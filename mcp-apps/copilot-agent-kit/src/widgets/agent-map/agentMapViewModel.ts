import type {
  AgentMapDiagnostic,
  AgentMapEdge,
  AgentMapGraph,
  AgentMapNode,
  AgentMapNodeCategory,
  AgentMapProvenance,
} from "../../agent-map/types";

export type {
  AgentMapDiagnostic,
  AgentMapNodeCategory,
  AgentMapProvenance,
} from "../../agent-map/types";

export type AgentMapResolution = "resolved" | "unresolved";

export type AgentMapToolKind = "McpTool" | "ConnectorTool";

export type AgentMapDetailValue = string | number | boolean | string[];

/**
 * The Code App node shape, derived from the deterministic MCP graph.
 *
 * The MCP contract carries deterministic hierarchy for connected-agent
 * expansion; React Flow adds resolution, tool subtype, and search indexing.
 */
export interface AgentMapViewNode {
  id: string;
  category: AgentMapNodeCategory;
  label: string;
  subtitle?: string;
  toolKind?: AgentMapToolKind;
  schemaName?: string;
  componentId?: string;
  componentIdUnique?: string;
  actionPath?: string;
  targetAgentSchemaName?: string;
  iconBase64?: string;
  description?: string;
  parentId?: string;
  depth: number;
  details: Record<string, AgentMapDetailValue>;
  warnings: string[];
  resolution: AgentMapResolution;
  searchText: string;
}

export interface AgentMapViewEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  provenance: AgentMapProvenance;
  evidence: string;
  confidence: number;
  resolution: AgentMapResolution;
  sourceField?: string;
  directed: boolean;
  searchText: string;
}

export interface AgentMapViewGraph {
  agent: AgentMapGraph["agent"];
  nodes: AgentMapViewNode[];
  edges: AgentMapViewEdge[];
  diagnostics: AgentMapDiagnostic[];
  summary: AgentMapGraph["summary"];
}

export interface AgentMapFilters {
  query: string;
  categories: ReadonlySet<AgentMapNodeCategory>;
  provenances: ReadonlySet<AgentMapProvenance>;
  includeUnresolved: boolean;
}

export interface FilteredAgentMapGraph {
  nodes: AgentMapViewNode[];
  edges: AgentMapViewEdge[];
  matchedNodeIds: ReadonlySet<string>;
  matchedEdgeIds: ReadonlySet<string>;
}

export interface AgentMapLayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AgentMapLayout {
  nodes: AgentMapLayoutNode[];
  algorithm: "concentric-radial";
}

/** Normalize authored identities for exact lookup and deterministic ordering. */
export function normalizeAgentMapKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/** Return a browser-safe image source for a maker-supplied icon. */
export function imageSource(value: string | undefined): string | undefined {
  const image = value?.trim();
  if (!image) return undefined;
  return image.startsWith("data:image/") ? image : `data:image/png;base64,${image}`;
}

function detailsText(details: Record<string, AgentMapDetailValue>): string {
  return Object.entries(details)
    .flatMap(([label, value]) => [label, ...(Array.isArray(value) ? value : [String(value)])])
    .join(" ");
}

/** Populate the normalized text searched by both Map and List views. */
export function agentMapNodeSearchText(
  node: Omit<AgentMapViewNode, "searchText">,
): string {
  return normalizeAgentMapKey([
    node.label,
    node.subtitle,
    node.schemaName,
    node.componentId,
    node.componentIdUnique,
    node.actionPath,
    node.description,
    node.category,
    detailsText(node.details),
    ...node.warnings,
  ].filter(Boolean).join(" "));
}

/** Populate edge search text without exposing raw source content. */
export function agentMapEdgeSearchText(
  edge: Omit<AgentMapViewEdge, "searchText">,
): string {
  return normalizeAgentMapKey([
    edge.relationship,
    edge.provenance,
    edge.evidence,
    edge.resolution,
    edge.sourceField,
  ].filter(Boolean).join(" "));
}

/**
 * The MCP builder records the tool subtype in `details.Kind` and echoes it in
 * the subtitle, so the exact MCP mark survives the transport without changing
 * the server contract.
 */
function toolKind(node: AgentMapNode): AgentMapToolKind | undefined {
  if (node.category !== "tool") return undefined;
  const kind = node.details.Kind;
  if (kind === "McpTool" || kind === "ConnectorTool") return kind;
  const subtitle = normalizeAgentMapKey(node.subtitle ?? "");
  if (subtitle === "mcp tool") return "McpTool";
  if (subtitle === "connector tool") return "ConnectorTool";
  return undefined;
}

/**
 * The deterministic MCP map is one ring deep: the server never expands a
 * connected agent's own components, so every component is a direct child of
 * the selected agent.
 */
function depthOf(node: AgentMapNode): number {
  return node.depth ?? (node.category === "agent" ? 0 : 1);
}

/**
 * Only the `unknown` category is unresolved.
 *
 * The MCP builder refuses to draw a relationship it cannot resolve to exactly
 * one component — it records a diagnostic instead — so every edge it emits and
 * every other node it emits is resolved by construction.
 */
function resolutionOf(node: AgentMapNode): AgentMapResolution {
  return node.category === "unknown" ? "unresolved" : "resolved";
}

function toViewNode(node: AgentMapNode, rootId: string | undefined): AgentMapViewNode {
  const base: Omit<AgentMapViewNode, "searchText"> = {
    id: node.id,
    category: node.category,
    label: node.label,
    subtitle: node.subtitle,
    toolKind: toolKind(node),
    schemaName: node.schemaName,
    componentId: node.componentId,
    componentIdUnique: node.componentIdUnique,
    actionPath: node.actionPath,
    targetAgentSchemaName: node.targetAgentSchemaName,
    iconBase64: imageSource(node.iconBase64),
    description: node.description,
    parentId: node.category === "agent" ? undefined : node.parentId ?? rootId,
    depth: depthOf(node),
    details: { ...node.details },
    warnings: [...node.warnings],
    resolution: resolutionOf(node),
  };
  return { ...base, searchText: agentMapNodeSearchText(base) };
}

function toViewEdge(edge: AgentMapEdge): AgentMapViewEdge {
  const base: Omit<AgentMapViewEdge, "searchText"> = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    relationship: edge.relationship,
    provenance: edge.provenance,
    evidence: edge.evidence,
    confidence: edge.confidence,
    resolution: "resolved",
    sourceField: edge.provenance === "structural" ? undefined : "SKILL.md",
    // Every MCP relationship reads one way: the agent contains a component, or
    // a skill references one. Undirected lines would lose that reading.
    directed: true,
  };
  return { ...base, searchText: agentMapEdgeSearchText(base) };
}

/** Adapt the deterministic MCP graph to the Code App React Flow view model. */
export function toAgentMapViewGraph(graph: AgentMapGraph): AgentMapViewGraph {
  const rootId = graph.nodes.find((node) => node.category === "agent")?.id;
  return {
    agent: graph.agent,
    nodes: graph.nodes.map((node) => toViewNode(node, rootId)),
    edges: graph.edges.map(toViewEdge),
    diagnostics: graph.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    summary: { ...graph.summary },
  };
}
