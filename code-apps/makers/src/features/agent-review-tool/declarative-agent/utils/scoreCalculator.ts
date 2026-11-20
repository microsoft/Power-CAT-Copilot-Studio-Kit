/**
 * scoreCalculator.ts
 *
 * Deterministic weighted score calculation for DA evaluation results.
 *
 * The semantic evaluator returns an assessment status per criterion.
 * This module maps assessed statuses to fixed values and redistributes weight
 * across assessed criteria only.
 *
 * Status → Score mapping:
 *   Pass    → 100
 *   Warning → 60
 *   Fail    → 0
 *
 * Weights: Instructions 30%, Knowledge 20%, Capabilities 15%, Actions 15%, Starters 10%, Error Handling 10%.
 */

import type { DAEvaluationResult, EvaluationStatus } from '../contracts/DAEvaluationResult';
import { CRITERION_WEIGHTS, DA_SCORE_THRESHOLDS } from '../contracts/constants';

/** Fixed numeric value for each AI-returned status. Never changes. */
const STATUS_SCORE: Partial<Record<EvaluationStatus, number>> = {
  Pass: 100,
  Warning: 60,
  Fail: 0,
};

/**
 * Returns the deterministic numeric score for a single criterion based on its status.
 *
 * @param criterion - A single CriterionResult from Stage B
 * @returns 100 (Pass), 60 (Warning), 0 (Fail), or null when not scored
 */
export function criterionScore(
  criterion: { status?: EvaluationStatus } | undefined,
): number | null {
  if (!criterion?.status) return null;
  return STATUS_SCORE[criterion.status] ?? null;
}

/**
 * Calculates the overall weighted DA score from evaluation results.
 *
 * Uses fixed STATUS_SCORE mapping — score is fully deterministic for a given set of statuses.
 *
 * @param result - DA evaluation result from Stage B
 * @returns Overall score 0-100, or null when no criterion was assessed
 */
export function calculateDAScore(result: DAEvaluationResult): number | null {
  const weightedCriteria = [
    [result.instructionsCriterion, CRITERION_WEIGHTS.instructions],
    [result.knowledgeCriterion, CRITERION_WEIGHTS.knowledge],
    [result.capabilitiesCriterion, CRITERION_WEIGHTS.capabilities],
    [result.actionsCriterion, CRITERION_WEIGHTS.actions],
    [result.conversationStartersCriterion, CRITERION_WEIGHTS.conversationStarters],
    [result.gracefulErrorHandlingCriterion, CRITERION_WEIGHTS.gracefulErrorHandling],
  ] as const;

  let weightedScore = 0;
  let assessedWeight = 0;
  for (const [criterion, weight] of weightedCriteria) {
    const score = criterionScore(criterion);
    if (score === null) continue;
    weightedScore += score * weight;
    assessedWeight += weight;
  }

  return assessedWeight === 0
    ? null
    : Math.round(weightedScore / assessedWeight);
}

/**
 * Returns the hex color for a given score value.
 * Matches CS agent review color scheme for visual consistency.
 */
export function getScoreColor(score: number): string {
  if (score >= DA_SCORE_THRESHOLDS.PASS) return '#107c10';    // Green — Pass  (5.4:1, WCAG AA)
  if (score >= DA_SCORE_THRESHOLDS.WARNING) return '#b7580a'; // Amber — Warning (4.76:1)
  return '#c50f1f';                                            // Red — Fail (6.1:1)
}

/**
 * Returns a label for a given score value.
 */
export function getScoreLabel(score: number): string {
  if (score >= DA_SCORE_THRESHOLDS.PASS) return 'Excellent';
  if (score >= DA_SCORE_THRESHOLDS.WARNING) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Improvement';
}
