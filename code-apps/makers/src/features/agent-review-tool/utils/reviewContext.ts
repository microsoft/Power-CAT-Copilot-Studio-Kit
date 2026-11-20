/** Return the nonblank, unique review-context messages in display order. */
export function getReviewContextItems(limit: string, notes: string[]): string[] {
  return [...new Set([limit, ...notes].map((item) => item.trim()).filter(Boolean))];
}
