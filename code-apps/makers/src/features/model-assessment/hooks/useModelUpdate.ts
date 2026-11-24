import { useIsMutating, useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { AgentModelPublishError, getPreviewModelsEnabled, updateAgentModel, type ModelOption } from '../services/model-update-service';

const updateKey = (botId: string) => ['mat', 'update-model', botId] as const;

/** Whether the environment allows preview and experimental models. */
export function usePreviewModelsEnabled() {
  return useQuery({
    queryKey: ['mat', 'preview-models-enabled'],
    queryFn: getPreviewModelsEnabled,
    staleTime: 10 * 60_000,
  });
}

/** Saves the model, publishes for Kit evaluations, then refreshes the live model and publication state. */
export function useUpdateAgentModel(botId: string, harness: boolean, kitMode = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: updateKey(botId),
    // Keep failed publications retryable when the drawer is closed and reopened.
    gcTime: Infinity,
    mutationFn: (option: ModelOption) => updateAgentModel(botId, harness, option, kitMode),
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['mat', 'live-models'] }),
      queryClient.invalidateQueries({ queryKey: ['mat', 'kit-options'] }),
    ]),
  });
}

/** Whether the model is being saved or its publication is being confirmed. */
export function useModelUpdating(botId: string): boolean {
  return useIsMutating({ mutationKey: updateKey(botId) }) > 0;
}

export function useModelPublishFailure(botId: string): AgentModelPublishError | undefined {
  const errors = useMutationState({
    filters: { mutationKey: updateKey(botId) },
    select: (mutation) => mutation.state.error,
  });
  const error = errors.at(-1);
  return error instanceof AgentModelPublishError ? error : undefined;
}
