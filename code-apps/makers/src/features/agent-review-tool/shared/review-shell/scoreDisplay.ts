/**
 * Score display helpers shared by the review shell.
 *
 * Kept out of `ReviewScoreBar.tsx` so that file exports only its component:
 * mixing component and non-component exports in one module disables React fast
 * refresh for it.
 */

/**
 * Clamps a possibly-malformed payload value into the 0–100 track.
 *
 * Any non-finite value reads as 0, never 100: reviews are re-rendered from
 * persisted payloads, some written by earlier versions of the pipeline, and an
 * unknown score must not be presented as a perfect one.
 */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}
