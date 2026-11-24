import { describe, it, expect } from 'vitest';
import { deriveReviewFailure, serializeReviewRecord } from '../reviewRecordSerializer';
import type { ReviewResult } from '../../contracts/ReviewResult';
import type { PillarBreakdown } from '../../agents-experience/services/scoring';
import type { RuleEvaluationResult } from '../../agents-experience/contracts/Findings';

const PILLARS: PillarBreakdown[] = [
  { pillar: 'Evaluation', weight: 30, applicable: true, score: 100, complete: true },
  { pillar: 'Instructions', weight: 25, applicable: true, score: 80, complete: true },
  { pillar: 'Skills', weight: 15, applicable: false, score: null, complete: true },
];

const RULE_RESULTS: RuleEvaluationResult[] = [
  { key: 'EVL-01', ruleId: 'EVL-01', family: 'Evaluation', status: 'passed' },
  { key: 'INS-01', ruleId: 'INS-01', family: 'Instructions', status: 'error' },
];

function standardReview(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    botId: 'bot-1', botName: 'Agent', componentIdUnique: 'unique-1',
    overallScore: 70, patternScore: 70, instructionScore: 70,
    highSeverityCount: 0, mediumSeverityCount: 0, lowSeverityCount: 0, totalIssueCount: 0,
    reviewedOn: new Date('2026-01-01T00:00:00.000Z'), durationMs: 10, status: 'completed',
    scorePillars: PILLARS, scoreStatus: 'partial', ruleResults: RULE_RESULTS,
    // Any one detail field opens the result-JSON gate; the standard harness always carries this one.
    workflowProvenance: { evaluator: 'workflow' } as ReviewResult['workflowProvenance'],
    ...overrides,
  };
}

function resultJson(review: ReviewResult): Record<string, unknown> {
  const record = serializeReviewRecord(review);
  return JSON.parse(record.cat_reviewresultjson as string);
}

describe('serializeReviewRecord six-pillar rail', () => {
  // The rail has been lost twice already: once because standardReviewStorage's Pick<> union
  // omitted these three fields, and once because the page read a hard-coded legacy pair. Both
  // read back as "this agent has no pillars", which is the opposite claim to "pillars were not
  // measured". Persistence is the layer every reopened review passes through, so it is pinned here.
  it('persists scorePillars, scoreStatus and ruleResults inside the result JSON', () => {
    expect(resultJson(standardReview())).toMatchObject({
      scorePillars: [
        { pillar: 'Evaluation', weight: 30, applicable: true, score: 100, complete: true },
        { pillar: 'Instructions', weight: 25, applicable: true, score: 80, complete: true },
        { pillar: 'Skills', weight: 15, applicable: false, score: null, complete: true },
      ],
      scoreStatus: 'partial',
      ruleResults: [
        { key: 'EVL-01', ruleId: 'EVL-01', family: 'Evaluation', status: 'passed' },
        { key: 'INS-01', ruleId: 'INS-01', family: 'Instructions', status: 'error' },
      ],
    });
  });

  it('keeps an unmeasured pillar distinguishable from a pillar that scored zero', () => {
    const json = resultJson(standardReview({
      scorePillars: [
        { pillar: 'Skills', weight: 15, applicable: false, score: null, complete: true },
        { pillar: 'Tools', weight: 12, applicable: true, score: 0, complete: true },
      ],
    }));
    const pillars = json.scorePillars as PillarBreakdown[];
    expect(pillars[0]).toMatchObject({ applicable: false, score: null });
    expect(pillars[1]).toMatchObject({ applicable: true, score: 0 });
  });

  it('writes the rail alongside a failed copilot run rather than instead of it', () => {
    const review = standardReview({
      reviewKind: 'copilot', status: 'failed', errorMessage: 'Skill assessment did not complete.',
    });
    const record = serializeReviewRecord(review);
    const json = JSON.parse(record.cat_reviewresultjson as string);
    expect(record.cat_reviewstatus).toBe(335350002);
    expect(json.errorMessage).toBe('Skill assessment did not complete.');
    expect(json.scorePillars).toHaveLength(3);
    expect(json.scoreStatus).toBe('partial');
  });

  it('omits the rail keys rather than writing nulls when the review never scored pillars', () => {
    const json = resultJson(standardReview({
      scorePillars: undefined, scoreStatus: undefined, ruleResults: undefined,
    }));
    expect(json).not.toHaveProperty('scorePillars');
    expect(json).not.toHaveProperty('scoreStatus');
    expect(json).not.toHaveProperty('ruleResults');
  });

  // A review saved because the AI workflow was unreachable has no stage B, no workflow provenance
  // and no copilot payload, so every other key in the result-JSON gate is absent. If the rail does
  // not open the gate itself, a degraded review writes an overall score and no pillars at all --
  // which reopens as "no pillars applied", the opposite claim to "only these pillars were measured".
  it('writes the result JSON for a deterministic-only review whose sole detail is the rail', () => {
    const degraded = standardReview({ workflowProvenance: undefined });
    const record = serializeReviewRecord(degraded);
    expect(record.cat_reviewresultjson).toBeDefined();
    const json = JSON.parse(record.cat_reviewresultjson as string);
    expect(json.scorePillars).toHaveLength(3);
    expect(json.ruleResults).toHaveLength(2);
    expect(json.scoreStatus).toBe('partial');
  });

  it('still writes no result JSON when a review carries neither detail nor rail', () => {
    expect(serializeReviewRecord(standardReview({
      workflowProvenance: undefined,
      scorePillars: undefined, scoreStatus: undefined, ruleResults: undefined,
    })).cat_reviewresultjson).toBeUndefined();
  });
});

describe('deriveReviewFailure', () => {
  // The row that is written and the result the caller keeps must agree, so both read one
  // derivation. A standard review is never marked failed by this path.
  it('marks a failed copilot review and carries its reason', () => {
    expect(deriveReviewFailure(standardReview({ reviewKind: 'copilot', status: 'failed', errorMessage: 'why' })))
      .toEqual({ failed: true, errorMessage: 'why' });
  });

  it('leaves a failed standard review unflagged', () => {
    expect(deriveReviewFailure(standardReview({ reviewKind: 'standard', status: 'failed', errorMessage: 'why' })))
      .toMatchObject({ failed: false });
  });

  it('leaves a completed copilot review unflagged', () => {
    expect(deriveReviewFailure(standardReview({ reviewKind: 'copilot' }))).toMatchObject({ failed: false });
  });
});
