import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  agentMapNodeIcon,
  agentMapNodeIconIsBranded,
  getAgentMapNodeTypeLabel,
} from '../components/agent-map/agentMapPresentation';

describe('agent map node presentation', () => {
  it('uses the MCP mark and explicit caption only for MCP tools', () => {
    const mcpTool = {
      category: 'tool' as const,
      subtitle: 'MCP tool',
      toolKind: 'McpTool' as const,
    };
    const connectorTool = {
      category: 'tool' as const,
      subtitle: 'Connector tool',
      toolKind: 'ConnectorTool' as const,
    };

    const mcpMarkup = renderToStaticMarkup(agentMapNodeIcon(mcpTool));
    const connectorMarkup = renderToStaticMarkup(agentMapNodeIcon(connectorTool));

    expect(mcpMarkup).toContain('mcp-mark-mask');
    expect(connectorMarkup).not.toContain('mcp-mark-mask');
    expect(getAgentMapNodeTypeLabel(mcpTool)).toBe('MCP tool');
    expect(getAgentMapNodeTypeLabel(connectorTool)).toBe('Connector tool');
  });

  it('places only product glyphs on a light icon tile', () => {
    expect(agentMapNodeIconIsBranded({
      category: 'tool',
      toolKind: 'McpTool',
    })).toBe(true);
    expect(agentMapNodeIconIsBranded({
      category: 'tool',
      toolKind: 'ConnectorTool',
    })).toBe(false);
  });

  it('keeps the category label for nodes without a tool subtype', () => {
    expect(getAgentMapNodeTypeLabel({
      category: 'knowledge',
      subtitle: 'SharePoint search source',
    })).toBe('Knowledge');
  });
});
