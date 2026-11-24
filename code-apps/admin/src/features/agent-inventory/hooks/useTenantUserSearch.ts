import { useQuery } from '@tanstack/react-query';
import { searchTenantUsers } from '../services/tenantUserService';
import { agentInventoryKeys } from './queryKeys';

/**
 * React Query wrapper around {@link searchTenantUsers}. The query is disabled
 * until at least two characters are entered to avoid unbounded directory scans.
 */
export function useTenantUserSearch(term: string) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: agentInventoryKeys.userSearch(trimmed),
    queryFn: () => searchTenantUsers(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 60 * 1000,
  });
}
