import type {
  AgentMapFilters,
  AgentMapNodeCategory,
  AgentMapProvenance,
  AgentMapViewGraph,
  FilteredAgentMapGraph,
} from "./agentMapViewModel";
import { normalizeAgentMapKey } from "./agentMapViewModel";

const ALL_CATEGORIES: readonly AgentMapNodeCategory[] = [
  "agent",
  "tool",
  "skill",
  "topic",
  "action",
  "knowledge",
  "connected-agent",
  "trigger",
  "evaluation-set",
  "test-case",
  "unknown",
];

/**
 * Evaluation sets and test cases describe how an agent is tested, not what it
 * runs. The map hides them until the maker turns them on in the toolbar.
 */
export const HIDDEN_BY_DEFAULT_CATEGORIES: ReadonlySet<AgentMapNodeCategory> = new Set([
  "evaluation-set",
  "test-case",
]);

const DEFAULT_CATEGORIES: ReadonlySet<AgentMapNodeCategory> = new Set(
  ALL_CATEGORIES.filter((category) => !HIDDEN_BY_DEFAULT_CATEGORIES.has(category)),
);

// Earlier releases saved these complete category sets as their default filter.
const LEGACY_DEFAULT_CATEGORY_SETS: readonly ReadonlySet<AgentMapNodeCategory>[] = [
  new Set(ALL_CATEGORIES),
  new Set(ALL_CATEGORIES.filter((category) => category !== "topic" && category !== "action")),
];

function sameCategories(
  left: ReadonlySet<AgentMapNodeCategory>,
  right: ReadonlySet<AgentMapNodeCategory>,
): boolean {
  return left.size === right.size && [...left].every((category) => right.has(category));
}

/**
 * Restore saved categories. A saved set that equals an earlier default is the
 * current default; any other saved set is a maker choice and stays unchanged.
 */
export function restoreSavedCategories(
  categories: Iterable<AgentMapNodeCategory>,
): Set<AgentMapNodeCategory> {
  const saved = new Set(categories);
  return LEGACY_DEFAULT_CATEGORY_SETS.some((legacy) => sameCategories(saved, legacy))
    ? new Set(DEFAULT_CATEGORIES)
    : saved;
}

/** Show a category that a finding or a deep link needs. Other filters stay unchanged. */
export function revealCategory(
  filters: AgentMapFilters,
  category: AgentMapNodeCategory | undefined,
): AgentMapFilters {
  if (!category || filters.categories.has(category)) return filters;
  return { ...filters, categories: new Set([...filters.categories, category]) };
}

/**
 * The deterministic MCP builder emits three evidence kinds.
 *
 * The Code App also carries `model-inferred`, which only exists once a
 * reviewing agent has run. This widget never starts a review, so that kind
 * cannot appear and is deliberately absent rather than shown as a dead filter.
 */
const ALL_PROVENANCES: ReadonlySet<AgentMapProvenance> = new Set([
  "structural",
  "textual-exact",
  "textual-strong",
]);

/** Create the initial and reset filter state for Agent Map. */
export function createDefaultFilters(): AgentMapFilters {
  return {
    query: "",
    categories: new Set(DEFAULT_CATEGORIES),
    provenances: new Set(ALL_PROVENANCES),
    includeUnresolved: true,
  };
}

/** Apply shared Map/List filters without mutating the deterministic graph. */
export function filterAgentMapGraph(
  graph: AgentMapViewGraph,
  filters: AgentMapFilters,
): FilteredAgentMapGraph {
  const query = normalizeAgentMapKey(filters.query);
  const categoryAllowed = new Set(
    graph.nodes
      .filter((node) =>
        filters.categories.has(node.category)
        && (filters.includeUnresolved || node.resolution !== "unresolved"))
      .map((node) => node.id),
  );

  const provenanceEdges = graph.edges.filter((edge) =>
    filters.provenances.has(edge.provenance)
    && categoryAllowed.has(edge.source)
    && categoryAllowed.has(edge.target));
  const allowedNodes = graph.nodes.filter((node) => categoryAllowed.has(node.id));

  if (!query) {
    return {
      nodes: allowedNodes,
      edges: provenanceEdges,
      matchedNodeIds: new Set(allowedNodes.map((node) => node.id)),
      matchedEdgeIds: new Set(provenanceEdges.map((edge) => edge.id)),
    };
  }

  const directlyMatchedNodeIds = new Set(
    graph.nodes
      .filter((node) => categoryAllowed.has(node.id) && node.searchText.includes(query))
      .map((node) => node.id),
  );
  const matchedNodeIds = new Set(directlyMatchedNodeIds);
  const matchedEdgeIds = new Set(
    provenanceEdges
      .filter((edge) => edge.searchText.includes(query))
      .map((edge) => edge.id),
  );
  provenanceEdges.forEach((edge) => {
    if (matchedEdgeIds.has(edge.id)) {
      matchedNodeIds.add(edge.source);
      matchedNodeIds.add(edge.target);
    }
  });

  // Expand only one hop from direct text matches. Adding the root before this
  // pass would make every structural spoke look matched for any node query.
  const emphasizedEdges = provenanceEdges.filter((edge) =>
    matchedEdgeIds.has(edge.id)
    || directlyMatchedNodeIds.has(edge.source)
    || directlyMatchedNodeIds.has(edge.target));
  emphasizedEdges.forEach((edge) => {
    matchedEdgeIds.add(edge.id);
    matchedNodeIds.add(edge.source);
    matchedNodeIds.add(edge.target);
  });

  const agent = graph.nodes.find((node) => node.category === "agent");
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
