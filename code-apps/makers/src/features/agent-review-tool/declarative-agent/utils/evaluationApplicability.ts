import type { DAManifest } from '../contracts/DAManifest';
import type { CriterionResult, DAEvaluationResult } from '../contracts/DAEvaluationResult';

function notApplicable(reason: string): CriterionResult {
  return {
    status: 'N/A',
    issues: [],
    passingChecks: [],
    assessmentNotes: [{ status: 'N/A', description: reason }],
  };
}

/**
 * Applies deterministic criterion applicability after semantic evaluation.
 * The workflow never decides N/A, and optional empty collections carry no score.
 */
export function applyDAEvaluationApplicability(
  evaluation: DAEvaluationResult,
  manifest: DAManifest,
): DAEvaluationResult {
  return {
    ...evaluation,
    actionsCriterion: manifest.actions.length === 0
      ? notApplicable('Not applicable. The agent declares no actions.')
      : evaluation.actionsCriterion,
    conversationStartersCriterion: manifest.conversationStarters.length === 0
      ? notApplicable('Not applicable. The agent declares no conversation starters.')
      : evaluation.conversationStartersCriterion,
  };
}
