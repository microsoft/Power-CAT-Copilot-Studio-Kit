/**
 * The single number for a skill or automation review.
 *
 * `SkillBundleScores` carries four buckets and no overall figure, but the grid
 * needs one number per row and Dataverse stores one number per record. Both
 * take the weighted rubric roll-up computed here, so the rule lives in one
 * place — a grid row and its stored record must never disagree.
 *
 * The number is a weighted mean of the six rubric dimensions, using
 * {@link RUBRIC_DIMENSION_WEIGHTS}. It is deliberately *not* the mean of the
 * runtime verdict scores, which is what this file used to return: that number
 * moved with how many runtimes the user happened to tick, so the same skill
 * scored differently depending on a checkbox. The rail shows the six weighted
 * sub-scores, and this function must agree with them.
 *
 * A dimension that was not assessed is excluded and its weight is redistributed
 * across the rest. Counting it as zero would report "we could not judge this"
 * as "this is bad", and those are different answers.
 *
 * Deliberately free of any Dataverse import: the grid renders this, and a UI
 * component should not pull the generated service into its module graph.
 */

import type { ArtifactReviewResult, RubricDimensionScore } from '../contracts/ArtifactReview';
import { RUBRIC_DIMENSION_WEIGHTS } from '../contracts/ArtifactReview';

/** Dimension scores are out of 5; the overall figure is a percentage. */
const MAX_DIMENSION_SCORE = 5;

function assessed(dimensions: readonly RubricDimensionScore[]): RubricDimensionScore[] {
  return dimensions.filter((d) => typeof d.score === 'number' && Number.isFinite(d.score));
}

function boundedDimensionScore(dimension: RubricDimensionScore): number {
  return Math.max(0, Math.min(MAX_DIMENSION_SCORE, dimension.score as number));
}

/**
 * Weighted mean of the assessed rubric dimensions, 0–100.
 *
 * Returns 0 when nothing was assessed. Callers that must distinguish "zero" from
 * "no score" use {@link hasScore}.
 */
export function overallScoreOf(result: ArtifactReviewResult): number {
  const scored = assessed(result.dimensions ?? []);
  if (scored.length === 0) return 0;

  const totalWeight = scored.reduce((sum, d) => sum + RUBRIC_DIMENSION_WEIGHTS[d.id], 0);
  if (totalWeight === 0) return 0;

  const weighted = scored.reduce(
    (sum, d) => sum + boundedDimensionScore(d) * RUBRIC_DIMENSION_WEIGHTS[d.id],
    0,
  );

  return Math.round((weighted / totalWeight / MAX_DIMENSION_SCORE) * 100);
}

/** Whether any dimension was assessed, so the grid can show `--` instead of `0%`. */
export function hasScore(result: ArtifactReviewResult): boolean {
  return assessed(result.dimensions ?? []).length > 0;
}

/**
 * The share of the overall score each assessed dimension actually carries.
 *
 * When every dimension was assessed this returns the declared weights. When the
 * AI stage did not run, the two dimensions it owns are absent and their weight
 * is spread over the rest — so the rail shows the weights that were really
 * applied, not the ones that would have been.
 */
export function effectiveWeights(
  result: ArtifactReviewResult,
): Map<RubricDimensionScore['id'], number> {
  const scored = assessed(result.dimensions ?? []);
  const totalWeight = scored.reduce((sum, d) => sum + RUBRIC_DIMENSION_WEIGHTS[d.id], 0);
  const weights = new Map<RubricDimensionScore['id'], number>();
  if (totalWeight === 0) return weights;
  for (const dimension of scored) {
    weights.set(dimension.id, (RUBRIC_DIMENSION_WEIGHTS[dimension.id] / totalWeight) * 100);
  }
  return weights;
}
