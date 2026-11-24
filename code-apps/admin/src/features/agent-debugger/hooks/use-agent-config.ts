import { useQuery } from "@tanstack/react-query";
import { fetchLiveAgentConfig } from "../services/agent-config-service";
import type { AgentConfig } from "../services/agent-config-service";

const STALE_TIME = 5 * 60 * 1000;

/** Load configuration from the selected bot's environment, independent of inventory. */
export function useAgentConfig(botId: string | undefined, environmentUrl: string) {
  return useQuery<AgentConfig>({
    queryKey: ["liveAgentConfig", environmentUrl, botId],
    queryFn: () => {
      if (!botId) throw new Error("botId is required");
      return fetchLiveAgentConfig(botId, environmentUrl);
    },
    enabled: !!botId && !!environmentUrl,
    staleTime: STALE_TIME,
    retry: false,
  });
}
