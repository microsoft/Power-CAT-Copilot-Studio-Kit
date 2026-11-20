import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AgentInventoryService } from '../services/AgentInventoryService';
import { AgentInventoryUsageService } from '../services/AgentInventoryUsageService';
import { getLastAgentSyncTime } from '../services/syncStatusService';
import { buildDashboardModel } from '../utils/aggregations';
import { agentInventoryKeys } from './queryKeys';

function twelveMonthsAgo(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
}

export function useInventoryDashboard() {
  const startDate = useMemo(() => twelveMonthsAgo(), []);
  const startIso = startDate.toISOString();
  const agentsQuery = useQuery({
    queryKey: agentInventoryKeys.agents(),
    queryFn: () => AgentInventoryService.listAll(),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const usageQuery = useQuery({
    queryKey: agentInventoryKeys.usage(startIso),
    queryFn: () => AgentInventoryUsageService.listSince(startDate),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const lastSyncQuery = useQuery({
    queryKey: agentInventoryKeys.lastSync(),
    queryFn: () => getLastAgentSyncTime(),
  });
  const model = useMemo(
    () => buildDashboardModel(agentsQuery.data ?? [], usageQuery.data ?? []),
    [agentsQuery.data, usageQuery.data],
  );
  return { model, agentsQuery, usageQuery, lastSyncedAt: lastSyncQuery.data };
}
