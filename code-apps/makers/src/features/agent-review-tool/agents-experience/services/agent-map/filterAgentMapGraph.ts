import type {
  AgentMapFilters,
  AgentMapGraph,
  AgentMapNodeCategory,
  AgentMapProvenance,
  FilteredAgentMapGraph,
} from '../../contracts/AgentMap';
import { normalizeAgentMapKey } from './agentMapUtils';

const DEFAULT_CATEGORIES: ReadonlySet<AgentMapNodeCategory> = new Set([
  'agent',
  'tool',
  'skill',
  'knowledge',
  'connected-agent',
  'trigger',
  'evaluation-set',
  'unknown',
]);

const ALL_PROVENANCES: ReadonlySet<AgentMapProvenance> = new Set([
  'structural',
  'model-inferred',
  'textual-exact',
  'textual-strong',
]);

/** Create the initial and reset filter state for Agent Map. */
export function createDefaultFilters(
  categories: Iterable<AgentMapNodeCategory> = DEFAULT_CATEGORIES,
): AgentMapFilters {
  return {
    query: '',
    categories: new Set(categories),
    provenances: new Set(ALL_PROVENANCES),
    includeUnresolved: true,
  };
}

/** Apply shared Map/List filters without mutating the reviewed graph. */
export function filterAgentMapGraph(
  graph: AgentMapGraph,
  filters: AgentMapFilters,
): FilteredAgentMapGraph {
  const query = normalizeAgentMapKey(filters.query);
  // First pass: nodes whose own category/resolution passes the filter.
  const directlyAllowed = new Set(
    graph.nodes
      .filter(node =>
        filters.categories.has(node.category) &&
        (filters.includeUnresolved || node.resolution !== 'unresolved'))
      .map(node => node.id),
  );

  // Second pass: exclude descendants whose ancestor was filtered out (#837).
  // A node is only allowed if every ancestor in its parentId chain is also allowed.
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
  const categoryAllowed = new Set<string>();
  for (const nodeId of directlyAllowed) {
    let current = nodeById.get(nodeId);
    let ancestorsAllowed = true;
    while (current?.parentId) {
      if (!directlyAllowed.has(current.parentId)) {
        ancestorsAllowed = false;
        break;
      }
      current = nodeById.get(current.parentId);
    }
    if (ancestorsAllowed) {
      categoryAllowed.add(nodeId);
    }
  }

  const provenanceEdges = graph.edges.filter(edge =>
    filters.provenances.has(edge.provenance) &&
    categoryAllowed.has(edge.source) &&
    categoryAllowed.has(edge.target));
  const allowedNodes = graph.nodes.filter(node => categoryAllowed.has(node.id));

  if (!query) {
    return {
      nodes: allowedNodes,
      edges: provenanceEdges,
      matchedNodeIds: new Set(allowedNodes.map(node => node.id)),
      matchedEdgeIds: new Set(provenanceEdges.map(edge => edge.id)),
    };
  }

  const directlyMatchedNodeIds = new Set(
    graph.nodes
      .filter(node => categoryAllowed.has(node.id) && node.searchText.includes(query))
      .map(node => node.id),
  );
  const matchedNodeIds = new Set(directlyMatchedNodeIds);
  const matchedEdgeIds = new Set(
    provenanceEdges
      .filter(edge => edge.searchText.includes(query))
      .map(edge => edge.id),
  );
  provenanceEdges.forEach(edge => {
    if (matchedEdgeIds.has(edge.id)) {
      matchedNodeIds.add(edge.source);
      matchedNodeIds.add(edge.target);
    }
  });

  // Expand only one hop from direct text matches. Adding the root before this
  // pass would make every structural spoke look matched for any node query.
  const emphasizedEdges = provenanceEdges.filter(edge =>
    matchedEdgeIds.has(edge.id) ||
    directlyMatchedNodeIds.has(edge.source) ||
    directlyMatchedNodeIds.has(edge.target));
  emphasizedEdges.forEach(edge => {
    matchedEdgeIds.add(edge.id);
    matchedNodeIds.add(edge.source);
    matchedNodeIds.add(edge.target);
  });

  const agent = graph.nodes.find(node => node.category === 'agent');
  if (agent && categoryAllowed.has(agent.id) && matchedNodeIds.size > 0) {
    matchedNodeIds.add(agent.id);
  }

  return {
    // Search emphasizes matches but does not remove the category/provenance-filtered
    // context. Map and List therefore remain spatially and semantically equivalent.
    nodes: allowedNodes,
    edges: provenanceEdges,
    matchedNodeIds,
    matchedEdgeIds,
  };
}
