import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AgentInventoryService } from '../services/AgentInventoryService';
import { AgentInventoryUsageService } from '../services/AgentInventoryUsageService';
import { buildAgentOverview } from '../utils/aggregations';
import { agentInventoryKeys } from './queryKeys';

export function useAgentOverview(agentDetailsId: string | undefined) {
  const agentQuery = useQuery({
    queryKey: agentInventoryKeys.detail(agentDetailsId ?? ''),
    queryFn: () => AgentInventoryService.getById(agentDetailsId!),
    enabled: Boolean(agentDetailsId),
  });
  const usageQuery = useQuery({
    queryKey: agentInventoryKeys.detailUsage(agentDetailsId ?? ''),
    queryFn: () => AgentInventoryUsageService.listForAgent(agentQuery.data!),
    enabled: Boolean(agentQuery.data),
  });
  const model = useMemo(
    () => agentQuery.data ? buildAgentOverview(agentQuery.data, usageQuery.data ?? []) : undefined,
    [agentQuery.data, usageQuery.data],
  );
  return { model, agentQuery, usageQuery };
}
