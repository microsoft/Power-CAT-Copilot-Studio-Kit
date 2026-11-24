import type { CSSProperties, ReactElement } from 'react';
import { tokens } from '@fluentui/react-components';
import {
  BeakerRegular,
  BookOpenRegular,
  BotRegular,
  ChatMultipleRegular,
  ErrorCircleRegular,
  FlashRegular,
  OrganizationRegular,
  SettingsRegular,
  WrenchRegular,
} from '@fluentui/react-icons';
import { SkillGlyph } from '../common';
import mcpMarkMask from './assets/mcp-mark-mask.png';
import type {
  AgentMapNode,
  AgentMapNodeCategory,
  AgentMapProvenance,
  AgentMapResolution,
} from '../../contracts/AgentMap';

export const AGENT_MAP_CATEGORY_LABELS: Record<AgentMapNodeCategory, string> = {
  agent: 'Agent',
  topic: 'Topic',
  tool: 'Tool',
  skill: 'Skill',
  knowledge: 'Knowledge',
  'connected-agent': 'Connected agent',
  'child-agent': 'Child agent',
  entity: 'Entity',
  configuration: 'Configuration',
  trigger: 'Trigger',
  'evaluation-set': 'Evaluation set',
  'test-case': 'Test case',
  unknown: 'Unknown component',
};

/**
 * Plain-language names for how a relationship was established.
 *
 * These are read by makers, not by the people who built the pipeline, so they
 * say what happened rather than naming the mechanism. "Structural" and
 * "inferred" described the implementation; a maker only needs to know whether a
 * line is a fact about their configuration or a judgement about their text.
 */
export const AGENT_MAP_PROVENANCE_LABELS: Record<AgentMapProvenance, string> = {
  structural: 'Configured on the agent',
  'textual-exact': 'Name matched in skill text',
  'textual-strong': 'Likely match in skill text',
  'model-inferred': 'Found by AI review',
};

export const AGENT_MAP_RESOLUTION_LABELS: Record<AgentMapResolution, string> = {
  resolved: 'Resolved',
  unresolved: 'Unresolved',
};

export const AGENT_MAP_CATEGORY_COLORS: Record<AgentMapNodeCategory, string> = {
  agent: tokens.colorBrandBackground,
  topic: tokens.colorPaletteDarkOrangeBorderActive,
  tool: tokens.colorPaletteTealBorderActive,
  skill: tokens.colorPalettePurpleBorderActive,
  knowledge: tokens.colorPaletteGreenBorderActive,
  'connected-agent': tokens.colorPaletteBerryBorderActive,
  'child-agent': tokens.colorPaletteBerryBorderActive,
  entity: tokens.colorPaletteTealBorderActive,
  configuration: tokens.colorPalettePurpleBorderActive,
  trigger: tokens.colorPaletteDarkOrangeBorderActive,
  'evaluation-set': tokens.colorPaletteMarigoldBorderActive,
  'test-case': tokens.colorPaletteMarigoldBorder2,
  unknown: tokens.colorPaletteYellowBorderActive,
};

const MCP_MARK_STYLE: CSSProperties = {
  display: 'inline-block',
  width: 18,
  height: 18,
  flexShrink: 0,
  backgroundColor: 'currentColor',
  maskImage: `url("${mcpMarkMask}")`,
  maskPosition: 'center',
  maskRepeat: 'no-repeat',
  maskSize: 'contain',
  WebkitMaskImage: `url("${mcpMarkMask}")`,
  WebkitMaskPosition: 'center',
  WebkitMaskRepeat: 'no-repeat',
  WebkitMaskSize: 'contain',
};

/** Return a visible node type that distinguishes MCP from connector tools. */
export function getAgentMapNodeTypeLabel(
  node: Pick<AgentMapNode, 'category' | 'toolKind'>,
): string {
  if (node.category === 'tool') {
    if (node.toolKind === 'McpTool') return 'MCP tool';
    if (node.toolKind === 'ConnectorTool') return 'Connector tool';
  }
  return AGENT_MAP_CATEGORY_LABELS[node.category];
}

/** Categories whose glyph carries its own colour and needs a light tile. */
export function agentMapCategoryIconIsBranded(category: AgentMapNodeCategory): boolean {
  return category === 'agent' || category === 'connected-agent' || category === 'skill';
}

/** Return whether a node glyph needs a light product-icon tile. */
export function agentMapNodeIconIsBranded(
  node: Pick<AgentMapNode, 'category' | 'toolKind'>,
): boolean {
  return node.toolKind === 'McpTool'
    || agentMapCategoryIconIsBranded(node.category);
}

/** Return the Fluent icon used to identify one graph component category. */
export function agentMapCategoryIcon(category: AgentMapNodeCategory): ReactElement {
  switch (category) {
    // Fallback only: an agent normally renders its own icon from
    // `bots.iconbase64`, the same mark the review grids show.
    case 'agent':
    case 'connected-agent':
    case 'child-agent':
      return <BotRegular />;
    case 'topic': return <ChatMultipleRegular />;
    case 'skill': return <SkillGlyph size={18} />;
    case 'tool': return <WrenchRegular />;
    case 'knowledge': return <BookOpenRegular />;
    case 'entity': return <OrganizationRegular />;
    case 'configuration': return <SettingsRegular />;
    case 'trigger': return <FlashRegular />;
    case 'evaluation-set':
    case 'test-case':
      return <BeakerRegular />;
    case 'unknown': return <ErrorCircleRegular />;
  }
}

/** Return the exact MCP mark or the fallback icon for a node category. */
export function agentMapNodeIcon(
  node: Pick<AgentMapNode, 'category' | 'toolKind'>,
): ReactElement {
  return node.category === 'tool' && node.toolKind === 'McpTool'
    ? <span aria-hidden="true" style={MCP_MARK_STYLE} />
    : agentMapCategoryIcon(node.category);
}

/** Return a theme-token edge color for a relationship provenance. */
export function agentMapProvenanceColor(provenance: AgentMapProvenance): string {
  switch (provenance) {
    // Structural edges are the agent-to-component relationships — the primary
    // information the map carries — so they are "graphical objects required to
    // understand the content" under WCAG 1.4.11 and need 3:1. The former
    // colorNeutralStroke2 measured ~1.3:1 on the canvas and ~1.1:1 over the
    // gradient bloom. colorNeutralStrokeAccessible is the Fluent token
    // guaranteed >=3:1 in both light and dark themes.
    case 'structural': return tokens.colorNeutralStrokeAccessible;
    case 'textual-exact': return tokens.colorBrandStroke1;
    case 'textual-strong': return tokens.colorPaletteDarkOrangeBorderActive;
    case 'model-inferred': return tokens.colorPalettePurpleBorderActive;
  }
}

/** Return the line pattern that reinforces provenance without relying on color. */
export function agentMapProvenanceDash(provenance: AgentMapProvenance): string | undefined {
  switch (provenance) {
    case 'textual-exact': return '2 4';
    case 'textual-strong': return '7 4';
    case 'model-inferred': return '1 5';
    default: return undefined;
  }
}
