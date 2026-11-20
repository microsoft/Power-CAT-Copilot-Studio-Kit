/**
 * Resolve an agentId (the GUID stored as text on `cat_conversationanalyzer`)
 * to a display name via the `cat_agentdetails` registry. Used by sub-screens
 * for breadcrumbs and headers.
 *
 * The same bot ID can be registered in several environments, so the optional
 * `environmentUrl` (from the `env` URL param) picks the matching registration.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { AgentService, type AgentLite } from '../services/AgentService';

const normalizeUrl = (url: string | undefined) => url?.trim().replace(/\/+$/, '').toLowerCase() || undefined;

export function useAgentMeta(agentId: string | undefined, environmentUrl?: string) {
  return useQuery<AgentLite | undefined>({
    queryKey: queryKeys.agentMeta(agentId ?? '', environmentUrl ?? ''),
    enabled: Boolean(agentId),
    queryFn: async () => {
      const agents = await AgentService.listWithTranscripts();
      const matches = agents.filter((a) => a.agentId === agentId || a.agentDetailsId === agentId);
      const env = normalizeUrl(environmentUrl);
      return (env && matches.find((a) => normalizeUrl(a.environmentUrl) === env)) || matches[0];
    },
    staleTime: 300_000,
    gcTime: 600_000,
  });
}
