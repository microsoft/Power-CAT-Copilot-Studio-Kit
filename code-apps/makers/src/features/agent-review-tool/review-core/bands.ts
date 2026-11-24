/**
 * The one place a score becomes a letter (D-3).
 *
 * Four `scoreBand` functions existed across the two apps with two unrelated
 * meanings — three graded a score, one computed a chart axis range — so "the
 * band" meant different things depending on which import a file happened to
 * reach for. The twelve-band mapping below is the single source; coarse views
 * and colour derive from the letter rather than re-testing the number.
 *
 * Grades are never stored. A cached letter disagrees with the score printed
 * beside it as soon as either the bands or the rubric move, and a report that
 * contradicts itself is worse than one that recomputes.
 */

export type Grade =
  | 'A+' | 'A' | 'A-'
  | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-'
  | 'D+' | 'D' | 'D-'
  | 'F';

/** Lower bound of each grade, best first, so a scan stops at the first band the score clears. */
export const GRADE_BANDS: readonly (readonly [Grade, number])[] = Object.freeze([
  ['A+', 97], ['A', 93], ['A-', 90],
  ['B+', 87], ['B', 83], ['B-', 80],
  ['C+', 77], ['C', 73], ['C-', 70],
  ['D+', 67], ['D', 63], ['D-', 60],
] as const);

/**
 * The letter for a 0-100 score.
 *
 * A score outside 0-100 is a bug upstream, not a grade, so it clamps rather than
 * inventing a band.
 */
export function gradeForScore(score: number): Grade {
  const clamped = Math.max(0, Math.min(100, score));
  for (const [grade, floor] of GRADE_BANDS) {
    if (clamped >= floor) return grade;
  }
  return 'F';
}
