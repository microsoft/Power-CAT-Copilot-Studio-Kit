import { getComplianceProgress, type ComplianceProgress } from '../services/syncTrackingService';
import { agentInventoryKeys } from './queryKeys';
import { usePollingTracker } from './usePollingTracker';

/**
 * Polls the Copilot Studio Kit logs every 5 seconds for the compliance scan
 * triggered alongside the agent load, resolving when the scan reaches a terminal
 * state. `onSettled` fires once with the full {@link ComplianceProgress} —
 * compliance completion only notifies the user (and marks the log notified); it
 * does NOT refresh dashboard data. Call {@link begin} once the agent sync has
 * settled with a non-cancelled compliance log present.
 */
export function useComplianceScanTracker(onSettled: (result: ComplianceProgress) => void) {
  return usePollingTracker<void, ComplianceProgress>(
    agentInventoryKeys.complianceProgress(),
    () => getComplianceProgress(),
    (result) => result.outcome === 'pending',
    onSettled,
  );
}
