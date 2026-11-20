/**
 * usePersistedCopilotReview — loads a saved Microsoft Copilot harness review (Task 11).
 *
 * Fetches the Dataverse review record via ReviewService.getReviewDetails,
 * deserializes the persisted `agentsExperience` payload, and returns it
 * typed. Never downloads resources or invokes AI — view-only.
 */
import { useQuery } from '@tanstack/react-query';
import { reviewService } from '../../services/ReviewService';
import { queryKeys } from '../../hooks/queryKeys';
import type { PersistedCopilotReviewPayload } from '../../contracts/ReviewResult';

export interface PersistedCopilotReviewData {
  payload: PersistedCopilotReviewPayload;
  reviewedBy?: string;
  reviewedOn?: Date;
  durationMs: number;
  botName: string;
  /** Bot component unique ID from the Dataverse record (enables re-run from view mode). */
  componentIdUnique?: string;
  sourceEnvironment?: string;
  agentVersion?: string;
}

/**
 * Loads a persisted Microsoft Copilot harness review from Dataverse.
 * Returns the deserialized `agentsExperience` payload without rerunning AI.
 *
 * @param reviewId - Dataverse review record ID (cat_agentreviewsid)
 */
export function usePersistedCopilotReview(reviewId: string | null) {
  return useQuery<PersistedCopilotReviewData | null, Error>({
    queryKey: queryKeys.review(reviewId ?? ''),
    queryFn: async (): Promise<PersistedCopilotReviewData | null> => {
      if (!reviewId) return null;
      const details = await reviewService.getReviewDetails(reviewId);
      if (!details.agentsExperience) return null;
      return {
        payload: details.agentsExperience,
        reviewedBy: details.reviewedBy,
        reviewedOn: details.reviewedOn,
        durationMs: details.durationMs ?? 0,
        botName: details.botName ?? 'Agent',
        componentIdUnique: details.componentIdUnique,
        sourceEnvironment: details.sourceEnvironment,
        agentVersion: details.agentVersion,
      };
    },
    enabled: !!reviewId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
