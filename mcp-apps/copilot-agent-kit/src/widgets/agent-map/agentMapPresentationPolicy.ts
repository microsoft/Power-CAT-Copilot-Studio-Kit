import type { AgentMapGraph } from "../../agent-map/types";

export type AgentMapView = "map" | "list";

export type AgentMapPresentation = "inline" | "fullscreen";

export const AGENT_MAP_PRESENTATION_KEY = "agent-review:agent-map:presentation";
export const AGENT_MAP_CONTEXT_KEY = "agent-review:agent-map:context";
export const AGENT_MAP_SNAPSHOT_KEY = "agent-review:agent-map:snapshot";
export const AGENT_MAP_SELECTION_FULLSCREEN_KEY = "agent-review:agent-map:selection-fullscreen";
export const AGENT_MAP_EXPLICIT_FULLSCREEN_KEY = "agent-review:agent-map:explicit-fullscreen";

interface ReadableStorage {
  getItem: (key: string) => string | null;
}

interface WritableStorage {
  setItem: (key: string, value: string) => void;
}

export function completeAgentMapSelection(
  storage: ReadableStorage & WritableStorage,
): boolean {
  if (storage.getItem(AGENT_MAP_SELECTION_FULLSCREEN_KEY) !== "true") return false;
  storage.setItem(AGENT_MAP_SELECTION_FULLSCREEN_KEY, "false");
  storage.setItem(AGENT_MAP_EXPLICIT_FULLSCREEN_KEY, "false");
  storage.setItem(AGENT_MAP_PRESENTATION_KEY, "inline");
  return true;
}

export function agentMapFullscreenControlsLayout() {
  return {
    columns: "280px 320px",
    narrowColumns: "repeat(2, minmax(0, 1fr))",
  } as const;
}

export function shouldShowAgentMapLoadingPlaceholder(input: {
  loading: boolean;
  hasGraph: boolean;
}): boolean {
  return input.loading && !input.hasGraph;
}

export interface AgentMapStoredContext {
  environmentId: string;
  agentId: string;
  componentIdUnique: string;
}

export interface AgentMapEnvironment {
  id: string;
  name: string;
  region?: string;
}

export interface AgentMapAgent {
  id: string;
  name: string;
  componentIdUnique: string;
  iconBase64?: string;
  harness: "standard" | "copilot";
}

export interface AgentMapSnapshotData {
  state?: string;
  selectionId?: string;
  environments?: AgentMapEnvironment[];
  environment?: AgentMapEnvironment;
  environmentId?: string;
  agents?: AgentMapAgent[];
  agentId?: string;
  componentIdUnique?: string;
  graph?: AgentMapGraph;
}

/** Restore the controlled combobox text from the same payload that restores the graph. */
export function resolveAgentMapSelectedAgentName(
  data: Pick<AgentMapSnapshotData, "agents" | "graph">,
  agentId: string,
): string {
  const normalizedAgentId = agentId.toLocaleLowerCase();
  const selected = data.agents?.find(
    (agent) => agent.id.toLocaleLowerCase() === normalizedAgentId,
  );
  if (selected) return selected.name;
  return data.graph?.agent.id.toLocaleLowerCase() === normalizedAgentId
    ? data.graph.agent.name
    : "";
}

interface DisplayModeApp {
  requestDisplayMode: (
    input: { mode: AgentMapPresentation },
  ) => Promise<{ mode: "inline" | "fullscreen" | "pip" }>;
}

export function readAgentMapPresentation(
  storage: ReadableStorage,
): AgentMapPresentation | undefined {
  if (storage.getItem(AGENT_MAP_SELECTION_FULLSCREEN_KEY) === "true") return "inline";
  const value = storage.getItem(AGENT_MAP_PRESENTATION_KEY);
  if (
    value === "fullscreen"
    && storage.getItem(AGENT_MAP_EXPLICIT_FULLSCREEN_KEY) === "true"
  ) {
    return "fullscreen";
  }
  return "inline";
}

export function readAgentMapContext(
  storage: ReadableStorage,
): AgentMapStoredContext | undefined {
  const raw = storage.getItem(AGENT_MAP_CONTEXT_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<AgentMapStoredContext>;
    const { environmentId, agentId, componentIdUnique } = parsed ?? {};
    if (!environmentId || !agentId || !componentIdUnique) return undefined;
    return { environmentId, agentId, componentIdUnique };
  } catch {
    return undefined;
  }
}

export function writeAgentMapContext(
  storage: WritableStorage,
  context: Partial<AgentMapStoredContext>,
): void {
  const { environmentId, agentId, componentIdUnique } = context;
  storage.setItem(
    AGENT_MAP_CONTEXT_KEY,
    environmentId && agentId && componentIdUnique
      ? JSON.stringify({ environmentId, agentId, componentIdUnique })
      : "",
  );
}

function sameContext(
  left: AgentMapStoredContext,
  right: AgentMapStoredContext,
): boolean {
  return left.environmentId.toLocaleLowerCase() === right.environmentId.toLocaleLowerCase()
    && left.agentId.toLocaleLowerCase() === right.agentId.toLocaleLowerCase()
    && left.componentIdUnique.toLocaleLowerCase() === right.componentIdUnique.toLocaleLowerCase();
}

function snapshotContext(
  data: AgentMapSnapshotData,
): AgentMapStoredContext | undefined {
  const { environmentId, agentId, componentIdUnique } = data;
  if (!environmentId || !agentId || !componentIdUnique || !data.graph) return undefined;
  return { environmentId, agentId, componentIdUnique };
}

/** Persist only Agent Map data; display mode remains under its own keys. */
export function writeAgentMapSnapshot(
  storage: WritableStorage,
  data: AgentMapSnapshotData,
): boolean {
  const context = snapshotContext(data);
  if (!context || !data.selectionId) return false;
  const snapshot: AgentMapSnapshotData = {
    state: data.state,
    selectionId: data.selectionId,
    environments: data.environments,
    environment: data.environment,
    environmentId: context.environmentId,
    agents: data.agents,
    agentId: context.agentId,
    componentIdUnique: context.componentIdUnique,
    graph: data.graph,
  };
  storage.setItem(AGENT_MAP_SNAPSHOT_KEY, JSON.stringify({
    selectionId: data.selectionId,
    context,
    data: snapshot,
  }));
  return true;
}

/** Restore only when the payload belongs to the exact widget invocation and selected map. */
export function readAgentMapSnapshot(
  storage: ReadableStorage,
  context: AgentMapStoredContext | undefined,
  selectionId: string | undefined,
): AgentMapSnapshotData | undefined {
  if (!context || !selectionId) return undefined;
  const raw = storage.getItem(AGENT_MAP_SNAPSHOT_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as {
      selectionId?: string;
      context?: Partial<AgentMapStoredContext>;
      data?: AgentMapSnapshotData;
    };
    const stored = parsed.context;
    if (
      !stored?.environmentId
      || !stored.agentId
      || !stored.componentIdUnique
      || parsed.selectionId !== selectionId
      || !parsed.data?.graph
    ) {
      return undefined;
    }
    const storedContext: AgentMapStoredContext = {
      environmentId: stored.environmentId,
      agentId: stored.agentId,
      componentIdUnique: stored.componentIdUnique,
    };
    return sameContext(storedContext, context) ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function shouldRehydrateAgentMap(input: {
  hasToolResult: boolean;
  hasGraph: boolean;
  storedContext?: AgentMapStoredContext;
  alreadyRequested: boolean;
  hasStoredSnapshot?: boolean;
  allowStoredContextRehydrate?: boolean;
}): boolean {
  if (!input.hasToolResult) return false;
  if (input.alreadyRequested || input.hasGraph || input.hasStoredSnapshot) return false;
  if (!input.allowStoredContextRehydrate) return false;
  return Boolean(input.storedContext);
}

/**
 * Record the requested mode before asking and the answered mode after.
 *
 * Writing first means a remount that happens mid-request still knows what the
 * maker chose; writing the response afterwards keeps the record honest when the
 * host answers with something else.
 */
export async function requestAgentMapDisplayMode(
  app: DisplayModeApp,
  requestedMode: AgentMapPresentation,
  storage: WritableStorage,
): Promise<"inline" | "fullscreen" | "pip"> {
  storage.setItem(AGENT_MAP_PRESENTATION_KEY, requestedMode);
  storage.setItem(
    AGENT_MAP_EXPLICIT_FULLSCREEN_KEY,
    requestedMode === "fullscreen" ? "true" : "false",
  );
  try {
    const response = await app.requestDisplayMode({ mode: requestedMode });
    if (response.mode !== requestedMode) {
      storage.setItem(AGENT_MAP_PRESENTATION_KEY, response.mode);
      storage.setItem(
        AGENT_MAP_EXPLICIT_FULLSCREEN_KEY,
        response.mode === "fullscreen" ? "true" : "false",
      );
    }
    return response.mode;
  } catch (error) {
    storage.setItem(
      AGENT_MAP_PRESENTATION_KEY,
      requestedMode === "fullscreen" ? "inline" : "fullscreen",
    );
    storage.setItem(
      AGENT_MAP_EXPLICIT_FULLSCREEN_KEY,
      requestedMode === "fullscreen" ? "false" : "true",
    );
    throw error;
  }
}

/** Resolve the effective mode with the same precedence the review browser uses. */
export function resolveAgentMapFullscreen(input: {
  presentation?: AgentMapPresentation;
  storedPresentation?: AgentMapPresentation;
  state?: string;
  hostDisplayMode?: "inline" | "fullscreen" | "pip";
  current: boolean;
}): boolean {
  if (input.state === "mapSelecting") return false;
  if (input.hostDisplayMode) return input.hostDisplayMode === "fullscreen";
  if (input.presentation) return input.presentation === "fullscreen";
  return input.current;
}

export interface AgentMapDataTransition {
  error: string;
  clearGraph: boolean;
  clearAgentSelection: boolean;
}

/**
 * Decide what one incoming tool payload does to the widget's own state.
 *
 * A failed call has to reach the maker, and a successful one has to clear the
 * message it replaces; a fresh `mapSelecting` result means the server is asking
 * for a choice again, so the previous graph and agent are stale.
 */
export function agentMapDataTransition(next: {
  state?: string;
  graph?: unknown;
  error?: { message?: string };
}): AgentMapDataTransition {
  if (next.error?.message) {
    return { error: next.error.message, clearGraph: false, clearAgentSelection: false };
  }
  const stale = next.state === "mapSelecting";
  return { error: "", clearGraph: stale, clearAgentSelection: stale };
}

/**
 * How the map shows the relationship evidence legend: a panel over the map
 * (full screen), or a toggle in the map controls that opens it on request
 * (inline, where a panel would cover nodes).
 */
export type AgentMapLegendMode = "panel" | "toggle";

export interface AgentMapSurface {
  selectors: boolean;
  toolbar: boolean;
  status: boolean;
  legend: AgentMapLegendMode;
  view: AgentMapView | "none";
  inspector: boolean;
  expandControl: boolean;
  exitControl: boolean;
}

/**
 * Decide what the widget shows for one host display mode.
 *
 * Inline asks for the environment and agent until a graph exists. Once loaded,
 * the map is the only inline content; search, filters, tabs, list, and
 * inspector remain full-screen controls. Inline, the legend is a toggle in the
 * map controls, so it never covers a node; full screen shows the legend panel.
 */
export function agentMapSurface(input: {
  fullscreen: boolean;
  hasGraph: boolean;
  view: AgentMapView;
}): AgentMapSurface {
  if (!input.fullscreen) {
    return {
      selectors: !input.hasGraph,
      toolbar: false,
      status: false,
      legend: "toggle",
      view: input.hasGraph ? "map" : "none",
      inspector: false,
      expandControl: true,
      exitControl: false,
    };
  }
  return {
    selectors: true,
    toolbar: true,
    status: true,
    legend: "panel",
    view: input.hasGraph ? input.view : "none",
    inspector: true,
    expandControl: false,
    exitControl: false,
  };
}

/**
 * Full-screen shell geometry.
 *
 * The root takes the host's whole height, but draws nothing: an outer card with
 * its own border and shadow inside a full-height surface reads as a second
 * window frame around Copilot's. Only the view content grows and scrolls.
 */
export function agentMapFullscreenLayout() {
  return {
    root: {
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      padding: "20px",
      boxSizing: "border-box",
      backgroundColor: "transparent",
      border: "none",
      borderRadius: 0,
      boxShadow: "none",
    },
    content: { flexGrow: 1, minHeight: 0, overflow: "hidden" },
  } as const;
}
