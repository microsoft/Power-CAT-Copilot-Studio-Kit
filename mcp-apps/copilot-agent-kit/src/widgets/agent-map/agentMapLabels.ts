import type {
  AgentMapNodeCategory,
  AgentMapProvenance,
  AgentMapResolution,
  AgentMapViewNode,
} from "./agentMapViewModel";

export const AGENT_MAP_CATEGORY_LABELS: Record<AgentMapNodeCategory, string> = {
  agent: "Agent",
  tool: "Tool",
  skill: "Skill",
  topic: "Topic",
  action: "Action",
  knowledge: "Knowledge",
  "connected-agent": "Connected agent",
  trigger: "Trigger",
  "evaluation-set": "Evaluation set",
  "test-case": "Test case",
  unknown: "Unknown component",
};

/**
 * Plain-language names for how a relationship was established.
 *
 * These are read by makers, not by the people who built the pipeline, so they
 * say what happened rather than naming the mechanism.
 */
export const AGENT_MAP_PROVENANCE_LABELS: Record<AgentMapProvenance, string> = {
  structural: "Configured on the agent",
  "textual-exact": "Name matched in skill text",
  "textual-strong": "Likely match in skill text",
};

export const AGENT_MAP_RESOLUTION_LABELS: Record<AgentMapResolution, string> = {
  resolved: "Resolved",
  unresolved: "Unresolved",
};

/** Return a visible node type that distinguishes MCP from connector tools. */
export function getAgentMapNodeTypeLabel(
  node: Pick<AgentMapViewNode, "category" | "toolKind">,
): string {
  if (node.category === "tool") {
    if (node.toolKind === "McpTool") return "MCP tool";
    if (node.toolKind === "ConnectorTool") return "Connector tool";
  }
  return AGENT_MAP_CATEGORY_LABELS[node.category];
}

/** Categories whose glyph carries its own colour and needs a light tile. */
export function agentMapCategoryIconIsBranded(category: AgentMapNodeCategory): boolean {
  return category === "agent" || category === "connected-agent" || category === "skill";
}

/** Return whether a node glyph needs a light product-icon tile. */
export function agentMapNodeIconIsBranded(
  node: Pick<AgentMapViewNode, "category" | "toolKind">,
): boolean {
  return node.toolKind === "McpTool" || agentMapCategoryIconIsBranded(node.category);
}

/** Return the line pattern that reinforces provenance without relying on color. */
export function agentMapProvenanceDash(
  provenance: AgentMapProvenance,
): string | undefined {
  switch (provenance) {
    case "textual-exact": return "2 4";
    case "textual-strong": return "7 4";
    default: return undefined;
  }
}
