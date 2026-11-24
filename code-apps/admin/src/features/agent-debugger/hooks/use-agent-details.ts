import { useQuery } from "@tanstack/react-query";
import { getAllAgentDetails, getAgentDetailsById } from "../services/dataverse-agent-service";

/** Shared stale time for agent detail queries. */
export const AGENT_STALE_TIME_MS = 1000 * 60 * 5; // 5 minutes

/** Fetches all agents with transcripts. Paginates through all Dataverse pages automatically. */
export function useAgentDetailsList() {
  return useQuery({
    queryKey: ["agentDetailsList"],
    queryFn: getAllAgentDetails,
    staleTime: AGENT_STALE_TIME_MS,
  });
}

export function useAgentDetailsById(agentId: string | undefined) {
  return useQuery({
    queryKey: ["agentDetails", agentId],
    queryFn: () => (agentId ? getAgentDetailsById(agentId) : null),
    enabled: !!agentId,
    staleTime: AGENT_STALE_TIME_MS,
  });
}
