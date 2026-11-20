/**
 * useAgentDetails — fetches inventory summary rows from the Agent Details table.
 * Shared by the agent count KPI and the inventory-backed drillthroughs.
 */
import { useQuery } from '@tanstack/react-query';
import { agentValueQueryKeys } from './queryKeys';
import { AgentDetailsService } from '../services/AgentDetailsService';
import type { AgentDetailsRecord } from '../contracts/types';

const STALE_TIME = 5 * 60 * 1000;

/** Fetches all Agent Details summary rows from Dataverse. */
export function useAgentDetails() {
  return useQuery<AgentDetailsRecord[]>({
    queryKey: agentValueQueryKeys.agentDetails(),
    queryFn: () => AgentDetailsService.getAll(),
    staleTime: STALE_TIME,
  });
}
