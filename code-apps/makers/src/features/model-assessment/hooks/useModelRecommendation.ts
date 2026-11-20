import { useQuery } from '@tanstack/react-query';
import type { RecommendationRequest } from '../contracts/model-recommendation';
import { requestModelRecommendation } from '../services/model-recommendation-service';

/**
 * Model recommendation for a ready comparison. Each run pair is asked once per
 * session (AI prompts use Copilot Credits); switching back to a pair reuses it.
 */
export function useModelRecommendation(request: RecommendationRequest) {
  const ready = request.state === 'ready' ? request : undefined;
  return useQuery({
    queryKey: ['mat', 'model-recommendation', ready?.key],
    queryFn: () => requestModelRecommendation(ready!.payload),
    enabled: Boolean(ready),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
