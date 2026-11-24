/**
 * React Query state over a single stored Skills and Automations review.
 *
 * The route page needs one review by id, which the landing page's list hook
 * cannot serve: a page opened cold — a refresh, a bookmark, or a link sent to a
 * colleague — has an id and nothing else.
 *
 * The cached list is used as the initial value when it happens to hold the row,
 * so opening a review from the grid paints immediately instead of showing a
 * spinner for a record already in memory. The query still runs, so a row edited
 * elsewhere is corrected on arrival.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getArtifactReview, type StoredArtifactReview } from '../services/artifactReviewStore';
import { artifactHistoryQueryKey } from './useArtifactHistory';

/** Namespaced under the same root as the list, so both clear together. */
export const artifactReviewQueryKey = (reviewId: string) =>
  ['agent-review-tool', 'artifact-review', reviewId] as const;

export interface UseArtifactReviewRecord {
  review: StoredArtifactReview | null;
  isLoading: boolean;
  /** Set only when the lookup itself failed, not when the row is absent. */
  loadError: string | null;
  /** The lookup succeeded and the row is not there. */
  notFound: boolean;
}

export function useArtifactReviewRecord(reviewId: string): UseArtifactReviewRecord {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: artifactReviewQueryKey(reviewId),
    queryFn: () => getArtifactReview(reviewId),
    initialData: () => {
      const cached = queryClient.getQueryData<StoredArtifactReview[]>(artifactHistoryQueryKey);
      return cached?.find((entry) => entry.reviewId === reviewId);
    },
  });

  return {
    review: query.data ?? null,
    isLoading: query.isPending,
    loadError:
      query.error instanceof Error && query.error.message
        ? query.error.message
        : query.error
          ? 'The review could not be loaded.'
          : null,
    // `data === null` is the store's "no such row". `undefined` means the query
    // has not resolved yet, which is not the same thing and must not render as
    // "unavailable".
    notFound: !query.isPending && !query.error && query.data === null,
  };
}
