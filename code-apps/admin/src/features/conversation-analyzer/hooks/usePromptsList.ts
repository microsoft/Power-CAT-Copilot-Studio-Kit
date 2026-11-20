/**
 * Lightweight hook to fetch just the prompts list (id + name) without
 * heavy analyzer-row stats. Use on the Results screen where we only need
 * prompt names for the dropdown filter.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { ConversationAnalyzerPromptService } from '../services/ConversationAnalyzerPromptService';
import type { PromptRow } from '../contracts/types';

export function usePromptsList() {
  return useQuery<PromptRow[]>({
    queryKey: queryKeys.promptsAll('', 1, 0),
    queryFn: () => ConversationAnalyzerPromptService.list(),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}
