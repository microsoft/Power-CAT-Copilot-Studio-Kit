/**
 * useUsageHistory - Fetches ALL agent usage history records.
 *
 * No server-side filtering — fetches all records once, filtering is done
 * client-side in UsageHistoryTab (ExistingSrcCode pattern).
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { AgentUsageHistoryService } from '../services/AgentUsageHistoryService';
import type { AgentUsageHistory } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';

/** Fetches all agent usage history records (no server-side filter). */
export function useUsageHistory() {
  return useQuery<AgentUsageHistory[]>({
    queryKey: queryKeys.usageHistory('all', 'all', '', '', 'all'),
    queryFn: () => AgentUsageHistoryService.getAll(),
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
