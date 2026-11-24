/**
 * useOrganizations — Caches the list of Power Platform environments the current
 * user has access to.
 *
 * Wraps EnvironmentService.getOrganizations with React Query. The environment
 * list rarely changes within a session, so the cache is tuned to survive
 * multiple dialog opens without re-fetching:
 *   - staleTime 10 min: repeat opens within this window skip the network
 *   - gcTime    60 min: unused cache evicted after an hour of inactivity
 *   - no refetch on mount / window focus — env list doesn't react to those signals
 *
 * Cache scope is in-memory, per browser tab, per user. Wiped on page reload.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { getOrganizations } from '../services/EnvironmentService';
import type { Organization } from '../services/EnvironmentService';
import { useClient } from '../provider/AgentLibraryProvider';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export function useOrganizations() {
  const client = useClient();

  return useQuery<Organization[]>({
    queryKey: queryKeys.organizations(),
    queryFn: () => getOrganizations(client),
    staleTime: TEN_MINUTES_MS,
    gcTime: ONE_HOUR_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
