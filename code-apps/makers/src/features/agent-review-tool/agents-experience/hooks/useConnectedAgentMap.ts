import { useQuery } from '@tanstack/react-query';
import type { AgentMapConnectedAgentSnapshot } from '../contracts/AgentMap';
import { loadConnectedAgentMapSnapshot } from '../services/agent-map/connectedAgentMapService';

export interface ConnectedAgentMapTarget {
  nodeId: string;
  schemaName: string;
}

/** Cache and load one selected ConnectedAgentTool target by exact schema name. */
export function useConnectedAgentMap(
  target: ConnectedAgentMapTarget | null,
  orgUrl?: string | null,
) {
  return useQuery<AgentMapConnectedAgentSnapshot, Error>({
    queryKey: ['agent-map', 'connected-agent', orgUrl ?? 'current', target?.schemaName ?? 'none'],
    queryFn: () => loadConnectedAgentMapSnapshot(target?.schemaName ?? '', orgUrl),
    enabled: target !== null,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
