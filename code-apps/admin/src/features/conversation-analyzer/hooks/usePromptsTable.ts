/**
 * Prompts table for Manage prompts: every active prompt (system + custom) with
 * all-time runs count and last run, computed server-side via a FetchXML
 * aggregate (GROUP BY prompt, COUNT + MAX(createdon)).
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { ConversationAnalyzerPromptService } from '../services/ConversationAnalyzerPromptService';
import { PromptRunStatsService } from '../services/PromptRunStatsService';
import { getPromptLabel } from '../utils/format';
import type { PromptRow } from '../contracts/types';

export interface PromptTableRow extends PromptRow {
  runsCount: number;
  lastRunAt?: string;
}

/** Query key shared with the optimistic updates in `useUpsertPrompt` / `useDeletePrompt`. */
export const PROMPTS_TABLE_QUERY_KEY = queryKeys.promptsTable('all-time', '', 'all', 'name', 1, 0);

export function usePromptsTable() {
  return useQuery<PromptTableRow[]>({
    queryKey: PROMPTS_TABLE_QUERY_KEY,
    queryFn: async () => {
      const [prompts, stats] = await Promise.all([
        ConversationAnalyzerPromptService.list(),
        PromptRunStatsService.getAllTimeStats(),
      ]);
      return prompts
        .map((p) => {
          const s = stats.get(p.id.toLowerCase());
          return { ...p, runsCount: s?.count ?? 0, lastRunAt: s?.lastRunAt };
        })
        .sort((a, b) => getPromptLabel(a).localeCompare(getPromptLabel(b)));
    },
    staleTime: 60_000,
    gcTime: 300_000,
  });
}
