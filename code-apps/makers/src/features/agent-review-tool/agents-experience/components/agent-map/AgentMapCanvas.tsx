import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Caption1,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnNodeDrag,
  type OnNodesChange,
  type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  AgentMapEdge,
  AgentMapNode,
  FilteredAgentMapGraph,
} from '../../contracts/AgentMap';
import { createRadialAgentMapLayout } from '../../services/agent-map/radialAgentMapLayout';
import {
  AGENT_MAP_PROVENANCE_LABELS,
  agentMapProvenanceColor,
  agentMapProvenanceDash,
  getAgentMapNodeTypeLabel,
} from './agentMapPresentation';
import {
  AgentMapNodeCard,
  type AgentMapFlowNodeData,
  type AgentMapFlowNode,
} from './AgentMapNodeCard';
import {
  AgentMapEdgeLine,
  type AgentMapFlowEdge,
} from './AgentMapEdgeLine';
import {
  reconcileAgentMapFlowNodes,
} from './agentMapNodeState';

const nodeTypes = { agentMapNode: AgentMapNodeCard };
const edgeTypes = { agentMapEdge: AgentMapEdgeLine };
/**
 * Hoisted because React Flow copies these props into its store whenever their
 * identity changes. Declared inline they were new objects on every render, so a
 * drag -- which re-renders on every frame -- wrote to the store on every frame
 * and the whole canvas re-evaluated. That churn was the flicker.
 */
const fitViewOptions = { padding: 0.18, duration: 0 };
const proOptions = { hideAttribution: true };
const nodeDataCache = new WeakMap<
  AgentMapNode,
  { emphasized: AgentMapFlowNodeData; dimmed: AgentMapFlowNodeData }
>();
const edgeDataCache = new WeakMap<
  AgentMapEdge,
  { emphasized: AgentMapFlowEdge['data']; dimmed: AgentMapFlowEdge['data'] }
>();

function getNodeData(node: AgentMapNode, dimmed: boolean): AgentMapFlowNodeData {
  const cached = nodeDataCache.get(node);
  if (cached) return dimmed ? cached.dimmed : cached.emphasized;
  const data = {
    emphasized: { mapNode: node, dimmed: false },
    dimmed: { mapNode: node, dimmed: true },
  };
  nodeDataCache.set(node, data);
  return dimmed ? data.dimmed : data.emphasized;
}

function getEdgeData(edge: AgentMapEdge, dimmed: boolean): AgentMapFlowEdge['data'] {
  let cached = edgeDataCache.get(edge);
  if (!cached) {
    cached = {
      emphasized: { mapEdge: edge, dimmed: false },
      dimmed: { mapEdge: edge, dimmed: true },
    };
    edgeDataCache.set(edge, cached);
  }
  return dimmed ? cached.dimmed : cached.emphasized;
}

const useStyles = makeStyles({
  canvas: {
    width: '100%',
    height: '640px',
    minWidth: 0,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    overflow: 'hidden',
    position: 'relative',
    /*
     * ReactFlow's own site look: a plain surface with a soft rainbow bloom
     * behind the nodes rather than a flat grey panel.
     *
     * Driven from theme tokens rather than a hard-coded white, so the canvas
     * stays aligned with the application theme.
     */
    backgroundColor: tokens.colorNeutralBackground1,
    backgroundImage: `
      radial-gradient(60% 55% at 34% 42%, color-mix(in srgb, ${tokens.colorPaletteBerryBorderActive} 16%, transparent) 0%, transparent 70%),
      radial-gradient(52% 50% at 62% 38%, color-mix(in srgb, ${tokens.colorBrandBackground} 14%, transparent) 0%, transparent 72%),
      radial-gradient(58% 55% at 50% 72%, color-mix(in srgb, ${tokens.colorPaletteTealBorderActive} 12%, transparent) 0%, transparent 72%)
    `,
    backgroundRepeat: 'no-repeat',
    '@media (max-width: 1199px)': { height: '560px' },
    '@media (max-width: 767px)': { height: '480px' },
    // The bloom is decoration. The boolean form matches `more`, `less` AND
    // `custom` — MQ5 §12.3 names turning off decorative gradients as its exact
    // use case, and `prefers-contrast: more` alone misses `custom`, which is
    // what most Windows contrast themes report.
    '@media (prefers-contrast)': { backgroundImage: 'none' },
    '@media (forced-colors: active)': {
      backgroundImage: 'none',
      backgroundColor: 'Canvas',
      ...shorthands.borderColor('CanvasText'),
      // The UA sheet applies `svg|svg { forced-color-adjust: preserve-parent-color }`,
      // so React Flow's SVG keeps its author colours unless restyled explicitly.
      // Without this the edges stay light-theme coloured over a forced black canvas.
      '& .react-flow__edge-path': { stroke: 'CanvasText' },
      '& .react-flow__arrowclosed, & .react-flow__arrowhead': { fill: 'CanvasText' },
      '& .react-flow__background circle': { fill: 'GrayText' },
    },
    '& .react-flow__node:focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
    '& .react-flow__edge:focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
    },
    // Smaller than ReactFlow's default squares so they sit alongside the small
    // toolbar, but held at 28px — above the 24px WCAG 2.5.8 AA floor rather
    // than exactly on it.
    '& .react-flow__controls-button': {
      width: '28px',
      height: '28px',
      ...shorthands.borderRadius(tokens.borderRadiusSmall),
      backgroundColor: tokens.colorNeutralBackground1,
      color: tokens.colorNeutralForeground1,
      borderBottomColor: tokens.colorNeutralStroke2,
      ':hover': {
        backgroundColor: tokens.colorNeutralBackground1Hover,
        color: tokens.colorNeutralForeground1,
      },
      ':focus-visible': {
        outline: `2px solid ${tokens.colorStrokeFocus2}`,
        outlineOffset: '2px',
        position: 'relative',
        zIndex: 1,
      },
      '& svg': { maxWidth: '12px', maxHeight: '12px' },
    },
  },
  /** Fills the full-screen dialog instead of the fixed inline height. */
  canvasExpanded: {
    height: '100%',
    '@media (max-width: 1199px)': { height: '100%' },
    '@media (max-width: 767px)': { height: '100%' },
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXXS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    // `max-content` with no maxWidth: a percentage cap resolves against the
    // ReactFlow panel, which is itself shrink-to-fit, so it collapsed to a
    // narrow column and wrapped every label onto two lines.
    width: 'max-content',
    whiteSpace: 'nowrap',
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    boxShadow: tokens.shadow4,
  },
  legendTitle: {
    display: 'block',
    marginBottom: tokens.spacingVerticalXXS,
    color: tokens.colorNeutralForeground2,
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground2,
  },
  legendLine: {
    width: '28px',
    flexShrink: 0,
    borderTopWidth: '2px',
    borderTopStyle: 'solid',
  },
});

export interface AgentMapCanvasProps {
  graph: FilteredAgentMapGraph;
  /** True inside the full-screen dialog, where the canvas fills the surface. */
  expanded?: boolean;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  /** Tab-owned cache so temporary positions survive conditional canvas mounts. */
  movedPositions: ReadonlyMap<string, XYPosition>;
  onNodePositionChange: (nodeId: string, position: XYPosition) => void;
  onSelectNode: (
    id: string,
    activator: HTMLElement | SVGElement | null,
    moveFocus: boolean,
  ) => void;
  onSelectEdge: (
    id: string,
    activator: HTMLElement | SVGElement | null,
    moveFocus: boolean,
  ) => void;
  onClearSelection: () => void;
}

interface CanvasInnerProps extends AgentMapCanvasProps {
  className: string;
  legendClassName: string;
  legendTitleClassName: string;
  legendRowClassName: string;
  legendLineClassName: string;
}

function AgentMapCanvasInner({
  graph,
  selectedNodeId,
  selectedEdgeId,
  movedPositions,
  onNodePositionChange,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  className,
  legendClassName,
  legendTitleClassName,
  legendRowClassName,
  legendLineClassName,
}: CanvasInnerProps) {
  const instance = useReactFlow<AgentMapFlowNode, AgentMapFlowEdge>();
  const layout = useMemo(() => createRadialAgentMapLayout(graph.nodes), [graph.nodes]);
  const positions = useMemo(
    () => new Map(layout.nodes.map(node => [node.id, node])),
    [layout.nodes],
  );
  const nodeIds = useMemo(() => new Set(graph.nodes.map(node => node.id)), [graph.nodes]);
  const nodeLabels = useMemo(
    () => new Map(graph.nodes.map(node => [node.id, node.label])),
    [graph.nodes],
  );
  const edgeIds = useMemo(() => new Set(graph.edges.map(edge => edge.id)), [graph.edges]);

  /**
   * Only the evidence kinds this graph actually contains.
   *
   * The legend used to list all four unconditionally, but two of them can never
   * co-occur with the other: once the reviewing agent returns edges for a skill,
   * `addAgentMapRelationships` uses them and skips text matching entirely, so
   * `textual-exact` and `textual-strong` appear only for skills the AI did not
   * evaluate. Listing absent kinds invites the reader to hunt for line styles
   * that are not on the diagram.
   */
  const legendProvenances = useMemo(() => {
    const present = new Set(graph.edges.map(edge => edge.provenance));
    return (['structural', 'model-inferred', 'textual-exact', 'textual-strong'] as const)
      .filter(provenance => present.has(provenance));
  }, [graph.edges]);
  /**
   * Everything about a node except where it sits and whether it is selected.
   *
   * Deliberately free of `selectedNodeId`: this feeds the state below, and
   * anything in here rebuilding would throw away dragged positions. Selecting a
   * node after moving it must not snap it back, so selection is overlaid later.
   */
  const nodeVisuals = useMemo(() => {
    const visuals = new Map<string, {
      data: ReturnType<typeof getNodeData>;
      style: { width: number; height: number; filter: string | undefined };
      ariaLabel: string;
    }>();

    for (const node of graph.nodes) {
      const position = positions.get(node.id);
      const dimmed = !graph.matchedNodeIds.has(node.id);
      visuals.set(node.id, {
        data: getNodeData(node, dimmed),
        style: {
          width: position?.width ?? 220,
          height: position?.height ?? 92,
          filter: dimmed ? 'grayscale(1)' : undefined,
        },
        ariaLabel: `${getAgentMapNodeTypeLabel(node)}: ${node.label}. ${node.resolution}.${dimmed ? ' Shown faintly for search context.' : ''} Press Enter for details${node.category === 'connected-agent' && node.depth === 1 ? ' and to load its botcomponents' : ''}.`,
      });
    }
    return visuals;
  }, [graph.matchedNodeIds, graph.nodes, positions]);

  /** The computed layout, before the maker moves anything. */
  const baseNodes = useMemo<AgentMapFlowNode[]>(
    () => graph.nodes.map(node => {
      const visual = nodeVisuals.get(node.id);
      const position = positions.get(node.id);
      return {
        id: node.id,
        type: 'agentMapNode',
        data: visual!.data,
        position: { x: position?.x ?? 0, y: position?.y ?? 0 },
        style: visual!.style,
        draggable: true,
        connectable: false,
        selectable: true,
        ariaRole: 'button',
        ariaLabel: visual!.ariaLabel,
      };
    }),
    [graph.nodes, nodeVisuals, positions],
  );

  /**
   * Live node state, owned here rather than recomputed from props each render.
   *
   * React Flow is controlled: handing it a freshly built array on every frame
   * makes it re-initialise node internals, so each card loses its measured size
   * for a frame and visibly re-lays-out -- the flicker. Owning the array and
   * feeding React Flow's own changes through `applyNodeChanges` keeps those
   * measurements, which is also what the floating edges read to find the border.
   */
  const [flowNodes, setFlowNodes] = useState<AgentMapFlowNode[]>(() =>
    reconcileAgentMapFlowNodes(baseNodes, [], movedPositions));
  const [lastBaseNodes, setLastBaseNodes] = useState(baseNodes);
  if (baseNodes !== lastBaseNodes) {
    setLastBaseNodes(baseNodes);
    setFlowNodes(currentNodes =>
      reconcileAgentMapFlowNodes(baseNodes, currentNodes, movedPositions));
  }

  // Selection is overlaid rather than baked in, so selecting a node never
  // rebuilds the array and never discards a dragged position.
  const nodes = useMemo<AgentMapFlowNode[]>(
    () => flowNodes.map(node => {
      const selected = node.id === selectedNodeId;
      if (node.selected === selected) return node;
      return {
        ...node,
        selected,
        // The selected node is never faded, even when a search excluded it.
        style: selected ? { ...node.style, filter: undefined } : node.style,
      };
    }),
    [flowNodes, selectedNodeId],
  );
  const edges = useMemo<AgentMapFlowEdge[]>(
    () => graph.edges.map(edge => {
      const color = edge.resolution === 'unresolved'
        ? tokens.colorPaletteRedBorderActive
        : agentMapProvenanceColor(edge.provenance);
      const dimmed = !graph.matchedEdgeIds.has(edge.id) && edge.id !== selectedEdgeId;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'agentMapEdge',
        data: getEdgeData(edge, dimmed),
        selected: edge.id === selectedEdgeId,
        selectable: true,
        focusable: true,
        ariaRole: 'button',
        ariaLabel: `Relationship from ${nodeLabels.get(edge.source) ?? edge.source} to ${nodeLabels.get(edge.target) ?? edge.target}: ${edge.relationship}. ${AGENT_MAP_PROVENANCE_LABELS[edge.provenance]}. ${edge.resolution}.${dimmed ? ' Shown faintly for search context.' : ''} Press Enter or Space for details.`,
        markerEnd: edge.directed
          ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
          : undefined,
      };
    }),
    [graph.edges, graph.matchedEdgeIds, nodeLabels, selectedEdgeId],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void instance.fitView(fitViewOptions);
    });
    return () => cancelAnimationFrame(frame);
    // Count-only dependencies avoid camera jumps when search changes emphasis in place.
  }, [instance, nodes.length, edges.length]);

  /**
   * Feed React Flow's own changes back into the node state.
   *
   * All change types are applied, not just `position`. `dimensions` changes are
   * how React Flow records a node's measured size, and dropping them is what
   * forced a re-measure on every frame. `applyNodeChanges` is React Flow's own
   * reducer, so this stays correct as new change kinds appear.
   */
  const handleNodesChange = useCallback<OnNodesChange<AgentMapFlowNode>>(
    changes => {
      setFlowNodes(current => applyNodeChanges(changes, current));
    },
    [],
  );
  const handleNodeDragStop = useCallback<OnNodeDrag<AgentMapFlowNode>>(
    (_event, node) => {
      onNodePositionChange(node.id, node.position);
    },
    [onNodePositionChange],
  );

  const handleNodeClick = useCallback<NodeMouseHandler<AgentMapFlowNode>>(
    (event, node) => {
      const target = event.target instanceof Element
        ? event.target.closest('.react-flow__node')
        : null;
      const activeElement = document.activeElement;
      const activator =
        target instanceof HTMLElement || target instanceof SVGElement
          ? target
          : activeElement instanceof HTMLElement || activeElement instanceof SVGElement
            ? activeElement
            : null;
      onSelectNode(node.id, activator, event.detail === 0);
    },
    [onSelectNode],
  );
  const handleEdgeClick = useCallback<EdgeMouseHandler<AgentMapFlowEdge>>(
    (event, edge) => {
      const target = event.target instanceof Element
        ? event.target.closest('.react-flow__edge')
        : null;
      const activeElement = document.activeElement;
      const activator =
        target instanceof HTMLElement || target instanceof SVGElement
          ? target
          : activeElement instanceof HTMLElement || activeElement instanceof SVGElement
            ? activeElement
            : null;
      onSelectEdge(edge.id, activator, event.detail === 0);
    },
    [onSelectEdge],
  );
  const handleKeyboardActivation = useCallback((
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!(event.target instanceof Element)) return;

    const activator = event.target.closest('.react-flow__node, .react-flow__edge');
    if (!(activator instanceof HTMLElement || activator instanceof SVGElement)) return;
    const id = activator.dataset.id;
    if (!id) return;

    if (nodeIds.has(id)) {
      event.preventDefault();
      event.stopPropagation();
      onSelectNode(id, activator, true);
    } else if (edgeIds.has(id)) {
      event.preventDefault();
      event.stopPropagation();
      onSelectEdge(id, activator, true);
    }
  }, [edgeIds, nodeIds, onSelectEdge, onSelectNode]);

  return (
    <div className={className} onKeyDownCapture={handleKeyboardActivation}>
      <ReactFlow<AgentMapFlowNode, AgentMapFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onNodesChange={handleNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onEdgeClick={handleEdgeClick}
        onPaneClick={onClearSelection}
        // Layout is computed, but letting a maker nudge an overlapping node to
        // read a label is worth more than a guaranteed-pristine arrangement.
        // Positions are view-only and reset on reload or Reset — nothing is persisted.
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        onlyRenderVisibleElements
        minZoom={0.15}
        maxZoom={2}
        fitView
        fitViewOptions={fitViewOptions}
        proOptions={proOptions}
        aria-label="Agent architecture map. Use the Map and List tabs to inspect components and relationships."
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          // Transparent background so the gradient bloom shows through, but the
          // dot colour is ReactFlow's own default rather than a theme token.
          bgColor="transparent"
        />
        {/*
          No minimap. It rendered as an empty white rectangle over the canvas
          and earns its keep only on graphs too large to see at once — an agent's
          component count is not that. Removing it also frees the top-right
          corner, which is where the eye starts.
        */}
        <Controls
          position="bottom-right"
          showInteractive={false}
          fitViewOptions={fitViewOptions}
        />
        {/*
          Top-left rather than bottom-left. The radial layout grows downward as
          components are added, so the bottom-left corner is exactly where nodes
          land — the legend was sitting on top of them. The top-left corner is
          freed by the minimap's removal and stays clear at every graph size.
        */}
        <Panel position="top-left">
          <div
            className={legendClassName}
            role="group"
            aria-label="Relationship evidence legend"
          >
            <Caption1 className={legendTitleClassName}>Relationship evidence</Caption1>
            {legendProvenances.map(provenance => (
              <div className={legendRowClassName} key={provenance}>
                <span
                  className={legendLineClassName}
                  style={{
                    borderTopColor: agentMapProvenanceColor(provenance),
                    borderTopStyle: agentMapProvenanceDash(provenance) ? 'dashed' : 'solid',
                  }}
                  aria-hidden="true"
                />
                <Caption1>{AGENT_MAP_PROVENANCE_LABELS[provenance]}</Caption1>
              </div>
            ))}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

interface AgentMapCanvasBoundaryProps {
  children: ReactNode;
  onError: (error: Error) => void;
}

interface AgentMapCanvasBoundaryState {
  failed: boolean;
}

/** Contain React Flow rendering failures without hiding the complete List equivalent. */
export class AgentMapCanvasBoundary extends Component<
  AgentMapCanvasBoundaryProps,
  AgentMapCanvasBoundaryState
> {
  state: AgentMapCanvasBoundaryState = { failed: false };

  static getDerivedStateFromError(): AgentMapCanvasBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Render the deterministic graph through React Flow with map controls and minimap. */
export function AgentMapCanvas(props: AgentMapCanvasProps) {
  const styles = useStyles();
  return (
    <ReactFlowProvider>
      <AgentMapCanvasInner
        {...props}
        className={mergeClasses(styles.canvas, props.expanded && styles.canvasExpanded)}
        legendClassName={styles.legend}
        legendTitleClassName={styles.legendTitle}
        legendRowClassName={styles.legendRow}
        legendLineClassName={styles.legendLine}
      />
    </ReactFlowProvider>
  );
}
