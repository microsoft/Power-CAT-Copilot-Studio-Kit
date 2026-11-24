import { useQuery } from '@tanstack/react-query';
import { AgentInventoryService } from '../services/AgentInventoryService';
import { agentInventoryKeys } from './queryKeys';

export function useAllAgents() {
  return useQuery({
    queryKey: agentInventoryKeys.agents(),
    queryFn: () => AgentInventoryService.listAll(),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
