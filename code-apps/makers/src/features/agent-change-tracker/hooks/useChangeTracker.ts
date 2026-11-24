/**
 * React Query hooks for the Agent Change Tracker feature.
 */

import { useMemo, useSyncExternalStore } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addTrackingConfig,
  getCentralAgentMetadata,
  getAgentComponentParents,
  getAgentOwnership,
  getComponentBodies,
  isTrackedAgentDeleted,
  listChangeLog,
  removeTrackingConfig,
} from '../services/change-tracker-service';
import { getTrackableAgents } from '../services/available-agents-service';
import {
  getFirstRunBootstrapSnapshot,
  listTrackingConfigsWithFirstRun,
  subscribeFirstRunBootstrap,
} from '../services/first-run-bootstrap-service';
import { shouldUseLocalStore } from '../services/connection-mode';
import { readComponentYaml } from '../services/agent-state-service';
import { getTrackingOrgUrl, initTrackingEnvironmentId } from '../services/tracking-org';
import {
  type AddTrackingConfigInput,
  type ChangeLogEntry,
  type TrackingConfig,
} from '../contracts/change-tracker';

const KEYS = {
  configs: ['change-tracker', 'configs'] as const,
  trackable: ['change-tracker', 'trackable-agents'] as const,
  environment: ['change-tracker', 'environment'] as const,
  localMode: ['change-tracker', 'local-mode'] as const,
  // Agent id alone does not identify a tracked agent: the same bot id can be
  // tracked in more than one environment, so every per-agent cache entry is
  // scoped by environment id too.
  log: (agentId: string | undefined, environmentId?: string) =>
    ['change-tracker', 'log', agentId, environmentId] as const,
  logFullyLoaded: (configId: string | undefined) =>
    ['change-tracker', 'log-fully-loaded', configId] as const,
  yaml: (componentId: string | undefined) => ['change-tracker', 'yaml', componentId] as const,
  ownership: (agentId: string | undefined, agentOrgUrl?: string) =>
    ['change-tracker', 'ownership', agentId, agentOrgUrl] as const,
  parents: (agentId: string | undefined) => ['change-tracker', 'parents', agentId] as const,
  bodies: (agentId: string | undefined) => ['change-tracker', 'bodies', agentId] as const,
  deleted: (configId: string) => ['change-tracker', 'deleted', configId] as const,
  metadata: (configId: string) => ['change-tracker', 'metadata', configId] as const,
};

export const PENDING_TRACKING_CONFIG_PREFIX = 'pending:';

/** True when the feature is running against the offline local-preview store. */
export function useLocalPreviewMode() {
  return useQuery({
    queryKey: KEYS.localMode,
    queryFn: () => shouldUseLocalStore(),
    staleTime: Infinity,
  });
}

/** Environment id of the Power Apps host running this feature. */
export function useTrackingEnvironmentId() {
  return useQuery({
    queryKey: KEYS.environment,
    queryFn: initTrackingEnvironmentId,
    staleTime: Infinity,
  });
}

/** Agents currently opted into change tracking. */
export function useTrackingConfigs() {
  const isFirstRunBootstrapPending = useSyncExternalStore(
    subscribeFirstRunBootstrap,
    getFirstRunBootstrapSnapshot,
    getFirstRunBootstrapSnapshot,
  );
  const query = useQuery({
    queryKey: KEYS.configs,
    queryFn: () => listTrackingConfigsWithFirstRun(),
    retry: false,
    refetchInterval: (query) => (query.state.status === 'error' ? false : 20_000),
  });
  return { ...query, isFirstRunBootstrapPending };
}

/** Tracking configuration ids whose underlying Copilot Studio agent was deleted. */
export function useDeletedTrackingConfigs(configs: TrackingConfig[] | undefined) {
  const list = configs ?? [];
  const results = useQueries({
    queries: list.map((config) => ({
      queryKey: KEYS.deleted(config.id),
      queryFn: () => isTrackedAgentDeleted(config),
      refetchInterval: 20_000,
      refetchOnWindowFocus: true,
    })),
  });
  return useMemo(() => {
    const deleted = new Set<string>();
    list.forEach((config, index) => {
      if (results[index]?.data) deleted.add(config.id);
    });
    return deleted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, results]);
}

/** Build a renderable image src from a raw base64 icon value, sniffing its MIME. */
function iconSrcFromBase64(value: string | undefined): string | undefined {
  const v = (value ?? '').trim();
  if (v.length < 100) return undefined;
  if (v.startsWith('data:')) return v;
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(v)) return undefined;
  let mime = 'image/png';
  if (v.startsWith('/9j/')) mime = 'image/jpeg';
  else if (v.startsWith('R0lGOD')) mime = 'image/gif';
  else if (v.startsWith('UklGR')) mime = 'image/webp';
  else if (v.startsWith('PHN2Zy') || v.startsWith('PD94bWw')) mime = 'image/svg+xml';
  return `data:${mime};base64,${v}`;
}

/**
 * Icon image src for every tracked configuration, read from central state.
 */
export function useAgentIcons(configs: TrackingConfig[] | undefined) {
  const list = configs ?? [];
  const results = useQueries({
    queries: list.map((c) => ({
      queryKey: KEYS.metadata(c.id),
      queryFn: () => getCentralAgentMetadata(c.id),
      staleTime: 5 * 60 * 1000,
    })),
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    list.forEach((c, i) => {
      const src = iconSrcFromBase64(results[i]?.data?.iconBase64);
      if (src) map.set(c.id, src);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, results]);
}

/** Agent icon/publish metadata captured in central tracked state. */
export function useCentralAgentMetadata(configId: string | undefined) {
  return useQuery({
    queryKey: KEYS.metadata(configId ?? ''),
    queryFn: () => getCentralAgentMetadata(configId as string),
    enabled: Boolean(configId),
    staleTime: 60_000,
  });
}

/** Catalog agents that can be opted into tracking. */
export function useTrackableAgents() {
  return useQuery({
    queryKey: KEYS.trackable,
    queryFn: () => getTrackableAgents(),
  });
}

/**
 * Grouped change history for a single agent. Polls periodically so change-log
 * rows written by the background capture flows surface without a manual
 * refresh, and refetches when the window regains focus.
 */
const mergeChangeEntries = (recent: ChangeLogEntry[], existing: ChangeLogEntry[] = []) => {
  const entries = new Map(existing.map((entry) => [entry.id, entry]));
  recent.forEach((entry) => entries.set(entry.id, entry));
  return Array.from(entries.values()).sort(
    (left, right) => (right.changedOn ?? '').localeCompare(left.changedOn ?? ''),
  );
};

/**
 * Query options for one agent's change log.
 *
 * Shared by the single-agent view and the all-agents aggregate so both read the
 * same cache entry — selecting "All agents" never refetches history an agent
 * has already loaded.
 */
function changeLogQueryOptions(
  queryClient: ReturnType<typeof useQueryClient>,
  agentId: string | undefined,
  environmentId?: string,
  configId?: string,
  /**
   * Poll for background captures. Disabled for the all-agents aggregate: N
   * agents each re-projecting their full history every 20s saturates the main
   * thread and makes the UI feel unresponsive.
   */
  poll = true,
) {
  const queryKey = KEYS.log(agentId, environmentId);
  const fullyLoadedKey = KEYS.logFullyLoaded(configId);
  return {
    queryKey,
    queryFn: async () => {
      const isFullyLoaded = queryClient.getQueryData<boolean>(fullyLoadedKey) === true;
      if (isFullyLoaded) queryClient.setQueryData(fullyLoadedKey, true);
      const recent = await listChangeLog(
        agentId as string,
        environmentId,
        undefined,
        undefined,
        configId,
        isFullyLoaded
          ? undefined
          : (older) => {
              queryClient.setQueryData<ChangeLogEntry[]>(queryKey, (current) =>
                mergeChangeEntries(older, current),
              );
            },
        isFullyLoaded ? undefined : () => queryClient.setQueryData(fullyLoadedKey, true),
      );
      return mergeChangeEntries(recent, queryClient.getQueryData<ChangeLogEntry[]>(queryKey));
    },
    enabled: Boolean(agentId),
    refetchInterval: poll ? 20_000 : (false as const),
    refetchOnWindowFocus: poll,
    staleTime: poll ? 0 : 60_000,
  };
}

export function useAgentChangeLog(agentId: string | undefined, environmentId?: string, configId?: string) {
  const queryClient = useQueryClient();
  return useQuery(changeLogQueryOptions(queryClient, agentId, environmentId, configId));
}

/**
 * Change entries across every tracked agent, for the "All agents" audit scope.
 *
 * Reuses each agent's own cached query, so this is only expensive the first
 * time an agent's history is read.
 */
export function useAllAgentsChangeLog(configs: TrackingConfig[] | undefined) {
  const queryClient = useQueryClient();
  const list = useMemo(
    () => (configs ?? []).filter((config) => !config.id.startsWith(PENDING_TRACKING_CONFIG_PREFIX)),
    [configs],
  );

  const results = useQueries({
    queries: list.map((config) =>
      changeLogQueryOptions(queryClient, config.agentId, config.environmentId, config.id, false),
    ),
  });

  const isLoading = results.some((result) => result.isLoading);
  const isFetching = results.some((result) => result.isFetching);

  const dataSignature = results.map((result) => result.dataUpdatedAt).join(',');

  const entries = useMemo(() => {
    // De-duplicate by entry id: the same change must never be counted twice if
    // an agent appears under two configurations, and duplicate ids would also
    // collide as React keys wherever entries are rendered.
    const byId = new Map<string, ChangeLogEntry>();
    for (const result of results) {
      if (!result.data) continue;
      for (const entry of result.data) byId.set(entry.id, entry);
    }
    return Array.from(byId.values()).sort(
      (left, right) => (right.changedOn ?? '').localeCompare(left.changedOn ?? ''),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSignature]);

  const agentNames = useMemo(() => {
    // Keyed by both config id and agent id: change entries reference the config
    // in Dataverse, but the local preview store only carries the agent id.
    const names = new Map<string, string>();
    for (const config of list) {
      const label = config.agentName || config.agentId;
      names.set(config.id, label);
      if (config.agentId) names.set(config.agentId, label);
    }
    return names;
  }, [list]);

  return { entries, agentNames, isLoading, isFetching, trackedCount: list.length };
}

/** Creator and owner of a single agent, so the UI can show who owns it. */
export function useAgentOwnership(
  agentId: string | undefined,
  agentOrgUrl?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: KEYS.ownership(agentId, agentOrgUrl ?? getTrackingOrgUrl()),
    queryFn: () => getAgentOwnership(agentId as string, agentOrgUrl ?? getTrackingOrgUrl()),
    enabled: enabled && Boolean(agentId),
    staleTime: 5 * 60 * 1000,
  });
}

/** Maps an agent's components to their owning child-agent name (componentId -> name). */
export function useAgentComponentParents(agentId: string | undefined, agentOrgUrl?: string) {
  return useQuery({
    queryKey: KEYS.parents(agentId),
    queryFn: () => getAgentComponentParents(agentId as string, agentOrgUrl ?? getTrackingOrgUrl()),
    enabled: Boolean(agentId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Current tracked-state bodies (component id -> YAML) for an agent.
 */
export function useComponentBodies(configId: string | undefined) {
  return useQuery({
    queryKey: KEYS.bodies(configId),
    queryFn: () => getComponentBodies(configId as string),
    enabled: Boolean(configId),
    staleTime: 60_000,
  });
}

/**
 * Read the full live YAML (`data`) of a single component, on demand. Used by
 * the "View YAML" dialog to fill in the current definition when a change row
 * stored no body (e.g. baseline creations). Disabled in local-preview mode.
 */
export function useComponentYaml(
  componentId: string | undefined,
  orgUrl: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: KEYS.yaml(componentId),
    queryFn: () => readComponentYaml(componentId as string, orgUrl ?? getTrackingOrgUrl()),
    enabled: enabled && Boolean(componentId),
    staleTime: 60_000,
  });
}

/** Opt an agent into tracking, then refresh the config list. */
export function useAddTrackingConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddTrackingConfigInput) => addTrackingConfig(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: KEYS.configs });
      const previousConfigs = queryClient.getQueryData<TrackingConfig[]>(KEYS.configs);
      const pendingConfig: TrackingConfig = {
        id: `${PENDING_TRACKING_CONFIG_PREFIX}${input.environmentId ?? ''}:${input.agentId}`,
        agentId: input.agentId,
        agentName: input.agentName,
        environmentId: input.environmentId,
        environmentUrl: input.environmentUrl,
      };
      queryClient.setQueryData<TrackingConfig[]>(KEYS.configs, (current) => [
        pendingConfig,
        ...(current ?? []),
      ]);
      return { previousConfigs };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(KEYS.configs, context?.previousConfigs ?? []);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.configs });
    },
  });
}

/** Permanently delete a tracking configuration and all related records. */
export function useRemoveTrackingConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: TrackingConfig) => removeTrackingConfig(config),
    onMutate: async (config) => {
      await queryClient.cancelQueries({ queryKey: KEYS.configs });
      const previousConfigs = queryClient.getQueryData<TrackingConfig[]>(KEYS.configs);
      queryClient.setQueryData<TrackingConfig[]>(KEYS.configs, (current) =>
        current?.filter((item) => item.id !== config.id),
      );
      return { previousConfigs };
    },
    onError: (_error, _config, context) => {
      if (context?.previousConfigs) {
        queryClient.setQueryData(KEYS.configs, context.previousConfigs);
      }
    },
    onSuccess: (_result, config) => {
      queryClient.invalidateQueries({ queryKey: KEYS.log(config.agentId, config.environmentId) });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.configs });
    },
  });
}
