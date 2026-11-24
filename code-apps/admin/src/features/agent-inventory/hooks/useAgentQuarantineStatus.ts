import { useQuery } from '@tanstack/react-query';
import {
  getAgentQuarantineStatus,
  type AgentQuarantineStatus,
} from '../services/agentQuarantineStatusService';

/**
 * Fetches the live quarantine status for an agent from the
 * "Agent Inventory | Agent Data for Actions" flow. The query is disabled when
 * the identifiers are missing or when `enabled` is false (e.g. the agent has a
 * PPAC environment mismatch, in which case the action is always hidden and the
 * flow call is unnecessary).
 */
export function useAgentQuarantineStatus(
  agentId: string | undefined,
  environmentId: string | undefined,
  enabled = true,
) {
  return useQuery<AgentQuarantineStatus>({
    queryKey: ['agent-quarantine-status', agentId, environmentId],
    queryFn: () => getAgentQuarantineStatus({ agentId: agentId!, environmentId: environmentId! }),
    enabled: enabled && Boolean(agentId && environmentId),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
