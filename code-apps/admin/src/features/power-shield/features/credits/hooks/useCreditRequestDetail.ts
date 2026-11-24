import { useCallback, useEffect } from 'react';
import { getCreditRequestDetail } from '../../../shared/services/dataverse/creditRequestService';
import type { CreditRequestDetail } from '../../../models/creditRequest';
import { useFetch } from '../../../shared/hooks/useFetch';
import { useNotify } from '../../../shared/hooks/useNotify';

export interface UseCreditRequestDetailResult {
  detail: CreditRequestDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Loads a single credit request (header + privileged children) for the detail
 * surface. The underlying repository asserts `cat_requesttype = Credits` BEFORE
 * reading any child, so a non-Credits id is rejected as a typed not-found and
 * the detail view never mounts a wrong-type request (FR-024/FR-035).
 *
 * Deps are the primitive requestId only (research.md S3/S4) — the fetch re-runs
 * when the route id changes and via the returned `refresh` after any admin action.
 */
export function useCreditRequestDetail(requestId: string): UseCreditRequestDetailResult {
  const { notifyError } = useNotify();

  const fetcher = useCallback(() => getCreditRequestDetail(requestId), [requestId]);

  const { data, isLoading, error, refetch } = useFetch<CreditRequestDetail>(fetcher, [requestId]);

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  return {
    detail: data,
    isLoading,
    error,
    refresh: refetch,
  };
}
