import {
  Button,
  Badge,
  MessageBar,
  MessageBarBody,
  Overflow,
  OverflowItem,
  Portal,
  Spinner,
  Tab,
  TabList,
  Text,
  Title3,
  Tooltip,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
  useIsOverflowItemVisible,
  useOverflowMenu,
  type SelectTabData,
  type SelectTabEvent,
} from "@fluentui/react-components";
import {
  ArrowMaximizeRegular,
  Bot24Regular,
  BranchFork20Regular,
  ChatMultiple20Regular,
  DataUsage20Regular,
  Globe20Regular,
  Lightbulb20Regular,
  MoreHorizontal20Regular,
  Play20Regular,
  Timer20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from "react";
import type { ConversationData } from "../../agent-debugger/contracts/conversation";
import type { ConversationTranscriptJson, UsageDiagnostics } from "../../agent-debugger/contracts/diagnostics";
import type {
  Activity,
  ProcessedTranscript,
  ProcessedTurn,
} from "../../agent-debugger/contracts/transcript";
import type { SessionSummary } from "../../agent-debugger/contracts/workspace";
import type { ConnectedAgentInfo } from "../../agent-debugger/contracts/connected-agent";
import type { AgentConfig } from "../../agent-debugger/services/agent-config-service";
import type { ComponentInfo } from "../../agent-debugger/services/botcomponents-service";
import type { Recommendation } from "../../agent-debugger/utils/recommendations";
import type { TranscriptData as FluentTranscriptData } from "../../agent-debugger/components/ui";
import { PerformanceTimelineTab, type TimelineTurnTarget } from "../../agent-debugger/components/tabs/PerformanceTimelineTab";
import { ExecutionFlowTab } from "../../agent-debugger/components/tabs/ExecutionFlowTab";
import { ConversationActivitiesTab } from "../../agent-debugger/components/tabs/ConversationActivitiesTab";
import { AgentInsightsTab, uniqueRecommendations } from "../../agent-debugger/components/tabs/AgentInsightsTab";
import { UsageCreditsTab } from "../../agent-debugger/components/tabs/UsageCreditsTab";
import noResultsImage from "../../agent-debugger/assets/no-results.png";
import { useMcpApp } from "../shared/McpAppProvider";
import {
  fullscreenHeight,
  fullscreenOffered,
  inlineContentHeight,
  inlineHeightBudget,
  measureFrameInset,
} from "../shared/fullscreen";
import { SearchablePicker, type PickerOption } from "../shared/SearchablePicker";
import { useWorkflowCanvasModel } from "../../agent-debugger/components/flow/WorkflowCanvasModel";
import { formatSessionStart } from "../../agent-debugger/utils/date-utils";
import { inlinePreviewRows } from "../../agent-debugger/components/common/InlinePreviewList";
import { ConversationJsonDialog } from "./ConversationJsonDialog";
import { ConversationPreview, FlowPreview, InsightsPreview, UsagePreview } from "./InlinePreviews";
import {
  clearFullscreenIntent,
  readFullscreenIntent,
  saveFullscreenIntent,
  type DebuggerTab,
  type FullscreenIntent,
} from "./fullscreenIntent";
import { downloadJson } from "../shared/download";
import type { InitialDataLoadError } from "../shared/initial-tool-data";

interface DebuggerEnvironment {
  id: string;
  name: string;
  url: string;
  region?: string;
}

interface DebuggerAgent {
  id: string;
  name: string;
  componentIdUnique?: string;
  schemaName?: string;
  experience: "classic" | "generative";
}

interface DebuggerConversation {
  id: string;
  name: string;
  createdOn?: string;
  conversationStartTime?: string;
  sessionCount?: number;
}

interface DebuggerData {
  state?: string;
  restoring?: boolean;
  deferred?: string[];
  dataLoadError?: InitialDataLoadError;
  selectionId?: string;
  targetResolved?: boolean;
  environments?: DebuggerEnvironment[];
  environment?: DebuggerEnvironment;
  environmentId?: string;
  agents?: DebuggerAgent[];
  agent?: DebuggerAgent;
  agentId?: string;
  conversations?: DebuggerConversation[];
  conversation?: DebuggerConversation;
  conversationId?: string;
  processedTranscript?: ProcessedTranscript;
  conversationData?: ConversationData;
  agentConfig?: AgentConfig;
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  connectedAgents?: ConnectedAgentInfo[];
  recommendations?: Recommendation[];
  sessions?: SessionSummary[];
  usage?: UsageDiagnostics;
  usageBySession?: Record<string, UsageDiagnostics>;
  transcriptJson?: ConversationTranscriptJson;
  turn?: ProcessedTurn;
  connectedAgent?: ConnectedAgentInfo;
  error?: { code?: string; message?: string };
  inlineLayout?: InlineLayout;
}

/**
 * Optional top-level field of the open_agent_debugger structuredContent. "full" shows the same full
 * tabs inline as in full screen; a missing value or "preview" keeps the finite inline previews.
 */
type InlineLayout = "full" | "preview";

function inlineLayoutOf(data: DebuggerData | undefined): InlineLayout | undefined {
  const value = data?.inlineLayout;
  return value === "full" || value === "preview" ? value : undefined;
}

type AnalysisTab = DebuggerTab;
type LoadingOperation = "agents" | "conversations" | "analysis" | "turn" | "child";
interface AnalysisTarget {
  environmentId: string;
  agentId: string;
  conversationId: string;
}

function analysisTarget(data: DebuggerData): AnalysisTarget | undefined {
  const environmentId = data.environmentId ?? data.environment?.id;
  const agentId = data.agentId ?? data.agent?.id;
  const conversationId = data.conversation?.name ?? data.conversation?.id ?? data.conversationId;
  return data.processedTranscript && environmentId && agentId && conversationId
    ? { environmentId, agentId, conversationId } : undefined;
}

// Lets the shared picker shrink in this row; the Combobox input has an intrinsic width.
const shrinkablePicker = {
  "& .fui-Field > div": { minWidth: 0 },
  "& .fui-Combobox__input": { minWidth: 0 },
};

const useStyles = makeStyles({
  root: {
    minWidth: 0,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  app: {
    minHeight: 0,
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    ...shorthands.gap(tokens.spacingHorizontalL),
  },
  titleText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  subtitle: { color: tokens.colorNeutralForeground2 },
  selectors: {
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "nowrap",
    width: "100%",
    minWidth: 0,
    ...shorthands.gap(tokens.spacingHorizontalM),
    "@media (max-width: 479px)": { flexWrap: "wrap" },
  },
  picker: {
    flex: "1 1 0",
    minWidth: 0,
    maxWidth: "360px",
    ...shrinkablePicker,
    "@media (max-width: 479px)": { flexBasis: "100%", maxWidth: "none" },
  },
  analyze: { flexShrink: 0, marginLeft: "auto" },
  analysisToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    ...shorthands.gap(tokens.spacingHorizontalM),
    flexWrap: "nowrap",
    minWidth: 0,
    paddingTop: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
  },
  tabs: {
    flex: "1 1 auto",
    minWidth: 0,
    flexWrap: "nowrap",
    overflow: "hidden",
    "& .fui-Tab": { flexShrink: 0 },
  },
  tabLabel: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, minWidth: 0, whiteSpace: "nowrap" },
  tabCount: { flexShrink: 0 },
  sessionPicker: {
    width: "180px",
    flexShrink: 0,
    paddingBottom: tokens.spacingVerticalXS,
    ...shrinkablePicker,
  },
  moreTabsMenu: {
    position: "fixed",
    zIndex: 1000,
    minWidth: "200px",
    display: "flex",
    flexDirection: "column",
    ...shorthands.padding(tokens.spacingVerticalXS),
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow16,
  },
  moreTabsItem: {
    justifyContent: "flex-start",
    fontWeight: tokens.fontWeightRegular,
  },
  content: {
    minHeight: 0,
    flexGrow: 1,
    overflow: "auto",
    paddingTop: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalXXL,
  },
  empty: {
    minHeight: "300px",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    color: tokens.colorNeutralForeground2,
  },
  emptyInner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    maxWidth: "440px",
    ...shorthands.gap(tokens.spacingVerticalM),
  },
  emptyImage: {
    width: "180px",
    maxWidth: "60%",
    height: "auto",
  },
  // Inline, the view fits the host height budget: the root never scrolls, and the previews fit
  // without a scroll. Only the full Performance timeline scrolls, inside this content area.
  inlineContent: {
    flex: "1 1 0",
    overflow: "hidden",
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: 0,
  },
  inlineEmpty: {
    flex: "1 1 0",
    minHeight: 0,
    overflow: "hidden",
  },
  // A compact title and gap keep the full title and detail visible below the inline pickers.
  inlineEmptyInner: {
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  inlineStatus: {
    display: "flex",
    alignItems: "center",
    minWidth: 0,
    ...shorthands.gap(tokens.spacingHorizontalM),
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalS,
  },
  displayFeedback: {
    display: "block",
    color: tokens.colorNeutralForeground2,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
  },
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
});

interface TabEntry {
  id: AnalysisTab;
  label: string;
  icon: ReactElement;
  count?: number;
  countLabel?: string;
}

function OverflowTabItem({ entry, onSelect }: { entry: TabEntry; onSelect: (id: AnalysisTab) => void }) {
  const styles = useStyles();
  const visible = useIsOverflowItemVisible(entry.id);
  if (visible) return null;
  return (
    <Button role="menuitem" appearance="subtle" className={styles.moreTabsItem} icon={entry.icon} onClick={() => onSelect(entry.id)}>
      {entry.count === undefined ? entry.label : `${entry.label} (${entry.count})`}
    </Button>
  );
}

function OverflowTabsMenu({ entries, onSelect }: { entries: readonly TabEntry[]; onSelect: (id: AnalysisTab) => void }) {
  const styles = useStyles();
  const { ref, isOverflowing } = useOverflowMenu<HTMLButtonElement>();
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number }>();
  const close = useCallback((focusTrigger: boolean) => {
    setPosition(undefined);
    if (focusTrigger) ref.current?.focus();
  }, [ref]);
  useEffect(() => {
    if (!position) return;
    popupRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popupRef.current?.contains(target) && !ref.current?.contains(target)) close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
    };
  }, [position, close, ref]);
  if (!isOverflowing) return null;
  const toggle = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (position || !rect) {
      close(false);
      return;
    }
    setPosition({ top: rect.bottom + 4, right: Math.max(4, document.documentElement.clientWidth - rect.right) });
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(popupRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close(true);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && items.length) {
      event.preventDefault();
      const index = items.indexOf(event.target as HTMLElement);
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };
  return (
    <>
      <Button
        ref={ref}
        appearance="transparent"
        icon={<MoreHorizontal20Regular />}
        aria-label="More tabs"
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        onClick={toggle}
      />
      {position && <Portal>
        <div ref={popupRef} role="menu" aria-label="More tabs" className={styles.moreTabsMenu} style={position} onKeyDown={onKeyDown}>
          {entries.map((entry) => (
            <OverflowTabItem key={entry.id} entry={entry} onSelect={(id) => { onSelect(id); close(true); }} />
          ))}
        </div>
      </Portal>}
    </>
  );
}

function structured(result: unknown): DebuggerData {
  return ((result as { structuredContent?: DebuggerData })?.structuredContent ?? {}) as DebuggerData;
}

/** A case-insensitive list key for an environment, or for an environment and an agent. */
function listKey(...ids: string[]): string {
  return ids.map((id) => id.toLowerCase()).join("|");
}

/**
 * Keeps the full agent and conversation lists of host data for the life of the view.
 * A conversation list for one explicit conversation ID is a filtered list, not the full list of the agent.
 */
function cacheLists(
  data: DebuggerData,
  agentLists: Map<string, DebuggerAgent[]>,
  conversationLists: Map<string, DebuggerConversation[]>,
) {
  const environmentId = data.environmentId ?? data.environment?.id;
  if (!environmentId) return;
  if (data.agents) agentLists.set(listKey(environmentId), data.agents);
  const agentId = data.agentId ?? data.agent?.id;
  if (!agentId || !data.conversations) return;
  const selected = (data.conversationId ?? data.conversation?.id)?.trim().toLowerCase();
  const filtered = Boolean(selected) && data.conversations.every((item) =>
    `${item.id} ${item.name}`.toLowerCase().includes(selected ?? ""));
  if (!filtered) conversationLists.set(listKey(environmentId, agentId), data.conversations);
}

function transcriptData(transcript: ProcessedTranscript): FluentTranscriptData {
  return {
    activities: transcript.turns.map((turn) => ({
      id: turn.id,
      type: "message",
      timestamp: turn.timestamp,
      from: {
        id: turn.role,
        role: turn.role === "assistant" ? "bot" : "user",
      },
      text: turn.content,
    })),
  } as FluentTranscriptData;
}

function sessionKey(turn: ProcessedTurn): string | undefined {
  return turn.activities.find((activity) => activity.mergedSessionKey)?.mergedSessionKey;
}

function scopedTranscript(
  transcript: ProcessedTranscript,
  selectedSession: string,
  summary?: SessionSummary,
): ProcessedTranscript {
  if (selectedSession === "all") return transcript;
  const turns = transcript.turns.filter((turn) => sessionKey(turn) === selectedSession);
  const times = turns.map((turn) => Date.parse(turn.timestamp)).filter(Number.isFinite);
  return {
    ...transcript,
    turns,
    generalInfo: {
      ...transcript.generalInfo,
      turnCount: turns.filter((turn) => turn.role === "user").length,
      durationMs: summary?.durationMs ?? (times.length ? Math.max(...times) - Math.min(...times) : transcript.generalInfo.durationMs),
    },
  };
}

function conversationForTranscript(
  source: ConversationData | undefined,
  transcript: ProcessedTranscript,
  summary?: SessionSummary,
): ConversationData | undefined {
  if (!source) return undefined;
  const signatures = new Set(transcript.turns.map((turn) =>
    `${turn.role === "assistant" ? "bot" : "user"}|${turn.timestamp}|${turn.content}`));
  return {
    ...source,
    messages: source.messages.filter((message) =>
      signatures.has(`${message.role}|${message.timestamp}|${message.content}`)),
    generalInfo: {
      ...source.generalInfo,
      numberOfTurns: transcript.generalInfo.turnCount,
      ...(summary ? { totalDuration: summary.durationMs, globalOutcome: summary.outcome, conversationStartTime: summary.startTimeUtc } : {}),
    },
  };
}

// Some hosts (for example the Copilot Studio test chat) refuse tool calls from the view with
// MCP -32000. Turn details and child transcripts are optional reads: the opener data stays.
const HOST_REFUSAL = /-32000|MCP integration is unavailable/i;

function optionalReadMessage(caught: unknown, unavailable: string, failed: string): string {
  const message = caught instanceof Error ? caught.message : "";
  if (HOST_REFUSAL.test(message)) return unavailable;
  return message ? `${failed} ${message}` : failed;
}

export function AgentDebuggerApp() {
  const styles = useStyles();
  const { app, data, host, theme, toolInput, replaceData, replaceMetadata, readInitialResult } = useMcpApp();
  const initial = (data ?? {}) as DebuggerData;
  const [current, setCurrent] = useState<DebuggerData>(initial);
  // The first valid inlineLayout stays for the life of the view; later results without it do not reset it.
  const [inlineLayout, setInlineLayout] = useState<InlineLayout | undefined>(() => inlineLayoutOf(initial));
  const keepInlineLayout = useCallback((next: DebuggerData) => {
    const layout = inlineLayoutOf(next);
    if (layout) setInlineLayout((value) => value ?? layout);
  }, []);
  const [environmentId, setEnvironmentId] = useState(initial.environmentId ?? initial.environment?.id ?? "");
  const [agentId, setAgentId] = useState(initial.agentId ?? initial.agent?.id ?? "");
  const [conversationId, setConversationId] = useState(initial.conversationId ?? initial.conversation?.id ?? "");
  const [tab, setTab] = useState<AnalysisTab>("performance");
  const [selectedSession, setSelectedSession] = useState("all");
  const [selectedTurnId, setSelectedTurnId] = useState(
    initial.processedTranscript?.turns.find((turn) => turn.role === "user")?.id ?? "",
  );
  const [transcript, setTranscript] = useState<ProcessedTranscript | undefined>(initial.processedTranscript);
  const [connectedAgents, setConnectedAgents] = useState(initial.connectedAgents ?? []);
  const [pending, setPending] = useState<Record<LoadingOperation, boolean>>({ agents: false, conversations: false, analysis: false, turn: false, child: false });
  const loading = (["analysis", "turn", "child", "agents", "conversations"] as const).find((operation) => pending[operation]);
  const markLoading = useCallback((operation: LoadingOperation, active: boolean) => {
    setPending((value) => ({ ...value, [operation]: active }));
  }, []);
  const [loadedTarget, setLoadedTarget] = useState<AnalysisTarget | undefined>(() => analysisTarget(initial));
  const [jsonOpen, setJsonOpen] = useState(false);
  const [error, setError] = useState(initial.error?.message ?? "");
  const [reloading, setReloading] = useState(false);
  const [agentListError, setAgentListError] = useState("");
  const [conversationSearchError, setConversationSearchError] = useState("");
  // Server results of a conversation search, for one environment and agent. Undefined: the loaded list shows.
  const [conversationResults, setConversationResults] = useState<{ key: string; conversations: DebuggerConversation[] }>();
  // A failed optional turn-details read shows as a note at the turn, not as the global error.
  const [turnDetailNote, setTurnDetailNote] = useState<{ turnId: string; text: string }>();
  const agentRequest = useRef(0);
  const conversationRequest = useRef(0);
  const analysisRequest = useRef(0);
  const turnRequest = useRef(0);
  const childRequests = useRef(new Set<string>());
  const analysisEpoch = useRef(0);
  const currentRef = useRef(current);
  const publishedData = useRef<DebuggerData>();
  // The full lists for the life of the view: agents for each environment, conversations for each environment and agent.
  // The first render already uses the lists of the opener data.
  const [{ agentLists, conversationLists }] = useState(() => {
    const lists = { agentLists: new Map<string, DebuggerAgent[]>(), conversationLists: new Map<string, DebuggerConversation[]>() };
    cacheLists(initial, lists.agentLists, lists.conversationLists);
    return lists;
  });
  currentRef.current = current;
  const bootstrapTranscript = useRef(initial.processedTranscript);
  const loadedTargetRef = useRef(loadedTarget);
  loadedTargetRef.current = loadedTarget;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const inlineRootRef = useRef<HTMLDivElement>(null);
  // The shared bootstrap template pads #root; the reported frame size must include it, or the host frame scrolls.
  const [frameInset] = useState(measureFrameInset);
  const target = useRef({ environmentId, agentId, conversationId });
  target.current = { environmentId, agentId, conversationId };
  const fullscreen = host?.displayMode === "fullscreen";
  const [displayRefused, setDisplayRefused] = useState(false);
  const [displayFeedback, setDisplayFeedback] = useState("");
  const [fullscreenIntent, setFullscreenIntent] = useState<FullscreenIntent>();
  const [timelineFocus, setTimelineFocus] = useState<TimelineTurnTarget>();
  const [mainElement, setMainElement] = useState<HTMLElement | null>(null);
  const [mainHeight, setMainHeight] = useState(0);
  // The pickers and Analyze are only in full screen. Without full screen (not offered or
  // refused), the user names the agent and conversation in chat.
  const fullscreenAvailable = fullscreenOffered(host) && !displayRefused;
  // With inlineLayout "full", inline shows the same full tabs as full screen, and <main> scrolls inside.
  const fullInline = !fullscreen && inlineLayout === "full";

  useEffect(() => {
    if ((current.state && !current.restoring) || error) return;
    const wait = window.setTimeout(() => setError("The host has not delivered Agent Debugger data. Reload this view; no conversation was analyzed."), 15_000);
    return () => window.clearTimeout(wait);
  }, [current.state, current.restoring, error]);

  useEffect(() => {
    if (data === null && currentRef.current.state) return;
    const next = (data ?? {}) as DebuggerData;
    // The view's own data can hold empty lists while a list loads. Only host data fills the caches.
    if (data !== publishedData.current) cacheLists(next, agentLists, conversationLists);
    setCurrent(next);
    keepInlineLayout(next);
    setError(next.error?.message ?? "");
    if (next.environmentId || next.environment) {
      setEnvironmentId(next.environmentId ?? next.environment?.id ?? "");
    }
    if (next.agentId || next.agent) setAgentId(next.agentId ?? next.agent?.id ?? "");
    if (data !== publishedData.current && (next.conversationId || next.conversation?.id)) {
      setConversationId(next.conversationId ?? next.conversation?.id ?? "");
    }
    if (next.processedTranscript !== bootstrapTranscript.current) {
      bootstrapTranscript.current = next.processedTranscript;
      if (data !== publishedData.current) {
        analysisEpoch.current += 1;
        analysisRequest.current += 1;
        turnRequest.current += 1;
        agentRequest.current += 1;
        conversationRequest.current += 1;
        childRequests.current.clear();
        setPending({ agents: false, conversations: false, analysis: false, turn: false, child: false });
      }
      setLoadedTarget(analysisTarget(next));
      setTranscript(next.processedTranscript);
      setTurnDetailNote(undefined);
      setJsonOpen(false);
      setSelectedTurnId((selected) =>
        next.processedTranscript?.turns.some((turn) => turn.id === selected)
          ? selected
          : next.processedTranscript?.turns.find((turn) => turn.role === "user")?.id ?? "");
    }
    if (next.connectedAgents) setConnectedAgents(next.connectedAgents);
  }, [data, keepInlineLayout]);

  const update = useCallback((next: DebuggerData) => {
    const merged = { ...currentRef.current, ...next, restoring: next.restoring ?? false,
      deferred: next.deferred, dataLoadError: next.dataLoadError, error: next.error };
    currentRef.current = merged;
    publishedData.current = merged;
    setCurrent(merged);
    keepInlineLayout(next);
    replaceData(merged);
    if (next.processedTranscript) {
      setTranscript(next.processedTranscript);
      setTurnDetailNote(undefined);
    }
    if (next.processedTranscript && next.conversation) setConversationId(next.conversation.id);
    if (next.connectedAgents) setConnectedAgents(next.connectedAgents);
    setError(next.error?.message ?? "");
  }, [replaceData, keepInlineLayout]);

  const reloadInitialData = async () => {
    if (!app || reloading) return;
    const epoch = analysisEpoch.current;
    const selection = target.current;
    const args: Record<string, unknown> = environmentId && agentId ? {
      environmentId, agentId,
      ...(selection.conversationId ? { conversationId: selection.conversationId } : {}),
    }
      : Object.fromEntries(["environmentId", "environmentName", "agentId", "agentName", "conversationId"].flatMap(key =>
        typeof toolInput?.[key] === "string" ? [[key, toolInput[key]]] : []));
    setReloading(true);
    setError("");
    try {
      const result = await app.callServerTool({ name: "open_agent_debugger", arguments: args });
      if (!readInitialResult) throw new Error("Debugger data recovery is not available.");
      const restored = await readInitialResult(result);
      if (epoch !== analysisEpoch.current || selection.environmentId !== target.current.environmentId
        || selection.agentId !== target.current.agentId || selection.conversationId !== target.current.conversationId) return;
      const next = restored.data as DebuggerData;
      if (next.error) throw new Error(next.error.message);
      if ((selection.environmentId && (next.environmentId ?? next.environment?.id)?.toLowerCase() !== selection.environmentId.toLowerCase())
        || (selection.agentId && (next.agentId ?? next.agent?.id)?.toLowerCase() !== selection.agentId.toLowerCase())
        || (selection.conversationId && (next.conversationId ?? next.conversation?.id)?.toLowerCase() !== selection.conversationId.toLowerCase())) {
        throw new Error("The restored Debugger data does not match the selected target or conversation.");
      }
      replaceMetadata(restored.metadata);
      cacheLists(next, agentLists, conversationLists);
      update(next);
    } catch (caught) {
      if (epoch === analysisEpoch.current && selection.environmentId === target.current.environmentId
        && selection.agentId === target.current.agentId && selection.conversationId === target.current.conversationId) setError(caught instanceof Error ? caught.message : "Unable to restore Agent Debugger data.");
    } finally {
      setReloading(false);
    }
  };

  const clearAnalysis = () => {
    analysisEpoch.current += 1;
    analysisRequest.current += 1;
    turnRequest.current += 1;
    childRequests.current.clear();
    setLoadedTarget(undefined);
    loadedTargetRef.current = undefined;
    setTranscript(undefined);
    setTurnDetailNote(undefined);
    setConnectedAgents([]);
    setSelectedSession("all");
    setSelectedTurnId("");
    setJsonOpen(false);
    setPending({ agents: false, conversations: false, analysis: false, turn: false, child: false });
  };

  const selectConversation = (id: string) => {
    if (id === conversationId) return;
    setConversationId(id);
    if (currentRef.current.deferred?.includes("analysis")) {
      clearAnalysis();
      update({ state: "conversations", conversationId: id || undefined, conversation: undefined, processedTranscript: undefined });
    } else update({ conversationId: id || undefined });
  };

  const loadAgents = async (id: string) => {
    const request = ++agentRequest.current;
    conversationRequest.current += 1;
    setEnvironmentId(id);
    setAgentId("");
    setConversationId("");
    clearAnalysis();
    setConversationResults(undefined);
    setAgentListError("");
    setConversationSearchError("");
    // A loaded agent list shows at once, with no call and no spinner.
    const cached = id ? agentLists.get(listKey(id)) : undefined;
    update({
      ...(cached ? { state: "agents" } : {}),
      targetResolved: false, environmentId: id, environment: currentRef.current.environments?.find((item) => item.id === id),
      agents: cached ?? [], agent: undefined, agentId: undefined, conversations: [],
      conversation: undefined, processedTranscript: undefined,
    });
    setError("");
    if (!app || !id || cached) return;
    markLoading("agents", true);
    try {
      const next = structured(await app.callServerTool({
        name: "list_debugger_agents",
        arguments: { environmentId: id },
      }));
      if (request !== agentRequest.current) return;
      if (next.error) throw new Error(next.error.message);
      const agents = next.agents ?? [];
      agentLists.set(listKey(id), agents);
      update({
        ...next,
        environment: current.environments?.find((item) => item.id === id),
        environmentId: id,
        agents,
        conversations: [],
        conversation: undefined,
        conversationId: undefined,
        processedTranscript: undefined,
      });
    } catch (caught) {
      if (request === agentRequest.current) setError(caught instanceof Error ? caught.message : "Unable to load agents.");
    } finally {
      if (request === agentRequest.current) markLoading("agents", false);
    }
  };

  const loadConversations = async (id = agentId) => {
    const request = ++conversationRequest.current;
    setAgentId(id);
    setConversationId("");
    clearAnalysis();
    setConversationResults(undefined);
    setConversationSearchError("");
    setError("");
    const key = environmentId && id ? listKey(environmentId, id) : "";
    // A loaded conversation list shows at once, with no call and no spinner.
    const cached = key ? conversationLists.get(key) : undefined;
    const agents = (environmentId ? agentLists.get(listKey(environmentId)) : undefined) ?? currentRef.current.agents;
    const agent = agents?.find((item) => item.id === id)
      ?? (currentRef.current.agent?.id === id ? currentRef.current.agent : undefined);
    update({
      ...(cached ? { state: "conversations" } : {}),
      agentId: id, agent,
      conversations: cached ?? [], conversation: undefined, conversationId: undefined, processedTranscript: undefined,
    });
    if (!app || !environmentId || !id || cached) return;
    markLoading("conversations", true);
    try {
      const next = structured(await app.callServerTool({
        name: "list_debugger_conversations",
        arguments: {
          environmentId,
          agentId: id,
          limit: 50,
        },
      }));
      if (request !== conversationRequest.current) return;
      if (next.error) throw new Error(next.error.message);
      const conversations = next.conversations ?? [];
      conversationLists.set(key, conversations);
      update({
        ...next,
        agent,
        agentId: id,
        conversations,
        conversation: undefined,
        conversationId: undefined,
        processedTranscript: undefined,
      });
    } catch (caught) {
      if (request === conversationRequest.current) setError(caught instanceof Error ? caught.message : "Unable to load conversations.");
    } finally {
      if (request === conversationRequest.current) markLoading("conversations", false);
    }
  };

  // Opening the Agent picker loads the agent list only when it is not loaded (for example, after a failed restore).
  const ensureAgents = async () => {
    const id = target.current.environmentId;
    if (!app || !id || pendingRef.current.agents || agentLists.has(listKey(id))) return;
    // A running restore delivers the list.
    if (currentRef.current.restoring && !currentRef.current.agents && !error) return;
    const request = ++agentRequest.current;
    markLoading("agents", true);
    setAgentListError("");
    try {
      const next = structured(await app.callServerTool({
        name: "list_debugger_agents", arguments: { environmentId: id, query: "" },
      }));
      if (request !== agentRequest.current || target.current.environmentId !== id) return;
      if (next.error) throw new Error(next.error.message);
      const agents = next.agents ?? [];
      agentLists.set(listKey(id), agents);
      setCurrent((value) => ({ ...value, agents }));
    } catch (caught) {
      if (request === agentRequest.current) setAgentListError(caught instanceof Error ? caught.message : "Unable to load agents.");
    } finally {
      if (request === agentRequest.current) markLoading("agents", false);
    }
  };

  // Opening the Conversation picker loads the full conversation list only when it is not loaded.
  const ensureConversations = async () => {
    const selection = target.current;
    if (!app || !selection.environmentId || !selection.agentId || pendingRef.current.conversations) return;
    const key = listKey(selection.environmentId, selection.agentId);
    if (conversationLists.has(key)) return;
    if (currentRef.current.restoring && !currentRef.current.conversations && !error) return;
    const request = ++conversationRequest.current;
    markLoading("conversations", true);
    setConversationSearchError("");
    try {
      const next = structured(await app.callServerTool({
        name: "list_debugger_conversations",
        arguments: { environmentId: selection.environmentId, agentId: selection.agentId, query: "", limit: 50 },
      }));
      if (request !== conversationRequest.current
        || target.current.environmentId !== selection.environmentId
        || target.current.agentId !== selection.agentId) return;
      if (next.error) throw new Error(next.error.message);
      const conversations = next.conversations ?? [];
      conversationLists.set(key, conversations);
      setConversationResults(undefined);
      setCurrent((value) => ({ ...value, conversations }));
    } catch (caught) {
      if (request === conversationRequest.current) {
        setConversationSearchError(caught instanceof Error ? caught.message : "Unable to load conversations.");
      }
    } finally {
      if (request === conversationRequest.current) markLoading("conversations", false);
    }
  };

  // A typed query always searches the server. The loaded list can be incomplete also with fewer than 50 items:
  // the server reads at most 250 transcript rows and removes duplicate names.
  // An empty query restores the loaded list without a call.
  const searchConversations = useCallback(async (query: string) => {
    const selection = target.current;
    if (!app || !selection.environmentId || !selection.agentId) return;
    const key = listKey(selection.environmentId, selection.agentId);
    const request = ++conversationRequest.current;
    setConversationSearchError("");
    if (!query) {
      setConversationResults(undefined);
      markLoading("conversations", false);
      return;
    }
    markLoading("conversations", true);
    try {
      const next = structured(await app.callServerTool({
        name: "list_debugger_conversations",
        arguments: { environmentId: selection.environmentId, agentId: selection.agentId, query, limit: 50 },
      }));
      if (request !== conversationRequest.current
        || target.current.environmentId !== selection.environmentId
        || target.current.agentId !== selection.agentId) return;
      if (next.error) throw new Error(next.error.message);
      setConversationResults({ key, conversations: next.conversations ?? [] });
    } catch (caught) {
      if (request === conversationRequest.current) {
        setConversationSearchError(caught instanceof Error ? caught.message : "Unable to search conversations.");
        setConversationResults({ key, conversations: [] });
      }
    } finally {
      if (request === conversationRequest.current) markLoading("conversations", false);
    }
  }, [app, markLoading]);

  const analyze = async () => {
    const id = conversationId;
    if (!app || !environmentId || !agentId || !id || pendingRef.current.analysis) return;
    const request = ++analysisRequest.current;
    analysisEpoch.current += 1;
    turnRequest.current += 1;
    childRequests.current.clear();
    markLoading("turn", false);
    markLoading("child", false);
    setJsonOpen(false);
    setConversationId(id);
    markLoading("analysis", true);
    setError("");
    try {
      const next = structured(await app.callServerTool({
        name: "analyze_debugger_conversation",
        arguments: { environmentId, agentId, conversationId: id },
      }));
      if (request !== analysisRequest.current) return;
      if (next.error || !next.processedTranscript) {
        throw new Error(next.error?.message ?? "The transcript could not be analyzed.");
      }
      update(next);
      const analyzed = analysisTarget({ ...next, environmentId, agentId });
      loadedTargetRef.current = analyzed;
      setLoadedTarget(analyzed);
      setTranscript(next.processedTranscript);
      setConnectedAgents(next.connectedAgents ?? []);
      setSelectedSession("all");
      setSelectedTurnId(next.processedTranscript.turns.find((turn) => turn.role === "user")?.id ?? "");
      setTab("performance");
    } catch (caught) {
      if (request === analysisRequest.current) setError(caught instanceof Error ? caught.message : "Unable to analyze the conversation.");
    } finally {
      if (request === analysisRequest.current) markLoading("analysis", false);
    }
  };

  const loadTurn = useCallback(async (turnId: string) => {
    setSelectedTurnId(turnId);
    const selection = loadedTargetRef.current;
    if (!app || !selection || pendingRef.current.analysis) return;
    const epoch = analysisEpoch.current;
    const request = ++turnRequest.current;
    markLoading("turn", true);
    try {
      const next = structured(await app.callServerTool({
        name: "get_debugger_turn_details",
        arguments: { ...selection, turnId },
      }));
      if (epoch !== analysisEpoch.current || request !== turnRequest.current) return;
      const turn = next.turn;
      if (next.error || !turn) throw new Error(next.error?.message ?? "Turn details are unavailable.");
      setTranscript((value) => value
        ? { ...value, turns: value.turns.map((candidate) => candidate.id === turn.id ? turn : candidate) }
        : value);
      setTurnDetailNote((note) => note?.turnId === turnId ? undefined : note);
    } catch (caught) {
      // The opener data and the selected turn stay; only this turn shows a note.
      if (epoch === analysisEpoch.current && request === turnRequest.current) {
        setTurnDetailNote({ turnId, text: optionalReadMessage(caught,
          "Activity details are not available in this host.",
          "Activity details could not be loaded.") });
      }
    } finally {
      if (request === turnRequest.current) markLoading("turn", false);
    }
  }, [app, markLoading]);

  const loadChildTranscript = useCallback(async (connectedAgent: ConnectedAgentInfo) => {
    const selection = loadedTargetRef.current;
    const sessionId = connectedAgent.sessionId;
    if (!app || !selection || !sessionId || pendingRef.current.analysis) return;
    const epoch = analysisEpoch.current;
    const key = `${epoch}:${sessionId}`;
    if (childRequests.current.has(key)) return;
    childRequests.current.add(key);
    markLoading("child", true);
    const markAgent = (patch: Partial<ConnectedAgentInfo>) => setConnectedAgents((agents) => agents.map((candidate) =>
      candidate.sessionId === sessionId ? { ...candidate, ...patch } : candidate));
    markAgent({ isFetching: true, fetchError: undefined });
    try {
      const next = structured(await app.callServerTool({
        name: "get_debugger_child_transcript",
        arguments: {
          ...selection,
          sessionId,
        },
      }));
      if (epoch !== analysisEpoch.current) return;
      const loaded = next.connectedAgent;
      if (next.error || !loaded) {
        throw new Error(next.error?.message ?? "Connected-agent details are unavailable.");
      }
      setConnectedAgents((agents) => agents.map((candidate) =>
        candidate.sessionId === loaded.sessionId || candidate.sessionId === sessionId
          ? { ...loaded, isFetching: false }
          : candidate));
    } catch (caught) {
      // The failure shows at the connected agent, not as the global error.
      if (epoch === analysisEpoch.current) {
        markAgent({ isFetching: false, fetchError: optionalReadMessage(caught,
          "Child transcript is not available in this host.",
          "Child transcript could not be loaded.") });
      }
    } finally {
      if (childRequests.current.delete(key)) markLoading("child", childRequests.current.size > 0);
    }
  }, [app, markLoading]);

  const loadConversationJson = useCallback(async () => {
    if (!app || !loadedTarget) throw new Error("Analyze a saved conversation before you open its full JSON.");
    const next = structured(await app.callServerTool({
      name: "get_debugger_conversation_transcript",
      arguments: { ...loadedTarget },
    }));
    if (next.error || !next.transcriptJson) throw new Error(next.error?.message ?? "Full conversation JSON is unavailable.");
    if (next.transcriptJson.conversationId !== loadedTarget.conversationId) {
      throw new Error("The JSON response does not match the conversation shown. No export was loaded.");
    }
    return next.transcriptJson;
  }, [app, loadedTarget]);

  const downloadTurnJson = useCallback(async (text: string, fileName: string) => {
    if (!app) throw new Error("The MCP host is not connected.");
    await downloadJson(app, fileName, text);
  }, [app]);

  const openFullscreen = async (intent?: FullscreenIntent) => {
    if (!app) return;
    const conversationKey = loadedTargetRef.current?.conversationId;
    setDisplayFeedback("");
    setFullscreenIntent(intent);
    // The host can mount a new view for full screen; the stored intent lets that view open the same tab and turn.
    if (intent) saveFullscreenIntent(conversationKey, intent);
    else clearFullscreenIntent(conversationKey);
    let refused: boolean;
    try {
      const display = await app.requestDisplayMode({ mode: "fullscreen" });
      refused = display?.mode !== "fullscreen";
    } catch {
      refused = true;
    }
    if (refused) {
      setFullscreenIntent(undefined);
      clearFullscreenIntent(conversationKey);
      setDisplayRefused(true);
      setDisplayFeedback("Fullscreen is not available in this host.");
    } else setDisplayRefused(false);
  };

  const loadedConversationId = loadedTarget?.conversationId;
  useEffect(() => {
    if (!fullscreen || !loadedConversationId) return;
    const intent = fullscreenIntent ?? readFullscreenIntent(loadedConversationId);
    clearFullscreenIntent(loadedConversationId);
    if (!intent) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setFullscreenIntent(undefined);
    setTab(intent.tab);
    if (intent.tab === "performance" && (intent.turnNumber !== undefined || intent.messageId)) {
      setTimelineFocus({ turnNumber: intent.turnNumber, messageId: intent.messageId });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fullscreen, loadedConversationId, fullscreenIntent]);

  // Inline previews choose their row count from the measured content height.
  useLayoutEffect(() => {
    if (!mainElement || fullscreen) return undefined;
    const measure = () => setMainHeight(mainElement.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(mainElement);
    return () => observer.disconnect();
  }, [mainElement, fullscreen]);

  const inlineBudget = inlineHeightBudget(host?.containerDimensions);
  const inlineHeight = Math.min(760, inlineContentHeight(host?.containerDimensions, frameInset.height));
  const hasState = Boolean(current.state);
  useEffect(() => {
    const element = inlineRootRef.current;
    if (!app || fullscreen || !hasState || !element) return;

    let lastWidth = 0;
    let lastHeight = 0;
    const reportSize = () => {
      const bounds = element.getBoundingClientRect();
      const width = Math.ceil(bounds.width + frameInset.width);
      // The reported inline height never exceeds the host budget.
      const height = Math.min(inlineBudget, Math.ceil(bounds.height + frameInset.height));
      if (bounds.width <= 0 || bounds.height <= 0 || (width === lastWidth && height === lastHeight)) return;
      lastWidth = width;
      lastHeight = height;
      void app.sendSizeChanged({ width, height });
    };
    const observer = new ResizeObserver(reportSize);
    observer.observe(element);
    reportSize();
    return () => observer.disconnect();
  }, [app, fullscreen, hasState, frameInset, inlineBudget]);

  const sessionKeys = useMemo(
    () => Array.from(new Set(
      (transcript?.turns ?? []).map(sessionKey).filter((key): key is string => Boolean(key)),
    )),
    [transcript],
  );
  const selectedSummary = selectedSession === "all" ? undefined : current.sessions?.[sessionKeys.indexOf(selectedSession)];
  const scoped = useMemo(
    () => transcript ? scopedTranscript(transcript, selectedSession, selectedSummary) : undefined,
    [selectedSession, selectedSummary, transcript],
  );
  const selectedTurn = scoped?.turns.find((turn) => turn.id === selectedTurnId) ?? null;
  const selectedConversationData = scoped
    ? conversationForTranscript(current.conversationData, scoped, selectedSummary)
    : current.conversationData;
  const visibleRecommendations = useMemo(() => {
    const recommendations = current.recommendations ?? [];
    if (selectedSession === "all" || !scoped || !transcript) return uniqueRecommendations(recommendations);
    const visibleIds = new Set(scoped.turns.map((turn) => turn.id));
    const originalUserTurns = transcript.turns.filter((turn) => turn.role === "user");
    const visibleUserTurns = scoped.turns.filter((turn) => turn.role === "user");
    return uniqueRecommendations(recommendations.flatMap((recommendation) => {
      const turnId = recommendation.turnId ?? (recommendation.turnNumber ? originalUserTurns[recommendation.turnNumber - 1]?.id : undefined);
      if (turnId && !visibleIds.has(turnId)) return [];
      const turnNumber = turnId ? visibleUserTurns.findIndex((turn) => turn.id === turnId) + 1 : 0;
      return [{ ...recommendation, ...(turnNumber > 0 ? { turnNumber } : {}) }];
    }));
  }, [current.recommendations, scoped, selectedSession, transcript]);
  const usage = selectedSession === "all" ? current.usage : current.usageBySession?.[selectedSession];
  const usageScope = selectedSession === "all" ? "all loaded parent-agent sessions" : `parent-agent session ${sessionKeys.indexOf(selectedSession) + 1}`;
  // The cached full lists come first: later host data can omit a list, or hold one filtered conversation list.
  const loadedAgents = environmentId ? agentLists.get(listKey(environmentId)) : undefined;
  const agentList = loadedAgents ?? current.agents;
  const conversationKey = environmentId && agentId ? listKey(environmentId, agentId) : "";
  const loadedConversations = conversationKey ? conversationLists.get(conversationKey) : undefined;
  const conversationList = conversationKey && conversationResults?.key === conversationKey
    ? conversationResults.conversations
    : loadedConversations ?? current.conversations;
  const currentAgent = current.agent ?? agentList?.find((item) => item.id === agentId);
  const workflow = useWorkflowCanvasModel(scoped?.turns ?? [], current.componentNameBySchemaName, connectedAgents);
  const environment = current.environments?.find((item) => item.id === environmentId) ?? current.environment;
  const agent = agentList?.find((item) => item.id === agentId)
    ?? (current.agent?.id === agentId ? current.agent : undefined);
  const conversation = conversationList?.find((item) => item.id === conversationId)
    ?? current.conversations?.find((item) => item.id === conversationId)
    ?? (current.conversation?.id === conversationId ? current.conversation : undefined);
  const resolvedTarget = current.targetResolved === true && Boolean(environment && agent);
  const dateLabel = (value: string | undefined) => {
    if (!value || !Number.isFinite(Date.parse(value))) return "Start date not recorded";
    return new Date(value).toLocaleString();
  };
  const environmentOption = (item: DebuggerEnvironment): PickerOption => ({
    id: item.id, label: item.name, detail: item.region || item.url, icon: <Globe20Regular />,
  });
  const agentOption = (item: DebuggerAgent): PickerOption => ({
    id: item.id, label: item.name, detail: item.schemaName || `${item.experience} agent`, icon: <Bot24Regular />,
  });
  const conversationOption = (item: DebuggerConversation): PickerOption => ({
    id: item.id, label: item.name, detail: `${dateLabel(item.conversationStartTime ?? item.createdOn)} · ${item.id}`,
    icon: <ChatMultiple20Regular />,
  });

  const selectTurn = (turnId: string, nextTab?: AnalysisTab) => {
    if (nextTab) setTab(nextTab);
    void loadTurn(turnId);
  };

  if (!current.state) {
    return <div className="w-shell" style={fullscreen ? undefined : { minHeight: 0 }}>{error ? <>
      <MessageBar intent="error" role="alert"><MessageBarBody>{error}</MessageBarBody></MessageBar>
      <Button disabled={!app || reloading} onClick={() => void reloadInitialData()}>Reload Debugger data</Button>
    </> : <Spinner label="Loading Agent Debugger..." />}</div>;
  }

  const tabEntries: TabEntry[] = [
    { id: "performance", label: "Performance timeline", icon: <Timer20Regular /> },
    {
      id: "flow", label: "Execution flow", icon: <BranchFork20Regular />, count: workflow.stats.steps,
      countLabel: `${workflow.stats.steps} execution ${workflow.stats.steps === 1 ? "step" : "steps"}`,
    },
    { id: "conversation", label: "Conversation & activities", icon: <ChatMultiple20Regular /> },
    {
      id: "insights", label: "Agent insights", icon: <Lightbulb20Regular />, count: visibleRecommendations.length,
      countLabel: `${visibleRecommendations.length} ${visibleRecommendations.length === 1 ? "recommendation" : "recommendations"} in this view`,
    },
    { id: "usage", label: "Usage and credits", icon: <DataUsage20Regular /> },
  ];
  const restoreLabel = !current.conversations ? "Loading saved conversations..."
    : current.deferred?.includes("analysis") ? "Loading saved analysis..." : "Loading target choices...";
  // Inline only: full screen shows picker loads in the pickers, the analysis in Analyze and a restore in the empty state.
  const statusSpinner = loading
    ? <Spinner size="tiny" label={`Loading ${loading}...`} />
    : current.restoring && !error ? <Spinner size="tiny" label={restoreLabel} /> : null;
  const restoreSpinner = fullscreen && !scoped && !error
    && (Boolean(current.restoring) || Boolean(current.deferred?.includes("analysis")));
  const reloadVisible = Boolean(error && (current.restoring || current.dataLoadError));
  // Before the first measurement, estimate the content height from the inline chrome:
  // header, loading status (only while it shows), tabs, error, reload and display feedback.
  const inlineChromeEstimate = 46 + (statusSpinner ? 32 : 0) + (scoped ? 54 : 0)
    + (error ? 48 + (reloadVisible ? 32 : 0) : 0) + (displayFeedback ? 24 : 0);
  const inlineAvailable = Math.max(0, (mainHeight > 0 ? mainHeight : inlineHeight - inlineChromeEstimate) - 8);
  const previewRows = inlinePreviewRows(inlineAvailable);
  const usagePreviewRows = inlinePreviewRows(inlineAvailable, { caption: true });
  const showAll = (next: AnalysisTab) => (fullscreenAvailable ? () => void openFullscreen({ tab: next }) : undefined);
  const emptyLoading = Boolean(current.deferred?.includes("analysis")) || Boolean(current.restoring && !error) || Boolean(loading);
  // Inline, an empty Debugger asks for full screen, where the pickers are, or, without full screen, asks in chat.
  const showFullscreenCta = !fullscreen && fullscreenAvailable && !scoped && !emptyLoading;
  const askInChat = !fullscreen && !fullscreenAvailable && !scoped && !emptyLoading;
  const emptyTitle = error ? "Saved Debugger data could not be loaded"
    : current.deferred?.includes("analysis") ? "Loading saved analysis"
      : current.restoring && !current.conversations ? "Loading saved conversations"
        : resolvedTarget && current.conversations?.length === 0 ? "No saved conversations"
          : "Select a conversation to start debugging";
  const loadingConversationDetail = current.deferred?.includes("analysis") && conversationId
    ? `Loading saved conversation ${conversationId}.`
    : resolvedTarget && current.conversations?.length === 0
      ? "No saved conversations are available for this agent."
      : "";
  const emptyDetail = loadingConversationDetail
    || (resolvedTarget
      ? "Choose a conversation and select Analyze to see its saved transcript."
      : "Choose an environment, an agent and a conversation, then select Analyze.");

  const analysis = scoped
    ? (
        <>
          <div className={styles.analysisToolbar}>
            <Overflow minimumVisible={1} padding={0}>
              <TabList
                className={styles.tabs}
                aria-label="Debugger views"
                selectedValue={tab}
                onTabSelect={(_: SelectTabEvent, detail: SelectTabData) =>
                  setTab(detail.value as AnalysisTab)}
              >
                {tabEntries.map((entry) => (
                  <OverflowItem key={entry.id} id={entry.id} priority={entry.id === tab ? 2 : 1}>
                    <Tab value={entry.id} icon={entry.icon}>
                      <span className={styles.tabLabel}>
                        {entry.count === undefined ? entry.label : <>
                          <span>{entry.label}</span>
                          <Badge className={styles.tabCount} size="small" appearance="tint" aria-label={entry.countLabel}>{entry.count}</Badge>
                        </>}
                      </span>
                    </Tab>
                  </OverflowItem>
                ))}
                <OverflowTabsMenu entries={tabEntries} onSelect={setTab} />
              </TabList>
            </Overflow>
            {sessionKeys.length >= 2 && <div className={styles.sessionPicker}>
              <SearchablePicker
                label="Session"
                hideLabel
                hideHint
                selected={{ id: selectedSession, label: selectedSession === "all" ? "All sessions" : `Session ${sessionKeys.indexOf(selectedSession) + 1}` }}
                options={[{ id: "all", label: "All sessions" }, ...sessionKeys.map((key, index) => ({
                  id: key, label: `Session ${index + 1}`,
                  detail: formatSessionStart(current.sessions?.[index] ?? {}) || key.split("__seg")[0],
                }))]}
                onSelect={(id) => { setSelectedSession(id); setSelectedTurnId(""); }}
              />
            </div>}
            {loadedTarget && <Text size={200} className={styles.visuallyHidden}>Conversation shown: {loadedTarget.conversationId}. {selectedSession !== "all" && "Conversation-wide recommendations stay visible."}</Text>}
          </div>
          <main
            ref={setMainElement}
            className={fullscreen ? styles.content : mergeClasses(styles.content, styles.inlineContent)}
            style={fullInline
              ? { overflowY: "auto", overflowX: "auto", paddingBottom: tokens.spacingVerticalM }
              : !fullscreen && tab === "performance" ? { overflowY: "auto" } : undefined}
          >
            {tab === "performance" && (
              <PerformanceTimelineTab
                transcript={scoped}
                componentNameBySchemaName={current.componentNameBySchemaName}
                connectedAgents={connectedAgents}
                onTurnSelect={(turnId) => selectTurn(turnId)}
                onTurnNavigate={(nextTab, turnId) =>
                  selectTurn(turnId, nextTab === "flow" ? "flow" : "conversation")}
                focusTurn={timelineFocus}
                onFocusHandled={() => setTimelineFocus(undefined)}
              />
            )}
            {fullscreen || fullInline ? <>
            {tab === "flow" && (
              <ExecutionFlowTab
                transcript={scoped}
                componentNameBySchemaName={current.componentNameBySchemaName}
                connectedAgents={connectedAgents}
                environmentUrl={current.environment?.url}
                selectedTurnId={selectedTurnId}
                onInspectTurn={(turnId) => selectTurn(turnId, "conversation")}
                onDownloadJson={downloadTurnJson}
                downloadSupported={Boolean(app?.getHostCapabilities()?.downloadFile)}
                detailColumns={fullscreen}
                transcriptData={fullscreen ? transcriptData(scoped) : undefined}
                selectedTurn={selectedTurn}
                onSelectTurn={(turnId) => selectTurn(turnId)}
                onFetchChildTranscript={(agent) => void loadChildTranscript(agent)}
                isLoadingSteps={pending.turn || pending.child}
                activityNote={turnDetailNote?.turnId === selectedTurnId ? turnDetailNote.text : undefined}
              />
            )}
            {tab === "conversation" && (
              <ConversationActivitiesTab
                transcriptData={transcriptData(scoped)}
                selectedTurn={selectedTurn}
                selectedUserMessageId={selectedTurnId}
                componentNameBySchemaName={current.componentNameBySchemaName}
                connectedAgents={connectedAgents}
                environmentUrl={current.environment?.url}
                onUserMessageClick={(turnId) => selectTurn(turnId)}
                onFetchChildTranscript={(agent) => void loadChildTranscript(agent)}
                canViewJson={Boolean(loadedTarget) && !pending.analysis}
                onViewJson={() => setJsonOpen(true)}
                isLoadingSteps={pending.turn || pending.child}
                activityTurns={scoped?.turns}
                activityNote={turnDetailNote?.turnId === selectedTurnId ? turnDetailNote.text : undefined}
              />
            )}
            {tab === "insights" && (
              <AgentInsightsTab
                transcript={scoped}
                conversationData={selectedConversationData}
                recommendations={visibleRecommendations}
                agentConfig={current.agentConfig}
                componentNameBySchemaName={current.componentNameBySchemaName ?? {}}
                connectedAgents={connectedAgents}
                agentName={currentAgent?.name ?? "Copilot Studio agent"}
                sessions={current.sessions}
                selectedSessionId={selectedSession === "all" ? undefined : String(selectedSummary?.n ?? sessionKeys.indexOf(selectedSession) + 1)}
                onTurnSelect={(turnId) => selectTurn(turnId, "conversation")}
              />
            )}
            {tab === "usage" && (usage ? <UsageCreditsTab usage={usage} scope={usageScope} /> : (
              <MessageBar intent="info"><MessageBarBody>This analysis does not include usage diagnostics. Analyze the conversation again.</MessageBarBody></MessageBar>
            ))}
            </> : <>
            {tab === "flow" && <FlowPreview turns={workflow.turns} maxRows={previewRows} onShowAll={showAll("flow")} />}
            {tab === "conversation" && <ConversationPreview turns={scoped.turns} maxRows={previewRows} onShowAll={showAll("conversation")} />}
            {tab === "insights" && (
              <InsightsPreview recommendations={visibleRecommendations} maxRows={previewRows} onShowAll={showAll("insights")} />
            )}
            {tab === "usage" && (usage ? <UsagePreview usage={usage} maxRows={usagePreviewRows} onShowAll={showAll("usage")} /> : (
              <MessageBar intent="info"><MessageBarBody>This analysis does not include usage diagnostics. Analyze the conversation again.</MessageBarBody></MessageBar>
            ))}
            </>}
          </main>
        </>
      )
    : fullscreen ? (
        <div className={styles.empty}>
          <div className={styles.emptyInner}>
            {restoreSpinner
              ? <Spinner aria-label={restoreLabel} />
              : <img className={styles.emptyImage} src={noResultsImage} alt="" aria-hidden="true" />}
            <Title3>{emptyTitle}</Title3>
            <Text>{emptyDetail}</Text>
          </div>
        </div>
      )
    : (
        <div className={mergeClasses(styles.empty, styles.inlineEmpty)}>
          <div className={mergeClasses(styles.emptyInner, styles.inlineEmptyInner)}>
            <Text size={400} weight="semibold">{emptyTitle}</Text>
            {loadingConversationDetail && <Text>{loadingConversationDetail}</Text>}
            {showFullscreenCta && <>
              <Text>Open full screen to choose an agent and a conversation</Text>
              <Button appearance="primary" icon={<ArrowMaximizeRegular />} onClick={() => void openFullscreen()}>Open full screen</Button>
            </>}
            {askInChat && <Text>Ask in chat for an agent and a conversation to debug.</Text>}
          </div>
        </div>
      );

  return (
    <div
      ref={inlineRootRef}
      className={`${styles.root} w-shell`}
      style={{ minHeight: 0, colorScheme: theme, background: tokens.colorNeutralBackground2, height: fullscreen
        ? fullscreenHeight(host?.containerDimensions, window.screen.availHeight)
        : `${inlineHeight}px` }}
    >
      <div className={`${styles.app} w-app`} style={{ minHeight: 0 }}>
        <header className="w-hdr" style={{ background: tokens.colorNeutralBackground2, position: "static", flexShrink: 0 }}>
          <div className={styles.header}>
            <div className={styles.titleText}>
              <Text weight="semibold" size={400}>Agent Debugger</Text>
              {fullscreen && <Text size={200} className={styles.subtitle}>
                Analyze and visualize agent conversation transcripts, thought processes and connected agents.
              </Text>}
            </div>
            {/* Full screen relies on the host close control. */}
            {!fullscreen && !showFullscreenCta && <Tooltip content="Open full screen" relationship="label">
              <Button
                appearance="secondary"
                size="small"
                icon={<ArrowMaximizeRegular />}
                aria-label="Open full screen"
                onClick={() => void openFullscreen()}
              />
            </Tooltip>}
          </div>
          {!fullscreen && statusSpinner && <div className={styles.inlineStatus}>{statusSpinner}</div>}
          {fullscreen && <div className="w-cmd">
            <div className={styles.selectors}>
              {!resolvedTarget && <div className={styles.picker}>
                <SearchablePicker
                  label="Environment"
                  hideHint
                  options={(current.environments ?? []).map(environmentOption)}
                  selected={environment && environmentId ? environmentOption(environment) : undefined}
                  disabled={loading === "analysis"}
                  emptyText="No accessible environments."
                  onSelect={(id) => void loadAgents(id)}
                  onClear={() => void loadAgents("")}
                />
              </div>}
              <div className={styles.picker}>
                <SearchablePicker
                  label="Agent"
                  hideHint
                  options={(agentList ?? []).map(agentOption)}
                  selected={agent ? agentOption(agent) : undefined}
                  disabled={!environmentId || loading === "analysis"}
                  loading={pending.agents || Boolean(current.restoring && !agentList && !error)}
                  loadingText="Loading agents..."
                  loadingInField={!restoreSpinner}
                  error={agentListError || undefined}
                  emptyText="No active agents match this search."
                  onOpen={() => void ensureAgents()}
                  onSelect={(id) => void loadConversations(id)}
                  onClear={() => {
                    if (resolvedTarget) update({ targetResolved: false });
                    void loadConversations("");
                  }}
                />
              </div>
              <div className={styles.picker}>
                <SearchablePicker
                  label="Conversation"
                  hideHint
                  options={(conversationList ?? []).map(conversationOption)}
                  selected={conversation ? conversationOption(conversation) : conversationId ? { id: conversationId, label: conversationId } : undefined}
                  disabled={!agentId || loading === "analysis"}
                  loading={pending.conversations || Boolean(current.restoring && !conversationList && !error)}
                  loadingText="Loading conversations..."
                  loadingInField={!restoreSpinner}
                  error={conversationSearchError || (current.restoring && !conversationList ? error : "") || undefined}
                  emptyText="No saved conversations match this search."
                  onSearch={searchConversations}
                  onOpen={() => void ensureConversations()}
                  onSelect={selectConversation}
                  onClear={() => selectConversation("")}
                />
              </div>
              <Button
                appearance="primary"
                className={styles.analyze}
                icon={pending.analysis ? <Spinner size="tiny" aria-hidden="true" /> : <Play20Regular />}
                aria-busy={pending.analysis || undefined}
                disabled={!conversationId || !agentId || loading === "analysis" || Boolean(current.deferred?.includes("analysis"))}
                onClick={() => void analyze()}
              >
                Analyze
              </Button>
            </div>
            <span role="status" aria-live="polite" className={styles.visuallyHidden}>
              {pending.analysis ? "Analyzing conversation..." : ""}
            </span>
          </div>}
          {error && (
            <MessageBar intent="error" role="alert">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}
          {reloadVisible && <Button disabled={reloading} onClick={() => void reloadInitialData()}>Reload Debugger data</Button>}
          {displayFeedback && <Text size={200} className={styles.displayFeedback}>{displayFeedback}</Text>}
        </header>
        {analysis}
        {jsonOpen && loadedTarget && <ConversationJsonDialog conversationId={loadedTarget.conversationId} onLoad={loadConversationJson} onClose={() => setJsonOpen(false)} />}
      </div>
    </div>
  );
}
