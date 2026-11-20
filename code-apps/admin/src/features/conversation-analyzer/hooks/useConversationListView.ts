import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InfiniteData, InfiniteQueryObserverResult } from '@tanstack/react-query';
import type { ConversationBrowserPage, ConversationBrowserRow } from '../services/ConversationBrowserService';
import { toIndexKey, type AnalysisIndex } from '../services/ConversationAnalysisIndexService';
import type { ConversationAnalysisRunState } from './useConversationAnalysis';
import type { ConversationGridRow, ConversationGridSortState } from '../components/shared/conversation-grid/types';
import { sortConversationRows } from '../components/shared/conversation-grid/conversationGridSort';

export type AnalysisStatusFilter = 'all' | 'not-analyzed' | 'analyzed';

export type ConversationListRow = ConversationBrowserRow & ConversationGridRow;

type PagesData = InfiniteData<ConversationBrowserPage, unknown>;

export interface ConversationPagesSource {
  data?: PagesData;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  fetchNextPage: () => Promise<InfiniteQueryObserverResult<PagesData, Error>>;
}

export interface ConversationListOptions {
  source: ConversationPagesSource;
  index?: AnalysisIndex;
  promptLabels: ReadonlyMap<string, string>;
  run?: ConversationAnalysisRunState | null;
  environmentUrl?: string;
  status: AnalysisStatusFilter;
  hideGreetingOnly: boolean;
  /** Applied to loaded rows when the server cannot sort the column. */
  clientSort?: ConversationGridSortState;
  /** Changing the scope resets the visible-row target. */
  scopeKey: string;
}

export const LIST_PAGE_SIZE = 25;
/** Maximum server pages fetched per request while filling client-side filters (FR-D2). */
export const MAX_PAGES_PER_REQUEST = 20;

/**
 * Joins transcript pages with the analysis index and applies the client-side status and
 * greeting-only filters (FR-D2). Pages ahead automatically until 25 more rows match, capped at
 * {@link MAX_PAGES_PER_REQUEST} pages per request; beyond that, scrolling the grid continues.
 */
export function useConversationListView(options: ConversationListOptions) {
  const { source, index, promptLabels, run, environmentUrl, status, hideGreetingOnly, clientSort, scopeKey } = options;
  const [paging, setPaging] = useState({ scopeKey, limit: LIST_PAGE_SIZE, startPage: 0 });
  if (paging.scopeKey !== scopeKey) setPaging({ scopeKey, limit: LIST_PAGE_SIZE, startPage: 0 });

  const runStatus = run && run.environmentUrl === environmentUrl ? run.rowStatus : undefined;
  const toListRow = useCallback((row: ConversationBrowserRow): ConversationListRow => {
    const state = runStatus?.[row.id];
    return {
      ...row,
      transcriptId: row.id,
      startTime: row.conversationStartTime ?? row.createdOn,
      analyses: (index?.get(toIndexKey(row.id)) ?? []).map((entry) => ({
        key: entry.recordId,
        promptLabel: (entry.promptId && promptLabels.get(entry.promptId)) || 'Prompt',
        outcomeLabel: entry.outcomeLabel,
        tone: entry.tone,
      })),
      runStatus: state === 'queued' || state === 'analyzing' ? state : undefined,
    };
  }, [index, promptLabels, runStatus]);

  const matches = useCallback((row: ConversationListRow) => {
    if (hideGreetingOnly && row.isGreetingOnly) return false;
    const analyzed = (row.analyses?.length ?? 0) > 0;
    if (status === 'analyzed') return analyzed;
    if (status === 'not-analyzed') return !analyzed;
    return true;
  }, [hideGreetingOnly, status]);

  const loaded = useMemo(
    () => (source.data?.pages ?? []).flatMap((page) => page.rows).map(toListRow),
    [source.data, toListRow],
  );
  const matching = useMemo(() => {
    const filtered = loaded.filter(matches);
    return clientSort ? sortConversationRows(filtered, clientSort) : filtered;
  }, [clientSort, loaded, matches]);
  const hiddenGreetingCount = useMemo(
    () => (hideGreetingOnly ? loaded.filter((row) => row.isGreetingOnly).length : 0),
    [hideGreetingOnly, loaded],
  );

  const pageCount = source.data?.pages.length ?? 0;
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isError } = source;
  const isCapped = matching.length < paging.limit && hasNextPage && pageCount - paging.startPage >= MAX_PAGES_PER_REQUEST;

  useEffect(() => {
    if (matching.length >= paging.limit || !hasNextPage || isFetchingNextPage || isError || isCapped) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isCapped, isError, isFetchingNextPage, matching.length, paging.limit]);

  const showMore = useCallback(() => {
    setPaging((current) => ({ ...current, limit: current.limit + LIST_PAGE_SIZE, startPage: pageCount }));
  }, [pageCount]);

  /** Loads pages until `count` rows match the filters (CV-12) and returns them in the current order. */
  const selectFirst = useCallback(async (count: number) => {
    const collect = (pages: ConversationBrowserPage[]) => {
      const rows = pages.flatMap((page) => page.rows).map(toListRow).filter(matches);
      return clientSort ? sortConversationRows(rows, clientSort) : rows;
    };
    let pages = source.data?.pages ?? [];
    let more = source.hasNextPage;
    let fetched = 0;
    while (collect(pages).length < count && more && fetched < MAX_PAGES_PER_REQUEST) {
      const result = await source.fetchNextPage();
      if (result.isError) break;
      pages = result.data?.pages ?? pages;
      more = result.hasNextPage;
      fetched += 1;
    }
    return { rows: collect(pages).slice(0, count), hasMore: more };
  }, [clientSort, matches, source, toListRow]);

  return {
    rows: matching.slice(0, paging.limit),
    matchingLoadedCount: matching.length,
    hiddenGreetingCount,
    hasMore: matching.length > paging.limit || hasNextPage,
    isPagingAhead: isFetchingNextPage,
    showMore,
    selectFirst,
  };
}
