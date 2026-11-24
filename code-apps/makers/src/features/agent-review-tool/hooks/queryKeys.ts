/**
 * React Query key factory for Agent Review Tool.
 *
 * Hierarchical keys with scalar primitives ensure proper cache invalidation
 * and deduplication.
 */

export const queryKeys = {
  all: ['agent-review-tool'] as const,

  /**
   * All bot metadata
   */
  bots: () => [...queryKeys.all, 'bots'] as const,

  /**
   * All CS reviews for the current user, scoped to an environment.
   * orgUrl = null means current environment; 'zip' reviews always included.
   */
  reviews: (orgUrl?: string | null) =>
    [...queryKeys.all, 'reviews', orgUrl ?? ''] as const,

  /**
   * Individual review by review ID
   */
  review: (reviewId: string) =>
    [...queryKeys.all, 'review', reviewId] as const,

  /**
   * Lightweight review history for one live or ZIP review subject.
   */
  reviewHistory: (
    sourceEnvironment: string | undefined,
    subjectKey: string,
  ) => [
    ...queryKeys.all,
    'review-history',
    sourceEnvironment ?? '',
    subjectKey,
  ] as const,

  /**
   * Current publication timestamp for one bot in one environment.
   */
  botPublication: (orgUrl: string | null | undefined, botId: string) =>
    [...queryKeys.all, 'bot-publication', orgUrl ?? '', botId] as const,

  /**
   * Tour completion status by user ID
   */
  tourStatus: (userId: string) =>
    [...queryKeys.all, 'tour-status', userId] as const,
} as const;
