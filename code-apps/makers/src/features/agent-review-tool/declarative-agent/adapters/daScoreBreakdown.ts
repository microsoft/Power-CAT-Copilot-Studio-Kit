import type { DAEvaluationResult, EvaluationStatus } from '../contracts/DAEvaluationResult';
import { CRITERION_WEIGHTS } from '../contracts/constants';
import { criterionScore } from '../utils/scoreCalculator';

const QUALITY_CRITERIA = [
  { key: 'instructionsCriterion', label: 'Instructions Quality', weight: CRITERION_WEIGHTS.instructions },
  { key: 'knowledgeCriterion', label: 'Knowledge Sources', weight: CRITERION_WEIGHTS.knowledge },
  { key: 'capabilitiesCriterion', label: 'Capabilities Fit', weight: CRITERION_WEIGHTS.capabilities },
  { key: 'actionsCriterion', label: 'Actions Quality', weight: CRITERION_WEIGHTS.actions },
  { key: 'conversationStartersCriterion', label: 'Conversation Starters', weight: CRITERION_WEIGHTS.conversationStarters },
  { key: 'gracefulErrorHandlingCriterion', label: 'Error Handling', weight: CRITERION_WEIGHTS.gracefulErrorHandling },
] as const;

export const DA_QUALITY_WEIGHTS: Readonly<Record<string, number>> = Object.fromEntries(
  QUALITY_CRITERIA.map(({ key, weight }) => [key, weight]),
);

export interface DAScoreBreakdownPart {
  key: typeof QUALITY_CRITERIA[number]['key'];
  label: string;
  status: EvaluationStatus;
  score: number | null;
  configuredWeight: number;
  effectiveWeight: number;
  points: number;
}

/** Explains the current score with exact weights; it never replaces the saved score. */
export function buildDAScoreBreakdown(
  evaluation: DAEvaluationResult | undefined,
): DAScoreBreakdownPart[] {
  if (!evaluation) return [];

  const parts = QUALITY_CRITERIA.map(({ key, label, weight }) => ({
    key,
    label,
    status: evaluation[key]?.status ?? 'Not assessed',
    score: criterionScore(evaluation[key]),
    configuredWeight: weight,
  }));
  const assessedWeight = parts.reduce(
    (sum, part) => sum + (part.score === null ? 0 : part.configuredWeight),
    0,
  );

  return parts.map((part) => ({
    ...part,
    effectiveWeight: part.score === null || assessedWeight === 0
      ? 0
      : part.configuredWeight / assessedWeight * 100,
    points: part.score === null || assessedWeight === 0
      ? 0
      : part.score * part.configuredWeight / assessedWeight,
  }));
}
