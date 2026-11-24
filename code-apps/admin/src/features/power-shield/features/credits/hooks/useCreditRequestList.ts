import { useState, useEffect, useMemo, useCallback } from 'react';
import { getCreditRequestList } from '../../../shared/services/dataverse/creditRequestService';
import { useFetch } from '../../../shared/hooks/useFetch';
import { useNotify } from '../../../shared/hooks/useNotify';
import { useAuth } from '../../../shared/hooks/useAuth';
import type { CreditRequestSummary } from '../../../models/creditRequest';
import type { AdminCreditStatBucket } from '../../../models/status';
import { creditStatBucketForStatus, CREDIT_STATUS_BADGE } from '../../../models/status';

const DEFAULT_PAGE_SIZE = 5;
export const CREDIT_PAGE_SIZE_OPTIONS = [5, 10, 25] as const;

export interface CreditListSortState {
  sortColumn: string | undefined;
  sortDirection: 'ascending' | 'descending';
}

const DEFAULT_SORT: CreditListSortState = { sortColumn: 'requestNumber', sortDirection: 'descending' };

const time = (iso?: string) => (iso ? new Date(iso).getTime() : 0);

/** Ascending comparers per grid column; shared with the grid so header clicks and the hook agree. */
export const CREDIT_LIST_COMPARE: Record<string, (a: CreditRequestSummary, b: CreditRequestSummary) => number> = {
  requestNumber: (a, b) => a.requestNumber.localeCompare(b.requestNumber),
  environment: (a, b) => (a.environmentNames[0] ?? '').localeCompare(b.environmentNames[0] ?? ''),
  outcome: (a, b) => CREDIT_STATUS_BADGE[a.status].label.localeCompare(CREDIT_STATUS_BADGE[b.status].label),
  creditsRequested: (a, b) => (a.creditsRequested ?? -1) - (b.creditsRequested ?? -1),
  creditsAdded: (a, b) => (a.creditsAdded ?? -1) - (b.creditsAdded ?? -1),
  submittedOn: (a, b) => time(a.submittedOn) - time(b.submittedOn),
  decidedOn: (a, b) => time(a.decidedOn) - time(b.decidedOn),
  assignedAdmin: (a, b) => (a.assignedAdminName ?? '').localeCompare(b.assignedAdminName ?? ''),
};

export interface UseCreditRequestListResult {
  /** Paginated, fully-filtered credit requests for the grid. */
  requests: CreditRequestSummary[];
  /** Search + assigned-to-me filtered (excludes the bucket tile) — drives stat-card counts. */
  nonBucketFiltered: CreditRequestSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  showCapNotice: boolean;
  // Stat-card / bucket filter
  bucketFilter: AdminCreditStatBucket | null;
  setBucketFilter: (bucket: AdminCreditStatBucket | null) => void;
  // Quick filter — assigned to the current admin
  assignedToMe: boolean;
  setAssignedToMe: (on: boolean) => void;
  // Pagination
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  pageCount: number;
  totalFilteredCount: number;
  // Sorting — applied to the whole filtered list before paging.
  sortState: CreditListSortState;
  setSortState: (state: CreditListSortState) => void;
}

/**
 * Loads the tenant-wide Copilot Credits list once and applies all triage
 * filters client-side. Isolation is guaranteed by the repository (strict
 * `cat_requesttype = Credits`); this hook keeps its own state and never shares
 * it with the connector list. Deps are empty (fetch on mount + manual refresh)
 * to avoid refetch storms (research.md S3/S4).
 */
export function useCreditRequestList(): UseCreditRequestListResult {
  const { notifyError } = useNotify();
  const { dvUserId } = useAuth();
  const [searchTerm, setSearchTermRaw] = useState('');
  const [bucketFilter, setBucketFilterRaw] = useState<AdminCreditStatBucket | null>(null);
  const [assignedToMe, setAssignedToMeRaw] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortStateRaw] = useState<CreditListSortState>(DEFAULT_SORT);

  const { data, isLoading, error, refetch } = useFetch<CreditRequestSummary[]>(
    () => getCreditRequestList(),
    [],
  );

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  // Any filter change resets to page 1.
  const setSearchTerm = useCallback((term: string) => {
    setSearchTermRaw(term);
    setCurrentPage(1);
  }, []);
  const setBucketFilter = useCallback((bucket: AdminCreditStatBucket | null) => {
    setBucketFilterRaw(bucket);
    setCurrentPage(1);
  }, []);
  const setAssignedToMe = useCallback((on: boolean) => {
    setAssignedToMeRaw(on);
    setCurrentPage(1);
  }, []);
  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setCurrentPage(1);
  }, []);
  const setSortState = useCallback((state: CreditListSortState) => {
    setSortStateRaw(state);
    setCurrentPage(1);
  }, []);

  // 1. Search filter
  const searchFiltered = useMemo(() => {
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

  // 2. Everything except the bucket tile (drives stat-card counts).
  const nonBucketFiltered = useMemo(() => {
    let result = searchFiltered;
    if (assignedToMe) {
      result = result.filter((r) => !!dvUserId && r.assignedAdminDvUserId === dvUserId);
    }
    return result;
  }, [searchFiltered, assignedToMe, dvUserId]);

  // 3. Bucket tile filter — final set for the grid.
  const bucketFiltered = useMemo(() => {
    if (!bucketFilter) return nonBucketFiltered;
    return nonBucketFiltered.filter(
      (r) => creditStatBucketForStatus(r.status) === bucketFilter,
    );
  }, [nonBucketFiltered, bucketFilter]);

  // 4. Sort the whole filtered set so paging shows the true order.
  const sorted = useMemo(() => {
    const compare = sortState.sortColumn ? CREDIT_LIST_COMPARE[sortState.sortColumn] : undefined;
    if (!compare) return bucketFiltered;
    const dir = sortState.sortDirection === 'ascending' ? 1 : -1;
    return [...bucketFiltered].sort((a, b) => dir * compare(a, b));
  }, [bucketFiltered, sortState]);

  const totalFilteredCount = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const requests = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage, pageSize]);

  return {
    requests,
    nonBucketFiltered,
    isLoading,
    error,
    refresh: refetch,
    searchTerm,
    setSearchTerm,
    showCapNotice: (data?.length ?? 0) >= 200,
    bucketFilter,
    setBucketFilter,
    assignedToMe,
    setAssignedToMe,
    currentPage: safePage,
    setCurrentPage,
    pageSize,
    setPageSize,
    pageCount,
    totalFilteredCount,
    sortState,
    setSortState,
  };
}
