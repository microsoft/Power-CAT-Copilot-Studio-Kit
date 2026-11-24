/**
 * useAgentValues — fetches all active agent value classification records.
 */
import { useQuery } from '@tanstack/react-query';
import { agentValueQueryKeys } from './queryKeys';
import { AgentValueService } from '../services/AgentValueService';
import type { AgentValueRecord } from '../contracts/types';

const STALE_TIME = 5 * 60 * 1000;

/** Fetches all active AgentValueRecord rows from Dataverse. */
export function useAgentValues() {
  return useQuery<AgentValueRecord[]>({
    queryKey: agentValueQueryKeys.agentValues(),
    queryFn: () => AgentValueService.getAll(),
    staleTime: STALE_TIME,
  });
}
