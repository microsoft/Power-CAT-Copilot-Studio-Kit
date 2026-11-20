/**
 * Formatting shared by the review grids.
 *
 * The Copilot Studio, Declarative Agent and Skills and Automations grids all
 * show "when was this last reviewed" and a "new" marker, and they must read the
 * same way. These were duplicated verbatim in two grids before the third one
 * arrived, so they live here instead.
 *
 * Note this is deliberately not `utils/dateUtils.formatRelativeDate`, which
 * renders a longer form ("1 hour ago", "Yesterday") and "--" for no date. The
 * grids use the compact form and say "Never" when nothing has been reviewed.
 */

/** A review is still "new" for half a day after it is run. */
export const NEW_REVIEW_THRESHOLD_MS = 12 * 60 * 60 * 1000;

/** Compact relative date for a grid cell, for example `3d ago`. */
export function formatRelativeReviewDate(date?: Date): string {
  if (!date) return 'Never';
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 60) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 24) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

/** Whether the row should carry the "new" marker. */
export function isRecentlyReviewed(reviewedOn?: Date): boolean {
  if (!reviewedOn) return false;
  return Date.now() - new Date(reviewedOn).getTime() < NEW_REVIEW_THRESHOLD_MS;
}
