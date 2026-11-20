import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * React Flow copies a fixed set of props into its Zustand store, and decides
 * whether to copy by *reference*:
 *
 *   if (fieldValue === previousFieldValue) continue;
 *   ...
 *   else if (fieldName === 'fitViewOptions')
 *     store.setState({ fitViewOptions: fieldValue });
 *
 * An inline object literal is a new reference on every render, so it wrote to
 * the store on every render. A drag re-renders on every frame, so every frame
 * notified every node, edge and viewport subscriber. Combined with
 * `onlyRenderVisibleElements`, the visible set was recomputed continuously and
 * the canvas visibly flickered as if it were reloading.
 *
 * The cost is invisible in review -- `fitViewOptions={{ padding: 0.18 }}` looks
 * completely ordinary -- so this is guarded here rather than left to be
 * rediscovered. There is no DOM test harness in this package, so the invariant
 * is asserted against the source.
 */
const TRACKED_PROPS = [
  'nodes',
  'edges',
  'defaultNodes',
  'defaultEdges',
  'nodesDraggable',
  'nodesConnectable',
  'nodesFocusable',
  'edgesFocusable',
  'minZoom',
  'maxZoom',
  'nodeExtent',
  'onNodesChange',
  'onEdgesChange',
  'elementsSelectable',
  'connectionMode',
  'snapGrid',
  'snapToGrid',
  'translateExtent',
  'connectOnClick',
  'defaultEdgeOptions',
  'fitView',
  'fitViewOptions',
  'onNodesDelete',
  'onEdgesDelete',
  'onDelete',
  'onNodeDrag',
  'onNodeDragStart',
  'onNodeDragStop',
  'onSelectionDrag',
  'onSelectionDragStart',
  'onSelectionDragStop',
  'onMoveStart',
  'onMove',
  'onMoveEnd',
  'nodeOrigin',
  'onError',
  'isValidConnection',
  'selectNodesOnDrag',
  'ariaLabelConfig',
];

/** A value React Flow can compare stably: a bare identifier or a primitive. */
const STABLE_VALUE = /^(?:[A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?|true|false|null)$/;

const source = readFileSync(
  fileURLToPath(new URL('../components/agent-map/AgentMapCanvas.tsx', import.meta.url)),
  'utf8',
);
const tabSource = readFileSync(
  fileURLToPath(new URL('../components/agent-map/AgentMapTab.tsx', import.meta.url)),
  'utf8',
);

describe('AgentMapCanvas React Flow props', () => {
  it.each(TRACKED_PROPS)('passes a referentially stable value to %s', prop => {
    // Boolean shorthand (`fitView`) and absent props are stable by definition;
    // only an explicit `prop={...}` can introduce a new reference per render.
    const assignment = new RegExp(`^\\s*${prop}=\\{([^\\n]*)\\}\\s*$`, 'm').exec(source);
    if (!assignment) return;

    const value = assignment[1].trim();
    expect(
      STABLE_VALUE.test(value),
      `${prop}={${value}} is rebuilt on every render. React Flow compares this prop by `
        + 'reference and writes it into its store whenever the reference changes, so an inline '
        + 'literal notifies every node and edge subscriber on every frame of a drag. Hoist it to '
        + 'a module constant, or wrap it in useMemo/useCallback.',
    ).toBe(true);
  });

  it('keeps nodeTypes and edgeTypes at module scope', () => {
    // Not store-tracked, but a new map remounts every node component, which is
    // the other way this canvas can be made to flicker.
    expect(source).toMatch(/^const nodeTypes = /m);
    expect(source).toMatch(/^const edgeTypes = /m);
  });

  it('keeps moved positions above the conditionally mounted canvas', () => {
    expect(tabSource).toMatch(
      /const \[movedNodePositions, setMovedNodePositions\] = useState/,
    );
    expect(tabSource).toContain('movedPositions={movedNodePositions}');
    expect(source).not.toMatch(/const movedPositions = useRef/);
    expect(source).toMatch(
      /useState<AgentMapFlowNode\[\]>\(\(\) =>\s*reconcileAgentMapFlowNodes\(baseNodes, \[\], movedPositions\)\)/,
    );
  });

  it('lets the expanded view panel claim the remaining dialog height', () => {
    expect(tabSource).toMatch(
      /className=\{isExpanded \? styles\.viewPanelExpanded : styles\.viewPanel\}/,
    );
    expect(tabSource).toMatch(
      /viewPanelExpanded: \{[\s\S]*?flexGrow: 1,[\s\S]*?display: 'flex',[\s\S]*?flexDirection: 'column',/,
    );
  });

  it('uses Fluent surface and foreground tokens for React Flow controls', () => {
    expect(source).toMatch(
      /'& \.react-flow__controls-button': \{[\s\S]*?backgroundColor: tokens\.colorNeutralBackground1,[\s\S]*?color: tokens\.colorNeutralForeground1,/,
    );
    expect(source).toMatch(
      /':hover': \{[\s\S]*?backgroundColor: tokens\.colorNeutralBackground1Hover,[\s\S]*?color: tokens\.colorNeutralForeground1,/,
    );
    expect(source).toMatch(
      /'& \.react-flow__controls-button': \{[\s\S]*?':focus-visible': \{[\s\S]*?outline: `2px solid \$\{tokens\.colorStrokeFocus2\}`/,
    );
  });

  it('includes the MCP or connector subtype in each tool accessible name', () => {
    expect(source).toContain('getAgentMapNodeTypeLabel');
    expect(source).toMatch(
      /ariaLabel: `\$\{getAgentMapNodeTypeLabel\(node\)\}: \$\{node\.label\}/,
    );
  });

  it('shows the Microsoft Copilot map without introductory copy', () => {
    // The map is self-explanatory, so the Microsoft Copilot variant passes no description or note and
    // the intro block renders nothing. The prebuilt variant still accepts both.
    expect(tabSource).not.toContain(
      'See how this agent connects to its tools, skills, knowledge, triggers, and connected agents.',
    );
    expect(tabSource).not.toContain(
      'A dashed link shows a possible reference in skill text. It does not prove that the agent',
    );
    expect(tabSource).toContain('{description || note ? (');
    expect(tabSource).not.toContain('Reviewed Microsoft Copilot botcomponents');
    expect(tabSource).not.toContain('aria-labelledby="agent-map-heading"');
  });
});
