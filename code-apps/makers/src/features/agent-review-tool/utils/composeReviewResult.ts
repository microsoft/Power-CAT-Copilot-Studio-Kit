/**
 * Composes the `ReviewResult` a Standard review surface renders, from the two
 * queries that supply it.
 *
 * The list query (`getAllReviews`) returns the record; `getReviewDetails`
 * returns the stage outputs the grids and finding panels are built from. Every
 * surface needs both, so every surface has to merge them.
 *
 * **Why this is a function rather than two `useMemo` bodies.** `ReviewDialogV2`
 * and `StandardReviewPage` must export byte-identical PDF and SARIF. That
 * holds only because both call `generateSARIF` and `generateCsPdfReport` with
 * the same object — so the merge is the thing that must not drift. Two copies
 * of it in two files would let a later edit to one break the guarantee with
 * nothing failing.
 *
 * The precedent is not hypothetical: the declarative page shipped reading its
 * record from the *list* projection, which omits `cat_reviewresultjson`. It
 * rendered a well-formed, entirely empty review and raised no error.
 */

import type { ReviewResult } from '../contracts/ReviewResult';

/**
 * Merges stage outputs onto a review record.
 *
 * @param baseReview The record from the list query, or null before it resolves.
 * @param details Stage outputs, undefined while `useReviewDetails` is in flight.
 * @returns The record with details applied, the bare record while they load, or
 *   null when there is no record. Never a partial — a caller that gets an object
 *   back can always render the summary, whether or not details have arrived.
 */
export function composeReviewResult(
  baseReview: ReviewResult | null | undefined,
  details: Partial<ReviewResult> | null | undefined,
): ReviewResult | null {
  if (!baseReview) return null;
  return details
    ? { ...baseReview, ...Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)) }
    : baseReview;
}
