/**
 * Create / update mutation for cat_conversationanalyzerprompt (custom prompts only).
 * Used by the Manage prompts drawer. Updates the prompts table cache, then
 * invalidates every Conversation Analyzer query.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConversationAnalyzerPromptService } from '../services/ConversationAnalyzerPromptService';
import { queryKeys } from './queryKeys';
import { PROMPTS_TABLE_QUERY_KEY, type PromptTableRow } from './usePromptsTable';
import { getPromptLabel } from '../utils/format';
import type { PromptRow } from '../contracts/types';

export interface UpsertPromptInput {
  id?: string;
  name: string;
  displayName?: string;
  userPrompt: string;
}

export function useUpsertPrompt() {
  const queryClient = useQueryClient();
  return useMutation<PromptRow, Error, UpsertPromptInput>({
    mutationFn: async (input) => {
      const fields = { name: input.name, displayName: input.displayName, userPrompt: input.userPrompt };
      return input.id
        ? ConversationAnalyzerPromptService.update(input.id, fields)
        : ConversationAnalyzerPromptService.create(fields);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<PromptTableRow[]>(PROMPTS_TABLE_QUERY_KEY, (old) => {
        if (!old) return old;
        const now = new Date().toISOString();
        if (old.some((r) => r.id === result.id)) {
          return old.map((r) => (r.id === result.id ? { ...r, ...result, runsCount: r.runsCount, lastRunAt: r.lastRunAt, modifiedOn: result.modifiedOn ?? now } : r));
        }
        return [...old, { ...result, createdOn: result.createdOn ?? now, modifiedOn: result.modifiedOn ?? now, runsCount: 0 }]
          .sort((a, b) => getPromptLabel(a).localeCompare(getPromptLabel(b)));
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.all });
    },
    onError: (error) => {
      console.error('[useUpsertPrompt] Save failed:', error.message);
    },
  });
}
