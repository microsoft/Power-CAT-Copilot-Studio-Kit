/**
 * useDAReviews Hook
 *
 * React Query hook for fetching all DA reviews from cat_agentreviews (cat_agenttype = 2).
 *
 * Configuration:
 * - Query key: daQueryKeys.daReviews.all()
 * - Stale time: 30 seconds
 * - Refetch on window focus: true
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getDAReviews } from '../services/DAReviewService';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import { DA_STALE_TIMES } from '../contracts/constants';
import { daQueryKeys } from './queryKeys';

/**
 * useDAReviews hook
 *
 * Fetches all DA review records for the current environment.
 *
 * @returns Query result with DA review data
 *
 * @example
 * ```tsx
 * function DAStatCards() {
 *   const { data: reviews = [], isLoading } = useDAReviews();
 *   const avgScore = reviews.reduce((sum, r) => sum + r.overallScore, 0) / reviews.length;
 *   return <StatCard label="Avg Score" value={Math.round(avgScore)} />;
 * }
 * ```
 */
/**
 * Query options shared with every other observer of this key. React Query
 * applies retry and refetch options per observer, so exporting them keeps key
 * and policy from drifting apart.
 */
export const daReviewsQueryOptions = {
  staleTime: DA_STALE_TIMES.REVIEWS_MS,
  refetchOnWindowFocus: true,
} as const;

export function useDAReviews(): UseQueryResult<DAReviewRecord[]> {
  return useQuery({
    queryKey: daQueryKeys.daReviews.all(),
    queryFn: getDAReviews,
    ...daReviewsQueryOptions,
  });
}
