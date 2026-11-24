import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it, vi } from 'vitest';
import type { AgentMapGraph } from '../contracts/AgentMap';

const { useConnectedAgentMap } = vi.hoisted(() => ({
  useConnectedAgentMap: vi.fn(() => {
    throw new Error('The prebuilt map must not load connected agents.');
  }),
}));

vi.mock('../hooks/useConnectedAgentMap', () => ({ useConnectedAgentMap }));
vi.mock('../services/agent-map/agentMapIcons', () => ({
  loadAgentMapIcons: vi.fn(async () => ({})),
}));
vi.mock('../components/agent-map/AgentMapCanvas', () => ({
  AgentMapCanvas: () => createElement('div', null, 'Synthetic map canvas'),
  AgentMapCanvasBoundary: ({ children }: { children: ReactNode }) => children,
}));

import { AgentMapTab } from '../components/agent-map/AgentMapTab';

const graph: AgentMapGraph = {
  nodes: [{
    id: 'agent',
    category: 'agent',
    label: 'Order agent',
    depth: 0,
    details: {},
    warnings: [],
    resolution: 'resolved',
    searchText: 'order agent',
  }, {
    id: 'topic',
    category: 'topic',
    label: 'Create order',
    parentId: 'agent',
    depth: 1,
    details: {},
    warnings: [],
    resolution: 'resolved',
    searchText: 'create order topic',
  }],
  edges: [{
    id: 'agent-topic',
    source: 'agent',
    target: 'topic',
    relationship: 'contains',
    provenance: 'structural',
    evidence: 'Saved component.',
    confidence: 1,
    resolution: 'resolved',
    directed: true,
    searchText: 'contains',
  }],
  diagnostics: [],
  summary: {
    nodeCount: 2,
    componentCount: 1,
    edgeCount: 1,
    unresolvedCount: 0,
    skillReferenceCount: 0,
    linkedSkillCount: 0,
    unlinkedSkillCount: 0,
  },
};

describe('AgentMapTab graph sources', () => {
  it('renders a prebuilt Standard graph without invoking live connected-agent hooks', () => {
    const markup = renderToStaticMarkup(createElement(
      FluentProvider,
      { theme: webLightTheme },
      createElement(AgentMapTab, {
        agentId: 'agent-1',
        agentName: 'Order agent',
        graph,
        description: 'Inspect the saved Standard agent structure.',
        note: 'No live data was loaded.',
      }),
    ));

    expect(useConnectedAgentMap).not.toHaveBeenCalled();
    expect(markup).toContain('Inspect the saved Standard agent structure.');
    expect(markup).toContain('No live data was loaded.');
    expect(markup).toContain('Synthetic map canvas');
    expect(markup).not.toContain('possible skill references');
  });
});
