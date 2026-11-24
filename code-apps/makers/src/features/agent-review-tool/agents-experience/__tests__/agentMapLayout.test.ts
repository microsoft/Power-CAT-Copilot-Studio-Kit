import { describe, expect, it } from 'vitest';
import type {
  AgentMapEdge,
  AgentMapFilters,
  AgentMapNode,
  AgentMapNodeCategory,
  AgentMapProvenance,
} from '../contracts/AgentMap';
import { filterAgentMapGraph } from '../services/agent-map/filterAgentMapGraph';
import { createRadialAgentMapLayout } from '../services/agent-map/radialAgentMapLayout';

const categoryOrder: AgentMapNodeCategory[] = [
  'tool',
  'skill',
  'knowledge',
  'connected-agent',
  'trigger',
  'evaluation-set',
  'test-case',
  'unknown',
];

function syntheticNode(index: number): AgentMapNode {
  const category = categoryOrder[index % categoryOrder.length];
  return {
    id: `node-${index}`,
    category,
    label: `Component ${index}`,
    parentId: index === 0 ? undefined : 'node-0',
    depth: index === 0 ? 0 : 1,
    details: {},
    warnings: [],
    resolution: 'resolved',
    searchText: `component ${index} ${category}`,
  };
}

function syntheticEdge(index: number, nodeCount: number): AgentMapEdge {
  const provenance: AgentMapProvenance =
    index % 2 === 0 ? 'textual-exact' : 'structural';
  return {
    id: `edge-${index}`,
    source: `node-${index % nodeCount}`,
    target: `node-${(index * 7 + 1) % nodeCount}`,
    relationship: provenance === 'textual-exact' ? 'possibly references tool' : 'has component',
    provenance,
    evidence: `Synthetic edge ${index}`,
    confidence: 1,
    resolution: 'resolved',
    directed: true,
    searchText: `synthetic edge ${index} ${provenance}`,
  };
}

describe('agent map radial layout', () => {
  it('keeps the agent at the center and produces deterministic positions', () => {
    const nodes = [
      { ...syntheticNode(0), category: 'agent' as const, label: 'Center agent' },
      ...Array.from({ length: 40 }, (_, index) => syntheticNode(index + 1)),
    ];
    const first = createRadialAgentMapLayout(nodes);
    const second = createRadialAgentMapLayout(nodes);
    const center = first.nodes.find(node => node.id === 'node-0');

    expect(center && center.x + center.width / 2).toBe(0);
    expect(center && center.y + center.height / 2).toBe(0);
    expect(second).toEqual(first);
    expect(new Set(first.nodes.map(node => `${node.x}:${node.y}`)).size).toBe(first.nodes.length);
  });

  it('filters and lays out a 500-node, 1,000-edge graph within the interaction target', () => {
    const nodeCount = 500;
    const nodes = [
      { ...syntheticNode(0), category: 'agent' as const, label: 'Center agent' },
      ...Array.from({ length: nodeCount - 1 }, (_, index) => syntheticNode(index + 1)),
    ];
    const edges = Array.from({ length: 1_000 }, (_, index) => syntheticEdge(index, nodeCount));
    const filters: AgentMapFilters = {
      query: '',
      categories: new Set(nodes.map(node => node.category)),
      provenances: new Set(edges.map(edge => edge.provenance)),
      includeUnresolved: true,
    };

    const started = performance.now();
    const filtered = filterAgentMapGraph({
      nodes,
      edges,
      diagnostics: [],
      summary: {
        nodeCount,
        componentCount: nodeCount - 1,
        edgeCount: edges.length,
        unresolvedCount: 0,
        skillReferenceCount: 500,
        linkedSkillCount: 250,
        unlinkedSkillCount: 250,
      },
    }, filters);
    const layout = createRadialAgentMapLayout(filtered.nodes);
    const elapsed = performance.now() - started;

    expect(filtered.nodes).toHaveLength(nodeCount);
    expect(filtered.edges).toHaveLength(1_000);
    expect(layout.nodes).toHaveLength(nodeCount);
    expect(elapsed).toBeLessThan(2_000);
  });
});
