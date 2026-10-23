import type { CSSProperties, ReactElement } from "react";
import { tokens } from "@fluentui/react-components";
import {
  BeakerRegular,
  BookOpenRegular,
  BotRegular,
  ChatRegular,
  ErrorCircleRegular,
  FlashRegular,
  WrenchRegular,
} from "@fluentui/react-icons";
import { SkillGlyph } from "../../agent-review/ui/components/common.js";
import mcpMarkMask from "./assets/mcp-mark-mask.png";
import type {
  AgentMapNodeCategory,
  AgentMapProvenance,
  AgentMapViewNode,
} from "./agentMapViewModel";

export {
  AGENT_MAP_CATEGORY_LABELS,
  AGENT_MAP_PROVENANCE_LABELS,
  AGENT_MAP_RESOLUTION_LABELS,
  agentMapNodeIconIsBranded,
  agentMapProvenanceDash,
  getAgentMapNodeTypeLabel,
} from "./agentMapLabels";

export const AGENT_MAP_CATEGORY_COLORS: Record<AgentMapNodeCategory, string> = {
  agent: tokens.colorBrandBackground,
  tool: tokens.colorPaletteTealBorderActive,
  skill: tokens.colorPalettePurpleBorderActive,
  topic: tokens.colorPaletteBlueBorderActive,
  action: tokens.colorPaletteTealBorderActive,
  knowledge: tokens.colorPaletteGreenBorderActive,
  "connected-agent": tokens.colorPaletteBerryBorderActive,
  trigger: tokens.colorPaletteDarkOrangeBorderActive,
  "evaluation-set": tokens.colorPaletteMarigoldBorderActive,
  "test-case": tokens.colorPaletteMarigoldBorder2,
  unknown: tokens.colorPaletteYellowBorderActive,
};

const MCP_MARK_STYLE: CSSProperties = {
  display: "inline-block",
  width: 18,
  height: 18,
  flexShrink: 0,
  backgroundColor: "currentColor",
  maskImage: `url("${mcpMarkMask}")`,
  maskPosition: "center",
  maskRepeat: "no-repeat",
  maskSize: "contain",
  WebkitMaskImage: `url("${mcpMarkMask}")`,
  WebkitMaskPosition: "center",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskSize: "contain",
};

/** Return the Fluent icon used to identify one graph component category. */
export function agentMapCategoryIcon(category: AgentMapNodeCategory): ReactElement {
  switch (category) {
    // Fallback only: an agent normally renders its own icon from
    // `bots.iconbase64`, the same mark the review grids show.
    case "agent":
    case "connected-agent":
      return <BotRegular />;
    case "skill": return <SkillGlyph size={18} />;
    case "topic": return <ChatRegular />;
    case "action": return <WrenchRegular />;
    case "tool": return <WrenchRegular />;
    case "knowledge": return <BookOpenRegular />;
    case "trigger": return <FlashRegular />;
    case "evaluation-set":
    case "test-case":
      return <BeakerRegular />;
    default: return <ErrorCircleRegular />;
  }
}

/** Return the exact MCP mark or the fallback icon for a node category. */
export function agentMapNodeIcon(
  node: Pick<AgentMapViewNode, "category" | "toolKind">,
): ReactElement {
  return node.category === "tool" && node.toolKind === "McpTool"
    ? <span aria-hidden="true" style={MCP_MARK_STYLE} />
    : agentMapCategoryIcon(node.category);
}

/** Return a theme-token edge color for a relationship provenance. */
export function agentMapProvenanceColor(provenance: AgentMapProvenance): string {
  switch (provenance) {
    // Structural edges are the agent-to-component relationships — the primary
    // information the map carries — so they are "graphical objects required to
    // understand the content" under WCAG 1.4.11 and need 3:1.
    case "structural": return tokens.colorNeutralStrokeAccessible;
    case "textual-exact": return tokens.colorBrandStroke1;
    case "textual-strong": return tokens.colorPaletteDarkOrangeBorderActive;
  }
}
