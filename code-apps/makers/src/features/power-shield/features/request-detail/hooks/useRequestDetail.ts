import { useCallback, useEffect } from 'react';
import { getRequestDetail } from '../../../shared/services/dataverse/requestService';
import type { RequestDetail } from '../../../shared/services/dataverse/requestService';
import { useFetch } from '../../../shared/hooks/useFetch';
import { useNotify } from '../../../shared/hooks/useNotify';

export interface UseRequestDetailResult {
  detail: RequestDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetches full request detail (header + all child records) for the given requestId.
 * Re-fetches automatically when requestId changes.
 * Manual refresh is available via the returned `refresh` callback.
 */
export function useRequestDetail(requestId: string): UseRequestDetailResult {
  const { notifyError } = useNotify();

  const fetcher = useCallback(() => getRequestDetail(requestId), [requestId]);

  const { data, isLoading, error, refetch } = useFetch<RequestDetail>(fetcher, [requestId]);

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
