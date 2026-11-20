/**
 * useSyncStatus — polls for unnotified Agent Inventory sync log entries.
 * When enabled, refetches every 5 seconds to detect sync completion.
 */
import { useQuery } from '@tanstack/react-query';
import { agentValueQueryKeys } from './queryKeys';
import { SyncStatusService } from '../services/SyncStatusService';
import type { SyncStatusRecord } from '../contracts/types';

const STALE_TIME = 2000;

/** Polls for the latest unnotified sync status when enabled. */
export function useSyncStatus(enabled: boolean) {
  return useQuery<SyncStatusRecord | null>({
    queryKey: agentValueQueryKeys.syncStatus(),
    queryFn: () => SyncStatusService.getLatestUnnotified(),
    refetchInterval: enabled ? 5000 : false,
    staleTime: STALE_TIME,
    enabled,
  });
}
