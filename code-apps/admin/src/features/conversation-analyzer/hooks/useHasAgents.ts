/**
 * Checks whether agent records exist and exposes lookup errors for the page gate.
 */

import { useQuery } from '@tanstack/react-query';
import { hasSyncedAgents } from '../services/FeatureBootstrapService';
import { queryKeys } from './queryKeys';

export function useHasAgents() {
  const query = useQuery<boolean>({
    queryKey: [...queryKeys.all, 'has-agents'],
    queryFn: hasSyncedAgents,
    staleTime: 5 * 60 * 1000,
  });

  return {
    hasAgents: query.data ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
