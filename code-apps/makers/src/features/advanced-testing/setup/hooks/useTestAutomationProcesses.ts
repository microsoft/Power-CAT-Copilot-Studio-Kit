/**
 * React Query hook for the Setup feature's Test Automation processes surface.
 *
 *  - `useTestAutomationProcesses(enabled)` runs discovery then classifies into
 *    a `ProcessInventory` (buckets + duplicates + missing + unexpected).
 *  - Re-uses the `SETUP_QUERY_PREFIX` namespace so a top-level invalidation
 *    refreshes both Connections and Flows tabs.
 *
 * `enabled` implements RD-M3: the query does not fire until the Flows tab is
 * the active tab, but stays cached once fetched so tab switches don't
 * re-trigger network work.
 *
 * Environment scoping: see the note in `useConnectionReferences.ts`. The
 * environment id is appended as the final queryKey segment so the cache is
 * per-env; `TEST_AUTOMATION_PROCESSES_KEY` remains a stable invalidation
 * prefix.
 */

import { useQuery } from "@tanstack/react-query";
import {
  bucketProcesses,
  getTestAutomationProcesses,
} from "../services/workflowService";
import type { ProcessInventory } from "../contracts/types";
import {
  SETUP_QUERY_GC_MS,
  SETUP_QUERY_PREFIX,
  SETUP_QUERY_STALE_MS,
} from "./useConnectionReferences";
import { useEnvironmentId } from "./useEnvironmentId";

export const TEST_AUTOMATION_PROCESSES_KEY = [
  ...SETUP_QUERY_PREFIX,
  "test-automation-processes",
] as const;

async function loadInventory(): Promise<ProcessInventory> {
  const rows = await getTestAutomationProcesses();
  return bucketProcesses(rows);
}

export function useTestAutomationProcesses(enabled: boolean) {
  const { environmentId } = useEnvironmentId();
  return useQuery<ProcessInventory, Error>({
    queryKey: [...TEST_AUTOMATION_PROCESSES_KEY, environmentId],
    queryFn: loadInventory,
    enabled: enabled && !!environmentId,
    staleTime: SETUP_QUERY_STALE_MS,
    gcTime: SETUP_QUERY_GC_MS,
  });
}
