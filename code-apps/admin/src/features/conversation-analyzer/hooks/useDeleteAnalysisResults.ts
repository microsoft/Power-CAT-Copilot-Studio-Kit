import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Cat_conversationanalyzers } from '../../../generated/models/Cat_conversationanalyzersModel';
import { CONVERSATION_BATCH_SIZE } from '../contracts/constants';
import { ConversationAnalyzerService } from '../services/ConversationAnalyzerService';
import { toIndexKey, type AnalysisIndex } from '../services/ConversationAnalysisIndexService';
import type { AnalyzerBase } from '../services/analyzerBase';
import { removeAnalyzerResults, removeFromAnalysisIndex } from '../utils/mergeAnalyzerResults';
import { ANALYZER_BASE_KEY } from './useAnalyzerBase';
import { queryKeys } from './queryKeys';

/** Deletes analysis results in batches; resolves to the number of failed deletions (AR-4). */
export function useDeleteAnalysisResults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: readonly string[]) => {
      let failed = 0;
      for (let i = 0; i < ids.length; i += CONVERSATION_BATCH_SIZE) {
        const batch = ids.slice(i, i + CONVERSATION_BATCH_SIZE);
        const results = await Promise.allSettled(batch.map((id) => ConversationAnalyzerService.delete(id)));
        failed += results.filter((r) => r.status === 'rejected').length;
        // Drop deleted records from cached lists now; cached screens would otherwise show them until refetched.
        const deleted = new Set(batch.filter((_, j) => results[j].status === 'fulfilled').map(toIndexKey));
        queryClient.setQueriesData<AnalysisIndex>(
          { queryKey: [...queryKeys.all, 'conversation-analysis-index'] },
          (index) => removeFromAnalysisIndex(index, deleted),
        );
        queryClient.setQueryData<AnalyzerBase>(ANALYZER_BASE_KEY, (base) => removeAnalyzerResults(base, deleted));
        queryClient.setQueriesData<Cat_conversationanalyzers[]>(
          { queryKey: [...queryKeys.all, 'analysis-results'] },
          (records) => records?.filter((r) => !deleted.has(toIndexKey(r.cat_conversationanalyzerid))),
        );
      }
      return failed;
    },
    // Not awaited: caches are already pruned above, so the button shouldn't wait for every analyzer query to refetch.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.all, refetchType: 'all' });
    },
  });
}
