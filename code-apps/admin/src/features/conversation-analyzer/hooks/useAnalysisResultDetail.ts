/**
 * Fetches a single `cat_conversationanalyzer` row by its id. Used by the
 * Analysis Result Details screen.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { ConversationAnalyzerService } from '../services/ConversationAnalyzerService';
import type { Cat_conversationanalyzers } from '../../../generated/models/Cat_conversationanalyzersModel';

export function useAnalysisResultDetail(conversationAnalyzerId: string | undefined) {
  return useQuery<Cat_conversationanalyzers | undefined>({
    queryKey: queryKeys.analysisResultDetail(conversationAnalyzerId ?? ''),
    enabled: Boolean(conversationAnalyzerId),
    queryFn: () => ConversationAnalyzerService.getById(conversationAnalyzerId!),
    staleTime: 60_000,
    gcTime: 300_000,
  });
}
