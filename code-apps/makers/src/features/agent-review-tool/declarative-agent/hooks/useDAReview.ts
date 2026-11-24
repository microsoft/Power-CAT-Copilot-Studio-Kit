/**
 * useDAReview — loads one declarative review, in full, by its record id.
 *
 * **Must use `getDAReviewById`, not the list query.** `getDAReviews` selects a
 * flat projection for the grid and deliberately omits `cat_reviewresultjson`,
 * which carries the evaluation and the manifest. Reading a record out of the
 * list therefore yields one with no criteria, no issues and no manifest — the
 * page renders, but every tab badge reads 0 and every panel is empty.
 *
 * The list record is used as placeholder data so the agent name and score paint
 * immediately from cache while the full record loads, instead of flashing a
 * spinner on a page the maker has just come from.
 *
 * `notFound` is distinct from `isError`: a review id that does not exist, or
 * that this maker cannot see, is a routing outcome the page reports plainly —
 * not a failure to retry.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDAReviewById } from '../services/DAReviewService';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import { daQueryKeys } from './queryKeys';

export interface UseDAReviewResult {
  review: DAReviewRecord | undefined;
  isLoading: boolean;
  /** True while the full record is still arriving behind placeholder data. */
  isLoadingDetails: boolean;
  isError: boolean;
  error: string | null;
  /** Loaded successfully, but no record carries this id. */
  notFound: boolean;
  refetch: () => void;
}

export function useDAReview(reviewId: string | undefined): UseDAReviewResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: daQueryKeys.daReviews.byId(reviewId ?? ''),
    queryFn: () => getDAReviewById(reviewId!),
    enabled: Boolean(reviewId),
    // Review results are immutable once written; the review mutation
    // invalidates this key when a new one runs.
    staleTime: Infinity,
    placeholderData: () => {
      if (!reviewId) return undefined;
      const list = queryClient.getQueryData<DAReviewRecord[]>(daQueryKeys.daReviews.all());
      return list?.find((r) => r.reviewId === reviewId);
    },
  });

  // The service resolves to null for a missing or inaccessible record.
  const notFound = Boolean(reviewId) && query.isSuccess && query.data === null;

  return {
    review: query.data ?? undefined,
    isLoading: query.isLoading,
    isLoadingDetails: query.isPlaceholderData,
    isError: query.isError,
    error: query.error instanceof Error ? query.error.message : query.isError ? 'Unknown error' : null,
    notFound,
    refetch: () => void query.refetch(),
  };
}
