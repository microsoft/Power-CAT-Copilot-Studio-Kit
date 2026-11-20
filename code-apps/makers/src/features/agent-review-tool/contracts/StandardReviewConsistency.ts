import type {
  AssessmentStatus,
  InstructionEvaluation,
  PatternEvaluation,
} from './StageOutputs';

export interface StandardReviewAssessmentIdentity {
  schemaVersion: 1;
  policyVersion: string;
  policyHash: string;
  sourceHash: string;
  ruleInputHashes: Record<string, string>;
}

export type StandardReviewOutcomeStatus = AssessmentStatus | 'not-present';

export interface StandardReviewOutcomeTransition {
  ruleId: string;
  ruleName: string;
  previousStatus: StandardReviewOutcomeStatus;
  currentStatus: StandardReviewOutcomeStatus;
  pillar: 'pattern' | 'instruction';
  weight: number;
  previousEarnedPoints: number;
  currentEarnedPoints: number;
  previousAvailablePoints: number;
  currentAvailablePoints: number;
}

export interface StandardReviewEvaluatorDisagreement {
  ruleId: string;
  ruleName: string;
  previousStatus: StandardReviewOutcomeStatus;
  evaluatorStatus: StandardReviewOutcomeStatus;
  acceptedStatus: StandardReviewOutcomeStatus;
  pillar: 'pattern' | 'instruction';
}

/**
 * A score is `null` when it was deliberately withheld rather than measured as zero.
 *
 * The composite is withheld when every conditional pillar came back without a verdict, which is a
 * statement about coverage rather than a grade. Collapsing that to `0` would persist "this agent
 * scored nothing" for a review that never claimed to have examined it, and the subtraction below
 * would then report a fabricated swing in whichever direction the withheld side fell.
 */
export interface StandardReviewScoreSnapshot {
  overallScore: number | null;
  patternScore: number | null;
  instructionScore: number | null;
}

/** A difference is `null` when either side of it was withheld, because no difference exists. */
export interface StandardReviewScoreDelta {
  previous: StandardReviewScoreSnapshot;
  current: StandardReviewScoreSnapshot;
  overall: number | null;
  pattern: number | null;
  instruction: number | null;
}

export interface StandardReviewConsistencyResult {
  schemaVersion: 1;
  baselineReviewId: string;
  baselineSourceHash: string;
  sourceChanged: boolean;
  unchangedRuleIds: string[];
  changedRuleIds: string[];
  transitions: StandardReviewOutcomeTransition[];
  evaluatorDisagreements?: StandardReviewEvaluatorDisagreement[];
  scoreDelta?: StandardReviewScoreDelta;
}

export interface StandardReviewComparableBaseline {
  reviewId: string;
  identity: StandardReviewAssessmentIdentity;
  patterns: PatternEvaluation;
  instructions: InstructionEvaluation;
  scores: StandardReviewScoreSnapshot;
}
