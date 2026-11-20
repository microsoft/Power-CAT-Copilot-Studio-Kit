import type { ReviewResult } from '../contracts/ReviewResult';
import { recordValue, textValue } from './topicApplicability';

type StoredReviewMetadata = Partial<Pick<ReviewResult,
  'assessmentPolicyVersion' | 'overallScoreApplicable' | 'patternScoreApplicable'
  | 'instructionScoreApplicable' | 'mediumSeverityCount' | 'lowSeverityCount'
  | 'scorePillars' | 'scoreStatus' | 'ruleResults'
>>;

/** Read saved score columns without interpreting missing or invalid values as measured zero. */
export function readStoredScore(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : undefined;
}

/** Restore additive standard metadata without inventing fields on legacy payloads. */
export function readStandardReviewMetadata(value: unknown): StoredReviewMetadata {
  const payload = recordValue(value);
  if (!payload) return {};
  const result: StoredReviewMetadata = {};
  const policy = textValue(payload.assessmentPolicyVersion) ?? textValue(recordValue(payload.stageA)?.policyVersion);
  if (policy) result.assessmentPolicyVersion = policy;
  for (const key of ['overallScoreApplicable', 'patternScoreApplicable', 'instructionScoreApplicable'] as const) {
    if (typeof payload[key] === 'boolean') result[key] = payload[key];
  }
  for (const key of ['mediumSeverityCount', 'lowSeverityCount'] as const) {
    const count = payload[key];
    if (typeof count === 'number' && Number.isInteger(count) && count >= 0) result[key] = count;
  }
  if (policy) {
    const patternAvailable = recordValue(payload.patternEvaluation)?.scoreAvailable;
    const instructionAvailable = recordValue(payload.instructionEvaluation)?.scoreAvailable;
    if (result.patternScoreApplicable === undefined && typeof patternAvailable === 'boolean') result.patternScoreApplicable = patternAvailable;
    if (result.instructionScoreApplicable === undefined && typeof instructionAvailable === 'boolean') result.instructionScoreApplicable = instructionAvailable;
  }
  // The composite breakdown is written by the serializer but is meaningless unless it is read back:
  // without it the page cannot tell a pillar-scored review from a legacy two-pillar one, and falls
  // back to the superseded pattern/instruction wording while the headline shows the composite.
  // Shapes are validated downstream, so an array check is enough to keep malformed rows legacy.
  if (Array.isArray(payload.scorePillars)) {
    result.scorePillars = payload.scorePillars as ReviewResult['scorePillars'];
  }
  if (payload.scoreStatus === 'complete' || payload.scoreStatus === 'partial') {
    result.scoreStatus = payload.scoreStatus;
  }
  if (Array.isArray(payload.ruleResults)) {
    result.ruleResults = payload.ruleResults as ReviewResult['ruleResults'];
  }
  return result;
}
