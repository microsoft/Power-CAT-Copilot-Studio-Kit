import { useState, useEffect, useMemo, useCallback } from 'react';
import { getCreditRequestList } from '../../../shared/services/dataverse/creditRequestService';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useFetch } from '../../../shared/hooks/useFetch';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { CreditRequestSummary } from '../../../models/creditRequest';
import type { CreditStatCardBucket } from '../../../models/status';
import { CREDIT_LABEL_TO_STAT_BUCKET } from '../../../models/status';

const DEFAULT_PAGE_SIZE = 5;
export const CREDIT_PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

/** True when a request belongs to the given stat-card bucket. `Total` matches all. */
export function matchesCreditBucket(
  summary: CreditRequestSummary,
  bucket: CreditStatCardBucket,
): boolean {
  if (bucket === 'Total') return true;
  return CREDIT_LABEL_TO_STAT_BUCKET[summary.creditLabel] === bucket;
}

export interface UseCreditRequestListResult {
  /** Paginated, fully-filtered credit requests for the grid. */
  requests: CreditRequestSummary[];
  /** Search-filtered (excludes bucket filter) — backs the stat cards. */
  nonBucketFiltered: CreditRequestSummary[];
  isLoading: boolean;
  error: string | null;
  /** Manual re-fetch. useFetch has no cache, so wire this to withdraw/change handlers. */
  refresh: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  showCapNotice: boolean;
  // Stat-card bucket filter
  bucketFilter: CreditStatCardBucket | null;
  setBucketFilter: (bucket: CreditStatCardBucket | null) => void;
  // Pagination
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  pageCount: number;
  totalFilteredCount: number;
}

/**
 * Loads and filters the current maker's Copilot Credits requests (T031).
 *
 * Uses the typed `useFetch` hook (NOT React Query) bound to the Credits-only,
 * row-level-scoped repository read. Because `useFetch` has no cache, the returned
 * `refresh` MUST be threaded into any mutation handler (withdraw, request-a-change)
 * so the list re-queries after a write. Row-level ownership and the Credits type
 * filter are enforced server-side inside `getCreditRequestList`; the client-side
 * filters below are presentation only.
 */
export function useCreditRequestList(): UseCreditRequestListResult {
  const { aadObjectId } = useAuth();
  const { notifyError } = useNotify();
  const [searchTerm, setSearchTermRaw] = useState('');
  const [bucketFilter, setBucketFilterRaw] = useState<CreditStatCardBucket | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);

  const fetcher = useCallback(() => getCreditRequestList({ aadObjectId }), [aadObjectId]);
  const { data, isLoading, error, refetch } = useFetch<CreditRequestSummary[]>(fetcher, [aadObjectId]);

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  // Reset to page 1 whenever a filter changes.
  const setSearchTerm = useCallback((term: string) => {
    setSearchTermRaw(term);
    setCurrentPage(1);
  }, []);
  const setBucketFilter = useCallback((bucket: CreditStatCardBucket | null) => {
    setBucketFilterRaw(bucket);
    setCurrentPage(1);
  }, []);
  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setCurrentPage(1);
  }, []);

  // 1. Search filter.
  const nonBucketFiltered = useMemo(() => {
    const items = data ?? [];
    const lower = searchTerm.trim().toLowerCase();
    if (lower === '') return items;
    return items.filter(
      (r) =>
        r.requestNumber.toLowerCase().includes(lower) ||
        r.createdByUpn.toLowerCase().includes(lower) ||
        r.environmentNames.some((n) => n.toLowerCase().includes(lower)),
    );
  }, [data, searchTerm]);

  // 2. Bucket filter for the grid. The stat cards use the search-only set above.
  const fullyFiltered = useMemo(() => {
    let result = nonBucketFiltered;
    if (bucketFilter) result = result.filter((r) => matchesCreditBucket(r, bucketFilter));
    return result;
  }, [nonBucketFiltered, bucketFilter]);

  const totalFilteredCount = fullyFiltered.length;
  const pageCount = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const requests = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return fullyFiltered.slice(start, start + pageSize);
  }, [fullyFiltered, safePage, pageSize]);

  return {
    requests,
    nonBucketFiltered,
    isLoading,
    error,
    refresh: refetch,
    searchTerm,
    setSearchTerm,
    showCapNotice: (data?.length ?? 0) >= 100,
    bucketFilter,
    setBucketFilter,
    currentPage: safePage,
    setCurrentPage,
    pageSize,
    setPageSize,
    pageCount,
    totalFilteredCount,
  };
}
