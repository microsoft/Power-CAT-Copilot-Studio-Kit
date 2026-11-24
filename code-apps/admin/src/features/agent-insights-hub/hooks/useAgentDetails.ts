/**
 * useAgentDetails hooks for agent detail lookups.
 *
 * useAgentDetailsSearch: Server-side search with OData $filter for scalable
 * lookup across 30k+ records. Used in AddAgentDialog.
 *
 * useAgentDetails: Fetches a page of agents without search filter.
 * Used in UsageHistoryTab for agent name resolution.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { AgentDetailsService } from '../services/AgentDetailsService';
import type { AgentDetails } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';

/** Fetches agent details with server-side search filtering (debounced). */
export function useAgentDetailsSearch(searchText: string) {
  return useQuery<AgentDetails[]>({
    queryKey: [...queryKeys.agentDetails(), searchText],
    queryFn: () => AgentDetailsService.search(searchText || undefined),
    staleTime: REACT_QUERY_STALE_TIME,
    placeholderData: (prev) => prev,
  });
}

/** Fetches agent details for name resolution (non-search use cases). */
export function useAgentDetails() {
  return useQuery<AgentDetails[]>({
    queryKey: queryKeys.agentDetails(),
    queryFn: () => AgentDetailsService.search(undefined, 5000),
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
