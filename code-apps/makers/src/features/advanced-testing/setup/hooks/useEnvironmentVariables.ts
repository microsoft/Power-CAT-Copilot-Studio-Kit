/**
 * React Query hooks for the Setup feature's Environment Variables surface.
 *
 *  - `useEnvironmentVariables(enabled)` loads the three Advanced Testing EVs
 *    and their current values via `getAdvancedTestingEnvironmentVariables`.
 *  - `useSaveEnvironmentVariableMutation()` persists a single edit, then
 *    invalidates the EV query so the tab refetches and re-baselines dirty
 *    state from the server (RD-1).
 *
 * `enabled` implements RD-M3: the read query does not fire until the
 * Environment Variables tab is the active tab, but stays cached once fetched
 * so tab switches don't re-trigger network work.
 *
 * Environment scoping: see the note in `useConnectionReferences.ts`. The
 * environment id is appended as the final queryKey segment so the cache is
 * per-env; `ENVIRONMENT_VARIABLES_KEY` remains a stable invalidation prefix.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdvancedTestingEnvironmentVariables,
  saveEnvironmentVariableValue,
  type GetEnvironmentVariablesResult,
  type SaveEnvironmentVariableArgs,
  type SaveEnvironmentVariableResult,
} from "../services/environmentVariableService";
import {
  SETUP_QUERY_GC_MS,
  SETUP_QUERY_PREFIX,
  SETUP_QUERY_STALE_MS,
} from "./useConnectionReferences";
import { useEnvironmentId } from "./useEnvironmentId";

export const ENVIRONMENT_VARIABLES_KEY = [
  ...SETUP_QUERY_PREFIX,
  "environment-variables",
] as const;

export function useEnvironmentVariables(enabled: boolean) {
  const { environmentId } = useEnvironmentId();
  return useQuery<GetEnvironmentVariablesResult, Error>({
    queryKey: [...ENVIRONMENT_VARIABLES_KEY, environmentId],
    queryFn: getAdvancedTestingEnvironmentVariables,
    enabled: enabled && !!environmentId,
    staleTime: SETUP_QUERY_STALE_MS,
    gcTime: SETUP_QUERY_GC_MS,
  });
}

export function useSaveEnvironmentVariableMutation() {
  const queryClient = useQueryClient();
  return useMutation<SaveEnvironmentVariableResult, Error, SaveEnvironmentVariableArgs>({
    mutationFn: saveEnvironmentVariableValue,
    onSuccess: () => {
      // RD-1: refetch and re-baseline dirty state from server truth.
      // Prefix match invalidates every env-scoped variant of the EV key.
      void queryClient.invalidateQueries({ queryKey: ENVIRONMENT_VARIABLES_KEY });
    },
  });
}
