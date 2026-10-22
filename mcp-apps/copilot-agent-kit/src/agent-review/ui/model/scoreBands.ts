/**
 * Grounded-score colour bands.
 *
 * Kept out of the rail component so the thresholds can be asserted alongside
 * the scoring weights they depend on: the bands and `scoring.ts`'s pillar
 * weights jointly enforce the product rule that an agent with no evaluation
 * set can never read as healthy.
 */

/** Lowest score that reads as healthy. */
export const GREEN_THRESHOLD = 80;

/** Lowest score that reads as caution rather than failing. */
export const AMBER_THRESHOLD = 50;

export type ScoreBand = 'green' | 'amber' | 'red';

/**
 * Buckets a 0-100 grounded score into its display band.
 *
 * The green cut-point sits above the 70-point ceiling that `computeGroundedScore`
 * holds an un-evaluated agent to, so a flawless-but-untested agent tops out at
 * amber. See the "never reaches the healthy band" test in `scoring.test.ts`.
 */
export function scoreBand(score: number): ScoreBand {
  if (score >= GREEN_THRESHOLD) return 'green';
  if (score >= AMBER_THRESHOLD) return 'amber';
  return 'red';
}
