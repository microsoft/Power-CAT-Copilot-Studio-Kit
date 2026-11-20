import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FluentProvider,
  webLightTheme,
} from '@fluentui/react-components';
import { describe, expect, it, vi } from 'vitest';
import { AgentMapList } from '../components/agent-map/AgentMapList';
import { AgentMapInspector } from '../components/agent-map/AgentMapInspector';
import { AgentMapToolbar } from '../components/agent-map/AgentMapToolbar';
import { getVisibleAgentMapCategoryGroups } from '../components/agent-map/agentMapToolbarGroups';
import { FindingsGrouped } from '../components/findings/FindingsGrouped';
import { buildFindingsGroupedView } from '../components/findings/findingsGroupedModel';
import { createDefaultFilters } from '../services/agent-map/filterAgentMapGraph';
import type { FindingView } from '../components/viewTypes';
import type {
  AgentMapFilters,
  AgentMapGraph,
  AgentMapNodeCategory,
  AgentMapProvenance,
  FilteredAgentMapGraph,
} from '../contracts/AgentMap';

const categories: ReadonlySet<AgentMapNodeCategory> = new Set([
  'agent',
  'tool',
]);
const provenances: ReadonlySet<AgentMapProvenance> = new Set([
  'structural',
  'textual-exact',
]);
const filters: AgentMapFilters = {
  query: '',
  categories,
  provenances,
  includeUnresolved: true,
};

const inspectorGraph: AgentMapGraph = {
  nodes: [{
    id: 'agent',
    category: 'agent',
    label: 'Travel agent',
    depth: 0,
    details: {},
    warnings: [],
    resolution: 'resolved',
    searchText: 'travel agent',
  }],
  edges: [],
  diagnostics: [],
  summary: {
    nodeCount: 1,
    componentCount: 0,
    edgeCount: 0,
    unresolvedCount: 0,
    skillReferenceCount: 0,
    linkedSkillCount: 0,
    unlinkedSkillCount: 0,
  },
};

function createFinding(overrides: Partial<FindingView> = {}): FindingView {
  return {
    id: 'TOL-02',
    sev: 'warning',
    family: 'Tools',
    provenance: 'deterministic',
    ai: false,
    title: 'Tool has a weak description',
    sub: '',
    fact: '',
    why: '',
    fix: '',
    dimension: 'quality',
    refTitle: '',
    refUrl: '',
    source: 'Microsoft Learn',
    how: '',
    fixSteps: [],
    references: [],
    ...overrides,
  };
}

function renderWithFluent(content: ReactNode): string {
  return renderToStaticMarkup(
    createElement(FluentProvider, { theme: webLightTheme }, content),
  );
}

function createLargeGraph(): FilteredAgentMapGraph {
  const nodes = Array.from({ length: 500 }, (_, index) => ({
    id: `node-${index}`,
    category: index === 0 ? 'agent' as const : 'tool' as const,
    label: `Component ${index}`,
    depth: index === 0 ? 0 : 1,
    details: {},
    warnings: [],
    resolution: 'resolved' as const,
    searchText: `component ${index}`,
  }));
  const edges = Array.from({ length: 1_000 }, (_, index) => ({
    id: `edge-${index}`,
    source: `node-${index % nodes.length}`,
    target: `node-${(index + 1) % nodes.length}`,
    relationship: 'contains',
    provenance: index % 2 === 0 ? 'structural' as const : 'textual-exact' as const,
    evidence: `Relationship ${index}`,
    confidence: 1,
    resolution: 'resolved' as const,
    directed: true,
    searchText: `relationship ${index}`,
  }));
  return {
    nodes,
    edges,
    matchedNodeIds: new Set(nodes.map(node => node.id)),
    matchedEdgeIds: new Set(edges.map(edge => edge.id)),
  };
}

describe('agent map components', () => {
  it('hides individual test cases by default while keeping evaluation summaries', () => {
    const defaultFilters = createDefaultFilters();

    expect(defaultFilters.categories.has('evaluation-set')).toBe(true);
    expect(defaultFilters.categories.has('test-case')).toBe(false);
  });

  it('can initialize every category retained by a Standard graph', () => {
    const standardCategories = new Set<AgentMapNodeCategory>([
      'agent',
      'topic',
      'test-case',
    ]);
    const defaultFilters = createDefaultFilters(standardCategories);

    expect(defaultFilters.categories).toEqual(standardCategories);
  });

  it('renders search, Filters, Map, List, and Reset controls in visual order', () => {
    const html = renderWithFluent(createElement(AgentMapToolbar, {
      filters,
      view: 'map',
      onFiltersChange: vi.fn(),
      onViewChange: vi.fn(),
      onReset: vi.fn(),
    }));

    const visibleText = html
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const filtersIndex = visibleText.indexOf('Filters');
    const mapIndex = visibleText.indexOf('Map');
    const listIndex = visibleText.indexOf('List');
    const resetIndex = visibleText.indexOf('Reset');

    expect(html).toContain('placeholder="Search components and relationships"');
    expect(filtersIndex).toBeGreaterThanOrEqual(0);
    expect(filtersIndex).toBeLessThan(mapIndex);
    expect(mapIndex).toBeLessThan(listIndex);
    expect(listIndex).toBeLessThan(resetIndex);
    expect(html).not.toContain('aria-label="Filter map"');
    expect(html).toContain('id="agent-map-view-tab-map"');
    expect(html).toContain('id="agent-map-view-tab-list"');
    // aria-controls was removed deliberately: only the active view's panel is
    // rendered, so the inactive tab's IDREF always dangled.
    expect(html).not.toContain('aria-controls="agent-map-view-panel-map"');
    expect(html).not.toContain('aria-controls="agent-map-view-panel-list"');
  });

  it('shows only component filter groups present in the current graph', () => {
    const groups = getVisibleAgentMapCategoryGroups(
      new Set<AgentMapNodeCategory>(['agent', 'topic']),
    );

    expect(groups.map(group => group.label)).toEqual(['Agent', 'Topics']);
  });

  it('progressively renders a large accessible List view within the interaction budget', () => {
    const graph = createLargeGraph();
    const started = performance.now();
    const html = renderWithFluent(createElement(AgentMapList, {
      graph,
      selectedNodeId: 'node-0',
      onSelectNode: vi.fn(),
      onSelectEdge: vi.fn(),
    }));
    const elapsed = performance.now() - started;
    const renderedRows = html.match(/aria-label="Inspect/g) ?? [];

    expect(renderedRows).toHaveLength(450);
    expect(html).toContain('Showing 200 of 500 components.');
    expect(html).toContain('Showing 250 of 1000 relationships.');
    expect(html).toContain('Show more components');
    expect(html).toContain('Show more relationships');
    expect(html).toContain('aria-current="true"');
    expect(html.match(/<ul/g)).toHaveLength(3);
    expect(html.match(/<li/g)).toHaveLength(450);
    expect(elapsed).toBeLessThan(2_000);
  });

  it('uses Fluent Card structure for the details inspector', () => {
    const html = renderWithFluent(createElement(AgentMapInspector, {
      graph: inspectorGraph,
      selection: { type: 'node', id: 'agent' },
      focusVersion: 0,
      onClear: vi.fn(),
      onSelectNode: vi.fn(),
      onSelectEdge: vi.fn(),
    }));

    expect(html).toContain('fui-Card');
    expect(html).toContain('fui-CardHeader');
    expect(html).toContain('fui-CardFooter');
    expect(html).toContain('Clear selection');
    expect(html).toContain('This review recorded no findings for the agent.');
  });

  it('keeps duplicate rule findings individually addressable and labels severity in text', () => {
    const findings = [
      createFinding({
        sev: 'error',
        title: 'First component finding',
        componentIdUnique: 'component-1',
      }),
      createFinding({
        title: 'Second component finding',
        componentIdUnique: 'component-2',
      }),
    ];
    const html = renderWithFluent(createElement(AgentMapInspector, {
      graph: inspectorGraph,
      selection: { type: 'node', id: 'agent' },
      focusVersion: 0,
      findings,
      onOpenFinding: vi.fn(),
      onClear: vi.fn(),
      onSelectNode: vi.fn(),
      onSelectEdge: vi.fn(),
    }));

    expect(html).toContain('data-finding-focus="row-key:0"');
    expect(html).toContain('data-finding-focus="row-key:1"');
    expect(html).toMatch(/>Error<\/span>/);
    expect(html).toMatch(/>Warning<\/span>/);
  });

  it('focuses a duplicate rule finding by its stable row key', () => {
    const findings = [
      createFinding({
        title: 'First component finding',
        componentIdUnique: 'component-1',
      }),
      createFinding({
        title: 'Second component finding',
        componentIdUnique: 'component-2',
      }),
    ];
    const html = renderWithFluent(createElement(FindingsGrouped, {
      grouped: buildFindingsGroupedView(findings),
      focusFindingId: 'row-key:1',
    }));
    const selectedRow = html.match(
      /<div role="button" aria-pressed="true"[^>]*>([\s\S]*?)<\/div>/,
    )?.[1];

    expect(selectedRow).toContain('Second component finding');
  });

  it('labels family severity totals and omits redundant row counts', () => {
    const findings = [
      createFinding({ id: 'WRN-01', sev: 'warning' }),
      createFinding({ id: 'WRN-02', sev: 'warning' }),
      createFinding({ id: 'INF-01', sev: 'info' }),
      createFinding({ id: 'INF-02', sev: 'info' }),
    ];
    const html = renderWithFluent(createElement(FindingsGrouped, {
      grouped: buildFindingsGroupedView(findings),
    }));

    expect(html).toContain('2 warnings \u00b7 2 info');
    expect(html).not.toMatch(/>1<\/span>/);
  });

  it('renders inspector reference actions with compact caption typography', () => {
    const graph: AgentMapGraph = {
      ...inspectorGraph,
      nodes: [
        inspectorGraph.nodes[0],
        {
          ...inspectorGraph.nodes[0],
          id: 'skill',
          category: 'skill',
          label: 'Store layout skill',
          parentId: 'agent',
        },
      ],
      edges: [{
        id: 'agent-skill',
        source: 'agent',
        target: 'skill',
        relationship: 'has component',
        provenance: 'structural',
        evidence: 'Captured in the reviewed snapshot.',
        confidence: 1,
        resolution: 'resolved',
        directed: true,
        searchText: 'agent skill',
      }],
      summary: {
        ...inspectorGraph.summary,
        nodeCount: 2,
        componentCount: 1,
        edgeCount: 1,
      },
    };

    const html = renderWithFluent(createElement(AgentMapInspector, {
      graph,
      selection: { type: 'node', id: 'skill' },
      focusVersion: 0,
      onClear: vi.fn(),
      onSelectNode: vi.fn(),
      onSelectEdge: vi.fn(),
    }));

    expect(html).toMatch(
      /fui-Caption1[^>]*>Travel agent has component Store layout skill<\/span>/,
    );
  });

  it('states that a text-matched relationship is inferred rather than runtime proof', () => {
    const graph: AgentMapGraph = {
      ...inspectorGraph,
      nodes: [
        {
          ...inspectorGraph.nodes[0],
          id: 'skill',
          category: 'skill',
          label: 'Store layout skill',
        },
        {
          ...inspectorGraph.nodes[0],
          id: 'tool',
          category: 'tool',
          label: 'Planogram Archive',
        },
      ],
      edges: [{
        id: 'possible-reference',
        source: 'skill',
        target: 'tool',
        relationship: 'possibly references tool',
        provenance: 'textual-exact',
        evidence: 'SKILL.md line 3: Use Planogram Archive.',
        confidence: 1,
        resolution: 'resolved',
        sourceField: 'SKILL.md:3',
        directed: true,
        searchText: 'possible reference',
      }],
      summary: {
        ...inspectorGraph.summary,
        nodeCount: 2,
        componentCount: 2,
        edgeCount: 1,
        skillReferenceCount: 1,
        linkedSkillCount: 1,
      },
    };
    const html = renderWithFluent(createElement(AgentMapInspector, {
      graph,
      selection: { type: 'edge', id: 'possible-reference' },
      focusVersion: 0,
      onClear: vi.fn(),
      onSelectNode: vi.fn(),
      onSelectEdge: vi.fn(),
    }));

    expect(html).toContain('Inferred from authored text');
    expect(html).toContain('does not prove that the skill runs this component');
    expect(html).toContain('Text-match strength');
  });
});
