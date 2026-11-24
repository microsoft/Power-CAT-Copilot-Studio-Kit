import { useCallback, useEffect } from 'react';
import { getCreditRequestDetail } from '../../../shared/services/dataverse/creditRequestService';
import type { CreditRequestDetail } from '../../../models/creditRequest';
import { useFetch } from '../../../shared/hooks/useFetch';
import { useNotify } from '../../../shared/hooks/useNotify';

export interface UseCreditRequestDetailResult {
  detail: CreditRequestDetail | null;
  isLoading: boolean;
  error: string | null;
  /** True when the request id is not a Credits request (wrong-type / not-found). */
  notFound: boolean;
  refresh: () => void;
}

/**
 * Loads a single Copilot Credits request (header + maker-safe children). The
 * repository rejects a non-Credits id as a typed not-found BEFORE reading any
 * child, so this hook surfaces that as `notFound` for the typed-not-found route.
 */
export function useCreditRequestDetail(requestId: string): UseCreditRequestDetailResult {
  const { notifyError } = useNotify();
  const fetcher = useCallback(() => getCreditRequestDetail(requestId), [requestId]);
  const { data, isLoading, error, refetch } = useFetch<CreditRequestDetail>(fetcher, [requestId]);

  // A typed not-found is an expected outcome (wrong-type id), not an error toast.
  const notFound = !!error && /not available in the copilot credits/i.test(error);

  useEffect(() => {
    if (error && !notFound) notifyError(error);
  }, [error, notFound, notifyError]);

  return { detail: data, isLoading, error, notFound, refresh: refetch };
}
