import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Caption1,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getViewportForBounds,
  useReactFlow,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type OnMove,
  type OnNodeDrag,
  type OnNodesChange,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  AgentMapViewEdge,
  AgentMapViewNode,
  FilteredAgentMapGraph,
} from "./agentMapViewModel";
import { createRadialAgentMapLayout } from "./radialAgentMapLayout";
import {
  AGENT_MAP_PROVENANCE_LABELS,
  agentMapProvenanceColor,
  agentMapProvenanceDash,
  getAgentMapNodeTypeLabel,
} from "./agentMapPresentation";
import {
  AgentMapNodeCard,
  type AgentMapFlowNode,
  type AgentMapFlowNodeData,
} from "./AgentMapNodeCard";
import { AgentMapEdgeLine, type AgentMapFlowEdge } from "./AgentMapEdgeLine";
import { reconcileAgentMapFlowNodes } from "./agentMapNodeState";
import type { NodeFindingBadge } from "./nodeFindings";
import type { AgentMapLegendMode } from "./agentMapPresentationPolicy";
import {
  AGENT_MAP_INLINE_CONTROLS_MARGIN_PX,
  AGENT_MAP_INLINE_MIN_ZOOM,
  AGENT_MAP_MIN_ZOOM,
  agentMapInlineFitPadding,
} from "./agentMapInlineFit";

const nodeTypes = { agentMapNode: AgentMapNodeCard };
const edgeTypes = { agentMapEdge: AgentMapEdgeLine };
/**
 * Hoisted because React Flow copies these props into its store whenever their
 * identity changes. Declared inline they were new objects on every render, so a
 * drag -- which re-renders on every frame -- wrote to the store on every frame.
 */
const fitViewOptions = { padding: 0.18, duration: 0 };
const AGENT_MAP_MAX_ZOOM = 2;
const inlineControlsStyle = { margin: `${AGENT_MAP_INLINE_CONTROLS_MARGIN_PX}px` };
const proOptions = { hideAttribution: true };
const nodeDataCache = new WeakMap<
  AgentMapViewNode,
  { emphasized: AgentMapFlowNodeData; dimmed: AgentMapFlowNodeData }
>();
/** Keyed by the badge, which the review map keeps stable while its findings do not change. */
const badgedNodeDataCache = new WeakMap<
  NodeFindingBadge,
  { node: AgentMapViewNode; emphasized: AgentMapFlowNodeData; dimmed: AgentMapFlowNodeData }
>();
const edgeDataCache = new WeakMap<
  AgentMapViewEdge,
  { emphasized: AgentMapFlowEdge["data"]; dimmed: AgentMapFlowEdge["data"] }
>();

function getNodeData(
  node: AgentMapViewNode,
  dimmed: boolean,
  findingBadge?: NodeFindingBadge,
): AgentMapFlowNodeData {
  if (findingBadge) {
    let badged = badgedNodeDataCache.get(findingBadge);
    if (!badged || badged.node !== node) {
      badged = {
        node,
        emphasized: { mapNode: node, dimmed: false, findingBadge },
        dimmed: { mapNode: node, dimmed: true, findingBadge },
      };
      badgedNodeDataCache.set(findingBadge, badged);
    }
    return dimmed ? badged.dimmed : badged.emphasized;
  }
  const cached = nodeDataCache.get(node);
  if (cached) return dimmed ? cached.dimmed : cached.emphasized;
  const data = {
    emphasized: { mapNode: node, dimmed: false },
    dimmed: { mapNode: node, dimmed: true },
  };
  nodeDataCache.set(node, data);
  return dimmed ? data.dimmed : data.emphasized;
}

interface PaneSize {
  width: number;
  height: number;
}

/** The map pane size in the DOM now, not the copy that React Flow keeps. */
function measurePane(container: HTMLElement | null): PaneSize {
  const pane = container?.querySelector<HTMLElement>(".react-flow__renderer") ?? container;
  return pane ? { width: pane.offsetWidth, height: pane.offsetHeight } : { width: 0, height: 0 };
}

function positiveSize(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The bounds of the shown nodes. Before React Flow measures a node, its layout size applies. */
function nodeBounds(nodes: readonly AgentMapFlowNode[]) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of nodes) {
    if (node.hidden) continue;
    const width = positiveSize(node.measured?.width, positiveSize(node.style?.width, 220));
    const height = positiveSize(node.measured?.height, positiveSize(node.style?.height, 92));
    left = Math.min(left, node.position.x);
    top = Math.min(top, node.position.y);
    right = Math.max(right, node.position.x + width);
    bottom = Math.max(bottom, node.position.y + height);
  }
  return Number.isFinite(left) && Number.isFinite(top)
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : undefined;
}

function getEdgeData(edge: AgentMapViewEdge, dimmed: boolean): AgentMapFlowEdge["data"] {
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
    width: "100%",
    height: "360px",
    minWidth: 0,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    overflow: "hidden",
    position: "relative",
    /*
     * ReactFlow's own site look: a plain surface with a soft rainbow bloom
     * behind the nodes rather than a flat grey panel, driven from theme tokens.
     */
    backgroundColor: tokens.colorNeutralBackground1,
    backgroundImage: `
      radial-gradient(60% 55% at 34% 42%, color-mix(in srgb, ${tokens.colorPaletteBerryBorderActive} 16%, transparent) 0%, transparent 70%),
      radial-gradient(52% 50% at 62% 38%, color-mix(in srgb, ${tokens.colorBrandBackground} 14%, transparent) 0%, transparent 72%),
      radial-gradient(58% 55% at 50% 72%, color-mix(in srgb, ${tokens.colorPaletteTealBorderActive} 12%, transparent) 0%, transparent 72%)
    `,
    backgroundRepeat: "no-repeat",
    "@media (max-width: 767px)": { height: "320px" },
    // The bloom is decoration. The boolean form also matches `custom`, which is
    // what most Windows contrast themes report.
    "@media (prefers-contrast)": { backgroundImage: "none" },
    "@media (forced-colors: active)": {
      backgroundImage: "none",
      backgroundColor: "Canvas",
      ...shorthands.borderColor("CanvasText"),
      "& .react-flow__edge-path": { stroke: "CanvasText" },
      "& .react-flow__arrowclosed, & .react-flow__arrowhead": { fill: "CanvasText" },
      "& .react-flow__background circle": { fill: "GrayText" },
    },
    "& .react-flow__node:focus-visible": {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: "2px",
    },
    "& .react-flow__edge:focus-visible": {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
    },
    // Smaller than ReactFlow's default squares so they sit alongside the small
    // toolbar, but held at 28px — above the 24px WCAG 2.5.8 AA floor.
    "& .react-flow__controls-button": {
      width: "28px",
      height: "28px",
      ...shorthands.borderRadius(tokens.borderRadiusSmall),
      backgroundColor: tokens.colorNeutralBackground1,
      color: tokens.colorNeutralForeground1,
      borderBottomColor: tokens.colorNeutralStroke2,
      ":hover": {
        backgroundColor: tokens.colorNeutralBackground1Hover,
        color: tokens.colorNeutralForeground1,
      },
      ":focus-visible": {
        outline: `2px solid ${tokens.colorStrokeFocus2}`,
        outlineOffset: "2px",
        position: "relative",
        zIndex: 1,
      },
      "& svg": { maxWidth: "12px", maxHeight: "12px" },
    },
  },
  /** Fills the host surface instead of the fixed inline height. */
  canvasExpanded: {
    height: "100%",
    "@media (max-width: 1199px)": { height: "100%" },
    "@media (max-width: 767px)": { height: "100%" },
  },
  canvasFrameless: {
    ...shorthands.borderWidth("0"),
    ...shorthands.borderRadius("0"),
  },
  legend: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalXXS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    width: "max-content",
    whiteSpace: "nowrap",
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    boxShadow: tokens.shadow4,
  },
  legendTitle: {
    display: "block",
    marginBottom: tokens.spacingVerticalXXS,
    color: tokens.colorNeutralForeground2,
  },
  legendRow: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap(tokens.spacingHorizontalS),
    whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground2,
  },
  legendLine: {
    width: "28px",
    flexShrink: 0,
    borderTopWidth: "2px",
    borderTopStyle: "solid",
  },
  /** The same legend content, opened from the inline map controls. */
  legendPopover: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalXXS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    width: "max-content",
    maxWidth: "calc(100vw - 16px)",
    whiteSpace: "nowrap",
  },
});

export interface AgentMapCanvasProps {
  graph: FilteredAgentMapGraph;
  /** True when the host is full screen and the canvas fills the surface. */
  expanded?: boolean;
  /** Drops the frame when the canvas sits flush in a flat host surface. */
  frameless?: boolean;
  /**
   * "panel" shows the legend over the map (full screen). "toggle" puts a legend
   * button in the map controls that opens the same content (inline).
   */
  legend?: AgentMapLegendMode;
  /** Inline: the fit keeps every node clear of the map controls. Both modes refit when the canvas resizes. */
  inline?: boolean;
  /** Inline: the height of an overlay at the bottom edge of the map that no node may sit under. */
  inlineBottomInset?: number;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  /** Review maps only: count badges by node ID. A badged node opens its findings. */
  nodeFindingBadges?: ReadonlyMap<string, NodeFindingBadge>;
  /** Review maps only: nodes that open all review findings, such as the reviewed agent. */
  allFindingsNodeIds?: ReadonlySet<string>;
  /** App-owned cache so temporary positions survive conditional canvas mounts. */
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
  legendPopoverClassName: string;
}

/** A small key glyph: one solid and two dashed lines, as on the map. */
function LegendGlyph() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M1 2.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 6h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 1.5" />
      <path d="M1 9.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1 1.5" />
    </svg>
  );
}

function AgentMapCanvasInner({
  graph,
  legend = "panel",
  inline = false,
  inlineBottomInset = 0,
  selectedNodeId,
  selectedEdgeId,
  nodeFindingBadges,
  allFindingsNodeIds,
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
  legendPopoverClassName,
}: CanvasInnerProps) {
  const instance = useReactFlow<AgentMapFlowNode, AgentMapFlowEdge>();
  const containerRef = useRef<HTMLDivElement>(null);
  /** True after the maker pans or zooms; a resize then keeps their view instead of refitting. */
  const userMovedRef = useRef(false);
  /** The pane size of the last fit. Undefined when no fit is shown. */
  const fittedSizeRef = useRef<PaneSize | undefined>(undefined);
  // Stable identity per mode: React Flow copies fit options into its store when they change.
  const fitOptions = useMemo(
    () => inline
      ? { padding: agentMapInlineFitPadding(inlineBottomInset), duration: 0 }
      : fitViewOptions,
    [inline, inlineBottomInset],
  );
  const minZoom = inline ? AGENT_MAP_INLINE_MIN_ZOOM : AGENT_MAP_MIN_ZOOM;
  const layout = useMemo(() => createRadialAgentMapLayout(graph.nodes), [graph.nodes]);
  const positions = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  );
  const nodeIds = useMemo(() => new Set(graph.nodes.map((node) => node.id)), [graph.nodes]);
  const nodeLabels = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.label])),
    [graph.nodes],
  );
  const edgeIds = useMemo(() => new Set(graph.edges.map((edge) => edge.id)), [graph.edges]);

  /** Only the evidence kinds this graph actually contains. */
  const legendProvenances = useMemo(() => {
    const present = new Set(graph.edges.map((edge) => edge.provenance));
    return (["structural", "textual-exact", "textual-strong"] as const)
      .filter((provenance) => present.has(provenance));
  }, [graph.edges]);

  /**
   * Everything about a node except where it sits and whether it is selected.
   *
   * Deliberately free of `selectedNodeId`: this feeds the state below, and
   * anything in here rebuilding would throw away dragged positions.
   */
  const nodeVisuals = useMemo(() => {
    const visuals = new Map<string, {
      data: AgentMapFlowNodeData;
      style: { width: number; height: number; filter: string | undefined };
      ariaLabel: string;
    }>();

    for (const node of graph.nodes) {
      const position = positions.get(node.id);
      const dimmed = !graph.matchedNodeIds.has(node.id);
      const findingBadge = nodeFindingBadges?.get(node.id);
      const action = findingBadge
        ? ` ${findingBadge.label}. Press Enter to open findings.`
        : allFindingsNodeIds?.has(node.id)
          ? " Press Enter to open all findings."
          : " Press Enter for details.";
      visuals.set(node.id, {
        data: getNodeData(node, dimmed, findingBadge),
        style: {
          width: position?.width ?? 220,
          height: position?.height ?? 92,
          filter: dimmed ? "grayscale(1)" : undefined,
        },
        ariaLabel: `${getAgentMapNodeTypeLabel(node)}: ${node.label}. ${node.resolution}.${
          dimmed ? " Shown faintly for search context." : ""
        }${action}`,
      });
    }
    return visuals;
  }, [allFindingsNodeIds, graph.matchedNodeIds, graph.nodes, nodeFindingBadges, positions]);

  /** The computed layout, before the maker moves anything. */
  const baseNodes = useMemo<AgentMapFlowNode[]>(
    () => graph.nodes.map((node) => {
      const visual = nodeVisuals.get(node.id)!;
      const position = positions.get(node.id);
      return {
        id: node.id,
        type: "agentMapNode",
        data: visual.data,
        position: { x: position?.x ?? 0, y: position?.y ?? 0 },
        style: visual.style,
        draggable: true,
        connectable: false,
        selectable: true,
        ariaRole: "button",
        ariaLabel: visual.ariaLabel,
      };
    }),
    [graph.nodes, nodeVisuals, positions],
  );

  /**
   * Live node state, owned here rather than recomputed from props each render.
   *
   * React Flow is controlled: handing it a freshly built array on every frame
   * makes it re-initialise node internals, so each card loses its measured size
   * for a frame and visibly re-lays-out. Feeding React Flow's own changes
   * through `applyNodeChanges` keeps those measurements, which is also what the
   * floating edges read to find the border.
   */
  const [flowNodes, setFlowNodes] = useState<AgentMapFlowNode[]>(() =>
    reconcileAgentMapFlowNodes(baseNodes, [], movedPositions));
  const [lastBaseNodes, setLastBaseNodes] = useState(baseNodes);
  if (baseNodes !== lastBaseNodes) {
    setLastBaseNodes(baseNodes);
    setFlowNodes((currentNodes) =>
      reconcileAgentMapFlowNodes(baseNodes, currentNodes, movedPositions));
  }

  // Selection is overlaid rather than baked in, so selecting a node never
  // rebuilds the array and never discards a dragged position.
  const nodes = useMemo<AgentMapFlowNode[]>(
    () => flowNodes.map((node) => {
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
    () => graph.edges.map((edge) => {
      const color = edge.resolution === "unresolved"
        ? tokens.colorPaletteRedBorderActive
        : agentMapProvenanceColor(edge.provenance);
      const dimmed = !graph.matchedEdgeIds.has(edge.id) && edge.id !== selectedEdgeId;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "agentMapEdge",
        data: getEdgeData(edge, dimmed),
        selected: edge.id === selectedEdgeId,
        selectable: true,
        focusable: true,
        ariaRole: "button",
        ariaLabel: `Relationship from ${nodeLabels.get(edge.source) ?? edge.source} to ${
          nodeLabels.get(edge.target) ?? edge.target
        }: ${edge.relationship}. ${AGENT_MAP_PROVENANCE_LABELS[edge.provenance]}. ${
          edge.resolution
        }.${dimmed ? " Shown faintly for search context." : ""} Press Enter or Space for details.`,
        markerEnd: edge.directed
          ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
          : undefined,
      };
    }),
    [graph.edges, graph.matchedEdgeIds, nodeLabels, selectedEdgeId],
  );

  /**
   * Fit the graph to the pane size in the DOM now.
   *
   * React Flow's own fit waits for the first node measurement and then uses the
   * pane size that it read at mount. A host that resized the frame in that gap,
   * for example on the return from full screen, left the graph fitted to the old
   * size: off the pane or very small, so the map looked empty.
   */
  const fitToPane = useCallback(() => {
    const size = measurePane(containerRef.current);
    const bounds = nodeBounds(instance.getNodes());
    if (!instance.viewportInitialized || size.width < 1 || size.height < 1 || !bounds) {
      fittedSizeRef.current = undefined;
      return;
    }
    const viewport = getViewportForBounds(
      bounds, size.width, size.height, minZoom, AGENT_MAP_MAX_ZOOM, fitOptions.padding,
    );
    if (![viewport.x, viewport.y, viewport.zoom].every(Number.isFinite)) {
      fittedSizeRef.current = undefined;
      return;
    }
    void instance.setViewport(viewport, { duration: 0 });
    fittedSizeRef.current = size;
  }, [fitOptions, instance, minZoom]);

  useEffect(() => {
    // A new graph or a new fit mode starts from the fitted view again.
    userMovedRef.current = false;
    fitToPane();
    // Count-only dependencies avoid camera jumps when search changes emphasis in place.
  }, [fitToPane, nodes.length, edges.length]);

  // The pane can change size after a fit: the host resizes the frame (a display
  // mode change or a host resize), or a caption shows above the map. Refit to each
  // new size, unless the maker already panned or zoomed. The first observation
  // counts too, because the host can resize the frame before the first paint.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      if (userMovedRef.current) return;
      const size = measurePane(container);
      const fitted = fittedSizeRef.current;
      if (fitted && Math.abs(fitted.width - size.width) < 1 && Math.abs(fitted.height - size.height) < 1) return;
      fitToPane();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitToPane]);

  /** Only user pan and zoom carry an event; a programmatic fit does not. */
  const handleMove = useCallback<OnMove>((event) => {
    if (event) userMovedRef.current = true;
  }, []);
  const markMoved = useCallback(() => {
    userMovedRef.current = true;
  }, []);
  const markFitted = useCallback(() => {
    userMovedRef.current = false;
    fittedSizeRef.current = measurePane(containerRef.current);
  }, []);

  /**
   * Feed React Flow's own changes back into the node state.
   *
   * All change types are applied, not just `position`. `dimensions` changes are
   * how React Flow records a node's measured size, and dropping them forces a
   * re-measure on every frame.
   */
  const handleNodesChange = useCallback<OnNodesChange<AgentMapFlowNode>>(
    (changes) => {
      setFlowNodes((current) => applyNodeChanges(changes, current));
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
        ? event.target.closest(".react-flow__node")
        : null;
      const activeElement = document.activeElement;
      const activator = target instanceof HTMLElement || target instanceof SVGElement
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
        ? event.target.closest(".react-flow__edge")
        : null;
      const activeElement = document.activeElement;
      const activator = target instanceof HTMLElement || target instanceof SVGElement
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
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target instanceof Element)) return;

    const activator = event.target.closest(".react-flow__node, .react-flow__edge");
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

  const legendContent = (
    <>
      <Caption1 className={legendTitleClassName}>Relationship evidence</Caption1>
      {legendProvenances.map((provenance) => (
        <div className={legendRowClassName} key={provenance}>
          <span
            className={legendLineClassName}
            style={{
              borderTopColor: agentMapProvenanceColor(provenance),
              borderTopStyle: agentMapProvenanceDash(provenance) ? "dashed" : "solid",
            }}
            aria-hidden="true"
          />
          <Caption1>{AGENT_MAP_PROVENANCE_LABELS[provenance]}</Caption1>
        </div>
      ))}
    </>
  );

  return (
    <div ref={containerRef} className={className} onKeyDownCapture={handleKeyboardActivation}>
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
        onMove={handleMove}
        // Layout is computed, but letting a maker nudge an overlapping node to
        // read a label is worth more than a guaranteed-pristine arrangement.
        // Positions are view-only and reset on reload or Reset.
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        // Not onlyRenderVisibleElements: it culls with React Flow's copy of the pane
        // size, and a stale copy must never hide the whole map.
        minZoom={minZoom}
        maxZoom={AGENT_MAP_MAX_ZOOM}
        proOptions={proOptions}
        aria-label="Agent architecture map. Use the Map and List tabs to inspect components and relationships."
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          bgColor="transparent"
        />
        <Controls
          position="bottom-right"
          showInteractive={false}
          fitViewOptions={fitOptions}
          style={inline ? inlineControlsStyle : undefined}
          onZoomIn={markMoved}
          onZoomOut={markMoved}
          onFitView={markFitted}
        >
          {legend === "toggle" && legendProvenances.length > 0 && (
            <Popover positioning="before-bottom" withArrow>
              <PopoverTrigger disableButtonEnhancement>
                <button
                  type="button"
                  className="react-flow__controls-button"
                  aria-label="Relationship evidence legend"
                  title="Relationship evidence legend"
                >
                  <LegendGlyph />
                </button>
              </PopoverTrigger>
              <PopoverSurface
                className={legendPopoverClassName}
                aria-label="Relationship evidence legend"
              >
                {legendContent}
              </PopoverSurface>
            </Popover>
          )}
        </Controls>
        {legend === "panel" && legendProvenances.length > 0 && (
          <Panel position="top-left">
            <div
              className={legendClassName}
              role="group"
              aria-label="Relationship evidence legend"
            >
              {legendContent}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

interface AgentMapCanvasBoundaryProps {
  children: ReactNode;
  onError: (error: Error) => void;
  /** Change to retry after a failure, e.g. a new graph or a layout reset. */
  resetKey?: string | number;
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

  // A failure is tied to what was being drawn. Latching it forever meant one
  // bad graph left the map dead for the rest of the session, even after the
  // maker picked another agent or reset the layout.
  componentDidUpdate(previous: AgentMapCanvasBoundaryProps): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Render the deterministic graph through React Flow with map controls and legend. */
export function AgentMapCanvas(props: AgentMapCanvasProps) {
  const styles = useStyles();
  return (
    <ReactFlowProvider>
      <AgentMapCanvasInner
        {...props}
        className={mergeClasses(
          styles.canvas,
          props.expanded && styles.canvasExpanded,
          props.frameless && styles.canvasFrameless,
        )}
        legendClassName={styles.legend}
        legendTitleClassName={styles.legendTitle}
        legendRowClassName={styles.legendRow}
        legendLineClassName={styles.legendLine}
        legendPopoverClassName={styles.legendPopover}
      />
    </ReactFlowProvider>
  );
}
