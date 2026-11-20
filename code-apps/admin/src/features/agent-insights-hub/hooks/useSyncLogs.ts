/**
 * useSyncLogs - Fetches sync logs for the SyncLogsTab.
 *
 * No filter state dependency — fetches all logs ordered by createdon desc.
 * Optional configId filter per S-3 from agent validation.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { SyncLogsService } from '../services/SyncLogsService';
import type { SyncLog } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';

/** Fetches sync logs filtered to the child pull metrics flow only. */
export function useSyncLogs() {
  return useQuery<SyncLog[]>({
    queryKey: queryKeys.syncLogs(),
    queryFn: () => SyncLogsService.getAll(
      "cat_cloudflowname eq 'Agent Insights | Pull Agent Metrics (Child)'"
    ),
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
