import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotMetadata, ReviewResult } from '../../contracts/ReviewResult';

const { create, getAll, get, update } = vi.hoisted(() => ({
  create: vi.fn(),
  getAll: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../../../generated/services/Cat_agentreviewsesService', () => ({
  Cat_agentreviewsesService: {
    create,
    getAll,
    get,
    update,
    delete: vi.fn(),
  },
}));

vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: {},
}));

import { ReviewService } from '../ReviewService';
import { buildPersistedCopilotReview } from '../../agents-experience/services/skill/persistedSkillReview';
import { copilotPayloadWithRawResourceContent } from '../../agents-experience/__tests__/skillTestFixtures';

function completedReview(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    botId: 'bot-1',
    botName: 'Agent',
    componentIdUnique: 'component-1',
    overallScore: 0,
    overallScoreApplicable: true,
    patternScore: 0,
    instructionScore: 0,
    highSeverityCount: 0,
    mediumSeverityCount: 0,
    lowSeverityCount: 0,
    totalIssueCount: 0,
    reviewedOn: new Date('2026-08-25T12:00:00Z'),
    durationMs: 100,
    status: 'completed',
    sourceEnvironment: '',
    agentVersion: '2026-08-25T10:00:00Z',
    reviewKind: 'standard',
    ...overrides,
  };
}

describe('ReviewService version history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns enough record metadata to reopen a review directly by review id', async () => {
    get.mockResolvedValue({
      success: true,
      data: {
        cat_agentreviewsid: 'review-1',
        cat_botid: 'bot-1',
        cat_botname: 'Agent',
        cat_componentidunique: 'component-1',
        cat_overallscore: '75',
        cat_patternscore: '70',
        cat_instructionscore: '80',
        cat_totalissues: '4',
        cat_highseverityissues: '2',
        cat_reviewdate: '2026-08-25T12:00:00Z',
        cat_reviewstatus: 335350000,
        cat_sourceenvironment: '',
        cat_sourcetype: 'standard',
        cat_reviewresultjson: JSON.stringify({
          stageA: { agentInstructions: 'Be concise.' },
          patternEvaluation: { Patterns: [], Summary: 'Pattern summary' },
          instructionEvaluation: { issues: [], summary: 'Instruction summary' },
          durationMs: 1234,
        }),
      },
    });

    const details = await new ReviewService().getReviewDetails('review-1');

    expect(details).toMatchObject({
      reviewId: 'review-1',
      botId: 'bot-1',
      botName: 'Agent',
      componentIdUnique: 'component-1',
      overallScore: 75,
      patternScore: 70,
      instructionScore: 80,
      highSeverityCount: 2,
      totalIssueCount: 4,
      reviewKind: 'standard',
      status: 'completed',
      hasReviewData: true,
      durationMs: 1234,
    });
  });

  it('treats blank source-environment rows as current-environment reviews', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [],
    });

    await new ReviewService().getAllReviews(null);

    const request = getAll.mock.calls[0][0] as { filter: string };
    expect(request.filter).toContain(`cat_sourceenvironment eq ''`);
    expect(request.filter).toContain('cat_sourceenvironment eq null');
    expect(request.filter).toContain(`cat_sourceenvironment eq 'zip'`);
  });

  it('excludes blank source-environment rows when another environment is selected', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [],
    });

    await new ReviewService().getAllReviews('https://contoso.crm.dynamics.com');

    const request = getAll.mock.calls[0][0] as { filter: string };
    expect(request.filter).toContain(
      `cat_sourceenvironment eq 'https://contoso.crm.dynamics.com'`,
    );
    expect(request.filter).not.toContain('cat_sourceenvironment eq null');
    expect(request.filter).not.toContain(`cat_sourceenvironment eq ''`);
    expect(request.filter).toContain(`cat_sourceenvironment eq 'zip'`);
  });

  it('always creates a new completed review and never probes or updates older rows', async () => {
    create
      .mockResolvedValueOnce({ success: true, data: { cat_agentreviewsid: 'review-1' } })
      .mockResolvedValueOnce({ success: true, data: { cat_agentreviewsid: 'review-2' } });
    const service = new ReviewService();

    const first = await service.saveReviewResult(completedReview());
    const second = await service.saveReviewResult(completedReview());

    expect(first.reviewId).toBe('review-1');
    expect(second.reviewId).toBe('review-2');
    expect(getAll).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toMatchObject({
      cat_agentversion: '2026-08-25T10:00:00Z',
      cat_sourcetype: 'standard',
      cat_overallscore: '0',
    });
  });

  it('saves an incomplete Copilot review as Failed and retains its failure notice', async () => {
    create.mockResolvedValue({ success: true, data: { cat_agentreviewsid: 'partial-review' } });
    const errorMessage = 'Review incomplete: skill assessment did not complete.';

    await new ReviewService().saveReviewResult(completedReview({
      reviewKind: 'copilot',
      status: 'failed',
      errorMessage,
    }));

    const record = create.mock.calls[0][0];
    expect(record.cat_reviewstatus).toBe(335350002);
    expect(JSON.parse(record.cat_reviewresultjson).errorMessage).toBe(errorMessage);
    get.mockResolvedValue({ success: true, data: { ...record, cat_agentreviewsid: 'partial-review' } });
    expect(await new ReviewService().getReviewDetails('partial-review')).toMatchObject({
      status: 'failed',
      errorMessage,
    });
  });

  it('does not display an old partial Copilot snapshot as a completed review', async () => {
    const input = copilotPayloadWithRawResourceContent();
    input.payload.skillBundleReviews![0].status = 'partial';
    const payload = buildPersistedCopilotReview(input).payload;
    const record = {
      cat_agentreviewsid: 'old-partial-review',
      cat_botid: 'bot-1',
      cat_botname: 'Agent',
      cat_componentidunique: 'component-1',
      cat_sourcetype: 'copilot',
      cat_reviewstatus: 335350000,
      cat_overallscore: '58',
      cat_reviewresultjson: JSON.stringify({ agentsExperience: payload }),
    };
    get.mockResolvedValue({ success: true, data: record });
    getAll.mockResolvedValue({ success: true, data: [record] });
    const service = new ReviewService();

    expect(await service.getReviewDetails('old-partial-review')).toMatchObject({
      status: 'failed',
      errorMessage: expect.stringContaining('Review incomplete'),
    });
    expect((await service.getAllReviews())[0]).toMatchObject({
      status: 'failed',
      errorMessage: expect.stringContaining('Review incomplete'),
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('omits overall score for a known non-measurable review', async () => {
    create.mockResolvedValue({
      success: true,
      data: { cat_agentreviewsid: 'review-1' },
    });

    await new ReviewService().saveReviewResult(completedReview({
      reviewKind: 'copilot',
      overallScoreApplicable: false,
    }));

    expect(create.mock.calls[0][0]).not.toHaveProperty('cat_overallscore');
    expect(create.mock.calls[0][0]).toMatchObject({
      cat_sourcetype: 'copilot',
    });
  });

  it('stores standard availability and counts without asserted unavailable pillar values', async () => {
    create.mockResolvedValue({ success: true, data: { cat_agentreviewsid: 'synthetic-review' } });
    await new ReviewService().saveReviewResult(completedReview({
      patternScoreApplicable: false, instructionScoreApplicable: false, overallScoreApplicable: false,
      assessmentPolicyVersion: 'standard-review-2',
      mediumSeverityCount: 2, lowSeverityCount: 1,
      stageBOutput: '{"Patterns":[],"scoreAvailable":false}',
      stageCOutput: '{"issues":[],"scoreAvailable":false}',
    }));
    const record = create.mock.calls[0][0];
    expect(record).not.toHaveProperty('cat_patternscore');
    expect(record).not.toHaveProperty('cat_instructionscore');
    expect(JSON.parse(record.cat_reviewresultjson)).toMatchObject({
      patternScoreApplicable: false, instructionScoreApplicable: false, overallScoreApplicable: false,
      assessmentPolicyVersion: 'standard-review-2', mediumSeverityCount: 2, lowSeverityCount: 1,
    });
    get.mockResolvedValue({ success: true, data: { ...record, cat_agentreviewsid: 'synthetic-review' } });
    const loaded = await new ReviewService().getReviewDetails('synthetic-review');
    expect(loaded).toMatchObject({
      patternScoreApplicable: false, instructionScoreApplicable: false, overallScoreApplicable: false,
      mediumSeverityCount: 2, lowSeverityCount: 1,
      assessmentPolicyVersion: 'standard-review-2', scoreState: 'not-assessed',
    });
    getAll.mockImplementation(async ({ select }: { select: string[] }) => ({
      success: true, data: [Object.fromEntries(select.filter(field => field in record).map(field => [field, record[field]]))],
    }));
    const service = new ReviewService();
    const history = await service.getReviewHistory({ botId: 'bot-1', sourceEnvironment: '' });
    expect(history[0]).toMatchObject({
      patternScoreApplicable: false, instructionScoreApplicable: false, overallScoreApplicable: false,
      scoreState: 'not-assessed',
    });
    expect(service.getReviewGridRows([], history)[0].overallScoreApplicable).toBe(false);
    expect(service.calculateDashboardStats([], [
      ...history, completedReview({ botId: 'bot-2', componentIdUnique: 'component-2', overallScore: 80 }),
    ])).toMatchObject({ averageScore: 80, scoredReviews: 1 });
  });

  it('persists and reloads the workflow provenance inside the immutable result JSON', async () => {
    const workflowProvenance = {
      jobId: 'synthetic-job',
      correlationId: 'synthetic-correlation',
      reviewPolicyVersion: 'standard-review-2',
      retrievedAt: '2026-09-12T05:36:51.000Z',
      rejectedCandidateCount: 2,
      validationDiagnostics: {
        rejectedCandidates: [{
          unitId: 'standard-configuration-quality',
          ruleId: 'synthetic-rule',
          reason: 'The candidate did not match the reviewed field.',
          outcomeImpact: 'incomplete' as const,
        }],
        normalizations: [{
          unitId: 'standard-instruction-safety',
          ruleId: 'privacy-and-sensitive-data',
          field: 'findingTitle' as const,
          originalLength: 249,
          normalizedLength: 200,
          reason: 'The generated title exceeded the display limit and was shortened.',
        }],
      },
      units: [{
        componentIndex: 9500,
        unitId: 'standard-configuration-quality',
        status: 'succeeded' as const,
        findingCount: 1,
        notAssessedCount: 0,
      }],
    };
    create.mockResolvedValue({
      success: true,
      data: { cat_agentreviewsid: 'provenance-review' },
    });

    await new ReviewService().saveReviewResult(completedReview({
      workflowProvenance,
    }));

    const record = create.mock.calls[0][0];
    expect(JSON.parse(record.cat_reviewresultjson).workflowProvenance)
      .toEqual(workflowProvenance);

    get.mockResolvedValue({
      success: true,
      data: { ...record, cat_agentreviewsid: 'provenance-review' },
    });
    await expect(new ReviewService().getReviewDetails('provenance-review'))
      .resolves.toMatchObject({ workflowProvenance });
  });

  it('drops malformed optional workflow diagnostics while retaining valid provenance', async () => {
    get.mockResolvedValue({
      success: true,
      data: {
        cat_agentreviewsid: 'provenance-review',
        cat_botid: 'bot-1',
        cat_botname: 'Agent',
        cat_componentidunique: 'component-1',
        cat_reviewdate: '2026-09-12T05:36:51.000Z',
        cat_reviewstatus: 335350000,
        cat_sourceenvironment: '',
        cat_sourcetype: 'standard',
        cat_reviewresultjson: JSON.stringify({
          workflowProvenance: {
            jobId: 'synthetic-job',
            correlationId: 'synthetic-correlation',
            reviewPolicyVersion: 'standard-review-2',
            retrievedAt: '2026-09-12T05:36:51.000Z',
            rejectedCandidateCount: 1,
            validationDiagnostics: {
              rejectedCandidates: [{
                unitId: 'standard-configuration-quality',
                reason: 42,
                outcomeImpact: 'incomplete',
              }],
              normalizations: [],
            },
            units: [],
          },
        }),
      },
    });

    const details = await new ReviewService().getReviewDetails('provenance-review');

    expect(details.workflowProvenance).toBeDefined();
    expect(details.workflowProvenance).not.toHaveProperty('validationDiagnostics');
  });

  it('persists and reloads the Standard review consistency audit', async () => {
    const assessmentIdentity = {
      schemaVersion: 1 as const,
      policyVersion: 'standard-review-3',
      policyHash: 'policy-hash',
      sourceHash: 'source-hash',
      ruleInputHashes: {
        'STD-PATTERN-MODEL-DESCRIPTION': 'rule-hash',
      },
    };
    const consistency = {
      schemaVersion: 1 as const,
      baselineReviewId: 'baseline-review',
      baselineSourceHash: 'baseline-source-hash',
      sourceChanged: true,
      unchangedRuleIds: ['STD-PATTERN-INPUT-NAME'],
      changedRuleIds: ['STD-PATTERN-MODEL-DESCRIPTION'],
      transitions: [{
        ruleId: 'STD-PATTERN-MODEL-DESCRIPTION',
        ruleName: 'Unclear Model Description',
        previousStatus: 'fail' as const,
        currentStatus: 'pass' as const,
        pillar: 'pattern' as const,
        weight: 1,
        previousEarnedPoints: 0,
        currentEarnedPoints: 1,
        previousAvailablePoints: 1,
        currentAvailablePoints: 1,
      }],
      evaluatorDisagreements: [{
        ruleId: 'deterministic-language',
        ruleName: 'Deterministic Language',
        previousStatus: 'pass' as const,
        evaluatorStatus: 'fail' as const,
        acceptedStatus: 'pass' as const,
        pillar: 'instruction' as const,
      }],
      scoreDelta: {
        previous: {
          overallScore: 50,
          patternScore: 0,
          instructionScore: 100,
        },
        current: {
          overallScore: 75,
          patternScore: 50,
          instructionScore: 100,
        },
        overall: 25,
        pattern: 50,
        instruction: 0,
      },
    };
    create.mockResolvedValue({
      success: true,
      data: { cat_agentreviewsid: 'consistent-review' },
    });
    const review = completedReview({
      assessmentPolicyVersion: 'standard-review-3',
      stageBOutput: '{"Patterns":[]}',
      stageCOutput: '{"issues":[]}',
    });
    Object.assign(review, { assessmentIdentity, consistency });

    await new ReviewService().saveReviewResult(review);

    const record = create.mock.calls[0][0];
    expect(JSON.parse(record.cat_reviewresultjson)).toMatchObject({
      assessmentIdentity,
      consistency,
    });
    get.mockResolvedValue({
      success: true,
      data: { ...record, cat_agentreviewsid: 'consistent-review' },
    });
    await expect(new ReviewService().getReviewDetails('consistent-review'))
      .resolves.toMatchObject({ assessmentIdentity, consistency });
  });

  it('loads the newest comparable Standard review under the same policy', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [{
        cat_agentreviewsid: 'baseline-review',
        cat_botid: 'bot-1',
        cat_botname: 'Agent',
        cat_componentidunique: 'component-1',
        cat_reviewdate: '2026-09-20T12:00:00Z',
        cat_reviewstatus: 335350000,
        cat_sourcetype: 'standard',
      }],
    });
    get.mockResolvedValue({
      success: true,
      data: {
        cat_agentreviewsid: 'baseline-review',
        cat_botid: 'bot-1',
        cat_botname: 'Agent',
        cat_componentidunique: 'component-1',
        cat_reviewdate: '2026-09-20T12:00:00Z',
        cat_reviewstatus: 335350000,
        cat_sourcetype: 'standard',
        cat_overallscore: '40',
        cat_patternscore: '42',
        cat_instructionscore: '37',
        cat_reviewresultjson: JSON.stringify({
          assessmentPolicyVersion: 'standard-review-3',
          assessmentIdentity: {
            schemaVersion: 1,
            policyVersion: 'standard-review-3',
            policyHash: 'policy-hash',
            sourceHash: 'source-hash',
            ruleInputHashes: {
              'STD-PATTERN-MODEL-DESCRIPTION': 'rule-hash',
            },
          },
          patternEvaluation: {
            Patterns: [{
              PatternId: 'workflow-model-description',
              PatternName: 'Unclear Model Description',
              Recommendation: 'Clarify the description.',
              Status: false,
              AssessmentStatus: 'fail',
              Topics: [],
            }],
          },
          instructionEvaluation: {
            compliancePercentage: 37,
            issues: [],
            criterionAssessments: [{
              criteriaId: 'scope-definition',
              status: 'pass',
            }],
          },
        }),
      },
    });

    const baseline = await new ReviewService().getLatestComparableStandardReview({
      botId: 'bot-1',
      componentIdUnique: 'component-1',
      sourceEnvironment: '',
    }, 'standard-review-3');

    expect(baseline).toMatchObject({
      reviewId: 'baseline-review',
      identity: {
        policyVersion: 'standard-review-3',
        sourceHash: 'source-hash',
      },
      scores: {
        overallScore: 40,
        patternScore: 42,
        instructionScore: 37,
      },
    });
  });

  describe('baseline comparability', () => {
    const subject = { botId: 'bot-1', componentIdUnique: 'component-1', sourceEnvironment: '' };

    function standardHistory() {
      getAll.mockResolvedValue({
        success: true,
        data: [{
          cat_agentreviewsid: 'baseline-review',
          cat_botid: 'bot-1',
          cat_botname: 'Agent',
          cat_componentidunique: 'component-1',
          cat_reviewdate: '2026-09-20T12:00:00Z',
          cat_reviewstatus: 335350000,
          cat_sourcetype: 'standard',
        }],
      });
    }

    function baselineRecord(resultJson: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
      return {
        success: true,
        data: {
          cat_agentreviewsid: 'baseline-review',
          cat_botid: 'bot-1',
          cat_botname: 'Agent',
          cat_componentidunique: 'component-1',
          cat_reviewdate: '2026-09-20T12:00:00Z',
          cat_reviewstatus: 335350000,
          cat_sourcetype: 'standard',
          cat_overallscore: '40',
          cat_patternscore: '42',
          cat_instructionscore: '37',
          cat_reviewresultjson: JSON.stringify({
            assessmentPolicyVersion: 'standard-review-3',
            assessmentIdentity: {
              schemaVersion: 1,
              policyVersion: 'standard-review-3',
              policyHash: 'policy-hash',
              sourceHash: 'source-hash',
              ruleInputHashes: {},
            },
            patternEvaluation: { Patterns: [] },
            instructionEvaluation: { compliancePercentage: 37, issues: [], criterionAssessments: [] },
            ...resultJson,
          }),
          ...overrides,
        },
      };
    }

    it('skips a row graded by a different rubric under the same policy version', async () => {
      standardHistory();
      get.mockResolvedValue(baselineRecord({}));

      // The version says which rubric graded the row; the hash says whether that rubric has since
      // changed underneath the version. Without this gate the row reaches
      // reconcileStandardReviewConsistency, whose hash assertion throws and takes the completed
      // review down with it.
      await expect(new ReviewService().getLatestComparableStandardReview(
        subject, 'standard-review-3', 'a-rubric-that-has-since-changed',
      )).resolves.toBeUndefined();
    });

    it('still returns the row when the rubric hash matches', async () => {
      standardHistory();
      get.mockResolvedValue(baselineRecord({}));

      await expect(new ReviewService().getLatestComparableStandardReview(
        subject, 'standard-review-3', 'policy-hash',
      )).resolves.toMatchObject({ reviewId: 'baseline-review' });
    });

    it('degrades to no baseline instead of throwing on an unreadable row', async () => {
      standardHistory();
      get.mockResolvedValue(baselineRecord({ patternEvaluation: { Patterns: 'not-an-array' } }));

      // ART and the Architecture Review Center write standard reviews into one table from
      // independently deployed apps, so a row written by whichever side is a deploy behind is
      // expected here. Throwing would discard a completed, credit-bearing review to complain
      // about an older one.
      await expect(new ReviewService().getLatestComparableStandardReview(
        subject, 'standard-review-3', 'policy-hash',
      )).resolves.toBeUndefined();
    });

    it('reports a withheld baseline score as not measured rather than zero', async () => {
      standardHistory();
      get.mockResolvedValue(baselineRecord({}, { cat_overallscore: null }));

      const baseline = await new ReviewService().getLatestComparableStandardReview(
        subject, 'standard-review-3', 'policy-hash',
      );

      // Reading a withheld score as 0 would make the next review's delta report a recovery from
      // a failure that never happened.
      expect(baseline?.scores.overallScore).toBeNull();
      expect(baseline?.scores.patternScore).toBe(42);
    });
  });

  it('persists and reloads agent map logos inside the immutable result JSON', async () => {
    const connectedAgentTargets = [{
      schemaName: 'synthetic.agent.hr',
      name: 'HR Assistant',
      iconBase64: 'data:image/png;base64,TARGET',
    }];
    create.mockResolvedValue({
      success: true,
      data: { cat_agentreviewsid: 'icon-review' },
    });

    await new ReviewService().saveReviewResult(completedReview({
      iconBase64: 'ROOT',
      connectedAgentTargets,
    }));

    const record = create.mock.calls[0][0];
    expect(JSON.parse(record.cat_reviewresultjson)).toMatchObject({
      iconBase64: 'ROOT',
      connectedAgentTargets,
    });

    get.mockResolvedValue({
      success: true,
      data: { ...record, cat_agentreviewsid: 'icon-review' },
    });
    await expect(new ReviewService().getReviewDetails('icon-review'))
      .resolves.toMatchObject({
        iconBase64: 'ROOT',
        connectedAgentTargets,
      });
  });

  it('retains a genuinely measured zero in lightweight history and aggregates', async () => {
    getAll.mockResolvedValue({ success: true, data: [{
      cat_agentreviewsid: 'measured-zero', cat_botid: 'zero-agent', cat_componentidunique: 'zero-component',
      cat_overallscore: '0', cat_sourcetype: 'standard', cat_reviewstatus: 335350000,
      cat_reviewdate: '2026-08-25T12:00:00Z',
    }] });
    const service = new ReviewService();
    const history = await service.getReviewHistory({ botId: 'zero-agent', sourceEnvironment: '' });
    expect(history[0]).toMatchObject({ overallScore: 0, overallScoreApplicable: true, scoreState: 'measured' });
    expect(service.calculateDashboardStats([], [
      ...history, completedReview({ overallScore: 80 }),
    ])).toMatchObject({ averageScore: 40, scoredReviews: 2 });
  });

  it('does not replace an unavailable historical review date with today', async () => {
    getAll.mockResolvedValue({
      success: true, data: [{
        cat_agentreviewsid: 'undated-review', cat_botid: 'synthetic-agent',
        cat_botname: 'Review Demo', cat_overallscore: '25', cat_sourcetype: 'standard',
      }],
    });
    const [review] = await new ReviewService().getAllReviews(null);
    expect(Number.isNaN(review.reviewedOn.getTime())).toBe(true);
  });

  it('surfaces an unreadable saved review instead of returning a successful empty detail', async () => {
    get.mockResolvedValue({ success: false, error: { message: 'The saved review could not be read.' } });
    await expect(new ReviewService().getReviewDetails('unreadable-review')).rejects.toThrow('could not be read');
  });

  it('loads lightweight history without the result JSON column', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [{
        cat_agentreviewsid: 'review-1',
        cat_botid: 'bot-1',
        cat_botname: 'Agent',
        cat_componentidunique: 'component-1',
        cat_reviewdate: '2026-08-25T12:00:00Z',
        createdon: '2026-08-25T12:00:01Z',
        cat_reviewstatus: 335350000,
        cat_sourcetype: 'copilot',
      }],
    });

    const history = await new ReviewService().getReviewHistory({
      botId: 'bot-1',
      sourceEnvironment: '',
    });

    const request = getAll.mock.calls[0][0] as { select: string[] };
    expect(request.select).not.toContain('cat_reviewresultjson');
    expect(history[0]).toMatchObject({
      reviewId: 'review-1',
      reviewKind: 'copilot',
      scoreState: 'not-applicable',
      overallScoreApplicable: false,
    });
  });

  it('throws history query failures instead of returning a false empty state', async () => {
    getAll.mockResolvedValue({
      success: false,
      error: { message: 'Dataverse unavailable' },
    });

    await expect(new ReviewService().getReviewHistory({
      botId: 'bot-1',
      sourceEnvironment: '',
    })).rejects.toThrow('Dataverse unavailable');
  });

  it('includes saved incomplete Copilot snapshots without including failed Standard runs', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [{
        cat_agentreviewsid: 'incomplete-copilot',
        cat_botid: 'bot-1',
        cat_botname: 'Agent',
        cat_componentidunique: 'component-1',
        cat_reviewdate: '2026-08-25T12:00:00Z',
        cat_reviewstatus: 335350002,
        cat_sourcetype: 'copilot',
        cat_overallscore: '70',
      }],
    });

    const [entry] = await new ReviewService().getReviewHistory({
      botId: 'bot-1',
      sourceEnvironment: '',
    });

    expect(getAll.mock.calls[0][0].filter).toContain(
      "cat_reviewstatus eq 335350002 and cat_sourcetype eq 'copilot' and cat_reviewresultjson ne null",
    );
    expect(entry).toMatchObject({
      reviewId: 'incomplete-copilot',
      reviewKind: 'copilot',
      status: 'failed',
      overallScore: 70,
    });
  });

  it('keeps legacy numeric scores explicitly unknown', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [{
        cat_agentreviewsid: 'legacy',
        cat_botid: 'bot-1',
        cat_botname: 'Agent',
        cat_componentidunique: 'component-1',
        cat_overallscore: '0',
        cat_reviewdate: '2025-01-01T00:00:00Z',
        cat_reviewstatus: 335350000,
      }],
    });

    const [entry] = await new ReviewService().getReviewHistory({
      botId: 'bot-1',
      sourceEnvironment: '',
    });

    expect(entry.overallScore).toBe(0);
    expect(entry.scoreState).toBe('legacy-unknown');
    expect(entry.overallScoreApplicable).toBeUndefined();
    expect(new ReviewService().calculateDashboardStats([], [
      entry,
      completedReview({ botId: 'measured-agent', componentIdUnique: 'measured-component', overallScore: 80 }),
    ])).toMatchObject({ averageScore: 80, scoredReviews: 1 });
  });

  it('maps a legacy history row without a stored score to Not assessed', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [{
        cat_agentreviewsid: 'legacy-unscored',
        cat_botid: 'bot-1',
        cat_botname: 'Agent',
        cat_componentidunique: 'component-1',
        cat_reviewdate: '2025-01-01T00:00:00Z',
        cat_reviewstatus: 335350000,
      }],
    });

    const [entry] = await new ReviewService().getReviewHistory({
      botId: 'bot-1',
      sourceEnvironment: '',
    });

    expect(entry).toMatchObject({
      overallScore: 0,
      overallScoreApplicable: false,
      scoreState: 'not-assessed',
    });
  });

  it('maps legacy review details without a stored score to Not assessed', async () => {
    get.mockResolvedValue({
      success: true,
      data: {
        cat_agentreviewsid: 'legacy-unscored',
        cat_botid: 'bot-1',
        cat_botname: 'Agent',
        cat_componentidunique: 'component-1',
        cat_reviewstatus: 335350000,
      },
    });

    await expect(new ReviewService().getReviewDetails('legacy-unscored')).resolves.toMatchObject({
      overallScore: 0,
      overallScoreApplicable: false,
      scoreState: 'not-assessed',
    });
  });
});

describe('saved review harness on grid rows', () => {
  const unsupportedBot: BotMetadata = {
    botId: 'bot-1',
    name: 'Agent',
    statusCode: 1,
    componentIdUnique: 'component-1',
    harness: 'unsupported',
  };

  it('keeps the harness of the saved review when the agent harness is now unsupported', () => {
    const [row] = new ReviewService().getReviewGridRows(
      [unsupportedBot],
      [completedReview({ reviewKind: 'copilot', reviewId: 'review-1', hasReviewData: true })],
    );

    expect(row).toMatchObject({
      harness: 'unsupported',
      reviewHarness: 'copilot',
      reviewId: 'review-1',
      status: 'completed',
    });
  });

  it('gives the harness of the saved review on a solution ZIP row', () => {
    const [row] = new ReviewService().getReviewGridRows([], [completedReview({
      botId: 'zip-agent',
      componentIdUnique: 'zip-agent',
      sourceEnvironment: 'zip',
      reviewId: 'review-2',
    })]);

    expect(row).toMatchObject({ isZipSource: true, harness: 'standard', reviewHarness: 'standard' });
  });

  it('gives no saved review harness when the saved review does not state it', () => {
    const service = new ReviewService();
    const [reviewed] = service.getReviewGridRows(
      [unsupportedBot],
      [completedReview({ reviewKind: undefined, reviewId: 'review-3' })],
    );
    const [notReviewed] = service.getReviewGridRows([unsupportedBot], []);

    expect(reviewed.reviewHarness).toBeUndefined();
    expect(notReviewed.reviewHarness).toBeUndefined();
    expect(notReviewed.status).toBe('not-reviewed');
  });
});
