import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { ConversationAnalysisIndexService, type AnalysisIndex } from '../services/ConversationAnalysisIndexService';

/** Query key of the per-environment analysis index (also patched by useConversationAnalysis). */
export const analysisIndexKey = (environmentUrl: string) =>
  [...queryKeys.all, 'conversation-analysis-index', environmentUrl] as const;

/** Which transcripts of an environment were analyzed, and with which prompt/outcome. */
export function useConversationAnalysisIndex(environmentUrl: string | undefined) {
  return useQuery<AnalysisIndex>({
    queryKey: analysisIndexKey(environmentUrl ?? ''),
    queryFn: () => ConversationAnalysisIndexService.load(environmentUrl ?? ''),
    enabled: Boolean(environmentUrl),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
