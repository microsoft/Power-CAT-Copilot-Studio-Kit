/**
 * React Query hooks for the Setup feature's Connection References surface.
 *
 *  - `useConnectionReferences(enabled)` fetches one slot per entry in the
 *    typed registry (`REQUIRED_CRS`). Each slot pairs the static definition
 *    with the live Dataverse record (or `null` when the CR row is absent
 *    from the environment).
 *  - `useAvailableConnections(...)` lists API Hub connections for a CR's
 *    connector + the current environment.
 *  - `useMapConnectionMutation()` writes a new connectionid to a CR, then
 *    invalidates the CR query so the UI refetches and RD-10 reconciliation
 *    fires in the row component.
 *
 * The `enabled` parameter on the read hooks implements RD-M3: queries do not
 * fire until the Connections tab is the active tab, but stay cached once
 * fetched so tab switches don't re-trigger network work.
 *
 * Environment scoping: each query key includes the resolved Power Platform
 * environment id as its last segment so React Query's cache (and the
 * persisted sessionStorage cache) is naturally segregated per environment.
 * Invalidation prefixes (`CR_QUERY_KEY`, etc.) deliberately omit the env id
 * so `invalidateQueries({ queryKey: CR_QUERY_KEY })` matches every env-scoped
 * cache entry via React Query's default prefix matching. The third key
 * segment ("connection-reference") is preserved so the existing
 * `persistence.ts` allow-list continues to match.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAvailableConnections,
  getRequiredConnectionReferences,
  mapConnectionToReference,
} from "../services/connectionReferenceService";
import type { AvailableConnectionsResult } from "../services/connectionReferenceService";
import type { ConnectionReferenceSlot } from "../contracts/types";
import { useEnvironmentId } from "./useEnvironmentId";

export const SETUP_QUERY_PREFIX = ["advanced-testing", "setup"] as const;
export const CR_QUERY_KEY = [...SETUP_QUERY_PREFIX, "connection-reference"] as const;
export const AVAILABLE_CONNECTIONS_KEY = [
  ...SETUP_QUERY_PREFIX,
  "available-connections",
] as const;

/** 15 minutes. Matches the sessionStorage persister `maxAge` so a hydrated
 *  cache is considered fresh for the same window. */
export const SETUP_QUERY_STALE_MS = 15 * 60 * 1000;
/** Keep cache in memory at least as long as the persister can restore it. */
export const SETUP_QUERY_GC_MS = 15 * 60 * 1000;

export function useConnectionReferences(enabled: boolean) {
  const { environmentId } = useEnvironmentId();
  return useQuery<ConnectionReferenceSlot[], Error>({
    queryKey: [...CR_QUERY_KEY, environmentId],
    queryFn: getRequiredConnectionReferences,
    enabled: enabled && !!environmentId,
    staleTime: SETUP_QUERY_STALE_MS,
    gcTime: SETUP_QUERY_GC_MS,
  });
}

export function useAvailableConnections(
  connectorId: string | undefined,
  environmentId: string | null,
  enabled: boolean,
) {
  const ready = enabled && !!connectorId && !!environmentId;
  return useQuery<AvailableConnectionsResult, Error>({
    queryKey: [...AVAILABLE_CONNECTIONS_KEY, connectorId ?? null, environmentId ?? null],
    queryFn: () => getAvailableConnections(connectorId!, environmentId!),
    enabled: ready,
  });
}

export interface MapConnectionVars {
  connectionReferenceId: string;
  connectionName: string;
}

export function useMapConnectionMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, MapConnectionVars>({
    mutationFn: ({ connectionReferenceId, connectionName }) =>
      mapConnectionToReference(connectionReferenceId, connectionName),
    onSuccess: () => {
      // Trigger CR refetch so RD-10 reconciliation can compare persisted vs selected.
      // Prefix match invalidates every env-scoped variant of the CR key.
      void queryClient.invalidateQueries({ queryKey: CR_QUERY_KEY });
    },
  });
}
