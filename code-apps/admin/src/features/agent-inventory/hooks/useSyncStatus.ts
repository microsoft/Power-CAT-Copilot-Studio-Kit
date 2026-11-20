import { useQuery } from '@tanstack/react-query';
import { getSyncStatus, type SyncStatus } from '../services/syncStatusService';
import { agentInventoryKeys } from './queryKeys';

/**
 * Checks whether an Agent Inventory data-load run is currently in progress so
 * the dashboard can disable the "Sync agents" and Settings actions while a sync
 * is underway. Runs alongside the dashboard data load.
 */
export function useSyncStatus() {
  return useQuery<SyncStatus>({
    queryKey: agentInventoryKeys.syncStatus(),
    queryFn: () => getSyncStatus(),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
