import {
  getSyncProgress,
  type SyncProgress,
  type SyncTrackingSetup,
} from '../services/syncTrackingService';
import { agentInventoryKeys } from './queryKeys';
import { usePollingTracker } from './usePollingTracker';

/**
 * Polls the Copilot Studio Kit logs every 5 seconds after an on-demand sync is
 * started, resolving when the agent (and, when enabled, usage) data-load run
 * reaches a terminal state. `onSettled` fires once per run with the full
 * {@link SyncProgress} so the caller can notify the user, mark the logs as
 * notified, refresh dashboard data, and optionally begin compliance tracking.
 *
 * Call {@link begin} with the {@link SyncTrackingSetup} captured *before* the
 * sync flow was triggered.
 */
export function useAgentSyncTracker(onSettled: (result: SyncProgress) => void) {
  return usePollingTracker<SyncTrackingSetup, SyncProgress>(
    agentInventoryKeys.syncProgress(),
    (setup) => getSyncProgress(setup.baseline, setup.usageEnabled, setup.complianceEnabled),
    (result) => result.outcome === 'pending',
    onSettled,
  );
}
