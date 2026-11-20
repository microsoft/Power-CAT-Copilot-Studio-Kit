import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';

vi.mock('../../../../generated/services/Cat_agentreviewsesService', () => ({
  Cat_agentreviewsesService: {
    getAll: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

import {
  getDAReviewById,
  getDAReviews,
  parseDAReviewResult,
  serializeDAReviewResult,
  upsertDAReview,
} from '../services/DAReviewService';
import { Cat_agentreviewsesService } from '../../../../generated/services/Cat_agentreviewsesService';
import { bundle } from '../../agents-experience/__tests__/skillTestFixtures';
import { buildPersistedSkillBundleReview } from '../../agents-experience/services/skill/persistedSkillReview';

const baseReview: DAReviewRecord = {
  componentIdUnique: 'component-1',
  agentName: 'Synthetic agent',
  agentVersion: '1.0.0',
  publisherName: 'Contoso',
  sourceType: 'zip',
  overallScore: 100,
  iconBase64: null,
};

describe('DA review persistence compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads a legacy payload without new fields', () => {
    const legacy = parseDAReviewResult(JSON.stringify({
      manifest: { schemaVersion: 'v1.6' },
      evaluation: { summary: 'Legacy review' },
    }));

    expect(legacy.manifest).toEqual({ schemaVersion: 'v1.6' });
    expect(legacy.evaluation).toEqual({ summary: 'Legacy review' });
    expect(legacy.packageValidation).toBeUndefined();
    expect(legacy.workflowProvenance).toBeUndefined();
  });

  it('round-trips package validity, evidence, and workflow provenance', () => {
    const review: DAReviewRecord = {
      ...baseReview,
      packageValidation: {
        status: 'valid',
        schemaVersion: 'v1.8',
        findings: [],
      },
      evidence: [{
        evidenceId: 'declarativeAgent.json#$.instructions',
        kind: 'json-value',
        sourceFile: 'declarativeAgent.json',
        jsonPath: '$.instructions',
        content: 'Synthetic evidence',
        status: 'available',
      }],
      workflowProvenance: {
        contractVersion: '1.0',
        correlationId: 'correlation-1',
        jobId: 'job-1',
        completedAt: '2026-09-21T00:00:00.000Z',
        rejectedOutcomeCount: 0,
      },
    };

    expect(parseDAReviewResult(serializeDAReviewResult(review))).toMatchObject({
      packageValidation: review.packageValidation,
      evidence: review.evidence,
      workflowProvenance: review.workflowProvenance,
    });
  });

  it('round-trips sanitized custom-skill reviews and orchestration', () => {
    const review: DAReviewRecord = {
      ...baseReview,
      customSkillReviews: [{
        skillName: 'synthetic-skill',
        findings: [{ id: 'skill-finding', severity: 'medium' }],
      }] as never,
      customSkillOrchestration: {
        status: 'complete',
        findings: [{
          id: 'XSK-01:first+second',
          ruleId: 'XSK-01',
          type: 'overlap',
          severity: 'medium',
          title: 'Synthetic overlap',
          skills: ['first', 'second'],
          evidence: 'Shared trigger',
          rationale: 'The skills overlap.',
          recommendation: 'Separate the triggers.',
          fixSteps: [{ order: 1, action: 'Separate the triggers.' }],
          referenceIds: [],
          confidence: 'high',
        }],
        summary: 'Synthetic orchestration review.',
        referenceIds: [],
      },
      customSkillIssues: [{
        code: 'synthetic-warning',
        message: 'Synthetic warning.',
        severity: 'warning',
      }],
    };

    expect(parseDAReviewResult(serializeDAReviewResult(review))).toMatchObject({
      customSkillReviews: review.customSkillReviews,
      customSkillOrchestration: review.customSkillOrchestration,
      customSkillIssues: review.customSkillIssues,
    });
  });

  it('redacts free-text secrets at the Dataverse serialization boundary', () => {
    const bearer = 'synthetic-bearer-token-12345';
    const apiKey = 'synthetic-unquoted-secret';
    const sasUrl = 'https://contoso.blob.core.windows.net/private/file.txt?sv=1&sig=synthetic-signature';
    const serialized = serializeDAReviewResult({
      ...baseReview,
      manifest: {
        instructions: `Authorization: Bearer ${bearer}`,
      } as never,
      evidence: [{
        evidenceId: 'agent.json#$.instructions',
        kind: 'json-value',
        sourceFile: 'agent.json',
        jsonPath: '$.instructions',
        content: `api_key=${apiKey}`,
        status: 'available',
      }],
      customSkillIssues: [{
        code: 'synthetic',
        message: sasUrl,
        severity: 'warning',
      }],
    });

    expect(serialized).not.toContain(bearer);
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain(sasUrl);
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).toContain('[URL-REDACTED]');
  });

  it('compacts custom-skill content before the Dataverse memo limit', () => {
    const persisted = buildPersistedSkillBundleReview(
      bundle({
        skillMarkdown: `---\nname: skill-creator\ndescription: Synthetic.\n---\n${'x'.repeat(15_000)}`,
      }),
      {
        status: 'unavailable',
        mode: 'standard',
        skillName: 'skill-creator',
        skillSchemaName: 'agent.skill.skill-creator',
        deterministicFindings: [],
        blocked: false,
        error: 'Synthetic evaluator unavailable.',
      },
      '2026-09-24T00:00:00.000Z',
      '2026-09-24T00:00:01.000Z',
    );

    const serialized = serializeDAReviewResult({
      ...baseReview,
      customSkillReviews: [persisted],
    }, 12_000);
    const stored = parseDAReviewResult(serialized);

    expect(serialized.length).toBeLessThanOrEqual(12_000);
    expect(stored.customSkillReviews?.[0].skillDefinitionSource).toBeUndefined();
    expect(stored.customSkillReviews?.[0].skillDefinitionSourceOmission)
      .toBe('payload-budget');
  });

  it('clears a previous numeric score when the new review is unscored', async () => {
    vi.mocked(Cat_agentreviewsesService.getAll).mockResolvedValue({
      success: true,
      data: [{ cat_agentreviewsid: 'review-1' }],
    } as never);
    vi.mocked(Cat_agentreviewsesService.update).mockResolvedValue({
      success: true,
      data: {},
    } as never);

    await upsertDAReview({ ...baseReview, overallScore: null });

    expect(Cat_agentreviewsesService.update).toHaveBeenCalledWith(
      'review-1',
      expect.objectContaining({ cat_overallscore: null }),
    );
  });

  it('persists quality and package issues in the list-level issue count', async () => {
    vi.mocked(Cat_agentreviewsesService.getAll).mockResolvedValue({
      success: true,
      data: [{ cat_agentreviewsid: 'review-1' }],
    } as never);
    vi.mocked(Cat_agentreviewsesService.update).mockResolvedValue({
      success: true,
      data: {},
    } as never);
    const pass = { status: 'Pass' as const, issues: [], passingChecks: [] };

    await upsertDAReview({
      ...baseReview,
      evaluation: {
        instructionsCriterion: pass,
        knowledgeCriterion: pass,
        capabilitiesCriterion: pass,
        actionsCriterion: pass,
        conversationStartersCriterion: pass,
        gracefulErrorHandlingCriterion: {
          status: 'Warning',
          issues: [{
            severity: 'Medium',
            description: 'Missing recovery guidance.',
            recommendation: 'Add recovery guidance.',
          }],
          passingChecks: [],
        },
        summary: 'Synthetic result.',
      },
      packageValidation: {
        status: 'valid-with-warnings',
        schemaVersion: 'v1.8',
        findings: [{
          ruleId: 'DA-SYNTHETIC',
          status: 'Warning',
          severity: 'Medium',
          method: 'deterministic',
          sourceFile: 'declarativeAgent.json',
          jsonPath: '$.name',
          evidence: 'Agent',
          explanation: 'Synthetic package warning.',
          recommendation: 'Fix the synthetic warning.',
        }],
      },
    });

    expect(Cat_agentreviewsesService.update).toHaveBeenCalledWith(
      'review-1',
      expect.objectContaining({ cat_totalissues: '2' }),
    );
  });

  it('includes custom-skill and orchestration findings in the list-level issue count', async () => {
    vi.mocked(Cat_agentreviewsesService.getAll).mockResolvedValue({
      success: true,
      data: [{ cat_agentreviewsid: 'review-1' }],
    } as never);
    vi.mocked(Cat_agentreviewsesService.update).mockResolvedValue({
      success: true,
      data: {},
    } as never);

    await upsertDAReview({
      ...baseReview,
      customSkillReviews: [{
        findings: [{ id: 'skill-finding', severity: 'medium' }],
      }] as never,
      customSkillOrchestration: {
        status: 'complete',
        findings: [{
          id: 'orchestration-finding',
          ruleId: 'XSK-01',
          type: 'overlap',
          severity: 'medium',
          title: 'Synthetic overlap',
          skills: ['first', 'second'],
          evidence: 'Shared trigger',
          rationale: 'The skills overlap.',
          recommendation: 'Separate the triggers.',
          fixSteps: [{ order: 1, action: 'Separate the triggers.' }],
          referenceIds: [],
          confidence: 'high',
        }],
        summary: 'Synthetic orchestration review.',
        referenceIds: [],
      },
    });

    expect(Cat_agentreviewsesService.update).toHaveBeenCalledWith(
      'review-1',
      expect.objectContaining({ cat_totalissues: '2' }),
    );
  });

  it('reads the persisted issue count for list-level statistics', async () => {
    vi.mocked(Cat_agentreviewsesService.getAll).mockResolvedValue({
      success: true,
      data: [{
        cat_agentreviewsid: 'review-1',
        cat_componentidunique: 'component-1',
        cat_agentname: 'Synthetic agent',
        cat_agentversion: '1.0.0',
        cat_publishername: 'Contoso',
        cat_sourcetype: 'zip',
        cat_overallscore: '84',
        cat_totalissues: '3',
      }],
    } as never);

    await expect(getDAReviews()).resolves.toContainEqual(expect.objectContaining({
      overallScore: 84,
      totalIssues: 3,
    }));
  });

  it('reads Integer columns that the Dataverse runtime returns as numbers', async () => {
    // The generated model types these columns as strings, but Dataverse returns Integer values as numbers.
    vi.mocked(Cat_agentreviewsesService.getAll).mockResolvedValue({
      success: true,
      data: [
        {
          cat_agentreviewsid: 'review-1',
          cat_componentidunique: 'component-1',
          cat_agentname: 'Synthetic agent',
          cat_sourcetype: 'zip',
          cat_overallscore: 96,
          cat_totalissues: 4,
        },
        {
          cat_agentreviewsid: 'review-2',
          cat_componentidunique: 'component-2',
          cat_agentname: 'Older synthetic agent',
          cat_sourcetype: 'graph-api',
          cat_overallscore: 68,
          cat_totalissues: null,
        },
      ],
    } as never);

    const reviews = await getDAReviews();

    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toEqual(expect.objectContaining({ reviewId: 'review-1', overallScore: 96, totalIssues: 4 }));
    expect(reviews[1]).toEqual(expect.objectContaining({ reviewId: 'review-2', overallScore: 68, totalIssues: undefined }));
  });

  it('reads a numeric score when one review is opened', async () => {
    vi.mocked(Cat_agentreviewsesService.get).mockResolvedValue({
      success: true,
      data: {
        cat_agentreviewsid: 'review-1',
        cat_componentidunique: 'component-1',
        cat_agentname: 'Synthetic agent',
        cat_sourcetype: 'zip',
        cat_overallscore: 96,
        cat_totalissues: 4,
      },
    } as never);

    await expect(getDAReviewById('review-1')).resolves.toEqual(expect.objectContaining({
      reviewId: 'review-1',
      overallScore: 96,
      totalIssues: 4,
    }));
  });

  it('keeps a row readable when a stored number is not valid', async () => {
    vi.mocked(Cat_agentreviewsesService.getAll).mockResolvedValue({
      success: true,
      data: [{
        cat_agentreviewsid: 'review-1',
        cat_componentidunique: 'component-1',
        cat_agentname: 'Synthetic agent',
        cat_overallscore: 'not scored',
        cat_totalissues: Number.NaN,
      }],
    } as never);

    await expect(getDAReviews()).resolves.toEqual([expect.objectContaining({
      reviewId: 'review-1',
      overallScore: null,
      totalIssues: undefined,
    })]);
  });
});
