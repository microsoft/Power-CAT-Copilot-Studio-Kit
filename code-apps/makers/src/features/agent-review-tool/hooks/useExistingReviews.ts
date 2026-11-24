/**
 * useExistingReviews Hook
 *
 * React Query hook for fetching all review results owned by the current user.
 *
 * Fetches all records from cat_agentreviews without a botId filter.
 * Dataverse enforces User-level (Basic) read access, so only records owned
 * by the calling user are returned — covers both Dataverse-sourced and
 * ZIP-sourced reviews.
 *
 * Configuration:
 * - Query key: ['reviews']
 * - Stale time: 1 minute
 * - Refetch on window focus: true
 * - Retry: 3 attempts
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { reviewService } from '../services/ReviewService';
import type { ReviewResult } from '../contracts/ReviewResult';
import { STALE_TIMES } from '../contracts/Constants';
import { queryKeys } from './queryKeys';

/**
 * useExistingReviews hook
 *
 * Fetches all CS review results for the current user, scoped to the selected environment.
 * ZIP-sourced reviews (cat_sourceenvironment = 'zip') are always included regardless of environment.
 * Dataverse User-level read scopes the query to the current user's records.
 *
 * @param orgUrl - Selected org URL (null = current environment, string = cross-env URL)
 * @returns Query result with all review data
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { data: reviews = [], isLoading } = useExistingReviews(selectedOrgUrl);
 *   return <ReviewGrid reviews={reviews} />;
 * }
 * ```
 */
/**
 * Query options shared with every other observer of this key.
 *
 * React Query applies retry and refetch options **per observer**, so a second
 * hook reusing the key but not these options would behave differently from the
 * dashboard whenever it is the only mounted consumer. Exported so key and
 * policy cannot drift apart.
 */
export const existingReviewsQueryOptions = {
  staleTime: STALE_TIMES.REVIEWS,
  refetchOnWindowFocus: true,
  retry: 3,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
} as const;

export function useExistingReviews(orgUrl?: string | null): UseQueryResult<ReviewResult[], Error> {
  return useQuery({
    queryKey: queryKeys.reviews(orgUrl),
    queryFn: () => reviewService.getAllReviews(orgUrl),
    ...existingReviewsQueryOptions,
  });
}
