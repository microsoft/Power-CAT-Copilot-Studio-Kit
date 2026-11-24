/**
 * Delete mutation for a custom prompt (and its analysis results).
 * Optimistically removes the row from the prompts table cache.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConversationAnalyzerPromptService } from '../services/ConversationAnalyzerPromptService';
import { queryKeys } from './queryKeys';
import { PROMPTS_TABLE_QUERY_KEY, type PromptTableRow } from './usePromptsTable';

export function useDeletePrompt() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string, { previous?: PromptTableRow[] }>({
    mutationFn: (id) => ConversationAnalyzerPromptService.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: PROMPTS_TABLE_QUERY_KEY });
      const previous = queryClient.getQueryData<PromptTableRow[]>(PROMPTS_TABLE_QUERY_KEY);
      queryClient.setQueryData<PromptTableRow[]>(PROMPTS_TABLE_QUERY_KEY, (old) => old?.filter((r) => r.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(PROMPTS_TABLE_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.all });
    },
  });
}
