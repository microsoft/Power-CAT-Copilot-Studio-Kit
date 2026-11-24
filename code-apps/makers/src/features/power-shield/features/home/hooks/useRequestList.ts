import { useState, useEffect, useMemo, useCallback } from 'react';
import { getRequestList } from '../../../shared/services/dataverse/requestService';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useFetch } from '../../../shared/hooks/useFetch';
import { useNotify } from '../../../shared/hooks/useNotify';
import type { PolicyRequestSummary } from '../../../models/policyRequest';
import type { RequestStatus } from '../../../models/status';

const DEFAULT_PAGE_SIZE = 5;
export const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;

export interface UseRequestListResult {
  /** Paginated, fully-filtered requests for the grid */
  requests: PolicyRequestSummary[];
  /** Search-filtered only (for StatsCards counts — not status/serviceTree filtered) */
  allRequests: PolicyRequestSummary[];
  /** Search + service-tree + env-group filtered (excludes tile/status filter) */
  nonStatusFiltered: PolicyRequestSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  showCapNotice: boolean;
  // Tile / status filter
  tileFilter: RequestStatus[] | null;
  setTileFilter: (statuses: RequestStatus[] | null) => void;
  // Service tree filter
  serviceTreeFilter: string | null;
  setServiceTreeFilter: (id: string | null) => void;
  distinctServiceTrees: Array<{ id: string; name: string }>;
  // Environment group filter
  environmentGroupFilter: string | null;
  setEnvironmentGroupFilter: (id: string | null) => void;
  distinctEnvironmentGroups: Array<{ id: string; name: string }>;
  // Pagination
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  pageCount: number;
  totalFilteredCount: number;
}

// Urgency tiers for admin review sort (lower = more urgent)
const URGENCY: Record<string, number> = {
  Submitted: 1,
  UnderReview: 2,
  AutoRejected: 3,
  Approved: 4,
  Implementing: 5,
  ImplementedWithErrors: 6,
};

// Dataverse integer values for admin-review actionable statuses
const ADMIN_REVIEW_STATUS_FILTER = [2, 5, 4, 6, 8, 10]; // Submitted, UnderReview, AutoRejected, Approved, Implementing, ImplementedWithErrors

export function useRequestList(scope: 'admin' | 'maker' | 'admin-review'): UseRequestListResult {
  const { aadObjectId } = useAuth();
  const { notifyError } = useNotify();
  const [searchTerm, setSearchTermRaw] = useState('');
  const [tileFilter, setTileFilterRaw] = useState<RequestStatus[] | null>(null);
  const [serviceTreeFilter, setServiceTreeFilterRaw] = useState<string | null>(null);
  const [environmentGroupFilter, setEnvironmentGroupFilterRaw] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(DEFAULT_PAGE_SIZE);

  const isAdmin = scope === 'admin' || scope === 'admin-review';
  const statusFilter = scope === 'admin-review' ? ADMIN_REVIEW_STATUS_FILTER : undefined;

  const { data, isLoading, error, refetch } = useFetch<PolicyRequestSummary[]>(
    () => getRequestList({ isAdmin, aadObjectId, statusFilter }),
    [isAdmin, aadObjectId, scope],
  );

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  // Reset page to 1 when filters change
  const setSearchTerm = useCallback((term: string) => {
    setSearchTermRaw(term);
    setCurrentPage(1);
  }, []);

  const setTileFilter = useCallback((statuses: RequestStatus[] | null) => {
    setTileFilterRaw(statuses);
    setCurrentPage(1);
  }, []);

  const setServiceTreeFilter = useCallback((id: string | null) => {
    setServiceTreeFilterRaw(id);
    setCurrentPage(1);
  }, []);

  const setEnvironmentGroupFilter = useCallback((id: string | null) => {
    setEnvironmentGroupFilterRaw(id);
    setCurrentPage(1);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeRaw(size);
    setCurrentPage(1);
  }, []);

  // Apply urgency sort for admin-review scope
  const sortedData = useMemo(() => {
    if (scope !== 'admin-review' || !data) return data;
    return [...data].sort((a, b) => {
      const urgencyA = URGENCY[a.status] ?? 99;
      const urgencyB = URGENCY[b.status] ?? 99;
      if (urgencyA !== urgencyB) return urgencyA - urgencyB;
      // Within same urgency tier, oldest first (submitted date ascending)
      const dateA = a.submittedOn ? new Date(a.submittedOn).getTime() : 0;
      const dateB = b.submittedOn ? new Date(b.submittedOn).getTime() : 0;
      return dateA - dateB;
    });
  }, [data, scope]);

  // 1. Search filter
  const searchFiltered = useMemo(() => {
    const items = sortedData ?? [];
    const lower = searchTerm.trim().toLowerCase();
    if (lower === '') return items;
    return items.filter(
      (r: PolicyRequestSummary) =>
        r.requestNumber.toLowerCase().includes(lower) ||
        (r.serviceTreeName ?? '').toLowerCase().includes(lower) ||
        (r.environmentGroupName ?? '').toLowerCase().includes(lower) ||
        r.createdByUpn.toLowerCase().includes(lower),
    );
  }, [sortedData, searchTerm]);

  // Non-status-filtered: search + service tree + env group (skips tile/status)
  const nonStatusFiltered = useMemo(() => {
    let result = searchFiltered;
    if (serviceTreeFilter) {
      result = result.filter((r) => r.serviceTreeId === serviceTreeFilter);
    }
    if (environmentGroupFilter) {
      result = result.filter((r) => r.environmentGroupId === environmentGroupFilter);
    }
    return result;
  }, [searchFiltered, serviceTreeFilter, environmentGroupFilter]);

  // 2. Tile / status-group filter
  const tileFiltered = useMemo(() => {
    if (!tileFilter) return searchFiltered;
    return searchFiltered.filter((r) => (tileFilter as string[]).includes(r.status));
  }, [searchFiltered, tileFilter]);

  // 3. Service tree filter
  const serviceTreeFiltered = useMemo(() => {
    if (!serviceTreeFilter) return tileFiltered;
    return tileFiltered.filter((r) => r.serviceTreeId === serviceTreeFilter);
  }, [tileFiltered, serviceTreeFilter]);

  // 4. Environment group filter
  const environmentGroupFiltered = useMemo(() => {
    if (!environmentGroupFilter) return serviceTreeFiltered;
    return serviceTreeFiltered.filter((r) => r.environmentGroupId === environmentGroupFilter);
  }, [serviceTreeFiltered, environmentGroupFilter]);

  // Distinct service trees for dropdown
  const distinctServiceTrees = useMemo(() => {
    const items = sortedData ?? [];
    const map = new Map<string, string>();
    for (const r of items) {
      if (r.serviceTreeId && !map.has(r.serviceTreeId)) {
        map.set(r.serviceTreeId, r.serviceTreeName ?? r.serviceTreeId);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sortedData]);

  // Distinct environment groups for dropdown
  const distinctEnvironmentGroups = useMemo(() => {
    const items = sortedData ?? [];
    const map = new Map<string, string>();
    for (const r of items) {
      if (r.environmentGroupId && !map.has(r.environmentGroupId)) {
        map.set(r.environmentGroupId, r.environmentGroupName ?? r.environmentGroupId);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sortedData]);

  // Pagination
  const totalFilteredCount = environmentGroupFiltered.length;
  const pageCount = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const requests = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return environmentGroupFiltered.slice(start, start + pageSize);
  }, [environmentGroupFiltered, safePage, pageSize]);

  return {
    requests,
    allRequests: searchFiltered,
    nonStatusFiltered,
    isLoading,
    error,
    refresh: refetch,
    searchTerm,
    setSearchTerm,
    showCapNotice: (data?.length ?? 0) >= 100,
    tileFilter,
    setTileFilter,
    serviceTreeFilter,
    setServiceTreeFilter,
    distinctServiceTrees,
    environmentGroupFilter,
    setEnvironmentGroupFilter,
    distinctEnvironmentGroups,
    currentPage: safePage,
    setCurrentPage,
    pageSize,
    setPageSize,
    pageCount,
    totalFilteredCount,
  };
}
