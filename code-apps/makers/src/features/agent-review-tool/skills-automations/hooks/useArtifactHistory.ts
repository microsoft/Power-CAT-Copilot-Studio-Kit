/**
 * React Query state over the Dataverse-backed review history.
 *
 * The list is the shared record for the environment. Every other Dataverse hook
 * in the Agent Review Tool is a React Query hook, so this one is too: cache
 * invalidation, retry and refetch policy then behave the same across all three
 * tabs, and there is one loading contract rather than two.
 *
 * Save and delete failures are surfaced rather than swallowed. A review costs a
 * real AI call, so a save that quietly failed would be worse than an error.
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArtifactReviewResult } from '../contracts/ArtifactReview';
import {
  deleteArtifactReview,
  listArtifactReviews,
  saveArtifactReview,
  sweepStaleArtifactReviews,
  type StoredArtifactReview,
} from '../services/artifactReviewStore';

/** Namespaced so an invalidation here cannot disturb the other two tabs. */
export const artifactHistoryQueryKey = ['agent-review-tool', 'artifact-reviews'] as const;

/** Matches the declarative agent tab, whose list is the same shape of data. */
const STALE_TIME_MS = 30_000;

/**
 * How often the list re-reads itself while something in it is still running.
 *
 * Only applies while at least one row is `in-progress`. Each of those refetches
 * offers the stranded rows to the resume path, so a review that finishes on the
 * server while the reader is looking at the grid settles in front of them
 * instead of waiting for them to navigate away and back.
 *
 * Twenty seconds because the thing being waited for takes minutes: polling any
 * faster would spend requests to shorten a wait nobody is timing to the second,
 * and polling much slower would leave a finished review looking unfinished for
 * long enough to be reported as a bug.
 */
const RUNNING_REFETCH_MS = 20_000;

export interface UseArtifactHistory {
  entries: StoredArtifactReview[];
  isLoading: boolean;
  /** Set when the list could not be read. The list itself stays empty. */
  loadError: string | null;
  /** Set when the most recent save or delete failed. */
  writeError: string | null;
  /**
   * Saves the review and resolves with its Dataverse id, so the caller can send
   * the user to `/agent-review-tool/skills/:reviewId`. Resolves `null` when the
   * review was not storable or the write failed — the caller then keeps the
   * result on screen rather than navigating to a row that does not exist.
   */
  save: (result: ArtifactReviewResult) => Promise<string | null>;
  remove: (reviewId: string) => Promise<void>;
  refresh: () => void;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useArtifactHistory(): UseArtifactHistory {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: artifactHistoryQueryKey,
    /**
     * Read the list, then resolve anything stranded in it.
     *
     * A review announces itself before its slow AI stage and completes the row
     * afterwards. A browser closed in between leaves the row claiming to be
     * running, so the list is swept here — the one place every reader of the
     * history passes through, whichever page they came from. The sweep looks up
     * the job each stranded row was waiting on and collects it if it finished,
     * which is what lets a review survive a refresh.
     *
     * The re-read only happens when the sweep actually rewrote something, so
     * the common case still costs exactly one request. Doing it inside the
     * query rather than in an effect also means the reader never sees a
     * "Running" row blink to "Not finished" a moment after the grid paints.
     */
    queryFn: async () => {
      const entries = await listArtifactReviews();
      const resolved = await sweepStaleArtifactReviews(entries);
      return resolved > 0 ? await listArtifactReviews() : entries;
    },
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: true,
    /**
     * Keep asking only while something is unfinished.
     *
     * React Query passes the current query, so the decision is made from the
     * data itself rather than from a separate piece of state that could
     * disagree with it. Returning `false` stops the timer the moment the last
     * running row settles, so an idle grid makes no requests at all.
     */
    refetchInterval: (query) =>
      query.state.data?.some((entry) => entry.result.status === 'in-progress')
        ? RUNNING_REFETCH_MS
        : false,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: artifactHistoryQueryKey });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: saveArtifactReview,
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: deleteArtifactReview,
    onSuccess: invalidate,
  });

  const save = useCallback(
    async (result: ArtifactReviewResult) => {
      // The error is read from mutation state, so a rejection here would only
      // produce an unhandled rejection on top of it.
      return await saveMutation.mutateAsync(result).catch(() => null);
    },
    [saveMutation],
  );

  const remove = useCallback(
    async (reviewId: string) => {
      await removeMutation.mutateAsync(reviewId).catch(() => undefined);
    },
    [removeMutation],
  );

  const writeError = saveMutation.error
    ? messageOf(saveMutation.error, 'The review could not be saved to your environment.')
    : removeMutation.error
      ? messageOf(removeMutation.error, 'The review could not be deleted.')
      : null;

  return {
    entries: query.data ?? [],
    isLoading: query.isPending,
    loadError: query.error ? messageOf(query.error, 'Could not load past reviews.') : null,
    writeError,
    save,
    remove,
    refresh: invalidate,
  };
}
