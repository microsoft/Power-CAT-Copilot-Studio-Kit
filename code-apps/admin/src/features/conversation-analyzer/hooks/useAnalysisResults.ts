/**
 * Fetches all `cat_conversationanalyzer` rows for a given agent.
 * Used by the Analysis Results screen - no time-period filter so
 * a freshly-completed run is always visible. Prompt filtering is done
 * client-side in the screen component.
 *
 * The environment is part of the key and the query waits until the agent has
 * resolved, so it never runs unscoped and mixes results for the same bot ID
 * across environments.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { ConversationAnalyzerService } from '../services/ConversationAnalyzerService';
import type { Cat_conversationanalyzers } from '../../../generated/models/Cat_conversationanalyzersModel';

export function useAnalysisResults(
  agentId: string | undefined,
  environmentUrl: string | undefined,
  agentResolved: boolean,
  refetchInterval: number | false = false,
) {
  return useQuery<Cat_conversationanalyzers[]>({
    queryKey: queryKeys.analysisResults(agentId ?? '', environmentUrl ?? ''),
    enabled: Boolean(agentId) && agentResolved,
    queryFn: () =>
      ConversationAnalyzerService.list({
        startDate: '1970-01-01T00:00:00.000Z',
        endDate: '2999-12-31T23:59:59.999Z',
        agentId,
        environmentUrl,
      }),
    refetchInterval,
    staleTime: 30_000,
    gcTime: 120_000,
  });
}
