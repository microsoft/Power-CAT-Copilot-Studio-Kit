import type { AeEvaluationSet, AeMultiTurnCase, AeTestCase } from './AgentsExperienceModel';
import type { UnifiedAvailability } from './UnifiedReview';

/** The small evaluation-only model accepted by shared predicates, independent of either harness. */
export interface EvaluationConfiguration {
  evaluationSets: AeEvaluationSet[];
  testCases: AeTestCase[];
  multiTurnCases: AeMultiTurnCase[];
}

/** Legacy assertion configuration retained as evidence, not an executed result or an inferred set grader. */
export interface EvaluationCaseAssertion {
  componentId: string;
  fieldPath: string;
  kind: string;
  expectedResponse?: string;
  expectedResponses?: readonly string[];
  scoreThreshold?: number;
}

export interface NormalizedEvaluationEvidence extends EvaluationConfiguration {
  availability: UnifiedAvailability;
  source: 'live' | 'zip';
  capturedComponentCount: number;
  evaluationComponentCount: number;
  expectedComponentCount?: number;
  diagnostics: readonly string[];
  /** Cases lacking a unique set link cannot safely inherit another set's grader requirements. */
  unlinkedCaseIds: readonly string[];
  caseAssertions?: readonly EvaluationCaseAssertion[];
}
