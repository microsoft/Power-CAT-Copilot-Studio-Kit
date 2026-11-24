import { useCallback, useEffect, useRef, useState } from 'react';
import type { GridPage, GridQuery } from './AdvancedDataGrid.types';

interface LocalInfiniteRecordsOptions<TRecord> {
  mode: 'local';
  records: TRecord[];
  queryKey: string;
  pageSize: number;
}

interface ServerInfiniteRecordsOptions<TRecord> {
  mode: 'server';
  query: Omit<GridQuery, 'skip' | 'take'>;
  loadRecords: (query: GridQuery, signal: AbortSignal) => Promise<GridPage<TRecord>>;
  queryKey: string;
  pageSize: number;
}

type InfiniteRecordsOptions<TRecord> =
  | LocalInfiniteRecordsOptions<TRecord>
  | ServerInfiniteRecordsOptions<TRecord>;

export function useInfiniteRecords<TRecord>(options: InfiniteRecordsOptions<TRecord>) {
  const { mode, pageSize, queryKey } = options;
  const [localWindow, setLocalWindow] = useState({ queryKey, count: pageSize });
  const [serverState, setServerState] = useState<{
    queryKey: string;
    records: TRecord[];
    totalCount: number;
    hasMore: boolean;
    isLoading: boolean;
    error: Error | null;
  }>({
    queryKey: '',
    records: [],
    totalCount: 0,
    hasMore: false,
    isLoading: false,
    error: null,
  });
  const requestVersion = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const loadRecords = mode === 'server' ? options.loadRecords : undefined;
  const query = mode === 'server' ? options.query : undefined;
  const localRecords = mode === 'local' ? options.records : undefined;
  const visibleCount = localWindow.queryKey === queryKey ? localWindow.count : pageSize;

  const fetchServerPage = useCallback(async (skip: number, append: boolean) => {
    if (!loadRecords || !query) return;
    const version = ++requestVersion.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setServerState((current) => ({
      ...current,
      isLoading: true,
      error: null,
    }));
    try {
      const page = await loadRecords(
        { ...query, skip, take: pageSize },
        controller.signal,
      );
      if (requestVersion.current !== version || controller.signal.aborted) return;
      setServerState((current) => ({
        queryKey,
        records: append && current.queryKey === queryKey
          ? [...current.records, ...page.records]
          : page.records,
        totalCount: page.totalCount,
        hasMore: page.hasMore,
        isLoading: false,
        error: null,
      }));
    } catch (caught) {
      if (controller.signal.aborted || requestVersion.current !== version) return;
      setServerState((current) => ({
        ...current,
        queryKey,
        isLoading: false,
        error: caught instanceof Error ? caught : new Error('Records could not be loaded.'),
      }));
    }
  }, [loadRecords, pageSize, query, queryKey]);

  useEffect(() => {
    if (mode !== 'server') return undefined;
    void fetchServerPage(0, false);
    return () => activeController.current?.abort();
  }, [fetchServerPage, mode]);

  const loadMore = useCallback(() => {
    if (mode === 'local' && localRecords) {
      setLocalWindow((current) => ({
        queryKey,
        count: Math.min(
          (current.queryKey === queryKey ? current.count : pageSize) + pageSize,
          localRecords.length,
        ),
      }));
      return;
    }
    if (
      serverState.queryKey === queryKey
      && !serverState.isLoading
      && serverState.hasMore
    ) {
      void fetchServerPage(serverState.records.length, true);
    }
  }, [fetchServerPage, localRecords, mode, pageSize, queryKey, serverState]);

  if (mode === 'local' && localRecords) {
    return {
      records: localRecords.slice(0, visibleCount),
      totalCount: localRecords.length,
      hasMore: visibleCount < localRecords.length,
      isLoading: false,
      error: null,
      loadMore,
      retry: () => undefined,
    };
  }

  const currentServerState = serverState.queryKey === queryKey
    ? serverState
    : {
      queryKey,
      records: [] as TRecord[],
      totalCount: 0,
      hasMore: false,
      isLoading: true,
      error: null,
    };

  return {
    records: currentServerState.records,
    totalCount: currentServerState.totalCount,
    hasMore: currentServerState.hasMore,
    isLoading: currentServerState.isLoading,
    error: currentServerState.error,
    loadMore,
    retry: () => void fetchServerPage(0, false),
  };
}
