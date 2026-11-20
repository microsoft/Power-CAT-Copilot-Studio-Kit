/**
 * React Query hook for published custom agent templates (Makers app).
 * Feeds the merged Agent Library gallery; read-only (no authoring).
 */

import { useQuery } from '@tanstack/react-query';
import { AgentTemplateService } from '../services/AgentTemplateService';
import type { AgentTemplate } from '../library';

const STALE_TIME = 5 * 60 * 1000;

export const agentTemplateKeys = {
  all: ['agentTemplates'] as const,
  list: () => [...agentTemplateKeys.all, 'list'] as const,
};

export function useAgentTemplates() {
  return useQuery<AgentTemplate[]>({
    queryKey: agentTemplateKeys.list(),
    queryFn: () => AgentTemplateService.listAll(),
    staleTime: STALE_TIME,
  });
}
