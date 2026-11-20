import { describe, expect, it } from 'vitest';
import type {
  AgentMapFilters,
  AgentMapGraph,
  AgentMapNode,
  AgentMapNodeCategory,
  AgentMapProvenance,
} from '../contracts/AgentMap';
import { filterAgentMapGraph } from '../services/agent-map/filterAgentMapGraph';

const categories: ReadonlySet<AgentMapNodeCategory> = new Set([
  'agent', 'tool', 'skill', 'unknown',
]);
const provenances: ReadonlySet<AgentMapProvenance> = new Set([
  'structural', 'textual-exact', 'textual-strong',
]);

function node(
  id: string,
  category: AgentMapNodeCategory,
  label: string,
  parentId?: string,
): AgentMapNode {
  return {
    id,
    category,
    label,
    parentId,
    depth: parentId ? 1 : 0,
    details: {},
    warnings: [],
    resolution: category === 'unknown' ? 'unresolved' : 'resolved',
    searchText: `${label} ${category}`.toLocaleLowerCase(),
  };
}

const graph: AgentMapGraph = {
  nodes: [
    node('agent', 'agent', 'Travel agent'),
    node('weather', 'tool', 'Weather lookup', 'agent'),
    node('travel', 'skill', 'Travel helper', 'agent'),
    node('billing', 'skill', 'Billing helper', 'agent'),
    node('missing', 'unknown', 'Missing flow', 'weather'),
  ],
  edges: [
    {
      id: 'agent-weather',
      source: 'agent',
      target: 'weather',
      relationship: 'contains',
      provenance: 'structural',
      evidence: 'Agent contains tool.',
      confidence: 1,
      resolution: 'resolved',
      directed: true,
      searchText: 'agent contains weather structural',
    },
    {
      id: 'agent-travel',
      source: 'agent',
      target: 'travel',
      relationship: 'contains',
      provenance: 'structural',
      evidence: 'Agent contains skill.',
      confidence: 1,
      resolution: 'resolved',
      directed: true,
      searchText: 'agent contains travel structural',
    },
    {
      id: 'agent-billing',
      source: 'agent',
      target: 'billing',
      relationship: 'contains',
      provenance: 'structural',
      evidence: 'Agent contains skill.',
      confidence: 1,
      resolution: 'resolved',
      directed: true,
      searchText: 'agent contains billing structural',
    },
    {
      id: 'travel-weather',
      source: 'travel',
      target: 'weather',
      relationship: 'mentions',
      provenance: 'textual-exact',
      evidence: 'Skill mentions Weather lookup.',
      confidence: 0.75,
      resolution: 'resolved',
      directed: true,
      searchText: 'travel mentions weather textual exact',
    },
    {
      id: 'weather-missing',
      source: 'weather',
      target: 'missing',
      relationship: 'invokes',
      provenance: 'textual-strong',
      evidence: 'Flow reference is missing.',
      confidence: 1,
      resolution: 'unresolved',
      directed: true,
      searchText: 'weather references missing textual strong unresolved',
    },
  ],
  diagnostics: [],
  summary: {
    nodeCount: 5,
    componentCount: 4,
    edgeCount: 3,
    unresolvedCount: 1,
    skillReferenceCount: 2,
    linkedSkillCount: 1,
    unlinkedSkillCount: 1,
  },
};

const filters = (overrides: Partial<AgentMapFilters> = {}): AgentMapFilters => ({
  query: '',
  categories,
  provenances,
  includeUnresolved: true,
  ...overrides,
});

describe('agent map filtering', () => {
  it('returns search matches with incident relationships and structural ancestors', () => {
    const result = filterAgentMapGraph(graph, filters({ query: 'Weather lookup' }));

    expect(result.matchedNodeIds.has('weather')).toBe(true);
    expect(result.nodes.map(item => item.id)).toEqual(expect.arrayContaining([
      'agent', 'weather', 'travel', 'billing', 'missing',
    ]));
    expect(result.edges).toHaveLength(5);
    expect(result.matchedNodeIds.has('billing')).toBe(false);
    expect(result.matchedEdgeIds.has('agent-billing')).toBe(false);
  });

  it('keeps filtered search nonmatches as faint context while excluding disabled categories', () => {
    const result = filterAgentMapGraph(graph, filters({
      query: 'Weather lookup',
      categories: new Set<AgentMapNodeCategory>(['agent', 'tool', 'skill']),
    }));

    expect(result.nodes.some(item => item.id === 'billing')).toBe(true);
    expect(result.matchedNodeIds.has('billing')).toBe(false);
    expect(result.nodes.some(item => item.id === 'weather')).toBe(true);
    expect(result.nodes.some(item => item.id === 'missing')).toBe(false);
  });

  it('removes unresolved nodes and their edges when unresolved is disabled', () => {
    const result = filterAgentMapGraph(graph, filters({ includeUnresolved: false }));

    expect(result.nodes.some(item => item.id === 'missing')).toBe(false);
    expect(result.edges.some(item => item.id === 'weather-missing')).toBe(false);
  });

  it('hides descendants when a parent category is disabled (#837)', () => {
    const graphWithConnected: AgentMapGraph = {
      nodes: [
        node('agent', 'agent', 'Root agent'),
        node('direct-skill', 'skill', 'Direct skill', 'agent'),
        node('connected', 'connected-agent', 'Sub agent', 'agent'),
        node('nested-skill', 'skill', 'Nested skill', 'connected'),
        node('nested-tool', 'tool', 'Nested tool', 'connected'),
      ],
      edges: [
        {
          id: 'agent-connected',
          source: 'agent',
          target: 'connected',
          relationship: 'contains',
          provenance: 'structural',
          evidence: '',
          confidence: 1,
          resolution: 'resolved',
          directed: true,
          searchText: 'agent contains connected structural',
        },
        {
          id: 'connected-nested-skill',
          source: 'connected',
          target: 'nested-skill',
          relationship: 'contains',
          provenance: 'structural',
          evidence: '',
          confidence: 1,
          resolution: 'resolved',
          directed: true,
          searchText: 'connected contains nested-skill structural',
        },
      ],
      diagnostics: [],
      summary: { nodeCount: 5, componentCount: 4, edgeCount: 2, unresolvedCount: 0, skillReferenceCount: 0, linkedSkillCount: 0, unlinkedSkillCount: 0 },
    };

    // Disable "connected-agent" but keep "skill" and "tool" enabled.
    const result = filterAgentMapGraph(graphWithConnected, filters({
      categories: new Set<AgentMapNodeCategory>(['agent', 'skill', 'tool']),
    }));

    // Connected agent is hidden (category disabled).
    expect(result.nodes.some(n => n.id === 'connected')).toBe(false);
    // Nested children are hidden even though their categories are enabled.
    expect(result.nodes.some(n => n.id === 'nested-skill')).toBe(false);
    expect(result.nodes.some(n => n.id === 'nested-tool')).toBe(false);
    // Direct skill (parented to root agent) remains visible.
    expect(result.nodes.some(n => n.id === 'direct-skill')).toBe(true);
  });

  it('preserves object identity for visible graph items', () => {
    const result = filterAgentMapGraph(graph, filters());

    expect(result.nodes[0]).toBe(graph.nodes[0]);
    expect(result.edges[0]).toBe(graph.edges[0]);
  });
});
