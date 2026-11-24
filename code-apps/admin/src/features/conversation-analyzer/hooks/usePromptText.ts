import { useQuery } from '@tanstack/react-query';
import type { PromptRow } from '../contracts/types';
import { SystemPromptTextService } from '../services/SystemPromptTextService';
import { getAiModelName } from '../utils/aiModelName';
import { queryKeys } from './queryKeys';

/**
 * Prompt instructions to display. Custom prompts use their stored text; system prompts
 * load the published AI Builder instructions.
 */
export function usePromptText(prompt: PromptRow) {
  const stored = prompt.userPrompt?.trim();
  const needsLookup = prompt.scope === 'system' && !stored;
  const query = useQuery({
    queryKey: queryKeys.systemPromptText(getAiModelName(prompt)),
    queryFn: () => SystemPromptTextService.getPromptText(prompt),
    enabled: needsLookup,
    staleTime: Infinity,
  });
  return {
    text: stored || (needsLookup ? query.data : undefined),
    isLoading: needsLookup && query.isPending,
    isError: needsLookup && query.isError,
  };
}
