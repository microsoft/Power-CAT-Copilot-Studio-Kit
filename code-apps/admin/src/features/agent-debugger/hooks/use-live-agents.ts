import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentDetailsOption } from "../services/dataverse-agent-service";
import {
  getAgentOrganizations, getAgentDiscoveryContext, getLiveAgents, getMakerEnvironments,
  loadAgentEnvironments, type AgentEnvironment,
} from "../services/live-agent-service";
import {
  agentDiscoveryErrorCacheTime, agentDiscoveryRetryDelay, classifyAgentDiscoveryError, shouldRetryAgentDiscovery,
} from "../utils/agent-discovery-errors";
import { createAgentDiscoveryPriorityCache } from "../utils/agent-discovery-priority";

const staleTime = 5 * 60 * 1000;
const queryOptions = { staleTime, retry: false, refetchOnWindowFocus: false } as const;
const agentQueryOptions = {
  ...queryOptions, retry: shouldRetryAgentDiscovery, retryDelay: agentDiscoveryRetryDelay,
};
const agentsKey = (url: string) => ["debugger-live-agents-with-transcripts", url] as const;
const currentAlias: AgentEnvironment = { url: "current", name: "Current environment" };
type EnvironmentResult = { agents: AgentDetailsOption[]; error?: Error };

export function useLiveAgents(enabled = true, requestedEnvironmentUrl = "") {
  const client = useQueryClient();
  const [mountedAt] = useState(Date.now);
  const context = useQuery({
    queryKey: ["debugger-discovery-context"], queryFn: getAgentDiscoveryContext, enabled, ...queryOptions,
  });
  const makers = useQuery({
    queryKey: ["debugger-maker-environments"], queryFn: getMakerEnvironments, enabled, ...queryOptions,
  });
  const organizations = useQuery({
    queryKey: ["debugger-organizations"], queryFn: getAgentOrganizations, enabled, ...queryOptions,
  });
  const current = makers.data?.find(env => env.id?.toLowerCase() === context.data?.environmentId.toLowerCase());
  const currentCached = client.getQueryState(agentsKey("current"));
  const canRefetchCurrentOnMount = currentCached?.status !== "error"
    || mountedAt - currentCached.errorUpdatedAt >= agentDiscoveryErrorCacheTime(currentCached.error);
  const currentAgents = useQuery({
    queryKey: agentsKey("current"),
    queryFn: () => getLiveAgents(currentAlias),
    enabled,
    ...agentQueryOptions,
    retryOnMount: canRefetchCurrentOnMount,
    refetchOnMount: canRefetchCurrentOnMount,
  });
  const environments = useMemo(() => {
    const byUrl = new Map<string, AgentEnvironment>();
    for (const env of organizations.data ?? []) byUrl.set(env.url, env);
    for (const env of makers.data ?? []) byUrl.set(env.url, env);
    return [...byUrl.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [makers.data, organizations.data]);
  const remaining = useMemo(() => environments.filter(env => env.url !== current?.url), [environments, current?.url]);
  const [loadRequested, setLoadRequested] = useState(false);
  const search = useRef("");
  const loadRemainingAgents = useCallback((query?: string) => {
    if (query !== undefined) search.current = query.trim().toLowerCase();
    setLoadRequested(true);
  }, []);
  const requestedEnvironments = useMemo(() => {
    const target = remaining.filter(env => env.url === requestedEnvironmentUrl);
    return loadRequested
      ? [...target, ...remaining.filter(env => env.url !== requestedEnvironmentUrl)]
      : target;
  }, [remaining, loadRequested, requestedEnvironmentUrl]);
  const [results, setResults] = useState<Record<string, EnvironmentResult>>({});
  // A stable directory keeps catalog updates from starting overlapping worker pools.
  // The current-connection query is independent and is already usable.
  const canLoadRemaining = enabled && !context.isPending && !makers.isPending && !organizations.isPending;
  useEffect(() => {
    if (!canLoadRemaining) return;
    const controller = new AbortController();
    const priorityCache = createAgentDiscoveryPriorityCache(context.data?.priorityCacheKey, environments.map(env => env.url));
    void loadAgentEnvironments(
      requestedEnvironments,
      async env => {
        const queryKey = agentsKey(env.url);
        const cached = client.getQueryState(queryKey);
        if (cached?.status === "error"
          && Date.now() - cached.errorUpdatedAt < agentDiscoveryErrorCacheTime(cached.error)) {
          throw cached.error;
        }
        return client.fetchQuery({
          queryKey,
          queryFn: async () => {
            const agents = await getLiveAgents(env);
            priorityCache.recordSuccess(env.url, agents.length > 0);
            return agents;
          },
          ...agentQueryOptions,
        });
      },
      (env, agents, error) => {
        if (error) priorityCache.recordFailure(env.url, error);
        setResults(previous => ({ ...previous, [env.url]: { agents, error } }));
      },
      controller.signal,
      env => {
        if (env.url === requestedEnvironmentUrl) return 4;
        if (search.current && `${env.name} ${env.url}`.toLowerCase().includes(search.current)) return 3;
        const cached = client.getQueryState(agentsKey(env.url));
        if (cached?.status === "error" && classifyAgentDiscoveryError(cached.error) === "access-denied"
          && Date.now() - cached.errorUpdatedAt < agentDiscoveryErrorCacheTime(cached.error)) return -1;
        return priorityCache.priority(env.url);
      },
    );
    return () => controller.abort();
  }, [canLoadRemaining, client, requestedEnvironments, requestedEnvironmentUrl, context.data?.priorityCacheKey, environments]);

  useEffect(() => {
    for (const error of [context.error, makers.error, organizations.error, currentAgents.error]) {
      if (error) console.warn("[AgentDebugger] Agent discovery failed:", error);
    }
  }, [context.error, makers.error, organizations.error, currentAgents.error]);

  const data = useMemo(() => [
    ...(currentAgents.data ?? []).map(agent => ({
      ...agent, environmentUrl: current?.url ?? "current",
      environmentName: current?.name ?? "Current environment",
      environmentId: current?.id ?? context.data?.environmentId,
    })),
    ...remaining.flatMap(env => (results[env.url]?.agents ?? []).map(agent => ({
      ...agent, environmentId: env.id, environmentName: env.name,
    }))),
  ], [currentAgents.data, current?.url, current?.name, current?.id, context.data, remaining, results]);
  const directoryLoading = context.isPending || makers.isPending || organizations.isPending;
  const loading = enabled && (
    ((loadRequested || !!requestedEnvironmentUrl) && directoryLoading)
    || requestedEnvironments.some(env => !results[env.url])
  );
  const errors = [
    context.error?.message, makers.error?.message, organizations.error?.message,
    currentAgents.error ? `${current?.name ?? "Current environment"}: ${currentAgents.error.message}` : undefined,
    ...remaining.flatMap(env => results[env.url]?.error ? [`${env.name}: ${results[env.url].error!.message}`] : []),
    !context.isPending && !makers.isPending && !context.error && !makers.error && !current
      ? "Current environment details are unavailable. Agents can still be read using the current connection."
      : undefined,
  ].filter((message): message is string => !!message);
  const isEnvironmentLoading = useCallback((url: string) => {
    if (url === "current" || current?.url === url) return currentAgents.isPending;
    if (remaining.some(env => env.url === url)) return !results[url];
    return context.isPending || makers.isPending || organizations.isPending;
  }, [current?.url, currentAgents.isPending, remaining, results, context.isPending, makers.isPending, organizations.isPending]);

  return {
    data, isLoading: enabled && currentAgents.isPending && data.length === 0, isDiscovering: loading,
    currentEnvironmentUrl: current?.url ?? "current", errors,
    isEnvironmentLoading, loadRemainingAgents,
    hasMoreAgents: !loadRequested && (directoryLoading || remaining.some(env => !results[env.url])),
  };
}
