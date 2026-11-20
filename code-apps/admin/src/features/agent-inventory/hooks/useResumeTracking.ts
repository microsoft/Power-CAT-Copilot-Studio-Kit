import { useQuery } from '@tanstack/react-query';
import { getResumeTrackingState, type ResumeTrackingState } from '../services/syncTrackingService';
import { agentInventoryKeys } from './queryKeys';

/**
 * Runs once when the Agent Inventory feature opens to decide whether completion-
 * notification tracking should resume for a run that is still in flight or that
 * finished (without notifying the user) while the app was closed. Mirrors the
 * custom page's on-load `IsSyncAgentFeatureEnabled` / `IsComplianceScanForNotification`
 * evaluation. The dashboard hands the result to the agent and compliance
 * trackers. Failures resolve to no-resume so the check never blocks the page.
 */
export function useResumeTracking() {
  return useQuery<ResumeTrackingState>({
    queryKey: agentInventoryKeys.resumeTracking(),
    queryFn: () => getResumeTrackingState(),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
