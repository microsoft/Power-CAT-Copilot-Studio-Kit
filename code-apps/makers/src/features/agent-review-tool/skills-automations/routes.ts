/**
 * Where the page that shows one saved review lives.
 *
 * A function rather than a literal so the route shape is stated once. The
 * runner navigates here on completion and the history grid links here, and a
 * mismatch between those two would send the reader to a blank page.
 */
export function skillsReviewPath(reviewId: string): string {
  return `/agent-review-tool/skills/${reviewId}`;
}
