import { describe, expect, it } from 'vitest';
import type { ReviewResult } from '../../contracts/ReviewResult';
import type { UpgradeReadinessEvidence } from '../../contracts/StageOutputs';
import { getSavedStandardScores, projectSavedStandardReview, STANDARD_REVIEW_LIMITS } from '../standardReviewProjection';

function review(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    botId: 'synthetic-agent', componentIdUnique: 'synthetic-component', botName: 'Synthetic agent',
    overallScore: 72, patternScore: 63, instructionScore: 81,
    highSeverityCount: 0, mediumSeverityCount: 0, lowSeverityCount: 0, totalIssueCount: 0,
    reviewedOn: new Date('2026-01-02T10:00:00Z'), durationMs: 10, status: 'completed',
    stageAOutput: JSON.stringify({ topics: [], tools: [] }),
    stageBOutput: JSON.stringify({ Patterns: [], PatternCompliancePercentage: 100 }),
    stageCOutput: JSON.stringify({ issues: [], compliancePercentage: 99 }),
    ...overrides,
  };
}

describe('saved standard score projection', () => {
  it('states the configuration/instruction scope and limits without a runtime score claim', () => {
    expect(STANDARD_REVIEW_LIMITS).toContain('not a conversation success rate');
    for (const limit of ['answer accuracy', 'response time', 'access-control effectiveness', 'production readiness']) {
      expect(STANDARD_REVIEW_LIMITS).toContain(limit);
    }
  });

  it.each([
    { field: 'stageBOutput', value: { Patterns: [{ PatternName: 'Incomplete saved check' }, null] }, label: 'Pattern' },
    { field: 'stageCOutput', value: { issues: [null] }, label: 'Instruction' },
  ] as const)('distinguishes partial $label data from an absent or unreadable stage', ({ field, value, label }) => {
    const result = projectSavedStandardReview(review({ [field]: JSON.stringify(value) }));
    const notice = result.scores.notes.find(note => note.startsWith(`${label} assessment data`));
    expect(notice).toContain('partial');
    expect(notice).not.toMatch(/missing|could not be read|unreadable/);
    expect(result.scores).toMatchObject({ pattern: 63, instruction: 81, overall: 72 });
  });

  it('uses saved scores, not model percentages or a newly calculated mean', () => {
    const input = review();
    const scores = getSavedStandardScores(input);
    expect(scores).toMatchObject({ pattern: 63, instruction: 81, overall: 72, legacy: true });
    expect(scores.notes.join(' ')).toMatch(/historical|legacy/i);
    expect(input.reviewedOn.toISOString()).toBe('2026-01-02T10:00:00.000Z');
  });

  it('honours explicit unavailable pillars and overall even with numeric placeholders', () => {
    expect(getSavedStandardScores(review({
      assessmentPolicyVersion: 'standard-review-2',
      patternScoreApplicable: false, instructionScoreApplicable: false,
      overallScoreApplicable: false, patternScore: 0, instructionScore: 100, overallScore: 0,
    }))).toMatchObject({ pattern: null, instruction: null, overall: null, legacy: false });
  });

  it('uses stage availability only when the corresponding root flag is absent', () => {
    const input = review({
      stageBOutput: JSON.stringify({ Patterns: [], scoreAvailable: false, policyVersion: 'standard-review-2' }),
      stageCOutput: JSON.stringify({ issues: [], compliancePercentage: 100, scoreAvailable: true }),
    });
    expect(getSavedStandardScores(input)).toMatchObject({ pattern: null, instruction: 81, overall: 72 });
    expect(getSavedStandardScores({
      ...input, patternScoreApplicable: true, instructionScoreApplicable: false,
    })).toMatchObject({ pattern: 63, instruction: null, overall: 72 });
  });

  it('does not replace a real saved zero with an unavailable placeholder', () => {
    expect(getSavedStandardScores(review({
      patternScore: 0, patternScoreApplicable: true,
      instructionScore: 0, instructionScoreApplicable: true,
      overallScore: 0, overallScoreApplicable: true,
    }))).toMatchObject({ pattern: 0, instruction: 0, overall: 0 });
  });

  it('falls back to explicit assessment metadata without regrading', () => {
    const input = review({
      stageBOutput: JSON.stringify({
        policyVersion: 'standard-review-2',
        Patterns: [{ PatternName: 'Unknown configuration', Status: true, AssessmentStatus: 'not-assessed' }],
      }),
      stageCOutput: JSON.stringify({
        issues: [], compliancePercentage: 100, criterionAssessments: [],
      }),
    });
    expect(getSavedStandardScores(input)).toMatchObject({ pattern: null, instruction: null, overall: null });
  });

  it('retains legacy ZIP scores even when the old test-case rule displays N/A', () => {
    expect(getSavedStandardScores(review({
      sourceEnvironment: 'zip', overallScore: 46, patternScore: 20, instructionScore: 70,
      stageBOutput: JSON.stringify({
        Patterns: [{ PatternName: 'Inadequate Test Cases', Status: false, Topics: [] }],
      }),
    }))).toMatchObject({ pattern: 20, instruction: 70, overall: 46, legacy: true });
  });

  it('keeps saved historical scores visible with explicit missing-stage notices', () => {
    const result = projectSavedStandardReview(review({
      stageAOutput: undefined, stageBOutput: undefined, stageCOutput: undefined,
    }));
    expect(result.scores).toMatchObject({ pattern: 63, instruction: 81, overall: 72 });
    expect(result.scores.notes.join(' ')).toMatch(/pattern.*unavailable/i);
    expect(result.scores.notes.join(' ')).toMatch(/instruction.*unavailable/i);
    expect(result.stageAOutput).toBeNull();
    expect(result.patternEvaluation).toBeNull();
    expect(result.instructionEvaluation).toBeNull();
  });

  it('labels legacy empty instruction results as compatibility outcomes, not fresh coverage', () => {
    const scores = getSavedStandardScores(review({
      stageAOutput: JSON.stringify({ topics: [], tools: [], policyVersion: 'standard-review-2' }),
      stageCOutput: JSON.stringify({ issues: [], compliancePercentage: 100 }),
    }));
    expect(scores.instruction).toBe(81);
    expect(scores.notes.join(' ')).toMatch(/Legacy instruction compatibility.*not a new coverage assessment/);
  });

  it('does not label explicit modern criterion metadata as legacy compatibility', () => {
    const scores = getSavedStandardScores(review({
      stageCOutput: JSON.stringify({ issues: [], criterionAssessments: [], policyVersion: 'standard-review-2' }),
    }));
    expect(scores.instruction).toBeNull();
    expect(scores.notes.join(' ')).not.toContain('Legacy instruction compatibility');
  });

  it.each(['{bad', 'null', '[]', '{}', '{"Patterns":{}}', '{"Patterns":[null]}'])(
    'does not treat malformed patterns as successful (%s)', (stageBOutput) => {
      const result = projectSavedStandardReview(review({ stageBOutput }));
      expect(result.patternEvaluation).toBeNull();
      expect(result.scores.notes.join(' ')).toMatch(/pattern.*unavailable/i);
    },
  );

  it.each([
    { assessmentStatus: 'future-outcome' }, { assessmentStatus: false }, { assessmentReason: 42 },
  ])('does not interpret malformed per-setting assessment metadata as complete: %j', metadata => {
    const result = projectSavedStandardReview(review({
      stageBOutput: JSON.stringify({
        Patterns: [{
          PatternName: 'Unclear Model Description', Status: false,
          Topics: [{ item: 'Workshop Lookup', ...metadata }],
        }],
      }),
    }));
    expect(result.patternEvaluation).toBeNull();
    expect(result.scores.notes.join(' ')).toContain('partial');
    expect(result.scores).toMatchObject({ overall: 72, pattern: 63, instruction: 81 });
  });

  it.each(['null', '{}', '{"issues":{}}', '{"issues":[null]}', '{"issues":[],"criterionAssessments":{}}'])(
    'makes malformed instruction data visibly unavailable (%s)', (stageCOutput) => {
      const result = projectSavedStandardReview(review({ stageCOutput }));
      expect(result.instructionEvaluation).toBeNull();
      expect(result.scores.notes.join(' ')).toMatch(/instruction.*unavailable/i);
    },
  );

  it.each([
    ['issue assessment outcome', { issues: [{ id: 'scope-definition', assessmentStatus: 'not-applicable' }] }],
    ['coverage category', { issues: [{ id: 'scope-definition', coverage: 'unrecognised' }] }],
    ['evidence object', { issues: [{ id: 'scope-definition', evidence: { source: {}, status: 'verified' } }] }],
    ['score availability', { issues: [], scoreAvailable: 'true' }],
  ] as const)('makes malformed nested instruction %s visibly unavailable', (_, stage) => {
    const result = projectSavedStandardReview(review({ stageCOutput: JSON.stringify(stage) }));
    expect(result.instructionEvaluation).toBeNull();
    expect(result.scores.notes.join(' ')).toMatch(/instruction.*unavailable/i);
  });

  it.each([
    ['target identity', { connectedAgents: [{ name: 'Connected', targetId: {} }] }],
    ['tool type', { toolDetails: [{ name: 'Tool', toolType: {} }] }],
    ['configuration availability', { configurationAvailable: 'false' }],
    ['settings value', { agentSettings: { useModelKnowledge: 'false' } }],
    ['resource count', { toolCount: -1 }],
    ['topic variables', { topicComponents: [{ TopicName: 'Topic', InputVariables: [null] }] }],
  ] as const)('makes malformed source %s visibly unavailable', (_, stage) => {
    const result = projectSavedStandardReview(review({
      stageAOutput: JSON.stringify({ topics: [], tools: [], ...stage }),
    }));
    expect(result.stageAOutput).toBeNull();
    expect(result.scores.notes.join(' ')).toMatch(/source.*unavailable/i);
  });

  it('honours unavailable metadata even when a stage body is missing', () => {
    expect(getSavedStandardScores(review({
      stageBOutput: '{"scoreAvailable":false}',
      stageCOutput: '{"scoreAvailable":false}',
    }))).toMatchObject({ pattern: null, instruction: null, overall: null });
  });

  it.each([NaN, Infinity, -1, 101])('does not render invalid saved scores (%s)', (score) => {
    const scores = getSavedStandardScores(review({
      patternScore: score, instructionScore: score, overallScore: score,
    }));
    expect(scores).toMatchObject({ pattern: null, instruction: null, overall: null });
    expect(scores.notes.join(' ')).toMatch(/saved.*score.*unavailable/i);
  });

  it('retains source identities and resource relationships without reading live data', () => {
    const stageA = {
      source: 'zip', policyVersion: 'standard-review-2',
      topics: [], tools: [], orchestrationMode: 'unknown',
      connectedAgents: [{ name: 'Connected', componentId: 'connection-id', targetSchemaName: 'target.agent', targetId: 'target-agent-id', parentComponentId: 'parent-component-id' }],
      entities: [{ name: 'Entity', schemaName: 'entity.schema' }],
      configurationComponents: [{ name: 'Session variable', kind: 'Variable', componentId: 'variable-id' }],
      unknownComponents: [{ name: 'Unclassified', kind: 'FutureKind', reason: 'Kind is not recognised.' }],
    };
    const result = projectSavedStandardReview(review({ stageAOutput: JSON.stringify(stageA) }));
    expect(result.stageAOutput).toEqual(stageA);
    expect(result.isZipSource).toBe(true);
    expect(result.scores.legacy).toBe(false);
  });
});

describe('saved standard upgrade readiness evidence', () => {
  it('keeps the upgrade readiness evidence of the saved Stage A snapshot', () => {
    const evidence: UpgradeReadinessEvidence = {
      knowledgeSources: [{ name: 'Policy index', kind: 'AzureAISearchSource' }],
      powerFx: [{ name: 'Workshop Lookup', kind: 'topic', expressionCount: 2 }],
      powerFxComponentCount: 1,
    };

    const result = projectSavedStandardReview(review({
      stageAOutput: JSON.stringify({ topics: [], tools: [], upgradeReadinessEvidence: evidence }),
    }));

    expect(result.stageAOutput?.upgradeReadinessEvidence).toEqual(evidence);
  });
});
