import type {
  AgentMapBuildInput,
  AgentMapGraph,
  CachedAgentMapInput,
} from '../../contracts/AgentMap';
import { AgentMapGraphBuilder } from './graphBuilderState';
import { addAgentMapNodes } from './addAgentMapNodes';
import { addAgentMapRelationships } from './addAgentMapRelationships';
import { addExpandedConnectedAgent } from './addExpandedConnectedAgent';

const graphCache = new WeakMap<object, Map<string, AgentMapGraph>>();

/** Build a deterministic evidence graph from one reviewed snapshot. */
export function buildAgentMapGraph(input: AgentMapBuildInput): AgentMapGraph {
  const builder = new AgentMapGraphBuilder();
  const context = addAgentMapNodes(input, builder);
  addAgentMapRelationships(input, builder, context);
  addExpandedConnectedAgent(input, builder);
  return builder.finalize();
}

/** Reuse graph output when an inactive result tab unmounts and later remounts. */
export function getCachedAgentMapGraph(input: CachedAgentMapInput): AgentMapGraph {
  // Icons arrive asynchronously, so they are part of the cache key: without
  // this the first (icon-less) graph would be served forever.
  const iconKey = input.agentIcons ? Object.keys(input.agentIcons).sort().join(',') : '';
  const cacheKey = `${input.agentId}|${input.agentName}|${iconKey}`;
  const payloadCache = graphCache.get(input.payload) ?? new Map<string, AgentMapGraph>();
  const cached = payloadCache.get(cacheKey);
  if (cached) return cached;
  const graph = buildAgentMapGraph({
    agentId: input.agentId,
    agentName: input.agentName,
    model: input.payload.model,
    skillBundleReviews: input.payload.skillBundleReviews,
    agentIcons: input.agentIcons,
  });
  payloadCache.set(cacheKey, graph);
  graphCache.set(input.payload, payloadCache);
  return graph;
}
