/**
 * React Query hooks for custom agent templates (Admin app).
 *
 * `useAgentTemplates` feeds the merged gallery; the create/update mutations are
 * wired to the package's authoring dialog via the AgentLibraryProvider config
 * callbacks and invalidate the list so the gallery refreshes on success.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AgentTemplateService } from '../services/AgentTemplateService';
import type { AgentTemplate, TemplateSubmitValues } from '../library';

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

export function useCreateAgentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ values, file }: { values: TemplateSubmitValues; file: File }) =>
      AgentTemplateService.create(values, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentTemplateKeys.all }),
  });
}

export function useUpdateAgentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values, file }: { id: string; values: TemplateSubmitValues; file?: File }) =>
      AgentTemplateService.update(id, values, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentTemplateKeys.all }),
  });
}

export function useDeleteAgentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name?: string }) => AgentTemplateService.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentTemplateKeys.all }),
  });
}
