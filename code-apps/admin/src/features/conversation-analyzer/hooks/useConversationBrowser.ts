import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { ConversationBrowserService } from '../services/ConversationBrowserService';
import type { ConversationBrowserPage } from '../services/ConversationBrowserService';
import type {
  ConversationTranscriptSortColumn,
  ConversationTranscriptSortDirection,
} from '../contracts/types';
import { getTraversedSkipTokens } from '../utils/dataversePagination';

/** Logs every failed attempt because the Conversations tab shows only generic error messages. */
async function logLoadFailure<T>(description: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`[useConversationBrowser] ${description}`, error);
    throw error;
  }
}

/** Loads the environments of agents with conversation transcripts (from `cat_agentdetails`). */
export function useConversationEnvironments() {
  return useQuery({
    queryKey: queryKeys.conversationEnvironments(),
    queryFn: () =>
      logLoadFailure('Environment list failed to load:', () =>
        ConversationBrowserService.listEnvironments(),
      ),
    staleTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/** Loads every agent with transcripts in one environment, independent of the grid's loaded pages. */
export function useConversationAgents(environmentUrl: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversationAgents(environmentUrl ?? ''),
    queryFn: () =>
      logLoadFailure('Agent list failed to load:', () => {
        if (!environmentUrl) throw new Error('Select a Dataverse environment to load agents.');
        return ConversationBrowserService.listTranscriptAgents(environmentUrl);
      }),
    enabled: Boolean(environmentUrl),
    staleTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/** Loads transcript pages from one environment with server-side search, agent, time-period filters and sorting. */
export function useConversationTranscripts(
  environmentUrl: string | undefined,
  agentId: string | undefined,
  search: string,
  searchAgentIds: readonly string[],
  sortColumn: ConversationTranscriptSortColumn,
  sortDirection: ConversationTranscriptSortDirection,
  since?: string,
  until?: string,
) {
  const queryKey = [...queryKeys.conversationTranscripts(
    environmentUrl ?? '',
    agentId ?? '',
    search,
    searchAgentIds,
    sortColumn,
    sortDirection,
  ), since ?? '', until ?? ''] as const;

  return useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, client }) =>
      logLoadFailure('Conversation transcripts failed to load:', () => {
        if (!environmentUrl) throw new Error('Select a Dataverse environment to load conversations.');
        const pageParams =
          client.getQueryData<InfiniteData<ConversationBrowserPage, string | undefined>>(queryKey)
            ?.pageParams ?? [];
        return ConversationBrowserService.listTranscriptPage({
          environmentUrl,
          agentId,
          search,
          searchAgentIds,
          sortColumn,
          sortDirection,
          since,
          until,
          skipToken: pageParam,
          usedSkipTokens: getTraversedSkipTokens(pageParams, pageParam),
        });
      }),
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    enabled: Boolean(environmentUrl),
    // A stale infinite query refetches every loaded page in sequence, so cached pages are reused until garbage-collected.
    staleTime: Infinity,
    gcTime: 120_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/** Counts transcripts matching the grid filters; resolves to undefined when the total is unavailable. */
export function useConversationTranscriptCount(
  environmentUrl: string | undefined,
  agentId: string | undefined,
  search: string,
  searchAgentIds: readonly string[],
  since?: string,
  until?: string,
) {
  return useQuery({
    queryKey: [...queryKeys.conversationTranscriptCount(
      environmentUrl ?? '',
      agentId ?? '',
      search,
      searchAgentIds,
    ), since ?? '', until ?? ''],
    queryFn: async () => {
      if (!environmentUrl) return null;
      return (
        (await ConversationBrowserService.countTranscripts({
          environmentUrl,
          agentId,
          search,
          searchAgentIds,
          since,
          until,
        })) ?? null
      );
    },
    enabled: Boolean(environmentUrl),
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Loads one transcript's raw content for the chat viewer. */
export function useConversationTranscriptContent(
  environmentUrl: string | undefined,
  transcriptId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.conversationTranscriptContent(environmentUrl ?? '', transcriptId ?? ''),
    queryFn: () =>
      logLoadFailure('Conversation transcript failed to load:', () => {
        if (!environmentUrl || !transcriptId) throw new Error('Select a conversation to view.');
        return ConversationBrowserService.getTranscriptContent(environmentUrl, transcriptId);
      }),
    enabled: Boolean(environmentUrl && transcriptId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
