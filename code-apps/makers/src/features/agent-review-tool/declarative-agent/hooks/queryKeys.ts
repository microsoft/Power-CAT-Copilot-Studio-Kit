/**
 * React Query key factory for DA review feature.
 *
 * Hierarchical keys with scalar primitives ensure proper cache invalidation.
 */

export const daQueryKeys = {
  all: ['declarative-agent-review'] as const,

  /** All DA reviews from cat_agentreviews (cat_agenttype = 2) */
  daReviews: {
    all: () => [...daQueryKeys.all, 'da-reviews'] as const,
    byId: (id: string) => [...daQueryKeys.all, 'da-reviews', id] as const,
  },
} as const;
