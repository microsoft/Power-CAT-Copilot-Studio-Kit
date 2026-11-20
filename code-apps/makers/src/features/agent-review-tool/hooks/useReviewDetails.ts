import { useQuery } from '@tanstack/react-query';
import { reviewService } from '../services/ReviewService';
import { queryKeys } from './queryKeys';

/**
 * Fetches full review details (stage outputs) from cat_reviewresultfile
 * when a review dialog is opened. Only runs when reviewId is provided.
 *
 * staleTime: Infinity — review results are immutable until a new review runs.
 * Cache is invalidated by useReviewMutation after each successful review.
 */
export function useReviewDetails(reviewId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.review(reviewId ?? ''),
    queryFn: () => reviewService.getReviewDetails(reviewId!),
    enabled: !!reviewId,
    staleTime: Infinity,
  });
}
