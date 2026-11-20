import { useState, useEffect, useCallback } from 'react';
import {
  getConnectorPublishers,
  searchConnectors,
  CONNECTOR_PAGE_SIZE,
} from '../../../shared/services/dataverse/connectorService';
import type { ConnectorSearchParams } from '../../../shared/services/dataverse/connectorService';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { Connector } from '../../../models/connector';

export type { ConnectorSearchParams };

/**
 * Hook for server-side paged connector search (Step 3).
 * Publishers are pre-fetched once on mount (lightweight — no icons).
 * Auto-executes an empty search on mount to populate the initial grid.
 * Exposes search(), nextPage(), prevPage() for explicit user-triggered queries.
 *
 * Pagination uses Dataverse skiptoken (cursor) pagination, not numeric $skip.
 * tokenStack[i] holds the skipToken required to fetch page i (undefined for page 0).
 * Each successful fetch stores the returned nextSkipToken at tokenStack[targetPage + 1],
 * enabling both forward and backward navigation without re-fetching from the top.
 */
export function useConnectorSearch() {
  const { notifyError } = useNotify();
  const [publishers, setPublishers] = useState<string[]>([]);
  const [isLoadingPublishers, setIsLoadingPublishers] = useState(true);
  const [results, setResults] = useState<Connector[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [tokenStack, setTokenStack] = useState<(string | undefined)[]>([undefined]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeParams, setActiveParams] = useState<ConnectorSearchParams>({});

  // Pre-fetch publisher list for dropdown (no icons — tiny payload)
  useEffect(() => {
    getConnectorPublishers()
      .then(setPublishers)
      .catch(() => notifyError('Failed to load publisher list'))
      .finally(() => setIsLoadingPublishers(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const executeSearch = useCallback(
    async (params: ConnectorSearchParams, skipToken: string | undefined, targetPage: number) => {
      console.log('[useConnectorSearch] executeSearch — params:', params, '| targetPage:', targetPage, '| skipToken:', skipToken ?? '(none)');
      setIsLoading(true);
      try {
        const { connectors, hasMore: more, nextSkipToken } = await searchConnectors(params, skipToken);
        setResults(connectors);
        setHasMore(more);
        setCurrentPage(targetPage);
        setActiveParams(params);
        setTokenStack(prev => {
          // Trim any stale forward tokens from a previous navigation path, then store the new one
          const next = prev.slice(0, targetPage + 1);
          next[targetPage + 1] = nextSkipToken;
          return next;
        });
      } catch (e) {
        console.error('[useConnectorSearch] searchConnectors failed:', e);
        notifyError('Failed to search connectors');
      } finally {
        setIsLoading(false);
      }
    },
    [notifyError],
  );

  // Auto-search on mount — default to 'available' connectors (hides blocked)
  useEffect(() => {
    executeSearch({ blockedFilter: 'available' }, undefined, 0);
  }, [executeSearch]);

  const search = useCallback(
    (params: ConnectorSearchParams) => {
      // Reset token stack whenever a new search is triggered
      setTokenStack([undefined]);
      executeSearch(params, undefined, 0);
    },
    [executeSearch],
  );

  const nextPage = useCallback(
    () => executeSearch(activeParams, tokenStack[currentPage + 1], currentPage + 1),
    [executeSearch, activeParams, currentPage, tokenStack],
  );

  const prevPage = useCallback(
    () => executeSearch(activeParams, tokenStack[currentPage - 1], currentPage - 1),
    [executeSearch, activeParams, currentPage, tokenStack],
  );

  return {
    publishers,
    isLoadingPublishers,
    results,
    hasMore,
    currentPage,
    isLoading,
    activeParams,
    search,
    nextPage,
    prevPage,
    CONNECTOR_PAGE_SIZE,
  };
}
