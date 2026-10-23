import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Badge,
  Button,
  Caption1,
  Combobox,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Subtitle2,
  Text,
  Title3,
  Tooltip,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowMaximizeRegular,
  Map24Regular,
} from "@fluentui/react-icons";
import type { XYPosition } from "@xyflow/react";
import { expandConnectedAgentMap } from "../../agent-map/builder";
import type { AgentMapGraph } from "../../agent-map/types";
import { useMcpApp } from "../shared/McpAppProvider";
import {
  fullscreenHeight,
  fullscreenOffered,
  inlineContentHeight,
  inlineHeightBudget,
  measureFrameInset,
} from "../shared/fullscreen";
import {
  imageSource,
  normalizeAgentMapKey,
  toAgentMapViewGraph,
  type AgentMapFilters,
  type AgentMapViewNode,
} from "./agentMapViewModel";
import { createDefaultFilters, filterAgentMapGraph, revealCategory } from "./filterAgentMapGraph";
import {
  agentMapDataTransition,
  agentMapFullscreenControlsLayout,
  agentMapFullscreenLayout,
  agentMapSurface,
  completeAgentMapSelection,
  readAgentMapContext,
  readAgentMapPresentation,
  readAgentMapSnapshot,
  requestAgentMapDisplayMode,
  resolveAgentMapSelectedAgentName,
  resolveAgentMapFullscreen,
  shouldRehydrateAgentMap,
  shouldShowAgentMapLoadingPlaceholder,
  writeAgentMapContext,
  writeAgentMapSnapshot,
  type AgentMapAgent,
  type AgentMapEnvironment,
  type AgentMapStoredContext,
  type AgentMapView,
} from "./agentMapPresentationPolicy";
import { updateMovedNodePosition } from "./agentMapNodeState";
import { AgentMapCanvas, AgentMapCanvasBoundary } from "./AgentMapCanvas";
import { AgentMapList } from "./AgentMapList";
import { AgentMapToolbar } from "./AgentMapToolbar";
import {
  AgentMapInspector,
  type AgentMapConnectedAgentStatus,
  type AgentMapSelection,
} from "./AgentMapInspector";

type Environment = AgentMapEnvironment;
type Agent = AgentMapAgent;

interface ToolData {
  state?: string;
  selectionId?: string;
  presentation?: "inline" | "fullscreen";
  environments?: Environment[];
  environment?: Environment;
  environmentId?: string;
  agents?: Agent[];
  agentId?: string;
  componentIdUnique?: string;
  graph?: AgentMapGraph;
  error?: { message?: string };
}

const layout = agentMapFullscreenLayout();
const controlsLayout = agentMapFullscreenControlsLayout();

const useStyles = makeStyles({
  inlineRoot: {
    minWidth: 0,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalS),
    color: tokens.colorNeutralForeground1,
    backgroundColor: "transparent",
  },
  /** Inline map: a fixed height inside the host budget; nothing may spill below it. */
  inlineMapRoot: {
    overflow: "hidden",
  },
  inlineSelectionCard: {
    minWidth: 0,
    minHeight: "min(220px, var(--agent-map-inline-height, 220px))",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalM),
    ...shorthands.padding(tokens.spacingHorizontalL),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusXLarge),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    overflow: "hidden",
  },
  inlineSelectionPlaceholder: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    color: tokens.colorNeutralForeground2,
    overflow: "hidden",
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  inlineSelectionLoading: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
  },
  inlineMessage: {
    flexShrink: 0,
  },
  /** A long message keeps two lines inline; the full text stays in the DOM and the tooltip. */
  inlineMessageText: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
  inlineCaption: {
    flexShrink: 0,
    minWidth: 0,
    color: tokens.colorNeutralForeground2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /**
   * Full-screen shell.
   *
   * Height comes from the host, but the surface itself draws nothing: an outer
   * card inside Copilot's own full-height frame reads as a second window.
   */
  fullRoot: {
    minWidth: 0,
    display: layout.root.display,
    flexDirection: layout.root.flexDirection,
    minHeight: layout.root.minHeight,
    padding: layout.root.padding,
    boxSizing: layout.root.boxSizing,
    backgroundColor: layout.root.backgroundColor,
    border: layout.root.border,
    borderRadius: layout.root.borderRadius,
    boxShadow: layout.root.boxShadow,
    ...shorthands.gap(tokens.spacingVerticalM),
    color: tokens.colorNeutralForeground1,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    ...shorthands.gap(tokens.spacingHorizontalL),
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap(tokens.spacingHorizontalS),
    minWidth: 0,
  },
  selectors: {
    display: "grid",
    gridTemplateColumns: controlsLayout.columns,
    ...shorthands.gap(tokens.spacingHorizontalM),
    "@media (max-width: 767px)": { gridTemplateColumns: controlsLayout.narrowColumns },
    "@media (max-width: 479px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  option: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap(tokens.spacingHorizontalS),
    minWidth: 0,
  },
  optionIcon: {
    width: "20px",
    height: "20px",
    flexShrink: 0,
    objectFit: "contain",
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
  },
  status: {
    color: tokens.colorNeutralForeground2,
  },
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  },
  /** Only the panel wrapping the view may grow; the toolbar and status stay auto. */
  viewPanel: {
    minWidth: 0,
    flexGrow: layout.content.flexGrow,
    minHeight: layout.content.minHeight,
    overflow: layout.content.overflow,
    display: "flex",
    flexDirection: "column",
  },
  split: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 360px",
    alignItems: "stretch",
    ...shorthands.gap(tokens.spacingHorizontalL),
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    "@media (max-width: 1199px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
      alignItems: "start",
      overflowY: "auto",
    },
  },
  /** The map fills its column; the list scrolls inside it. */
  content: {
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
  },
  mapContent: {
    overflow: "hidden",
    "> *": { height: "100%" },
  },
  inspectorColumn: {
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
  },
  /** Inline: the canvas takes the height left in the budget; the map fits it. */
  inlineCanvas: {
    minWidth: 0,
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0px",
    position: "relative",
  },
  inlineExpand: {
    position: "absolute",
    top: tokens.spacingVerticalS,
    right: tokens.spacingHorizontalS,
    zIndex: 5,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    ...shorthands.gap(tokens.spacingVerticalM),
    ...shorthands.padding(tokens.spacingVerticalL),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
  },
  placeholder: {
    display: "grid",
    placeItems: "center",
    minHeight: "180px",
  },
});

function structured(result: unknown): ToolData {
  return ((result as { structuredContent?: ToolData })?.structuredContent ?? {}) as ToolData;
}

function AgentOption({
  agent,
  className,
  iconClassName,
}: {
  agent: Agent;
  className: string;
  iconClassName: string;
}) {
  const icon = imageSource(agent.iconBase64);
  return (
    <span className={className}>
      {icon && <img className={iconClassName} src={icon} alt="" aria-hidden="true" />}
      <span>{agent.name}</span>
    </span>
  );
}

export function AgentMapApp() {
  const styles = useStyles();
  const { app, data, host, replaceData } = useMcpApp();
  const storedContext = readAgentMapContext(window.sessionStorage);
  const replayed = (data ?? {}) as ToolData;
  const storedSnapshot = replayed.state === "mapSelecting" && !replayed.graph && !replayed.error
    ? readAgentMapSnapshot(window.sessionStorage, storedContext, replayed.selectionId)
    : undefined;
  const initial = (storedSnapshot ?? replayed) as ToolData;
  const selectionIdRef = useRef(initial.selectionId ?? replayed.selectionId ?? "");
  const storedPresentation = readAgentMapPresentation(window.sessionStorage);
  const initialAgentId = initial.agentId ?? storedContext?.agentId ?? "";
  const [state, setState] = useState(initial.state);
  const [environments, setEnvironments] = useState<Environment[]>(initial.environments ?? []);
  const [environmentId, setEnvironmentId] = useState(
    initial.environmentId ?? storedContext?.environmentId ?? "",
  );
  const [environmentFilter, setEnvironmentFilter] = useState(initial.environment?.name ?? "");
  const [agents, setAgents] = useState<Agent[]>(initial.agents ?? []);
  const [agentId, setAgentId] = useState(initialAgentId);
  const [agentFilter, setAgentFilter] = useState(
    () => resolveAgentMapSelectedAgentName(initial, initialAgentId),
  );
  const [graph, setGraph] = useState<AgentMapGraph | undefined>(initial.graph);
  const [filters, setFilters] = useState<AgentMapFilters>(createDefaultFilters);
  const [view, setView] = useState<AgentMapView>("map");
  const [selection, setSelection] = useState<AgentMapSelection>(null);
  const [focusVersion, setFocusVersion] = useState(0);
  const [selectionAnnouncement, setSelectionAnnouncement] = useState("");
  const [layoutResetKey, setLayoutResetKey] = useState(0);
  const [canvasError, setCanvasError] = useState(false);
  const [movedNodePositions, setMovedNodePositions] = useState<
    ReadonlyMap<string, XYPosition>
  >(() => new Map());
  const [loadingPhase, setLoadingPhase] = useState<"agents" | "map" | null>(null);
  const [connectedAgentLoad, setConnectedAgentLoad] = useState<{
    nodeId: string;
    state: "loading" | "loaded" | "error";
    componentCount?: number;
    message?: string;
  } | null>(null);
  const loading = loadingPhase !== null;
  const [error, setError] = useState(initial.error?.message ?? "");
  const [fullscreenRefused, setFullscreenRefused] = useState(false);
  const [frameInset] = useState(measureFrameInset);
  const activatorRef = useRef<HTMLElement | SVGElement | null>(null);
  const inlineRootRef = useRef<HTMLDivElement>(null);
  const rehydrateRequested = useRef(false);
  const connectedAgentRequestRef = useRef("");
  const connectedAgentCacheRef = useRef(new Map<string, AgentMapGraph>());
  const [isFullscreen, setIsFullscreen] = useState(() => resolveAgentMapFullscreen({
    presentation: initial.presentation,
    storedPresentation,
    state: initial.state,
    hostDisplayMode: host?.displayMode,
    current: false,
  }));

  const surface = agentMapSurface({ fullscreen: isFullscreen, hasGraph: Boolean(graph), view });
  const inlineBudget = inlineHeightBudget(host?.containerDimensions);
  const inlineHeight = inlineContentHeight(host?.containerDimensions, frameInset.height);

  useEffect(() => {
    const incoming = (data ?? {}) as ToolData;
    const currentContext = readAgentMapContext(window.sessionStorage);
    const next = ((incoming.state === "mapSelecting" && !incoming.graph && !incoming.error
      ? readAgentMapSnapshot(window.sessionStorage, currentContext, incoming.selectionId)
      : undefined) ?? incoming) as ToolData;
    if (!selectionIdRef.current && next.selectionId) {
      selectionIdRef.current = next.selectionId;
    }
    const transition = agentMapDataTransition(next);
    setError(transition.error);
    if (next.state) setState(next.state);
    if (next.environments) setEnvironments(next.environments);
    if (next.environmentId) {
      setEnvironmentId(next.environmentId);
      const environment = next.environment
        ?? next.environments?.find((candidate) => candidate.id === next.environmentId);
      if (environment) setEnvironmentFilter(environment.name);
    }
    if (next.agents) setAgents(next.agents);
    if (next.agentId) {
      setAgentId(next.agentId);
      setAgentFilter(resolveAgentMapSelectedAgentName(next, next.agentId));
    }
    if (transition.clearAgentSelection) {
      setAgentId("");
      setAgentFilter("");
    }
    if (transition.clearGraph) setGraph(undefined);
    if (next.graph) {
      writeAgentMapSnapshot(window.sessionStorage, next);
      setGraph(next.graph);
      setSelection(null);
      setCanvasError(false);
    }
    setIsFullscreen((current) => resolveAgentMapFullscreen({
      presentation: next.presentation,
      storedPresentation,
      state: next.state,
      hostDisplayMode: host?.displayMode,
      current,
    }));
  }, [data, host?.displayMode, storedPresentation]);

  useEffect(() => {
    if (!app) return;
    if (!shouldRehydrateAgentMap({
      hasToolResult: Boolean(replayed.state),
      hasGraph: Boolean(graph),
      storedContext,
      alreadyRequested: rehydrateRequested.current,
      hasStoredSnapshot: Boolean(storedSnapshot),
      allowStoredContextRehydrate: !replayed.selectionId,
    })) return;
    rehydrateRequested.current = true;
    void rebuildMap(storedContext!);
  }, [app, graph, replayed.selectionId, replayed.state, storedContext, storedSnapshot]);

  // Earlier builds opened selection fullscreen automatically. Clear that
  // persisted state once so an existing conversation also returns inline.
  useEffect(() => {
    if (!completeAgentMapSelection(window.sessionStorage)) return;
    if (host?.displayMode === "fullscreen") {
      void requestDisplayMode("inline");
    }
  }, [host?.displayMode]);

  // The host is authoritative once it reports a mode of its own, but a mode the
  // maker chose explicitly still wins so an exit cannot bounce back.
  useEffect(() => {
    if (!host?.displayMode || host.displayMode === "pip") return;
    setIsFullscreen((current) => resolveAgentMapFullscreen({
      storedPresentation: readAgentMapPresentation(window.sessionStorage),
      hostDisplayMode: host.displayMode,
      current,
    }));
  }, [host?.displayMode]);

  // The reported height is the whole document: the inline root plus the
  // bootstrap frame padding, never more than the host's inline budget.
  useEffect(() => {
    const element = inlineRootRef.current;
    if (!app || isFullscreen || !element) return;

    const frameInsetHeight = frameInset.height;
    let lastWidth = 0;
    let lastHeight = 0;
    const reportSize = () => {
      const bounds = element.getBoundingClientRect();
      const width = Math.ceil(bounds.width);
      const height = Math.min(inlineBudget, Math.ceil(bounds.height + frameInsetHeight));
      if (width <= 0 || bounds.height <= 0 || (width === lastWidth && height === lastHeight)) return;
      lastWidth = width;
      lastHeight = height;
      void app.sendSizeChanged({ width, height });
    };
    const observer = new ResizeObserver(reportSize);
    observer.observe(element);
    reportSize();
    return () => observer.disconnect();
  }, [app, frameInset.height, inlineBudget, isFullscreen]);

  const viewGraph = useMemo(() => (graph ? toAgentMapViewGraph(graph) : undefined), [graph]);
  const filtered = useMemo(
    () => (viewGraph ? filterAgentMapGraph(viewGraph, filters) : undefined),
    [filters, viewGraph],
  );
  // Search matches only shown categories; count the rest so a search never fails silently.
  const hiddenMatchCount = useMemo(() => {
    const query = normalizeAgentMapKey(filters.query);
    if (!query || !viewGraph) return 0;
    return viewGraph.nodes.filter((node) =>
      !filters.categories.has(node.category) && node.searchText.includes(query)).length;
  }, [filters, viewGraph]);
  const nodeIndex = useMemo(
    () => new Map((viewGraph?.nodes ?? []).map((node) => [node.id, node])),
    [viewGraph],
  );
  const edgeIndex = useMemo(
    () => new Map((viewGraph?.edges ?? []).map((edge) => [edge.id, edge])),
    [viewGraph],
  );

  const selectedNodeId = selection?.type === "node" ? selection.id : undefined;
  const selectedEdgeId = selection?.type === "edge" ? selection.id : undefined;

  const loadConnectedAgent = useCallback(async (node: AgentMapViewNode) => {
    if (
      !app
      || !graph
      || !environmentId
      || node.category !== "connected-agent"
      || node.depth !== 1
      || !node.targetAgentSchemaName
    ) {
      return;
    }
    const schemaName = node.targetAgentSchemaName;
    const requestKey = `${node.id}:${schemaName.toLocaleLowerCase()}`;
    connectedAgentRequestRef.current = requestKey;
    setConnectedAgentLoad({ nodeId: node.id, state: "loading" });
    setError("");

    const applyChildGraph = (childGraph: AgentMapGraph) => {
      if (connectedAgentRequestRef.current !== requestKey) return;
      const expanded = expandConnectedAgentMap(graph, node.id, childGraph);
      const selected = agents.find((candidate) => candidate.id === agentId);
      const next: ToolData = {
        state: "map",
        selectionId: selectionIdRef.current,
        environments,
        environment: environments.find((candidate) => candidate.id === environmentId),
        environmentId,
        agents,
        agentId,
        componentIdUnique: selected?.componentIdUnique,
        graph: expanded,
      };
      writeAgentMapSnapshot(window.sessionStorage, next);
      replaceData(next);
      setGraph(expanded);
      setConnectedAgentLoad({
        nodeId: node.id,
        state: "loaded",
        componentCount: childGraph.summary.componentCount,
      });
      setSelectionAnnouncement(
        `Loaded ${childGraph.summary.componentCount} components for ${node.label}.`,
      );
    };

    const cached = connectedAgentCacheRef.current.get(schemaName.toLocaleLowerCase());
    if (cached) {
      applyChildGraph(cached);
      return;
    }

    try {
      const output = structured(await app.callServerTool({
        name: "get_connected_agent_map",
        arguments: {
          environmentId,
          targetSchemaName: schemaName,
        },
      }));
      if (!output.graph) {
        throw new Error(output.error?.message ?? "Unable to load the connected agent.");
      }
      connectedAgentCacheRef.current.set(schemaName.toLocaleLowerCase(), output.graph);
      applyChildGraph(output.graph);
    } catch (caught) {
      if (connectedAgentRequestRef.current !== requestKey) return;
      const message = caught instanceof Error
        ? caught.message
        : "Unable to load the connected agent.";
      setConnectedAgentLoad({ nodeId: node.id, state: "error", message });
      setError(message);
    }
  }, [agentId, agents, app, environmentId, environments, graph, replaceData]);

  const selectNode = useCallback((
    id: string,
    activator: HTMLElement | SVGElement | null,
    moveFocus: boolean,
  ) => {
    const node = nodeIndex.get(id);
    if (activator) activatorRef.current = activator;
    // A target in a hidden category (for example a test case) is shown, not lost.
    if (node) setFilters((current) => revealCategory(current, node.category));
    setSelection({ type: "node", id });
    if (
      node?.category === "connected-agent"
      && node.depth === 1
      && node.targetAgentSchemaName
    ) {
      void loadConnectedAgent(node);
    }
    if (moveFocus) {
      setSelectionAnnouncement(
        `Selected ${node?.label ?? "component"}. Details opened.${
          node?.category === "connected-agent" ? " Loading its components." : ""
        }`,
      );
      setFocusVersion((version) => version + 1);
    }
  }, [loadConnectedAgent, nodeIndex]);

  const revealEdgeEndpoints = useCallback((id: string) => {
    const edge = edgeIndex.get(id);
    if (!edge) return;
    const categories = [edge.source, edge.target].map((nodeId) => nodeIndex.get(nodeId)?.category);
    setFilters((current) => categories.reduce(revealCategory, current));
  }, [edgeIndex, nodeIndex]);

  const selectEdge = useCallback((
    id: string,
    activator: HTMLElement | SVGElement | null,
    moveFocus: boolean,
  ) => {
    if (activator) activatorRef.current = activator;
    revealEdgeEndpoints(id);
    setSelection({ type: "edge", id });
    if (moveFocus) {
      const edge = edgeIndex.get(id);
      const source = edge ? nodeIndex.get(edge.source)?.label ?? edge.source : "source";
      const target = edge ? nodeIndex.get(edge.target)?.label ?? edge.target : "target";
      setSelectionAnnouncement(
        `Selected relationship ${source} ${edge?.relationship ?? "to"} ${target}. Details opened.`,
      );
      setFocusVersion((version) => version + 1);
    }
  }, [edgeIndex, nodeIndex, revealEdgeEndpoints]);

  const clearSelection = useCallback((restoreFocus = true) => {
    setSelection(null);
    if (restoreFocus) {
      setSelectionAnnouncement("Selection cleared.");
      requestAnimationFrame(() => activatorRef.current?.focus());
    }
  }, []);

  /** Stable identity: the canvas passes this straight to React Flow's `onPaneClick`. */
  const clearSelectionSilently = useCallback(() => clearSelection(false), [clearSelection]);

  const reset = useCallback(() => {
    setFilters(createDefaultFilters());
    setMovedNodePositions(new Map());
    setLayoutResetKey((current) => current + 1);
    clearSelection(false);
  }, [clearSelection]);

  const rememberMovedNodePosition = useCallback((nodeId: string, position: XYPosition) => {
    setMovedNodePositions((current) => updateMovedNodePosition(current, nodeId, position));
  }, []);

  const updateFilters = useCallback((nextFilters: AgentMapFilters) => {
    setFilters(nextFilters);
    setSelection(null);
  }, []);

  const selectedEnvironment = environments.find((item) => item.id === environmentId);
  const selectedAgent = agents.find((item) => item.id === agentId);
  const selectedNode = selectedNodeId ? nodeIndex.get(selectedNodeId) : undefined;
  const connectedAgentStatus: AgentMapConnectedAgentStatus | undefined =
    selectedNode?.category === "connected-agent" && selectedNode.depth === 1
      ? connectedAgentLoad?.nodeId === selectedNode.id
        ? connectedAgentLoad
        : { state: "idle" }
      : undefined;
  const filteredEnvironments = useMemo(() => {
    const needle = environmentFilter.trim().toLocaleLowerCase();
    if (!needle || selectedEnvironment?.name === environmentFilter) return environments;
    return environments.filter((item) => item.name.toLocaleLowerCase().includes(needle));
  }, [environmentFilter, environments, selectedEnvironment]);
  const filteredAgents = useMemo(() => {
    const needle = agentFilter.trim().toLocaleLowerCase();
    if (!needle || selectedAgent?.name === agentFilter) return agents;
    return agents.filter((item) => item.name.toLocaleLowerCase().includes(needle));
  }, [agentFilter, agents, selectedAgent]);

  const loadAgents = async (id: string) => {
    const environment = environments.find((item) => item.id === id);
    setEnvironmentId(id);
    setEnvironmentFilter(environment?.name ?? "");
    setAgentId("");
    setAgentFilter("");
    setAgents([]);
    setGraph(undefined);
    setConnectedAgentLoad(null);
    connectedAgentCacheRef.current.clear();
    setError("");
    writeAgentMapContext(window.sessionStorage, { environmentId: id });
    if (!id || !app) return;
    setLoadingPhase("agents");
    try {
      const output = structured(await app.callServerTool({
        name: "show_agent_map",
        arguments: { environmentId: id },
      }));
      if (output.state === "error") {
        throw new Error(output.error?.message ?? "Unable to load agents.");
      }
      const nextSelectionId = selectionIdRef.current || output.selectionId || "";
      selectionIdRef.current = nextSelectionId;
      const next = {
        ...output,
        selectionId: nextSelectionId,
        environmentId: id,
        environment,
      };
      replaceData(next);
      setAgents(next.agents ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load agents.");
    } finally {
      setLoadingPhase(null);
    }
  };

  /** Build a map for one selection; shared by the picker and by remount rehydration. */
  async function rebuildMap(context: AgentMapStoredContext) {
    if (!app) return;
    setLoadingPhase("map");
    try {
      const output = structured(await app.callServerTool({
        name: "get_agent_map",
        arguments: {
          environmentId: context.environmentId,
          agentId: context.agentId,
          componentIdUnique: context.componentIdUnique,
        },
      }));
      if (!output.graph) {
        throw new Error(output.error?.message ?? "Unable to build the Agent Map.");
      }
      const next = { ...output, selectionId: selectionIdRef.current };
      writeAgentMapContext(window.sessionStorage, context);
      writeAgentMapSnapshot(window.sessionStorage, next);
      // Through the provider so a later remount and every child read the same
      // payload the widget is rendering.
      replaceData(next);
      setState(next.state ?? "map");
      setEnvironmentId(next.environmentId ?? context.environmentId);
      if (next.environments) setEnvironments(next.environments);
      if (next.environment) setEnvironmentFilter(next.environment.name);
      if (next.agents) setAgents(next.agents);
      const agent = next.agents?.find((item) => item.id === context.agentId);
      setAgentId(context.agentId);
      if (agent) setAgentFilter(agent.name);
      setGraph(next.graph);
      setConnectedAgentLoad(null);
      connectedAgentCacheRef.current.clear();
      setSelection(null);
      setMovedNodePositions(new Map());
      setCanvasError(false);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to build the Agent Map.");
    } finally {
      setLoadingPhase(null);
    }
  }

  const loadMap = async (id: string) => {
    const agent = agents.find((item) => item.id === id);
    setAgentId(id);
    setAgentFilter(agent?.name ?? "");
    setError("");
    if (!app || !environmentId || !agent) return;
    await rebuildMap({
      environmentId,
      agentId: agent.id,
      componentIdUnique: agent.componentIdUnique,
    });
  };

  const requestDisplayMode = async (requested: "inline" | "fullscreen") => {
    if (requested === "inline") {
      completeAgentMapSelection(window.sessionStorage);
    }
    if (!app) return;
    try {
      const mode = await requestAgentMapDisplayMode(app, requested, window.sessionStorage);
      setIsFullscreen(mode === "fullscreen");
      if (requested === "fullscreen") setFullscreenRefused(mode !== "fullscreen");
    } catch (caught) {
      // A host that cannot open full screen is a neutral state, not an error.
      if (requested === "fullscreen") {
        setFullscreenRefused(true);
        return;
      }
      setError(caught instanceof Error
        ? caught.message
        : "Unable to change the Agent Map display mode.");
    }
  };

  const canvasView = filtered && viewGraph
    ? (
        <AgentMapCanvasBoundary
          resetKey={`${viewGraph.agent.id}:${layoutResetKey}`}
          onError={() => {
            setCanvasError(true);
            if (isFullscreen) setView("list");
          }}
        >
          <AgentMapCanvas
            key={layoutResetKey}
            graph={filtered}
            movedPositions={movedNodePositions}
            onNodePositionChange={rememberMovedNodePosition}
            expanded
            legend={surface.legend}
            inline={!isFullscreen}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            onSelectNode={selectNode}
            onSelectEdge={selectEdge}
            onClearSelection={clearSelectionSilently}
          />
        </AgentMapCanvasBoundary>
      )
    : null;

  const listView = filtered
    ? (
        <AgentMapList
          graph={filtered}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          onSelectNode={selectNode}
          onSelectEdge={selectEdge}
        />
      )
    : null;

  const showLoadingPlaceholder = shouldShowAgentMapLoadingPlaceholder({
    loading,
    hasGraph: Boolean(graph),
  });

  const selectorsView = (
    <div className={styles.selectors}>
      <Field label="Environment">
        <Combobox
          value={environmentFilter}
          selectedOptions={environmentId ? [environmentId] : []}
          placeholder="Choose an environment"
          onChange={(event) => {
            const value = event.target.value;
            setEnvironmentFilter(value);
            if (environmentId && value !== selectedEnvironment?.name) {
              setEnvironmentId("");
              setAgents([]);
              setGraph(undefined);
            }
          }}
          onOptionSelect={(_, option) => {
            if (option.optionValue) void loadAgents(option.optionValue);
          }}
        >
          {filteredEnvironments.map((environment) => (
            <Option key={environment.id} value={environment.id} text={environment.name}>
              {environment.name}
            </Option>
          ))}
        </Combobox>
      </Field>
      <Field label="Agent">
        <Combobox
          value={agentFilter}
          selectedOptions={agentId ? [agentId] : []}
          disabled={!environmentId || loading}
          placeholder="Choose an agent"
          onChange={(event) => {
            const value = event.target.value;
            setAgentFilter(value);
            if (agentId && value !== selectedAgent?.name) {
              setAgentId("");
            }
          }}
          onOptionSelect={(_, option) => {
            if (option.optionValue) void loadMap(option.optionValue);
          }}
        >
          {filteredAgents.map((agent) => (
            <Option key={agent.id} value={agent.id} text={agent.name}>
              <AgentOption
                agent={agent}
                className={styles.option}
                iconClassName={styles.optionIcon}
              />
            </Option>
          ))}
        </Combobox>
      </Field>
    </div>
  );

  const inlineSelectionView = (
    <div className={styles.inlineSelectionCard}>
      {error && (
        <MessageBar className={styles.inlineMessage} intent="error" role="alert">
          <MessageBarBody>
            <span className={styles.inlineMessageText} title={error}>{error}</span>
          </MessageBarBody>
        </MessageBar>
      )}
      {selectorsView}
      {showLoadingPlaceholder && (
        <div className={styles.inlineSelectionLoading}>
          <Spinner
            label={loadingPhase === "agents"
              ? "Loading available agents"
              : "Reading agent configuration"}
          />
        </div>
      )}
      {!showLoadingPlaceholder && (
        <div className={styles.inlineSelectionPlaceholder}>
          <Subtitle2 as="h3">Your agent map will appear here</Subtitle2>
          <Text>Choose an environment and an agent to display its component map.</Text>
        </div>
      )}
    </div>
  );

  if (!isFullscreen) {
    const fullscreenUnavailable = fullscreenRefused || !fullscreenOffered(host);
    // The selection card keeps its natural height up to the budget; the map fills it.
    const inlineStyle = (surface.selectors
      ? { maxHeight: inlineHeight, "--agent-map-inline-height": `${inlineHeight}px` }
      : { height: inlineHeight }) as CSSProperties;
    return (
      <div
        ref={inlineRootRef}
        className={surface.selectors
          ? styles.inlineRoot
          : mergeClasses(styles.inlineRoot, styles.inlineMapRoot)}
        style={inlineStyle}
      >
        {surface.selectors ? inlineSelectionView : (
          <>
            {error && (
              <MessageBar className={styles.inlineMessage} intent="error" role="alert">
                <MessageBarBody>
                  <span className={styles.inlineMessageText} title={error}>{error}</span>
                </MessageBarBody>
              </MessageBar>
            )}
            {fullscreenUnavailable && (
              <Caption1 className={styles.inlineCaption} role="status">
                Fullscreen is not available in this host.
              </Caption1>
            )}
            <div className={styles.inlineCanvas}>
              <Tooltip content="Expand to full screen" relationship="label">
                <Button
                  appearance="secondary"
                  className={styles.inlineExpand}
                  size="small"
                  icon={<ArrowMaximizeRegular />}
                  aria-label="Expand to full screen"
                  onClick={() => void requestDisplayMode("fullscreen")}
                />
              </Tooltip>
              {surface.view === "map" && canvasView && !canvasError ? canvasView : (
                <MessageBar intent="error" role="alert">
                  <MessageBarBody>
                    The map canvas could not render. Expand to use List view.
                  </MessageBarBody>
                </MessageBar>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={styles.fullRoot}
      style={{ height: fullscreenHeight(host?.containerDimensions, window.screen.availHeight) }}
    >
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Map24Regular />
          <Title3>{viewGraph ? `${viewGraph.agent.name} — agent map` : "Agent Map"}</Title3>
          {viewGraph && (
            <Badge appearance="tint" color="brand">
              {viewGraph.summary.componentCount} components
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {canvasError && (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>
            The map canvas could not render. The complete architecture remains available in
            List view.
          </MessageBarBody>
        </MessageBar>
      )}

      {surface.selectors && selectorsView}

      {showLoadingPlaceholder ? (
        <div className={styles.placeholder}>
          <Spinner
            label={loadingPhase === "agents"
              ? "Loading available agents"
              : "Reading agent configuration"}
          />
        </div>
      ) : viewGraph && filtered ? (
        <>
          <AgentMapToolbar
            filters={filters}
            view={view}
            onFiltersChange={updateFilters}
            onViewChange={setView}
            onReset={reset}
          />
          <Text className={styles.status} role="status" aria-live="polite">
            {filters.query.trim()
              ? (
                  <>
                    Highlighting {filtered.matchedNodeIds.size} components and{" "}
                    {filtered.matchedEdgeIds.size} relationships. Showing{" "}
                    {filtered.nodes.length} components and {filtered.edges.length} relationships
                    after filters. {viewGraph.summary.skillReferenceCount} possible skill
                    references were captured.
                    {hiddenMatchCount > 0 && (
                      <>
                        {" "}{hiddenMatchCount} more matching{" "}
                        {hiddenMatchCount === 1 ? "component is" : "components are"} in hidden
                        categories. Turn them on in Filters to show them.
                      </>
                    )}
                  </>
                )
              : (
                  <>
                    Showing {filtered.nodes.length} of {viewGraph.summary.nodeCount} components
                    and {filtered.edges.length} of {viewGraph.summary.edgeCount} relationships.{" "}
                    {viewGraph.summary.linkedSkillCount} of{" "}
                    {viewGraph.summary.linkedSkillCount + viewGraph.summary.unlinkedSkillCount}
                    {" "}skills have a possible configured tool or knowledge reference with
                    inspectable authored evidence.
                  </>
                )}
          </Text>
          <span className={styles.visuallyHidden} role="status" aria-live="polite">
            {selectionAnnouncement}
          </span>
          <div
            className={styles.viewPanel}
            role="tabpanel"
            id={`agent-map-view-panel-${view}`}
            aria-labelledby={`agent-map-view-tab-${view}`}
          >
            {filtered.nodes.length === 0 ? (
              <div className={styles.empty}>
                <Subtitle2 as="h3">No matching map items</Subtitle2>
                <Text>Change the search or filters to restore components and relationships.</Text>
                <Button appearance="primary" onClick={reset}>Reset filters</Button>
              </div>
            ) : (
              <div className={styles.split}>
                <div
                  className={view === "map"
                    ? `${styles.content} ${styles.mapContent}`
                    : styles.content}
                >
                  {view === "map" ? canvasView : listView}
                </div>
                <div className={styles.inspectorColumn}>
                  <AgentMapInspector
                    graph={viewGraph}
                    selection={selection}
                    focusVersion={focusVersion}
                    connectedAgentStatus={connectedAgentStatus}
                    onClear={() => clearSelection(true)}
                    onSelectNode={(id) => {
                      if (nodeIndex.has(id)) selectNode(id, null, false);
                    }}
                    onSelectEdge={(id) => {
                      if (!edgeIndex.has(id)) return;
                      revealEdgeEndpoints(id);
                      setSelection({ type: "edge", id });
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <Subtitle2 as="h3">Choose an agent</Subtitle2>
          <Text>
            Pick an environment and an agent to build its deterministic component map.
          </Text>
        </div>
      )}
    </div>
  );
}
