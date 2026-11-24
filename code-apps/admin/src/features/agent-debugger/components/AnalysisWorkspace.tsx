/**
 * AnalysisWorkspace — the analysis surface of the Agent Debugger.
 *
 * The data layer (analysis reducer, transcript parsing, MCP extraction,
 * connected-agent fetching, recommendations) is carried over verbatim from the
 * original TranscriptAnalysisPage so behaviour is identical. Only the render
 * layer is new: results are presented through the approved five-tab layout
 * instead of the previous stacked sections.
 */

import { useEffect, useMemo, useRef, useCallback, useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Text,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogTrigger,
  Spinner,
  Tooltip,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import { ArrowDownload20Regular, Dismiss20Regular } from "@fluentui/react-icons";
import noResultsImage from "../../../shared/assets/no-results.png?inline";
import CopyButton from "./ui/CopyButton";
import { ExportAnalysisButton } from "./ExportAnalysisButton";
import { FlowRunLink } from "./activities/FlowRunLink";
import { flowStepExecution } from "../utils/flow-run-links";
import { JsonViewer } from "./ui";
import type { TranscriptData as FluentTranscriptData } from "./ui";
import { deriveRecommendations } from "../utils/recommendations";
import { useAgentConfig } from "../hooks/use-agent-config";
import { useAgentDetailsById } from "../hooks/use-agent-details";
import {
  conversationDataFromTranscriptEntity,
  mergeConversationTranscriptRecords,
  listConversationTranscripts,
  toIsoTimestamp,
} from "../services/conversation-transcript-service";
import {
  lookupBotComponentNames,
  lookupBotComponentNamesById,
  normalizeOrganizationUrl,
  type ComponentInfo,
} from "../services/botcomponents-service";
import type { ConversationData } from "../contracts/conversation";
import type {
  Activity,
  ProcessedTranscript,
  ProcessedTurn,
  StepExecution,
  MCPServerInfo,
  MCPTool,
  TranscriptData,
} from "../contracts/transcript";
import type { ConnectedAgentInfo } from "../contracts/connected-agent";
import {
  parseTranscriptWithConnectedAgents,
  populateConnectedAgentFromChildTranscript,
  buildChildTopicsFromTurns,
} from "../utils/transcript/parse-transcript";
import { fetchConnectedAgentTranscript } from "../services/connected-agent-service";
import { hydrateHarnessFlowSteps } from "../services/harness-flow-service";
import { deriveSnapshotGeneralInfo } from "../services/snapshot-service";
import { getSessionInfoTurnCount } from "../utils/transcript/session-info";
import {
  buildCopilotStudioAgentOverviewUrl,
  getConfiguredCopilotStudioBaseUrl,
} from "../../../shared/services/copilotStudioUrl";
import { PerformanceTimelineTab } from "./tabs/PerformanceTimelineTab";
import { ExecutionFlowTab } from "./tabs/ExecutionFlowTab";
import { ConversationActivitiesTab } from "./tabs/ConversationActivitiesTab";
import { AgentInsightsTab } from "./tabs/AgentInsightsTab";
import { UsageCreditsTab } from "./tabs/UsageCreditsTab";
import { countSteps, turnDurationMs } from "../utils/timeline-insights";
import { detectOrchestrationEngine } from "../utils/transcript/detect-orchestration-engine";
import type { AnalysisTabKey, AnalysisMeta, SessionSummary } from "../contracts/workspace";
import { fmtMs as formatDuration } from "../utils/format-ms";
import { distinctComponentTypes } from "../theme/component-colors";
import { guessStepSubtitle } from "../utils/step-classification";
import { focusNavigationTarget } from "../utils/focus-navigation-target";
import { logAnalyzeStarted } from "../utils/debuggerTelemetry";
import {
  activitiesForUserTurn,
  isUserMessageActivity,
} from "../utils/transcript/turn-activities";

function TabLoading({ label }: { label: string }) {
  const styles = useStyles();

  return (
    <div className={styles.tabLoading}>
      <Spinner size="medium" label={label} labelPosition="after" />
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    gap: tokens.spacingVerticalL,
    // Inherits radial gradient background from Layout Content area
    overflow: "visible",
  },
  infoSection: {
    overflow: "visible",
  },
  tabLoading: {
    minHeight: "240px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  infoIcon: {
    color: tokens.colorNeutralForeground3,
    cursor: "help",
    display: "flex",
    alignItems: "center",
  },
  metricsRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "stretch",
    gap: tokens.spacingHorizontalL,
    flexWrap: "wrap",
    padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXS}`,
  },
  metricTile: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    flex: "1 1 0",
    minWidth: "130px",
    maxWidth: "200px",
  },
  metricLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  metricLabel: {
    color: tokens.colorNeutralForeground2,
  },
  metricValueRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    whiteSpace: "nowrap",
  },
  mainContentArea: {
    display: "flex",
    flexWrap: "wrap",
    // Match the gutter used between the activity and details panels so all three
    // sections remain visually distinct and evenly spaced.
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalL,
    overflow: "visible",
    alignItems: "flex-start",
  },
  debugPanel: {
    flex: 1,
    minWidth: "300px",
    display: "flex",
    flexDirection: "column",
    overflow: "visible",
    // Stack below 1200px CSS-px so the activity + details split always has room.
    // This band is common under Windows display scaling (e.g. a 1920px monitor at
    // 150–175% resolves to ~1097–1280 CSS px), where a side-by-side split would
    // squeeze the detail panel.
    "@media (max-width: 1200px)": {
      minWidth: 0,
      width: "100%",
    },
  },
  conversationPanel: {
    display: "flex",
    flexDirection: "column",
    height: "700px",
    width: "510px",
    minWidth: "510px",
    flexShrink: 0,
    overflow: "hidden",
    position: "sticky" as const,
    top: "0",
    // Stack above the debug panel on tablet/laptop/high-scale widths: full-width,
    // static (non-sticky), and a shorter scrollable height.
    "@media (max-width: 1200px)": {
      width: "100%",
      minWidth: 0,
      height: "500px",
      position: "static" as const,
    },
  },
  conversationCardHeader: {
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  conversationCardContent: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  loadingCenter: {
    display: "flex",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "400px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: tokens.spacingVerticalXXXL,
  },
  emptyStateImg: {
    width: "120px",
    height: "120px",
    marginBottom: tokens.spacingVerticalL,
  },
  emptyStateTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase400,
    fontFamily: tokens.fontFamilyBase,
    color: tokens.colorNeutralForeground2,
    display: "block",
  },
  emptyStateText: {
    marginTop: tokens.spacingVerticalS,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    display: "block",
    maxWidth: "400px",
  },
  badgeSuccess: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
    color: tokens.colorPaletteGreenForeground2,
    fontSize: tokens.fontSizeBase100,
    maxWidth: "100%",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  badgeError: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground2,
    fontSize: tokens.fontSizeBase100,
    maxWidth: "100%",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  outcomeResolved: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  outcomeFailed: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
  },
  // Analysis section — lightweight inline toggle row with persistent border
  analysisContainer: {
    display: "flex",
    flexDirection: "column",
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: "hidden",
  },
  analysisTabStrip: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
  },
  analysisTabBtn: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    borderRadius: tokens.borderRadiusSmall,
    transitionProperty: "color",
    transitionDuration: tokens.durationFast,
    transitionTimingFunction: tokens.curveEasyEase,
    "&:hover": { color: tokens.colorNeutralForeground1 },
    "&:focus-visible": {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: "1px",
    },
  },
  analysisTabBtnActive: {
    color: tokens.colorNeutralForeground1,
  },
  analysisTabLabel: {},
  analysisTabPipe: {
    color: tokens.colorNeutralStroke1,
    fontSize: tokens.fontSizeBase200,
    userSelect: "none" as const,
    pointerEvents: "none" as const,
  },
  analysisTabContent: {
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalS,
  },
  analysisTabBadge: {
    marginLeft: tokens.spacingHorizontalXXS,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectSchemaNames(processed: Pick<ProcessedTranscript, "turns">): string[] {
  const out = new Set<string>();

  const addIfValid = (value: unknown) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (s) out.add(s);
  };

  const addSearchResultNames = (observationValue: unknown) => {
    const observation = asRecord(observationValue);
    const searchResult = asRecord(observation?.["search_result"]);
    const results = searchResult?.["search_results"];
    if (!Array.isArray(results)) return;

    for (const result of results) {
      const resultRecord = asRecord(result);
      addIfValid(resultRecord?.["Name"] ?? resultRecord?.["name"]);
    }
  };

  for (const turn of processed.turns) {
    const di = turn.debugInfo;
    if (!di) continue;

    if (di.initialTopic?.topicId) addIfValid(di.initialTopic.topicId);
    if (di.stepType) addIfValid(di.stepType);
    if (di.plan?.steps?.length) {
      for (const step of di.plan.steps) addIfValid(step);
    }
    if (di.stepTypes?.length) {
      for (const st of di.stepTypes) addIfValid(st.type);
    }
    if (di.mcpServerInfo?.schemaName) addIfValid(di.mcpServerInfo.schemaName);
    if (di.mcpServers?.length) {
      for (const server of di.mcpServers) {
        if (server.schemaName) addIfValid(server.schemaName);
      }
    }
    if (di.stepExecutions?.length) {
      for (const exec of di.stepExecutions) {
        addIfValid((exec as { taskDialogId?: unknown })?.taskDialogId);
        addSearchResultNames(exec.observation);
      }
    }
    for (const activity of turn.activities) {
      addSearchResultNames(asRecord(activity.value)?.["observation"]);
      if (activity.name === "DialogTracing" || activity.valueType === "DialogTracing") {
        const actions = asRecord(activity.value)?.["actions"];
        if (Array.isArray(actions)) {
          for (const action of actions) addIfValid(asRecord(action)?.["topicId"]);
        }
      }
      if (activity.name === "NodeTraceData" || activity.valueType === "NodeTraceData") {
        addIfValid(asRecord(activity.value)?.["topicId"]);
      }
    }
    if (di.knowledgeSources?.searched?.length) {
      for (const ks of di.knowledgeSources.searched) addIfValid(ks);
    }
    if (di.knowledgeSources?.output?.length) {
      for (const ks of di.knowledgeSources.output) addIfValid(ks);
    }
    if (di.knowledgeSources?.cited?.length) {
      for (const ks of di.knowledgeSources.cited) addIfValid(ks);
    }
  }

  return Array.from(out);
}

function collectSearchResultSourceIds(
  processed: Pick<ProcessedTranscript, "turns">,
): string[] {
  const ids = new Set<string>();

  const addFromObservation = (observationValue: unknown) => {
    const observation = asRecord(observationValue);
    const searchResult = asRecord(observation?.["search_result"]);
    const results = searchResult?.["search_results"];
    if (!Array.isArray(results)) return;

    for (const result of results) {
      const sourceId = asRecord(result)?.["SourceId"];
      if (typeof sourceId === "string" && sourceId.trim()) {
        ids.add(sourceId.trim());
      }
    }
  };

  for (const turn of processed.turns) {
    for (const exec of turn.debugInfo?.stepExecutions ?? []) {
      addFromObservation(exec.observation);
    }
    for (const activity of turn.activities) {
      addFromObservation(asRecord(activity.value)?.["observation"]);
    }
  }

  return Array.from(ids);
}



// ---------------------------------------------------------------------------
// Props accepted from parent (single-page mode)
// ---------------------------------------------------------------------------

export interface AnalysisWorkspaceProps {
  /** Hosts opt in explicitly; shared consumers retain their existing UI. */
  enableAnalysisExport?: boolean;
  /** Optional header location; the workspace still owns export data and lifecycle. */
  exportActionTarget?: HTMLElement | null;
  // ── Transcript mode (Dataverse) ────────────────────────────────────
  agentId?: string;
  environmentUrl?: string;
  environmentId?: string;
  botId?: string;
  agentName?: string;
  transcriptId?: string;

  // ── Snapshot mode (local file) ─────────────────────────────────────
  /** When provided, skips all Dataverse fetches and uses these activities directly. */
  snapshotActivities?: Activity[];
  /** Component name map built from botContent.yml (replaces botcomponents Dataverse lookup). */
  snapshotComponentNames?: Record<string, ComponentInfo>;
  snapshotBotName?: string;
  snapshotConversationId?: string;
  snapshotStartTime?: string;

  // ── Shell integration ──────────────────────────────────
  /** Tab currently selected in the app shell. */
  activeTab?: AnalysisTabKey;
  /** Changes the active shell tab from contextual actions inside a tab. */
  onTabChange?: (tab: AnalysisTabKey) => void;
  /** 1-based session selected in the shell, or "all". */
  selectedSessionId?: string;
  /** Reports derived counts back to the shell for the tab bar. */
  onMetaChange?: (meta: AnalysisMeta) => void;
}

// ---------------------------------------------------------------------------
// Analysis state reducer
// ---------------------------------------------------------------------------

interface AnalysisState {
  isAnalyzing: boolean;
  analysisStatusMessage: string;
  conversationData: ConversationData | null;
  rawTranscriptData: TranscriptData | null;
  processedTranscript: ProcessedTranscript | null;
  selectedUserMessageId: string | null;
  selectedTurn: ProcessedTurn | null;
  componentNameBySchemaName: Record<string, ComponentInfo>;
  showTranscriptDialog: boolean;
  connectedAgents: ConnectedAgentInfo[];
}

type AnalysisAction =
  | { type: "RESET" }
  | { type: "START_ANALYZING" }
  | { type: "SET_TRANSCRIPT_DATA"; payload: TranscriptData | null }
  | { type: "SET_CONVERSATION_DATA"; payload: ConversationData | null }
  | { type: "SET_SELECTED_TURN"; payload: ProcessedTurn | null }
  | { type: "SET_CONNECTED_AGENTS"; payload: ConnectedAgentInfo[] }
  | { type: "PATCH_CONNECTED_AGENTS"; payload: (prev: ConnectedAgentInfo[]) => ConnectedAgentInfo[] }
  | { type: "MERGE_COMPONENT_NAMES"; payload: Record<string, ComponentInfo> }
  | { type: "SET_COMPONENT_NAMES"; payload: Record<string, ComponentInfo> }
  | { type: "SET_SELECTED_MESSAGE"; payload: string | null }
  | { type: "SET_SHOW_TRANSCRIPT_DIALOG"; payload: boolean }
  | { type: "SET_PROCESSED_TRANSCRIPT"; payload: ProcessedTranscript | null }
  | { type: "SET_STATUS_MESSAGE"; payload: string }
  | {
      type: "ANALYSIS_COMPLETE";
      payload: {
        conversationData: ConversationData;
        rawTranscriptData: TranscriptData;
        processedTranscript: ProcessedTranscript;
        connectedAgents: ConnectedAgentInfo[];
      };
    }
  | { type: "ANALYSIS_ERROR"; payload: string };

const initialAnalysisState: AnalysisState = {
  isAnalyzing: false,
  analysisStatusMessage: "",
  conversationData: null,
  rawTranscriptData: null,
  processedTranscript: null,
  selectedUserMessageId: null,
  selectedTurn: null,
  componentNameBySchemaName: {},
  showTranscriptDialog: false,
  connectedAgents: [],
};

function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
  switch (action.type) {
    case "RESET":
      return { ...initialAnalysisState };
    case "START_ANALYZING":
      return {
        ...initialAnalysisState,
        isAnalyzing: true,
      };
    case "SET_TRANSCRIPT_DATA":
      return { ...state, rawTranscriptData: action.payload };
    case "SET_CONVERSATION_DATA":
      return { ...state, conversationData: action.payload };
    case "SET_SELECTED_TURN":
      return { ...state, selectedTurn: action.payload };
    case "SET_CONNECTED_AGENTS":
      return { ...state, connectedAgents: action.payload };
    case "PATCH_CONNECTED_AGENTS":
      return { ...state, connectedAgents: action.payload(state.connectedAgents) };
    case "MERGE_COMPONENT_NAMES":
      return { ...state, componentNameBySchemaName: { ...state.componentNameBySchemaName, ...action.payload } };
    case "SET_COMPONENT_NAMES":
      return { ...state, componentNameBySchemaName: action.payload };
    case "SET_SELECTED_MESSAGE":
      return { ...state, selectedUserMessageId: action.payload };
    case "SET_SHOW_TRANSCRIPT_DIALOG":
      return { ...state, showTranscriptDialog: action.payload };
    case "SET_PROCESSED_TRANSCRIPT":
      return { ...state, processedTranscript: action.payload };
    case "SET_STATUS_MESSAGE":
      return { ...state, analysisStatusMessage: action.payload };
    case "ANALYSIS_COMPLETE": {
      const { conversationData, rawTranscriptData, processedTranscript, connectedAgents } = action.payload;
      return {
        ...state,
        isAnalyzing: false,
        conversationData,
        rawTranscriptData,
        processedTranscript,
        connectedAgents,
        selectedTurn: null,
        selectedUserMessageId: null,
      };
    }
    case "ANALYSIS_ERROR":
      return {
        ...initialAnalysisState,
        analysisStatusMessage: action.payload,
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalysisWorkspace(props: AnalysisWorkspaceProps) {
  const styles = useStyles();

  // Snapshot mode: snapshotActivities present → skip all Dataverse operations
  const isSnapshotMode = Array.isArray(props.snapshotActivities);

  // Fallback: fetch agent details from Dataverse if props don't include botId
  // (only used in transcript mode)
  const { data: fetchedAgent } = useAgentDetailsById(
    isSnapshotMode || props.botId ? undefined : props.agentId,
  );

  const agentName = props.agentName ?? fetchedAgent?.name ?? props.snapshotBotName ?? "";
  const environmentUrl = props.environmentUrl ?? fetchedAgent?.environmentUrl ?? "";
  const botId = props.botId ?? fetchedAgent?.botId ?? "";

  const { data: agentConfig, error: agentConfigError } = useAgentConfig(
    isSnapshotMode ? undefined : (botId || undefined),
    environmentUrl,
  );
  const conversationId = props.transcriptId ?? "";

  const environmentId = props.environmentId ?? fetchedAgent?.environmentId ?? "";
  const { data: copilotStudioBaseUrl } = useQuery({
    queryKey: ["copilot-studio-base-url"],
    queryFn: getConfiguredCopilotStudioBaseUrl,
    staleTime: Infinity,
    retry: 1,
    enabled: !isSnapshotMode,
  });
  const agentCopilotStudioUrl = !isSnapshotMode && copilotStudioBaseUrl && environmentId && botId
    ? buildCopilotStudioAgentOverviewUrl(
        copilotStudioBaseUrl,
        environmentId,
        botId,
        agentConfig?.settings?.isGenerativeDesigner,
      )
    : undefined;

  // Analysis state (managed via reducer)
  const [state, dispatch] = useReducer(analysisReducer, initialAnalysisState);
  const {
    isAnalyzing,
    analysisStatusMessage,
    conversationData,
    rawTranscriptData,
    processedTranscript,
    selectedUserMessageId,
    selectedTurn,
    componentNameBySchemaName: loadedComponentNames,
    showTranscriptDialog,
    connectedAgents,
  } = state;
  const componentNameBySchemaName = useMemo(() => ({
    ...loadedComponentNames,
    ...(!isSnapshotMode ? agentConfig?.choiceEntities : undefined),
  }), [loadedComponentNames, agentConfig?.choiceEntities, isSnapshotMode]);
  const activeTab = props.activeTab ?? "performance";
  const onTabChange = props.onTabChange;

  const sessionKeys = useMemo(() => {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const activity of rawTranscriptData?.activities ?? []) {
      const key = activity.mergedSessionKey ?? "__single__";
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
    return keys;
  }, [rawTranscriptData]);

  const selectedSessionKey = useMemo(() => {
    if (!props.selectedSessionId || props.selectedSessionId === "all") return undefined;
    const index = Number(props.selectedSessionId) - 1;
    return Number.isInteger(index) && index >= 0 ? sessionKeys[index] : undefined;
  }, [props.selectedSessionId, sessionKeys]);

  const scopedRawTranscriptData = useMemo(() => {
    if (!rawTranscriptData || !selectedSessionKey) return rawTranscriptData;
    return {
      ...rawTranscriptData,
      activities: rawTranscriptData.activities.filter(
        (activity) => (activity.mergedSessionKey ?? "__single__") === selectedSessionKey,
      ),
    };
  }, [rawTranscriptData, selectedSessionKey]);

  const scopedProcessedTranscript = useMemo(() => {
    if (!processedTranscript || !selectedSessionKey) return processedTranscript;
    return {
      ...processedTranscript,
      turns: processedTranscript.turns.filter((turn) => {
        const key =
          turn.activities.find((activity) => activity.mergedSessionKey)?.mergedSessionKey ??
          "__single__";
        return key === selectedSessionKey;
      }),
    };
  }, [processedTranscript, selectedSessionKey]);

  // The parser distributes some late trace records onto assistant turns, while
  // the Conversation tab defines a turn from one user message to the next.
  // Normalize the Execution flow to that same raw activity range so both tabs
  // show the same logical activities for a turn.
  const flowProcessedTranscript = useMemo<ProcessedTranscript | null>(() => {
    if (!scopedProcessedTranscript || !scopedRawTranscriptData) {
      return scopedProcessedTranscript;
    }

    const rawActivities = scopedRawTranscriptData.activities ?? [];
    const groups: Array<{ user: ProcessedTurn; source: ProcessedTurn[] }> = [];
    for (const turn of scopedProcessedTranscript.turns) {
      if (turn.role === "user") {
        groups.push({ user: turn, source: [turn] });
      } else if (turn.role === "assistant") {
        if (groups.length) groups[groups.length - 1].source.push(turn);
        else groups.push({ user: turn, source: [turn] });
      }
    }

    const turns = groups.map(({ user, source }) => {
      const rawStartIndex = rawActivities.findIndex((activity) => activity.id === user.id);
      const activities =
        rawStartIndex >= 0 && user.role === "user"
          ? activitiesForUserTurn(rawActivities, rawStartIndex)
          : source.flatMap((turn) => turn.activities ?? []);
      const mergedDebugInfo = Object.assign(
        {},
        ...source.map((turn) => turn.debugInfo ?? {}),
        user.debugInfo ?? {},
      );
      const stepExecutions: StepExecution[] = [];
      const seenExecutions = new Set<string>();
      for (const execution of source.flatMap((turn) => turn.debugInfo?.stepExecutions ?? [])) {
        const key = [
          execution.taskDialogId ?? "",
          execution.stepId ?? "",
          execution.triggeredAt ?? "",
        ].join(":");
        if (seenExecutions.has(key)) continue;
        seenExecutions.add(key);
        stepExecutions.push(execution);
      }

      return {
        ...user,
        activities,
        debugInfo: {
          ...mergedDebugInfo,
          stepExecutions,
        },
      };
    });

    return { ...scopedProcessedTranscript, turns };
  }, [scopedProcessedTranscript, scopedRawTranscriptData]);

  const scopedSelectedTurn = useMemo(() => {
    if (!selectedTurn || !scopedProcessedTranscript) return null;
    return scopedProcessedTranscript.turns.some((turn) => turn.id === selectedTurn.id)
      ? selectedTurn
      : null;
  }, [selectedTurn, scopedProcessedTranscript]);

  const scopedSelectedUserMessageId = useMemo(() => {
    if (!selectedUserMessageId || !scopedProcessedTranscript) return undefined;
    return scopedProcessedTranscript.turns.some(
      (turn) => turn.id === selectedUserMessageId,
    )
      ? selectedUserMessageId
      : undefined;
  }, [selectedUserMessageId, scopedProcessedTranscript]);

  const scopedConversationData = useMemo(() => {
    if (!conversationData || !scopedProcessedTranscript) {
      return conversationData;
    }
    const turns = scopedProcessedTranscript.turns;
    const turnCount =
      getSessionInfoTurnCount(scopedRawTranscriptData?.activities ?? []) ?? turns.length;
    return {
      ...conversationData,
      generalInfo: {
        ...conversationData.generalInfo,
        ...(selectedSessionKey ? { numberOfSessions: 1 } : {}),
        numberOfTurns: turnCount,
        ...(selectedSessionKey
          ? {
              conversationStartTime:
                turns[0]?.timestamp ?? conversationData.generalInfo.conversationStartTime,
            }
          : {}),
      },
    };
  }, [
    conversationData,
    scopedProcessedTranscript,
    scopedRawTranscriptData,
    selectedSessionKey,
  ]);

  // Generation counter to prevent stale async state updates
  const analyzeGenerationRef = useRef(0);
  // Ref to hold raw activities for auto-click (avoids stale closure)
  const rawActivitiesRef = useRef<Activity[]>([]);
  // Ref to hold the first user message ID for deferred auto-select
  const pendingAutoSelectRef = useRef<string | null>(null);
  // Ref to the scrollable conversation content div — used for scroll-to-message
  const conversationContentRef = useRef<HTMLDivElement>(null);

  // Extract MCP info from the FULL transcript (not per-turn)
  const transcriptMcpInfo = useMemo(() => {
    if (!scopedRawTranscriptData?.activities) return null;

    let mcpServerInfo: MCPServerInfo | undefined = undefined;
    const mcpServers: MCPServerInfo[] = [];
    const mcpTools: MCPTool[] = [];

    const seenMcpServers = new Set<string>();
    const seenMcpTools = new Set<string>();

    for (const activity of scopedRawTranscriptData.activities) {
      const activityValue = asRecord(activity.value);
      if (
        activity.name === "DynamicServerInitialize" &&
        activityValue?.["initializationResult"]
      ) {
        const init = asRecord(activityValue["initializationResult"]) ?? {};
        const server = asRecord(init["serverInfo"]) ?? {};
        const session = asRecord(init["sessionInfo"]) ?? {};
        const serverInfo: MCPServerInfo = {
          name: String(server["name"] ?? "Unknown"),
          description:
            typeof server["description"] === "string"
              ? server["description"]
              : undefined,
          version: String(server["version"] ?? "Unknown"),
          sessionId: String(session["id"] ?? "Unknown"),
          protocolVersion: String(init["protocolVersion"] ?? "Unknown"),
          capabilities: asRecord(init["capabilities"]),
          schemaName:
            typeof activityValue["dialogSchemaName"] === "string"
              ? activityValue["dialogSchemaName"]
              : undefined,
        };

        const serverKey = [serverInfo.schemaName || "", serverInfo.name || ""].join("|");
        if (!seenMcpServers.has(serverKey)) {
          seenMcpServers.add(serverKey);
          mcpServers.push(serverInfo);
        }

        if (!mcpServerInfo) {
          mcpServerInfo = serverInfo;
        }
      }

      if (
        activity.name === "DynamicServerToolsList" &&
        Array.isArray(activityValue?.["toolsList"])
      ) {
        const tools = activityValue["toolsList"].flatMap((rawTool): MCPTool[] => {
          const tool = asRecord(rawTool);
          if (!tool) return [];
          const rawInputs = Array.isArray(tool["inputs"]) ? tool["inputs"] : [];
          return [
            {
              displayName: String(tool["displayName"] ?? ""),
              identifier: String(tool["identifier"] ?? ""),
              description: String(tool["description"] ?? ""),
              schemaName:
                typeof tool["schemaName"] === "string" ? tool["schemaName"] : undefined,
              llmIdentifierPrefix:
                typeof tool["llmIdentifierPrefix"] === "string"
                  ? tool["llmIdentifierPrefix"]
                  : undefined,
              inputs: rawInputs.flatMap((rawInput) => {
                const input = asRecord(rawInput);
                if (!input) return [];
                const inputType = asRecord(input["type"]);
                return [
                  {
                    name: String(input["name"] ?? ""),
                    description: String(input["description"] ?? ""),
                    type: String(inputType?.["$kind"] ?? input["type"] ?? ""),
                    required: Boolean(input["isRequired"]),
                  },
                ];
              }),
            },
          ];
        });
        for (const tool of tools) {
          const toolKey = [tool.schemaName || "", tool.identifier || ""].join("|");
          if (seenMcpTools.has(toolKey)) continue;
          seenMcpTools.add(toolKey);
          mcpTools.push(tool);
        }
      }
    }

    return { mcpServerInfo, mcpServers, mcpTools };
  }, [scopedRawTranscriptData]);

  // Derive recommendations from parsed transcript (pure, synchronous)
  const recommendations = useMemo(() => {
    if (!scopedProcessedTranscript || !scopedConversationData) return [];
    return deriveRecommendations(
      scopedProcessedTranscript,
      scopedConversationData,
      connectedAgents,
      componentNameBySchemaName,
    );
  }, [
    scopedProcessedTranscript,
    scopedConversationData,
    connectedAgents,
    componentNameBySchemaName,
  ]);

  // Build the JSON viewer payload only while its dialog is open. Large
  // transcripts otherwise kept a second activity graph alive for the whole session.
  const sanitizedTranscriptData = useMemo(() => {
    if (!showTranscriptDialog) return null;
    if (!scopedRawTranscriptData?.activities) return scopedRawTranscriptData;
    return {
      ...scopedRawTranscriptData,
      activities: scopedRawTranscriptData.activities.map((activity) => {
        if (!("mergedSessionKey" in activity)) return activity;
        const rest = { ...activity };
        delete rest.mergedSessionKey;
        return rest;
      }),
    };
  }, [scopedRawTranscriptData, showTranscriptDialog]);

  const transcriptJsonText = useMemo(
    () => (sanitizedTranscriptData ? JSON.stringify(sanitizedTranscriptData, null, 2) : ""),
    [sanitizedTranscriptData],
  );

  const downloadTranscriptJson = useCallback(() => {
    if (!transcriptJsonText) return;
    const requestedName = conversationId || props.snapshotConversationId || "conversation-transcript";
    const safeName = Array.from(requestedName.replace(/[<>:"/\\|?*]/g, "_"))
      .filter((character) => character.charCodeAt(0) >= 32)
      .join("");
    const url = URL.createObjectURL(
      new Blob([transcriptJsonText], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [conversationId, props.snapshotConversationId, transcriptJsonText]);

  // -----------------------------------------------------------------------
  // handleAnalyze - fetch and parse transcript
  // -----------------------------------------------------------------------

  const handleAnalyze = useCallback(async () => {
    const generation = ++analyzeGenerationRef.current;
    const trimmedConversationId = conversationId.trim();
    if (!trimmedConversationId) {
      dispatch({ type: "SET_STATUS_MESSAGE", payload: "Missing conversation ID." });
      return;
    }

    const organizationUrl = environmentUrl ? normalizeOrganizationUrl(environmentUrl) : undefined;
    if (!organizationUrl) {
      dispatch({ type: "SET_STATUS_MESSAGE", payload: "Missing organization URL." });
      return;
    }
    if (!botId) {
      dispatch({ type: "SET_STATUS_MESSAGE", payload: "Missing agent ID." });
      return;
    }

    dispatch({ type: "START_ANALYZING" });

    try {
      const result = await listConversationTranscripts({
        organizationUrl,
        conversationId: trimmedConversationId,
        agentId: botId,
      });
      if (generation !== analyzeGenerationRef.current) return;

      if (!result.success) {
        dispatch({ type: "ANALYSIS_ERROR", payload: "Failed to fetch transcript records." });
        return;
      }

      const batches = result.data?.value ?? [];
      if (batches.length === 0) {
        dispatch({ type: "ANALYSIS_ERROR", payload: "No transcript records found for this Conversation ID." });
        return;
      }

      const merged = mergeConversationTranscriptRecords(batches, trimmedConversationId);
      const mapped = conversationDataFromTranscriptEntity(merged, trimmedConversationId);
      const rawActivities = (() => {
        try {
          const parsed = merged.content
            ? (JSON.parse(merged.content) as { activities?: Activity[] })
            : undefined;
          return parsed?.activities ?? [];
        } catch {
          return [] as Activity[];
        }
      })();

      rawActivitiesRef.current = rawActivities;

      const parseResult = parseTranscriptWithConnectedAgents(
        { activities: rawActivities },
        trimmedConversationId,
      );
      let processed = parseResult.transcript;
      let harnessComponents: Record<string, ComponentInfo> = {};
      let harnessWarning: string | undefined;
      try {
        const hydrated = await hydrateHarnessFlowSteps(organizationUrl, botId, processed.turns);
        processed = { ...processed, turns: hydrated.turns };
        harnessComponents = hydrated.components;
      } catch (error) {
        harnessWarning = error instanceof Error ? error.message : "Could not resolve harness flow definitions.";
      }
      if (generation !== analyzeGenerationRef.current) return;

      // Populate General Information
      const sessionCount = new Set(
        batches
          .map((b) => b.conversationstarttime)
          .filter((t): t is string => typeof t === "string" && t.length > 0),
      ).size;

      const totalTokensUsed = processed.turns.reduce((sum, turn) => {
        const total = turn.debugInfo?.tokenInfo?.totalTokens;
        return sum + (typeof total === "number" && Number.isFinite(total) ? total : 0);
      }, 0);

      const lastModel = processed.turns
        .map((t) => t.debugInfo?.tokenInfo?.model)
        .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
        .pop();

      const channelId = rawActivities
        .filter((activity) => activity.type === "message")
        .map((activity) => activity.channelId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)[0];

      const modelName = rawActivities
        .filter((activity) => activity.name === "GenerativeAnswersSupportData")
        .map((activity) => {
          const value = asRecord(activity.value);
          // Check CapiResourceUsage first, then top-level response fields
          const respKeys = ["queryRewrittingOpenAIResponse", "queryRewritingOpenAIResponse", "summarizationOpenAIResponse", "completionOpenAIResponse", "openAIResponse"];
          for (const rk of respKeys) {
            const response = asRecord(value?.[rk]);
            const usage = asRecord(response?.["CapiResourceUsage"]);
            if (typeof usage?.["ModelName"] === "string") return usage["ModelName"];
          }
          for (const rk of respKeys) {
            const response = asRecord(value?.[rk]);
            if (typeof response?.["ModelName"] === "string") return response["ModelName"];
          }
          return undefined;
        })
        .filter((name): name is string => typeof name === "string" && name.length > 0)[0];

      mapped.generalInfo.numberOfSessions = sessionCount || 1;
      mapped.generalInfo.numberOfTurns =
        getSessionInfoTurnCount(rawActivities) ?? processed.generalInfo.turnCount;
      if (processed.generalInfo.outcome) mapped.generalInfo.globalOutcome = processed.generalInfo.outcome;
      mapped.generalInfo.totalDuration = processed.generalInfo.durationMs;
      mapped.generalInfo.inactivityCounts = Math.max(0, (sessionCount || 1) - 1);
      mapped.generalInfo.totalTokensUsed = totalTokensUsed;
      if (lastModel) mapped.generalInfo.model = lastModel;
      if (modelName) mapped.generalInfo.modelName = modelName;
      if (channelId) mapped.generalInfo.channelId = channelId;

      // Set the auto-select ref BEFORE the dispatch so it's available when the
      // effect fires after the ANALYSIS_COMPLETE render. The original code set
      // this after the async component-name lookups and relied on
      // componentNameBySchemaName being in handleUserMessageClick's dep array
      // to re-trigger the effect. Since that dep was removed (the callback no
      // longer uses it), we set the ref here so ANALYSIS_COMPLETE itself
      // (which sets rawTranscriptData + processedTranscript) triggers the effect
      // with the ref already populated.
      const firstUserAct = rawActivities.find(
        (activity) =>
          activity.type === "message" &&
          (activity.from?.role === 1 || activity.from?.role === "user"),
      );
      pendingAutoSelectRef.current = firstUserAct?.id ?? null;

      dispatch({
        type: "ANALYSIS_COMPLETE",
        payload: {
          conversationData: mapped,
          rawTranscriptData: { activities: rawActivities },
          processedTranscript: processed,
          connectedAgents: parseResult.connectedAgents,
        },
      });
      dispatch({ type: "SET_COMPONENT_NAMES", payload: harnessComponents });
      if (harnessWarning) dispatch({ type: "SET_STATUS_MESSAGE", payload: harnessWarning });

      // Lookup friendly names for step schema names
      const schemaNames = collectSchemaNames(processed);
      if (parseResult.connectedAgents?.length) {
        for (const ca of parseResult.connectedAgents) {
          if (ca.botSchemaName?.trim()) schemaNames.push(ca.botSchemaName.trim());
          if (ca.dialogSchemaName?.trim()) schemaNames.push(ca.dialogSchemaName.trim());
        }
      }

      if (schemaNames.length) {
        const lookup = await lookupBotComponentNames({ organizationUrl, schemaNames });
        if (generation !== analyzeGenerationRef.current) return;
        if (lookup.success && lookup.data) dispatch({ type: "MERGE_COMPONENT_NAMES", payload: lookup.data });
      }

      const searchResultSourceIds = collectSearchResultSourceIds(processed);
      if (searchResultSourceIds.length) {
        const lookup = await lookupBotComponentNamesById({
          organizationUrl,
          botComponentIds: searchResultSourceIds,
        });
        if (generation !== analyzeGenerationRef.current) return;
        if (lookup.success && lookup.data) {
          dispatch({ type: "MERGE_COMPONENT_NAMES", payload: lookup.data });
        }
      }

    } catch {
      dispatch({ type: "ANALYSIS_ERROR", payload: "Failed to fetch transcript records." });
    }
  }, [environmentUrl, botId, conversationId]);

  // -----------------------------------------------------------------------
  // handleAnalyzeSnapshot — snapshot mode, no Dataverse fetch
  // -----------------------------------------------------------------------

  const handleAnalyzeSnapshot = useCallback(async () => {
    const activities = props.snapshotActivities;
    if (!activities?.length) {
      dispatch({ type: "SET_STATUS_MESSAGE", payload: "No snapshot data provided." });
      return;
    }

    dispatch({ type: "START_ANALYZING" });

    try {
      const conversationIdSnap = props.snapshotConversationId ?? "";

      const parseResult = parseTranscriptWithConnectedAgents(
        { activities: activities as Activity[] },
        conversationIdSnap,
      );
      const processed = parseResult.transcript;

      const genInfo = deriveSnapshotGeneralInfo(
        activities as Activity[],
        processed.generalInfo.turnCount,
        processed.generalInfo.durationMs,
        processed.generalInfo.outcome ?? "",
      );

      const totalTokensUsed = processed.turns.reduce((sum, turn) => {
        const total = turn.debugInfo?.tokenInfo?.totalTokens;
        return sum + (typeof total === "number" && Number.isFinite(total) ? total : 0);
      }, 0);

      const conversationData: ConversationData = {
        id: conversationIdSnap,
        generalInfo: {
          numberOfSessions: genInfo.numberOfSessions,
          numberOfTurns: genInfo.numberOfTurns,
          globalOutcome: genInfo.globalOutcome,
          totalDuration: genInfo.totalDuration,
          inactivityCounts: genInfo.inactivityCounts,
          totalTokensUsed,
          model: genInfo.modelName ?? "",
          modelName: genInfo.modelName,
          gptAnswerState: "",
          contentModeration: "",
          conversationStartTime: genInfo.conversationStartTime,
          channelId: genInfo.channelId,
        },
        messages: [],
      };

      rawActivitiesRef.current = activities;

      // Set the ref BEFORE dispatch so the auto-select effect fires correctly
      const firstUserAct = activities.find(
        (activity) =>
          activity.type === "message" &&
          (activity.from?.role === 1 || activity.from?.role === "user"),
      );
      pendingAutoSelectRef.current = firstUserAct?.id ?? null;

      dispatch({
        type: "ANALYSIS_COMPLETE",
        payload: {
          conversationData,
          rawTranscriptData: { activities },
          processedTranscript: processed,
          connectedAgents: parseResult.connectedAgents,
        },
      });

      // Apply component names from botContent.yml — no Dataverse needed
      if (props.snapshotComponentNames && Object.keys(props.snapshotComponentNames).length > 0) {
        dispatch({ type: "SET_COMPONENT_NAMES", payload: props.snapshotComponentNames });
      }
    } catch {
      dispatch({ type: "ANALYSIS_ERROR", payload: "Failed to analyze snapshot data." });
    }
  }, [props.snapshotActivities, props.snapshotComponentNames, props.snapshotConversationId]);

  // -----------------------------------------------------------------------
  // Auto-analyze on mount
  // -----------------------------------------------------------------------

  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (hasTriggeredRef.current) return;
    if (isSnapshotMode && props.snapshotActivities?.length) {
      hasTriggeredRef.current = true;
      logAnalyzeStarted();
      handleAnalyzeSnapshot();
    } else if (!isSnapshotMode && environmentUrl && botId && conversationId) {
      hasTriggeredRef.current = true;
      logAnalyzeStarted();
      handleAnalyze();
    }
  }, [
    isSnapshotMode,
    environmentUrl,
    botId,
    conversationId,
    handleAnalyze,
    handleAnalyzeSnapshot,
    props.snapshotActivities,
  ]);

  // -----------------------------------------------------------------------
  // handleFetchChildTranscript
  // -----------------------------------------------------------------------

  const handleFetchChildTranscript = useCallback(
    async (agent: ConnectedAgentInfo) => {
      const orgUrl = environmentUrl ? normalizeOrganizationUrl(environmentUrl) : "";

      if (!orgUrl || !agent.childConversationId) {
        dispatch({
          type: "PATCH_CONNECTED_AGENTS",
          payload: (prev) =>
            prev.map((a) =>
              a.sessionId === agent.sessionId
                ? { ...a, isFetching: false, fetchError: "Missing org URL or child conversation ID." }
                : a,
            ),
        });
        return;
      }

      dispatch({
        type: "PATCH_CONNECTED_AGENTS",
        payload: (prev) =>
          prev.map((a) =>
            a.sessionId === agent.sessionId ? { ...a, isFetching: true, fetchError: undefined } : a,
          ),
      });

      try {
        const childTranscript = await fetchConnectedAgentTranscript(
          orgUrl,
          agent.childConversationId,
        );

        if (childTranscript && childTranscript.activities?.length) {
          const updated = populateConnectedAgentFromChildTranscript(
            agent,
            childTranscript.activities as unknown[],
          );
          try {
            const hydrated = await hydrateHarnessFlowSteps(orgUrl, childTranscript.botId, updated.childTranscript ?? []);
            updated.childTranscript = hydrated.turns;
            if (Object.keys(hydrated.components).length) {
              updated.childTopics = buildChildTopicsFromTurns(hydrated.turns);
            }
            dispatch({ type: "MERGE_COMPONENT_NAMES", payload: hydrated.components });
          } catch (error) {
            dispatch({
              type: "SET_STATUS_MESSAGE",
              payload: error instanceof Error ? error.message : "Could not resolve child harness flow definitions.",
            });
          }
          // Store transcript record IDs for Dataverse link
          if (childTranscript.recordIds?.length) {
            updated.childTranscriptRecordIds = childTranscript.recordIds;
          }

          dispatch({
            type: "PATCH_CONNECTED_AGENTS",
            payload: (prev) =>
              prev.map((a) => (a.sessionId === agent.sessionId ? updated : a)),
          });

          const childSchemaNames = [
            ...updated.childTopics.map((t) => t.schemaId),
            ...collectSchemaNames({ turns: updated.childTranscript ?? [] }),
          ].filter((s) => s && s.trim().length > 0);
          if (childSchemaNames.length && orgUrl) {
            try {
              const childLookup = await lookupBotComponentNames({
                organizationUrl: orgUrl,
                schemaNames: childSchemaNames,
              });
              if (childLookup.success && childLookup.data) {
                dispatch({ type: "MERGE_COMPONENT_NAMES", payload: childLookup.data });
              }
            } catch (error) {
              console.warn("Failed to resolve child component names.", error);
            }
          }

          const childSourceIds = collectSearchResultSourceIds({
            turns: updated.childTranscript ?? [],
          });
          if (childSourceIds.length && orgUrl) {
            try {
              const childLookup = await lookupBotComponentNamesById({
                organizationUrl: orgUrl,
                botComponentIds: childSourceIds,
              });
              if (childLookup.success && childLookup.data) {
                dispatch({ type: "MERGE_COMPONENT_NAMES", payload: childLookup.data });
              }
            } catch (error) {
              console.warn("Failed to resolve child search-result component names.", error);
            }
          }
        } else {
          dispatch({
            type: "PATCH_CONNECTED_AGENTS",
            payload: (prev) =>
              prev.map((a) =>
                a.sessionId === agent.sessionId
                  ? { ...a, isFetching: false, fetchError: "No child transcript found." }
                  : a,
              ),
          });
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to fetch child transcript.";
        dispatch({
          type: "PATCH_CONNECTED_AGENTS",
          payload: (prev) =>
            prev.map((a) =>
              a.sessionId === agent.sessionId
                ? { ...a, isFetching: false, fetchError: message }
                : a,
            ),
        });
      }
    },
    [environmentUrl],
  );

  // -----------------------------------------------------------------------
  // handleUserMessageClick
  // -----------------------------------------------------------------------

  const handleUserMessageClick = useCallback((messageId: string) => {
    if (!rawTranscriptData) {
      dispatch({ type: "SET_SELECTED_MESSAGE", payload: messageId });
      dispatch({ type: "SET_SELECTED_TURN", payload: null });
      return;
    }

    const allActivities = rawTranscriptData.activities || [];
    const isStandardTranscript = allActivities.some(
      (activity) => activity.type === "message" && activity.from?.role === 0,
    );

    let resolvedId = messageId;
    const clickedIdx = allActivities.findIndex((a) => a.id === messageId);
    if (clickedIdx < 0) {
      dispatch({ type: "SET_SELECTED_MESSAGE", payload: messageId });
      dispatch({ type: "SET_SELECTED_TURN", payload: null });
      return;
    }

    if (!isUserMessageActivity(allActivities[clickedIdx], isStandardTranscript)) {
      let found = false;
      for (let i = clickedIdx - 1; i >= 0; i--) {
        if (isUserMessageActivity(allActivities[i], isStandardTranscript)) {
          resolvedId = allActivities[i].id || "";
          found = true;
          break;
        }
      }
      if (!found) {
        dispatch({ type: "SET_SELECTED_MESSAGE", payload: messageId });
        dispatch({ type: "SET_SELECTED_TURN", payload: null });
        return;
      }
    }

    dispatch({ type: "SET_SELECTED_MESSAGE", payload: resolvedId });

    const startIdx = allActivities.findIndex((a) => a.id === resolvedId);
    if (startIdx < 0) {
      dispatch({ type: "SET_SELECTED_TURN", payload: null });
      return;
    }

    const selectedActivity = allActivities[startIdx];

    const rangeActivities = activitiesForUserTurn(allActivities, startIdx);

    // Prefer the pre-computed full-parse turn so multi-turn step assignments are
    // correct. A fresh isolated re-parse of the activity slice cannot know which
    // steps were triggered in earlier turns, so DynamicPlanStepFinished events
    // (e.g. a Connected Agent that spans several user turns) end up attached to the
    // WRONG turn (the one that received the Finished event instead of the one that
    // triggered it). The full parse uses attachedStepExecutionKeys to prevent this.
    const fullParseTurn = processedTranscript?.turns.find(
      (t) => t.role === "user" && t.id === resolvedId
    );

    const extractedTurn: ProcessedTurn = fullParseTurn
      ? {
          ...fullParseTurn,
          // Override activities with the filtered range so the raw activity
          // viewer and JSON panel still show only events for this turn.
          activities: rangeActivities,
          // Shallow-copy debugInfo so MCP overlay assignments below don't
          // mutate the original processedTranscript turn in state.
          debugInfo: fullParseTurn.debugInfo ? { ...fullParseTurn.debugInfo } : {},
        }
      : {
          id: selectedActivity.id || messageId,
          role: "user",
          content: selectedActivity.text || "",
          timestamp: toIsoTimestamp(selectedActivity.timestamp),
          activities: rangeActivities,
          debugInfo: {},
        };

    // Layer transcript-level MCP metadata on top so MCP display remains unchanged
    if (extractedTurn.debugInfo) {
      if (transcriptMcpInfo?.mcpServerInfo) {
        extractedTurn.debugInfo.mcpServerInfo = transcriptMcpInfo.mcpServerInfo;
      }
      if (transcriptMcpInfo?.mcpServers?.length) {
        extractedTurn.debugInfo.mcpServers = transcriptMcpInfo.mcpServers;
      }
      if (transcriptMcpInfo?.mcpTools?.length) {
        extractedTurn.debugInfo.mcpTools = transcriptMcpInfo.mcpTools;
      }
    }

    dispatch({ type: "SET_SELECTED_TURN", payload: extractedTurn });
  }, [rawTranscriptData, processedTranscript, transcriptMcpInfo]);

  const navigateToTurn = useCallback(
    (tab: Extract<AnalysisTabKey, "flow" | "conversation">, messageId: string) => {
      // The displayed recommendation number can differ from the conversation
      // marker, so navigation is always resolved from the source message id.
      const startupTurn = flowProcessedTranscript?.turns.find(
        (turn) => turn.id === messageId && turn.role === "assistant",
      );
      if (startupTurn) {
        dispatch({ type: "SET_SELECTED_MESSAGE", payload: messageId });
        dispatch({ type: "SET_SELECTED_TURN", payload: startupTurn });
      } else {
        handleUserMessageClick(messageId);
      }
      onTabChange?.(tab);
    },
    [flowProcessedTranscript, handleUserMessageClick, onTabChange],
  );

  // After analysis completes and rawTranscriptData is committed to state,
  // auto-select the first user message using the full handleUserMessageClick
  // which builds the complete debug info (intent, steps, tokens, etc.).
  useEffect(() => {
    const id = pendingAutoSelectRef.current;
    if (id && !isAnalyzing && rawTranscriptData) {
      pendingAutoSelectRef.current = null;
      handleUserMessageClick(id);
    }
  }, [isAnalyzing, rawTranscriptData, handleUserMessageClick]);

  // Scroll only the conversation pane. scrollIntoView would also move the page
  // and can place the target under the sticky debugger header.
  useEffect(() => {
    if (activeTab !== "conversation" || !selectedUserMessageId) return;
    const frame = window.requestAnimationFrame(() => {
      const container = conversationContentRef.current;
      const message = container?.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(selectedUserMessageId)}"]`,
      );
      if (!container || !message) return;
      const focusTarget = message.querySelector<HTMLElement>('[role="button"]');
      focusNavigationTarget(message, {
        block: "center",
        container,
        focusTarget,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, selectedUserMessageId]);

  // Auto-fetch connected agent child transcripts so the Topic Flow diagram can
  // render their child steps without requiring the user to expand each agent
  // in the Debug panel. Skipped in snapshot mode (no Dataverse access).
  useEffect(() => {
    if (isAnalyzing || !connectedAgents.length || isSnapshotMode) return;
    for (const agent of connectedAgents) {
      if (agent.isFetched || agent.isFetching || agent.fetchError || !agent.childConversationId)
        continue;
      handleFetchChildTranscript(agent);
    }
  }, [isAnalyzing, connectedAgents, handleFetchChildTranscript, isSnapshotMode]);

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // Derived metadata for the shell's tab bar
  // -----------------------------------------------------------------------

  const orchestrationEngine = useMemo(
    () =>
      detectOrchestrationEngine(
        scopedRawTranscriptData?.activities as Activity[] | undefined,
      ),
    [scopedRawTranscriptData],
  );

  const stepCount = useMemo(
    () =>
      scopedProcessedTranscript ? countSteps(scopedProcessedTranscript.turns) : 0,
    [scopedProcessedTranscript],
  );

  /**
   * Turn duration keyed by the user message that opened it.
   *
   * The design's turn divider reads "Turn N · <duration>", so the conversation
   * pane needs the same measured span the timeline shows. Steps can be attached
   * to the user turn or to the assistant turns that follow it, so each entry
   * spans the whole exchange.
   */
  const turnDurationByMessageId = useMemo(() => {
    const out: Record<string, number> = {};
    if (!scopedProcessedTranscript) return out;
    let currentId: string | undefined;
    let execs: StepExecution[] = [];
    let source: ProcessedTurn[] = [];
    const flush = () => {
      if (!currentId) return;
      out[currentId] = turnDurationMs({
        id: currentId,
        role: "user",
        content: "",
        timestamp: "",
        activities: source.flatMap((turn) => turn.activities),
        debugInfo: { stepExecutions: execs },
      } as ProcessedTurn);
    };
    for (const turn of scopedProcessedTranscript.turns) {
      if (turn.role === "user") {
        flush();
        currentId = turn.id;
        execs = [...(turn.debugInfo?.stepExecutions ?? [])];
        source = [turn];
      } else if (currentId) {
        execs.push(...(turn.debugInfo?.stepExecutions ?? []));
        source.push(turn);
      }
    }
    flush();
    return out;
  }, [scopedProcessedTranscript]);

  /**
   * Sessions for the command bar's Session picker.
   *
   * A conversation is stored as one batch per session — the user went idle and
   * reconnected — so distinct `mergedSessionKey` values across the turns'
   * activities identify the sessions. Turns without a key belong to session 1.
   */
  const sessionSummaries = useMemo<SessionSummary[]>(() => {
    const turns = processedTranscript?.turns ?? [];
    const sessionInfo = new Map<
      string,
      {
        startTimeUtc?: string;
        endTimeUtc?: string;
        type?: string;
        outcome?: string;
        turnCount?: number;
      }
    >();
    for (const activity of rawTranscriptData?.activities ?? []) {
      if (activity.valueType !== "SessionInfo" || !activity.value) continue;
      const key = activity.mergedSessionKey ?? "__single__";
      sessionInfo.set(
        key,
        activity.value as {
          startTimeUtc?: string;
          endTimeUtc?: string;
          type?: string;
          outcome?: string;
          turnCount?: number;
        },
      );
    }

    const order: string[] = [];
    const buckets = new Map<string, typeof turns>();
    for (const key of sessionInfo.keys()) {
      buckets.set(key, []);
      order.push(key);
    }
    for (const turn of turns) {
      const key =
        turn.activities.find((a) => a.mergedSessionKey)?.mergedSessionKey ?? "__single__";
      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push(key);
      }
      buckets.get(key)!.push(turn);
    }
    if (!order.length) return [];

    const fmtTime = (value: string | undefined) => {
      if (!value) return "";
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
    };
    const msOf = (value: string | undefined) => {
      const t = value ? new Date(value).getTime() : NaN;
      return Number.isNaN(t) ? null : t;
    };

    let previousEnd: number | null = null;
    return order.map((key, index) => {
      const bucket = buckets.get(key)!;
      const info = sessionInfo.get(key);
      const start = info?.startTimeUtc ?? bucket[0]?.timestamp;
      const end = info?.endTimeUtc ?? bucket[bucket.length - 1]?.timestamp;
      const startMs = msOf(start);
      const endMs = msOf(end);
      const gap =
        previousEnd !== null && startMs !== null && startMs > previousEnd
          ? startMs - previousEnd
          : 0;
      previousEnd = msOf(end) ?? previousEnd;
      const observedTurnCount = bucket.filter((t) => t.role === "user").length;
      const turnCount =
        observedTurnCount ||
        (typeof info?.turnCount === "number" ? info.turnCount : bucket.length);
      return {
        n: index + 1,
        startText: fmtTime(start),
        startTimeUtc: start,
        endTimeUtc: end,
        durationMs:
          startMs !== null && endMs !== null ? Math.max(0, endMs - startMs) : 0,
        type: info?.type ?? "",
        outcome:
          info?.outcome ??
          (index === order.length - 1
            ? (conversationData?.generalInfo?.globalOutcome ?? "")
            : ""),
        turnCount,
        turnText: `${turnCount} turn${turnCount === 1 ? "" : "s"}`,
        idleText: gap > 0 ? formatDuration(gap) : undefined,
      };
    });
  }, [processedTranscript, rawTranscriptData, conversationData]);

  /** Formatted span covering every session, shown when "All sessions" is picked. */
  const sessionSpanText = useMemo(() => {
    if (sessionSummaries.length < 2) return sessionSummaries[0]?.startText ?? "";
    return `${sessionSummaries[0].startText} \u2192 ${
      sessionSummaries[sessionSummaries.length - 1].startText
    }`;
  }, [sessionSummaries]);

  /** Distinct step types present, used by the advanced-filter chips. */
  const stepTypes = useMemo(
    () =>
      distinctComponentTypes(
        (scopedProcessedTranscript?.turns ?? []).flatMap((turn) =>
          (turn.debugInfo?.stepExecutions ?? []).map(
            (step) =>
              step.subtitle ||
              guessStepSubtitle(
                step.taskDialogId,
                step.type,
                componentNameBySchemaName[step.taskDialogId],
                step.observation,
              ),
          ),
        ),
      ),
    [scopedProcessedTranscript, componentNameBySchemaName],
  );

  /**
   * Locale of the analysed conversation, used by the advanced-filter Locale
   * select.
   *
   * The design models locale as a single per-conversation facet
   * (`a.facets.locale`), so the select only ever offers "All locales" plus the
   * conversation's own locale. Scanning every activity instead surfaced the
   * whole set of locale strings the channel happened to stamp on individual
   * activities, which is not a meaningful filter for a single conversation.
   */
  const locales = useMemo(() => {
    const activities =
      (scopedRawTranscriptData?.activities as Activity[] | undefined) ?? [];
    const messageLocale = activities.find(
      (activity) =>
        (activity as { type?: string }).type === "message" &&
        typeof (activity as { locale?: string }).locale === "string" &&
        (activity as { locale?: string }).locale!.trim(),
    ) as { locale?: string } | undefined;
    const anyLocale = activities.find(
      (activity) =>
        typeof (activity as { locale?: string }).locale === "string" &&
        (activity as { locale?: string }).locale!.trim(),
    ) as { locale?: string } | undefined;
    const conversationLocale = activities
      .filter((activity) => activity.valueType === "ConversationInfo")
      .map((activity) =>
        typeof (activity.value as { locale?: unknown } | undefined)?.locale === "string"
          ? ((activity.value as { locale: string }).locale ?? "").trim()
          : "",
      )
      .find(Boolean);
    const locale = (
      messageLocale?.locale ??
      anyLocale?.locale ??
      conversationLocale ??
      ""
    ).trim();
    return locale ? [locale] : [];
  }, [scopedRawTranscriptData]);

  const onMetaChangeRef = useRef(props.onMetaChange);
  useEffect(() => {
    onMetaChangeRef.current = props.onMetaChange;
  }, [props.onMetaChange]);

  useEffect(() => {
    onMetaChangeRef.current?.({
      isReady: !!rawTranscriptData && !isAnalyzing,
      stepCount,
      recommendationCount: recommendations.length,
      hasHighSeverity: recommendations.some((r) => r.severity === "high"),
      hasFlow: !!scopedProcessedTranscript?.turns.some(
        (turn) => turn.debugInfo?.stepExecutions?.length,
      ),
      canViewJson: !!rawTranscriptData,
      agentUrl: agentCopilotStudioUrl,
      sessions: sessionSummaries,
      sessionSpanText,
      locales,
      stepTypes,
    });
  }, [
    rawTranscriptData,
    isAnalyzing,
    stepCount,
    recommendations,
    scopedProcessedTranscript,
    agentCopilotStudioUrl,
    sessionSummaries,
    sessionSpanText,
    locales,
    stepTypes,
  ]);

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  const isLoading = isAnalyzing;

  return (
    <div className={styles.root}>
      {agentConfigError && (
        <Text role="alert">Agent configuration could not be loaded: {agentConfigError.message}</Text>
      )}
      {isLoading ? (
        <TabLoading label="Analyzing conversation..." />
      ) : !rawTranscriptData ? (
        <div className={styles.emptyState} aria-live="polite" aria-atomic="true">
          <img src={noResultsImage} alt="" role="presentation" className={styles.emptyStateImg} />
          <Text className={styles.emptyStateTitle}>
            {analysisStatusMessage ? "Analysis failed" : "Loading\u2026"}
          </Text>
          <Text className={styles.emptyStateText}>
            {analysisStatusMessage || "Preparing to analyze transcript\u2026"}
          </Text>
        </div>
      ) : (
        <>
          {props.enableAnalysisExport && processedTranscript && conversationData && (
            <ExportAnalysisButton
              actionTarget={props.exportActionTarget}
              input={{
                agentName,
                conversationId: conversationId || props.snapshotConversationId || conversationData.id,
                environmentUrl,
                source: isSnapshotMode ? "snapshot" : "transcript",
                conversation: conversationData,
                transcript: processedTranscript,
                sessions: sessionSummaries,
                componentNames: componentNameBySchemaName,
                connectedAgents,
                warnings: [
                  ...(analysisStatusMessage ? [analysisStatusMessage] : []),
                  ...(agentConfigError ? [`Agent configuration could not be loaded: ${agentConfigError.message}`] : []),
                ],
              }}
            />
          )}
          {activeTab === "performance" &&
            (scopedProcessedTranscript ? (
              <PerformanceTimelineTab
                transcript={scopedProcessedTranscript}
                componentNameBySchemaName={componentNameBySchemaName}
                connectedAgents={connectedAgents}
                onTurnSelect={handleUserMessageClick}
                onTurnNavigate={navigateToTurn}
              />
            ) : (
              <TabLoading label="Building performance timeline..." />
            ))}

          {activeTab === "flow" &&
            (flowProcessedTranscript ? (
              <ExecutionFlowTab
                transcript={flowProcessedTranscript}
                componentNameBySchemaName={componentNameBySchemaName}
                connectedAgents={connectedAgents}
                environmentUrl={environmentUrl}
                onInspectTurn={(turnId) => navigateToTurn("conversation", turnId)}
                selectedTurnId={scopedSelectedUserMessageId}
              />
            ) : (
              <TabLoading label="Building execution flow..." />
            ))}

          {activeTab === "conversation" && (
            <ConversationActivitiesTab
              renderFlowRunLink={(turn, step, execution, agent) => <FlowRunLink
                execution={flowStepExecution(turn, step) ?? execution}
                component={componentNameBySchemaName[step?.taskDialogId ?? execution?.taskDialogId ?? ""]}
                environmentUrl={environmentUrl}
                environmentId={environmentId}
                conversationId={agent?.agentKind === "connected" ? agent.childConversationId : conversationId}
                snapshotMode={isSnapshotMode}
              />}
              ref={conversationContentRef}
              transcriptData={scopedRawTranscriptData as FluentTranscriptData}
              selectedTurn={scopedSelectedTurn}
              selectedUserMessageId={scopedSelectedUserMessageId}
              turnDurationByMessageId={turnDurationByMessageId}
              componentNameBySchemaName={componentNameBySchemaName}
              connectedAgents={connectedAgents}
              onUserMessageClick={handleUserMessageClick}
              onFetchChildTranscript={isSnapshotMode ? undefined : handleFetchChildTranscript}
              onViewJson={() => dispatch({ type: "SET_SHOW_TRANSCRIPT_DIALOG", payload: true })}
              canViewJson={!!rawTranscriptData}
              snapshotMode={isSnapshotMode}
              environmentUrl={environmentUrl}
              environmentId={environmentId}
              conversationId={conversationData?.generalInfo.conversationId}
              isLoading={isLoading}
              emptyMessage={
                !scopedSelectedTurn && scopedRawTranscriptData
                  ? !(scopedRawTranscriptData.activities || []).some(
                      (a: Activity) =>
                        a.type === "message" &&
                        ((a.from as { role?: unknown } | undefined)?.role === 1 ||
                          (a.from as { role?: unknown } | undefined)?.role === "user"),
                    )
                    ? "This conversation has no user messages. Debug steps are only available for user message turns."
                    : "Select a user message to inspect its debug steps."
                  : undefined
              }
              isLoadingSteps={false}
            />
          )}

          {activeTab === "insights" &&
            (scopedProcessedTranscript ? (
              <AgentInsightsTab
                transcript={scopedProcessedTranscript}
                conversationData={scopedConversationData}
                recommendations={recommendations}
                agentConfig={agentConfig}
                componentNameBySchemaName={componentNameBySchemaName}
                connectedAgents={connectedAgents}
                agentName={agentName}
                agentUrl={agentCopilotStudioUrl}
                sessions={sessionSummaries}
                selectedSessionId={props.selectedSessionId}
                onTurnSelect={(turnId) => navigateToTurn("conversation", turnId)}
              />
            ) : (
              <TabLoading label="Loading agent insights..." />
            ))}

          {activeTab === "usage" &&
            (scopedProcessedTranscript ? (
              <UsageCreditsTab
                transcript={scopedProcessedTranscript}
                engine={orchestrationEngine}
                totalTokensUsed={scopedConversationData?.generalInfo.totalTokensUsed}
              />
            ) : (
              <TabLoading label="Estimating usage..." />
            ))}
        </>
      )}

      {/* View Transcript JSON Dialog */}
      <Dialog
        open={showTranscriptDialog}
        onOpenChange={(_, data) => dispatch({ type: "SET_SHOW_TRANSCRIPT_DIALOG", payload: data.open })}
      >
        <DialogSurface
          className="w-json-dialog-surface"
          style={{
            maxWidth: "calc(100vw - 32px)",
            width: "1040px",
            height: "86vh",
            maxHeight: "calc(100vh - 48px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <DialogBody
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <DialogTitle
              style={{
                position: "absolute",
                width: "1px",
                height: "1px",
                padding: 0,
                margin: "-1px",
                overflow: "hidden",
                clip: "rect(0, 0, 0, 0)",
                whiteSpace: "nowrap",
                border: 0,
              }}
            >
              Raw JSON — Conversation transcript
            </DialogTitle>
            <DialogContent
              style={{
                flex: 1,
                overflow: "hidden",
                minHeight: 0,
                padding: 0,
                backgroundColor: tokens.colorNeutralBackground1,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {sanitizedTranscriptData && (
                <JsonViewer
                  data={sanitizedTranscriptData}
                  enableSearch
                  jsonText={transcriptJsonText}
                  toolbarTitle="Raw JSON — Conversation transcript"
                  searchPlaceholder="Search JSON…"
                  toolbarActions={
                    <>
                      <CopyButton value={transcriptJsonText} size="medium" />
                      <Tooltip content="Download JSON" relationship="label">
                        <Button
                          appearance="subtle"
                          size="medium"
                          icon={<ArrowDownload20Regular />}
                          aria-label="Download JSON"
                          onClick={downloadTranscriptJson}
                        />
                      </Tooltip>
                      <DialogTrigger action="close">
                        <Button
                          appearance="subtle"
                          size="medium"
                          aria-label="Close"
                          icon={<Dismiss20Regular />}
                        />
                      </DialogTrigger>
                    </>
                  }
                />
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
