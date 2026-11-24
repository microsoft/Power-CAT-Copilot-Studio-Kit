/**
 * useUserInstallPrivilege — Checks whether the current user has the
 * prvImportSolution privilege (required to install component solutions)
 * in the current environment.
 *
 * Delegates to checkInstallPrivilegeInOrg('current') from EnvironmentService
 * so there is a single code path for privilege checks.
 */

import { useQuery } from '@tanstack/react-query';
import { useClient, useAgentLibrary } from '../provider/AgentLibraryProvider';
import { checkInstallPrivilegeInOrg } from '../services/EnvironmentService';
import { queryKeys } from './queryKeys';

/** React Query stale time — privilege rarely changes (5 minutes). */
const PRIVILEGE_STALE_TIME = 5 * 60 * 1000;

/**
 * Hook to check if the current user has prvImportSolution privilege.
 * Runs once on page load, cached for 5 minutes.
 */
export function useUserInstallPrivilege() {
  const client = useClient();
  const { userEmail } = useAgentLibrary();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.userPrivilege(),
    queryFn: () => checkInstallPrivilegeInOrg(client, 'current', userEmail),
    staleTime: PRIVILEGE_STALE_TIME,
  });

  return { hasPrivilege: data?.hasPrivilege ?? false, isLoading };
}
