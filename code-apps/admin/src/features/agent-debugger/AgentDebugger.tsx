import React, { useState, useMemo, Suspense, lazy, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import "./styles/design/index.css";
import { useFeatureTelemetry } from "../../shared/hooks/useFeatureTelemetry";
import {
  makeStyles,
  mergeClasses,
  typographyStyles,
  tokens,
  FluentProvider,
  Button,
  Tab,
  TabList,
  Text,
  Tooltip,
  Spinner,
  MessageBar,
  MessageBarBody,
  Dialog,
  DialogSurface,
} from "@fluentui/react-components";
import {
  QuestionCircle20Regular,
  Dismiss20Regular,
  ChatMultiple20Regular,
  DocumentArrowUp20Regular,
  CalendarLtr20Regular,
  Timer20Regular,
  BranchFork20Regular,
  Bot20Regular,
  Clock20Regular,
  Filter20Regular,
  Play20Regular,
  TextBulletListSquare20Regular,
} from "@fluentui/react-icons";
import noResultsImage from "../../shared/assets/no-results.png?inline";
import { useLiveAgents } from "./hooks/use-live-agents";
import { useBotLanguageOptions } from "./hooks/use-bot-languages";
import {
  useRecentAgentTranscripts,
  useSearchAgentTranscripts,
  useAgentScannedTranscripts,
} from "./hooks/use-agent-transcripts";
import type { AgentDetailsOption } from "./services/dataverse-agent-service";
import SnapshotUpload from "./components/ui/SnapshotUpload";
import type { SnapshotData } from "./services/snapshot-service";
import type { ComponentInfo } from "./services/botcomponents-service";
import type { Activity } from "./contracts/transcript";
import CopyButton from "./components/ui/CopyButton";
import { MEDIA } from "./theme/layout";
import { agentDebuggerLightTheme } from "./theme/agentDebuggerTheme";
import { useSurfaceStyles } from "./styles/useSurfaceStyles";
import CommandCombobox, { type CommandOption } from "./components/command/CommandCombobox";
import FilterTags from "./components/command/FilterTags";
import AdvancedFiltersDrawer from "./components/command/AdvancedFiltersDrawer";
import {
  FILTER_DEFAULTS,
  clearFilterKey,
  countActiveFilters,
  hasContentFilters,
  matchesTranscriptFilters,
  partsOf,
  type DebuggerFilters,
  type FilterOption,
} from "./contracts/filters";
import type { AnalysisMeta, AnalysisTabKey } from "./contracts/workspace";
import { dedupeOutcome } from "./utils/outcome";

const EMPTY_META: AnalysisMeta = {
  isReady: false,
  stepCount: 0,
  recommendationCount: 0,
  hasHighSeverity: false,
  hasFlow: false,
  canViewJson: false,
};

const AnalysisWorkspace = lazy(() => import("./components/AnalysisWorkspace"));

/**
 * The analysis views, in the order the design lists them.
 * Mirrors the `tabs` array in the prototype's `paint()`.
 */
const ANALYSIS_TAB_DEFS: ReadonlyArray<{
  key: AnalysisTabKey;
  label: string;
  icon: React.ElementType;
}> = [
  { key: "performance", label: "Performance timeline", icon: Timer20Regular },
  { key: "flow", label: "Execution flow", icon: BranchFork20Regular },
  { key: "conversation", label: "Conversation & activities", icon: ChatMultiple20Regular },
  { key: "insights", label: "Agent insights", icon: Bot20Regular },
];

type DebugMode = "transcript" | "snapshot";

const TIME_RANGE_DURATION_MS: Record<string, number> = {
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

class FeatureErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: 40, textAlign: "center" }}>
          <Text>Something went wrong loading this page.</Text>
          <Button onClick={() => this.setState({ hasError: false })}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}


const useStyles = makeStyles({
  /**
   * Shell-local styles only. All chrome shared with the design prototype
   * (`.w-shell`, `.w-app`, `.w-hdr`, `.w-cmd`, `.w-tabs`, `.w-panel`,
   * `.w-combo`, `.w-tag`, `.w-metrics`) lives in `styles/useShellStyles.ts`.
   */
  filterField: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "240px",
    minWidth: "210px",
    maxWidth: "340px",
    [MEDIA.maxSm]: { flexBasis: "100%", maxWidth: "none" },
  },
  filterFieldNarrow: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "170px",
    minWidth: "150px",
    [MEDIA.maxSm]: { flexBasis: "100%" },
  },
  customRangeButton: {
    maxWidth: "320px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  popoverContent: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    minWidth: "260px",
  },
  popoverDateField: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  dateTimeRow: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    alignItems: "center",
    flexWrap: "wrap",
  },
  timeInput: {
    width: "116px",
  },
  snapshotZone: {
    flex: "1 1 100%",
    minWidth: 0,
  },
  messages: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalM,
  },
  deepLinkLoadingScreen: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  deepLinkLoadingContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    textAlign: "center",
  },
  deepLinkLoadingTitle: {
    ...typographyStyles.subtitle1,
    marginTop: tokens.spacingVerticalS,
  },
  deepLinkLoadingText: {
    color: tokens.colorNeutralForeground2,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacingVerticalS,
    padding: "64px 24px",
    textAlign: "center",
  },
  emptyStateImg: {
    width: "180px",
    maxWidth: "60%",
    opacity: 0.9,
  },
  emptyStateText: {
    ...typographyStyles.subtitle2,
  },
  emptyStateSubtext: {
    color: tokens.colorNeutralForeground3,
    maxWidth: "460px",
  },
});


interface TranscriptAnalysisProps {
  agentId: string;
  environmentUrl: string;
  environmentId: string;
  botId: string;
  agentName: string;
  transcriptId: string;
}

interface SnapshotAnalysisProps {
  snapshotActivities: Activity[];
  snapshotComponentNames: Record<string, ComponentInfo>;
  snapshotBotName: string;
  snapshotConversationId: string;
  snapshotStartTime: string;
}

type AnalysisProps =
  | ({ mode: "transcript" } & TranscriptAnalysisProps)
  | ({ mode: "snapshot" } & SnapshotAnalysisProps);

const SCAN_NOTICE_TIMEOUT_MS = 8_000;

function formatDateForPicker(date?: Date | null): string {
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeRecordId(value: string): string {
  return value.trim().replace(/[{}]/g, "").toLowerCase();
}

function normalizeEnvironmentUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/g, "").toLowerCase();
  }
}

export default function AgentDebugger() {
  useFeatureTelemetry('agent-debugger-load', 'Agent Debugger');
  const [searchParams] = useSearchParams();
  const styles = useStyles();
  const surface = useSurfaceStyles();
  const appRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLElement>(null);

  const [mode, setMode] = useState<DebugMode>("transcript");
  const [exportActionTarget, setExportActionTarget] = useState<HTMLSpanElement | null>(null);
  /** `.w-dialog.snap` — the design opens the uploader in a modal, not inline. */
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false);

  // Tab selection and the counts the workspace reports back for the tab bar.
  // The design opens on the Performance timeline (`STATE.tab = 1`, rendered by
  // `renderWaterfall()`), so a fresh analysis lands there rather than on the
  // conversation view.
  const [activeTab, setActiveTab] = useState<AnalysisTabKey>("performance");
  const [meta, setMeta] = useState<AnalysisMeta>(EMPTY_META);

  useEffect(() => {
    const app = appRef.current;
    const header = headerRef.current;
    if (!app || !header) return;

    const updateStickyOffset = () => {
      app.style.setProperty(
        "--debugger-sticky-offset",
        `${Math.ceil(header.getBoundingClientRect().height) + 12}px`,
      );
    };

    updateStickyOffset();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateStickyOffset);
    observer?.observe(header);
    window.addEventListener("resize", updateStickyOffset);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateStickyOffset);
    };
  }, []);

  /** Count badge for a tab, or `null` when that tab carries no badge. */
  const tabCount = useCallback(
    (key: AnalysisTabKey): number | null => {
      if (key === "flow") return meta.stepCount > 0 ? meta.stepCount : null;
      if (key === "insights") {
        return meta.recommendationCount > 0 ? meta.recommendationCount : null;
      }
      return null;
    },
    [meta.stepCount, meta.recommendationCount],
  );

  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedTranscriptName, setSelectedTranscriptName] = useState<string>("");
  const [selectedTranscriptStartTime, setSelectedTranscriptStartTime] = useState<string>("");
  /** Focused session, or "all" for the whole conversation. */
  const [selectedSessionId, setSelectedSessionId] = useState<string>("all");
  const [agentSearch, setAgentSearch] = useState("");
  const [transcriptSearch, setTranscriptSearch] = useState("");

  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("");
  const [timeRangeAnchorMs, setTimeRangeAnchorMs] = useState(0);
  const [errorConversationsOnly, setErrorConversationsOnly] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [customFromDate, setCustomFromDate] = useState<Date | null>(null);
  const [customFromTime, setCustomFromTime] = useState<string>("00:00");
  const [customToDate, setCustomToDate] = useState<Date | null>(null);
  const [customToTime, setCustomToTime] = useState<string>("23:59");

  const [snapshotData, setSnapshotData] = useState<SnapshotData | null>(null);
  const [analysisProps, setAnalysisProps] = useState<AnalysisProps | null>(null);
  const processedDeepLinkRef = React.useRef("");

  // Compute since/to UTC strings from current time range selection
  const dateRangeParams = useMemo((): { since: string | undefined; to: string | undefined } => {
    if (selectedTimeRange === "custom") {
      const [fromH, fromM] = customFromTime.split(":").map(Number);
      const since = customFromDate
        ? new Date(
            customFromDate.getFullYear(),
            customFromDate.getMonth(),
            customFromDate.getDate(),
            isNaN(fromH) ? 0 : fromH,
            isNaN(fromM) ? 0 : fromM,
            0, 0
          ).toISOString()
        : undefined;
      const [toH, toM] = customToTime.split(":").map(Number);
      const to = customToDate
        ? new Date(
            customToDate.getFullYear(),
            customToDate.getMonth(),
            customToDate.getDate(),
            isNaN(toH) ? 23 : toH,
            isNaN(toM) ? 59 : toM,
            59, 999
          ).toISOString()
        : undefined;
      return { since, to };
    }
    const ms = selectedTimeRange ? TIME_RANGE_DURATION_MS[selectedTimeRange] : undefined;
    return {
      since:
        ms !== undefined && timeRangeAnchorMs > 0
          ? new Date(timeRangeAnchorMs - ms).toISOString()
          : undefined,
      to: undefined,
    };
  }, [
    selectedTimeRange,
    customFromDate,
    customFromTime,
    customToDate,
    customToTime,
    timeRangeAnchorMs,
  ]);

  // Label shown on the custom range trigger button
  const customRangeLabel = useMemo(() => {
    if (!customFromDate && !customToDate) return "Set date range...";
    const from = customFromDate
      ? `${formatDateForPicker(customFromDate)} ${customFromTime}`
      : "\u2026";
    const to = customToDate
      ? `${formatDateForPicker(customToDate)} ${customToTime}`
      : "now";
    return `${from} → ${to}`;
  }, [customFromDate, customFromTime, customToDate, customToTime]);

  const {
    data: agents, isLoading: agentsLoading, isDiscovering: agentsDiscovering,
    currentEnvironmentUrl, isEnvironmentLoading, loadRemainingAgents, hasMoreAgents,
  } = useLiveAgents(mode === "transcript", normalizeEnvironmentUrl(searchParams.get("environmentUrl") ?? ""));

  const deepLinkConversationId = searchParams.get("conversationId")?.trim() ?? "";
  const deepLinkEnvironmentUrl = searchParams.get("environmentUrl")?.trim() ?? "";
  const deepLinkAgentId = searchParams.get("agentId")?.trim() ?? "";
  const hasDeepLinkParams = Boolean(
    deepLinkConversationId || deepLinkEnvironmentUrl || deepLinkAgentId,
  );
  const hasDeepLinkRequest = hasDeepLinkParams;

  const deepLinkResolution = useMemo(() => {
    if (!hasDeepLinkRequest) {
      return { requestKey: "", agent: null, error: null, incomplete: false };
    }

    const requestKey = [
      deepLinkConversationId,
      normalizeEnvironmentUrl(deepLinkEnvironmentUrl),
      normalizeRecordId(deepLinkAgentId),
    ].join("|");
    const missing = [
      !deepLinkConversationId && "conversationId",
      !deepLinkEnvironmentUrl && "environmentUrl",
      !deepLinkAgentId && "agentId",
    ].filter(Boolean);

    if (missing.length > 0) {
      return {
        requestKey,
        agent: null,
        error: `This Agent Debugger link is incomplete. Select an agent and conversation to continue. Missing: ${missing.join(", ")}.`,
        incomplete: true,
      };
    }
    if (isEnvironmentLoading(normalizeEnvironmentUrl(deepLinkEnvironmentUrl))) {
      return { requestKey, agent: null, error: null, incomplete: false };
    }

    const normalizedAgentId = normalizeRecordId(deepLinkAgentId);
    const normalizedEnvironmentUrl = normalizeEnvironmentUrl(deepLinkEnvironmentUrl);
    const agent =
      (agents ?? []).find(
        (candidate) =>
          normalizeRecordId(candidate.botId ?? "") === normalizedAgentId &&
          normalizeEnvironmentUrl(candidate.environmentUrl ?? "") ===
            normalizedEnvironmentUrl,
      ) ?? null;

    return {
      requestKey,
      agent,
      error: agent
        ? null
        : "The Agent Debugger link does not match an agent in the specified environment.",
      incomplete: false,
    };
  }, [
    agents,
    isEnvironmentLoading,
    deepLinkAgentId,
    deepLinkConversationId,
    deepLinkEnvironmentUrl,
    hasDeepLinkRequest,
  ]);

  useEffect(() => {
    const matchedAgent = deepLinkResolution.agent;
    const requestKey = deepLinkResolution.requestKey;
    if (!matchedAgent || processedDeepLinkRef.current === requestKey) return;

    const handle = window.setTimeout(() => {
      if (processedDeepLinkRef.current === requestKey) return;
      processedDeepLinkRef.current = requestKey;
      setMode("transcript");
      setSnapshotData(null);
      setSnapshotDialogOpen(false);
      setSelectedAgentId(matchedAgent.id);
      setSelectedTranscriptName(deepLinkConversationId);
      setSelectedTranscriptStartTime("");
      setSelectedSessionId("all");
      setAgentSearch("");
      setTranscriptSearch("");
      setActiveTab("performance");
      setMeta(EMPTY_META);
      setAnalysisProps({
        mode: "transcript",
        agentId: matchedAgent.id,
        environmentUrl: matchedAgent.environmentUrl ?? "",
        environmentId: matchedAgent.environmentId ?? "",
        botId: matchedAgent.botId ?? "",
        agentName: matchedAgent.name,
        transcriptId: deepLinkConversationId,
      });
    }, 0);

    return () => window.clearTimeout(handle);
  }, [
    deepLinkConversationId,
    deepLinkResolution,
  ]);

  // ---------------------------------------------------------------------
  // Advanced filters (design: `.w-drawer` / `paintPanel()`)
  //
  // The design keeps only Agent, Conversation and Session inline; every other
  // predicate moves into an overlay drawer and reappears as a removable chip.
  // The ported query state above stays the source of truth so the Dataverse
  // logic is untouched — this adapter just projects it into the drawer's shape.
  // ---------------------------------------------------------------------
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [dismissedScanNoticeKey, setDismissedScanNoticeKey] = useState("");
  /** Facets the design filters on that the ported query layer does not send. */
  const [clientFilters, setClientFilters] = useState({
    slowOnly: false,
    twoTurnsOnly: false,
    outcome: "all",
    sessionType: "all",
    locale: "all",
    stepTypes: [] as string[],
  });

  const toLocalInput = useCallback((date: Date | null, time: string): string => {
    if (!date) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
  }, []);

  const filters = useMemo<DebuggerFilters>(
    () => ({
      timeRange: selectedTimeRange,
      customFrom: toLocalInput(customFromDate, customFromTime),
      customTo: toLocalInput(customToDate, customToTime),
      channel: selectedChannel,
      errorsOnly: errorConversationsOnly,
      ...clientFilters,
    }),
    [
      selectedTimeRange,
      customFromDate,
      customFromTime,
      customToDate,
      customToTime,
      selectedChannel,
      errorConversationsOnly,
      clientFilters,
      toLocalInput,
    ],
  );

  /** Commits a drafted filter set back onto the ported query state. */
  const applyFilters = useCallback((next: DebuggerFilters) => {
    setSelectedTimeRange(next.timeRange);
    setTimeRangeAnchorMs(TIME_RANGE_DURATION_MS[next.timeRange] ? Date.now() : 0);
    setSelectedChannel(next.channel);
    setErrorConversationsOnly(next.errorsOnly);
    const parse = (value: string): { date: Date | null; time: string } => {
      const { d, t } = partsOf(value);
      if (!d) return { date: null, time: t || "00:00" };
      const [y, m, day] = d.split("-").map(Number);
      return { date: new Date(y, (m ?? 1) - 1, day ?? 1), time: t || "00:00" };
    };
    const from = parse(next.customFrom);
    setCustomFromDate(from.date);
    setCustomFromTime(from.time);
    const to = parse(next.customTo);
    setCustomToDate(to.date);
    setCustomToTime(to.time === "00:00" && !next.customTo ? "23:59" : to.time);
    setClientFilters({
      slowOnly: next.slowOnly,
      twoTurnsOnly: next.twoTurnsOnly,
      outcome: next.outcome,
      sessionType: next.sessionType,
      locale: next.locale,
      stepTypes: next.stepTypes,
    });
    setFilterDrawerOpen(false);
    setSelectedTranscriptName("");
    setSelectedTranscriptStartTime("");
    setSelectedSessionId("all");
    setTranscriptSearch("");
    setAnalysisProps(null);
    setMeta(EMPTY_META);
  }, []);

  // The design has no separate Environment field — agents are grouped by their
  // environment inside the picker popover, and picking one sets both.
  const filteredAgents = useMemo(
    () => agents ?? ([] as AgentDetailsOption[]),
    [agents],
  );

  const filteredAgentOptions = useMemo(() => {
    const term = agentSearch.trim().toLowerCase();
    if (!term) return filteredAgents;
    return filteredAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        (a.environmentName ?? "").toLowerCase().includes(term) ||
        (a.environmentUrl ?? "").toLowerCase().includes(term),
    );
  }, [filteredAgents, agentSearch]);

  /** `renderPicker()` — agents grouped by environment, newest label first. */
  const agentPickerOptions = useMemo<CommandOption[]>(
    () =>
      [...filteredAgentOptions]
        .sort((a, b) => {
          const currentOrder = Number(b.environmentUrl === currentEnvironmentUrl)
            - Number(a.environmentUrl === currentEnvironmentUrl);
          if (currentOrder) return currentOrder;
          const env = (a.environmentName ?? "").localeCompare(b.environmentName ?? "");
          return env !== 0 ? env : a.name.localeCompare(b.name);
        })
        .map((agent) => ({
          id: agent.id,
          group: `${agent.environmentName?.trim() || agent.environmentUrl || "Other environments"}${agent.environmentUrl === currentEnvironmentUrl ? " (current)" : ""}`,
          icon: <Bot20Regular />,
          primary: agent.name,
          secondary: agent.environmentName ?? undefined,
        })),
    [filteredAgentOptions, currentEnvironmentUrl],
  );

  const selectedAgent = useMemo(
    () => filteredAgents.find((a) => a.id === selectedAgentId) ?? null,
    [filteredAgents, selectedAgentId]
  );

  const {
    data: botLanguageOptions,
    isLoading: botLanguagesLoading,
    isError: botLanguagesError,
  } = useBotLanguageOptions(selectedAgent?.botId, selectedAgent?.environmentUrl);

  // Fast list-only query for the default view (All channels, no error filter).
  const { data: recentTranscripts, isLoading: recentTranscriptsLoading, error: recentTranscriptsError } =
    useRecentAgentTranscripts(
      selectedAgent?.botId,
      selectedAgent?.environmentUrl,
      dateRangeParams.since,
      dateRangeParams.to,
    );

  const contentFiltersActive = useMemo(() => hasContentFilters(filters), [filters]);
  const shouldScanTranscripts =
    mode === "transcript" && (contentFiltersActive || filterDrawerOpen);

  // Content is fetched only when the drawer needs facets or an applied filter
  // needs exact JSON evaluation.
  const {
    data: scanResult,
    isLoading: scannedLoading,
    isError: scannedError,
    error: scanError,
    dataUpdatedAt: scanDataUpdatedAt,
    errorUpdatedAt: scanErrorUpdatedAt,
  } = useAgentScannedTranscripts(
    selectedAgent?.botId,
    selectedAgent?.environmentUrl,
    dateRangeParams.since,
    dateRangeParams.to,
    shouldScanTranscripts,
  );

  const scannedData = useMemo(
    () => scanResult?.transcripts ?? [],
    [scanResult],
  );

  const isFiltered = contentFiltersActive;
  const scanNoticeKind =
    scannedError && !scannedLoading
      ? "error"
      : scanResult && !scanResult.isComplete && !scannedLoading
        ? "incomplete"
        : null;
  const scanNoticeKey = scanNoticeKind
    ? [
        scanNoticeKind,
        selectedAgentId,
        selectedTimeRange,
        selectedChannel,
        errorConversationsOnly,
        scanNoticeKind === "error" ? scanErrorUpdatedAt : scanDataUpdatedAt,
      ].join("|")
    : "";
  const showScanNotice =
    mode === "transcript"
    && isFiltered
    && !!scanNoticeKey
    && dismissedScanNoticeKey !== scanNoticeKey;

  useEffect(() => {
    if (!showScanNotice) return;
    const handle = window.setTimeout(
      () => setDismissedScanNoticeKey(scanNoticeKey),
      SCAN_NOTICE_TIMEOUT_MS,
    );
    return () => window.clearTimeout(handle);
  }, [scanNoticeKey, showScanNotice]);

  const filteredScanned = useMemo(() => {
    if (!isFiltered) return scannedData;
    return scannedData.filter((transcript) =>
      matchesTranscriptFilters(transcript.facets, filters),
    );
  }, [scannedData, isFiltered, filters]);

  const activeTranscripts = useMemo(
    () => (isFiltered ? filteredScanned.slice(0, 50) : (recentTranscripts ?? [])),
    [isFiltered, filteredScanned, recentTranscripts],
  );
  const transcriptsLoading = isFiltered ? scannedLoading : recentTranscriptsLoading;

  const hasTranscriptSearch = transcriptSearch.trim().length > 0;

  // Debounce the search term so we issue at most one server query per pause,
  // not one per keystroke. setState inside the timeout is async, so this does
  // not trip the "setState in effect" lint rule.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(transcriptSearch.trim()), 300);
    return () => clearTimeout(handle);
  }, [transcriptSearch]);

  // Server-side conversation-id search: matches across ALL of the agent's
  // transcripts (no client cap). Skipped while a channel/error filter is active
  // (those filter the already-scanned set in memory instead).
  const { data: searchResults, isFetching: searchTranscriptsFetching } = useSearchAgentTranscripts(
    hasTranscriptSearch && !isFiltered ? selectedAgent?.botId : undefined,
    hasTranscriptSearch && !isFiltered ? selectedAgent?.environmentUrl : undefined,
    debouncedSearch,
    dateRangeParams.since,
    dateRangeParams.to,
  );
  const conversationSearchLoading =
    hasTranscriptSearch &&
    !isFiltered &&
    (debouncedSearch !== transcriptSearch.trim() || searchTranscriptsFetching);

  const transcriptOptions = useMemo(() => {
    if (hasTranscriptSearch) {
      if (isFiltered) {
        // Channel/error filter active — narrow the scanned set in memory.
        const term = transcriptSearch.trim().toLowerCase();
        const seen = new Set<string>();
        return filteredScanned.filter((t) => {
          if (!t.name || seen.has(t.name)) return false;
          seen.add(t.name);
          return t.name.toLowerCase().includes(term);
        });
      }
      // No content filter. Dataverse already applied name and date predicates.
      return searchResults ?? [];
    }
    return activeTranscripts;
  }, [hasTranscriptSearch, transcriptSearch, searchResults, activeTranscripts, isFiltered, filteredScanned]);

  /** Picking an agent resets conversation and analysis state. */
  const handleAgentPick = useCallback(
    (id: string) => {
      setSelectedAgentId(id);
      setSelectedTranscriptName("");
      setSelectedTranscriptStartTime("");
      setAgentSearch("");
      setTranscriptSearch("");
      setSelectedSessionId("all");
      setAnalysisProps(null);
      setMeta(EMPTY_META);
      setClientFilters((current) => ({ ...current, locale: "all" }));
    },
    [],
  );

  const handleConversationPick = useCallback(
    (name: string) => {
      const selected = transcriptOptions.find((transcript) => transcript.name === name);
      setSelectedTranscriptName(name);
      setSelectedTranscriptStartTime(selected?.conversationstarttime ?? "");
      setTranscriptSearch("");
      setSelectedSessionId("all");
      setAnalysisProps(null);
      setMeta(EMPTY_META);
    },
    [transcriptOptions],
  );

  /**
   * Resets the Conversation picker without choosing another transcript. The
   * analysis is torn down too, since it belonged to the cleared conversation.
   */
  const handleConversationClear = useCallback(() => {
    setSelectedTranscriptName("");
    setSelectedTranscriptStartTime("");
    setTranscriptSearch("");
    setSelectedSessionId("all");
    setAnalysisProps(null);
    setMeta(EMPTY_META);
  }, []);

  const formatConversationDate = useCallback((value: string | null | undefined) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  /** `renderConvPicker()` — conversation id on line 1, start date on line 2. */
  const conversationPickerOptions = useMemo<CommandOption[]>(
    () =>
      transcriptOptions
        .filter((t) => !!t.name)
        .map((t) => ({
          id: t.name,
          icon: <ChatMultiple20Regular />,
          primary: <span className="l1 mono">{t.name}</span>,
          secondary: formatConversationDate(t.conversationstarttime),
        })),
    [transcriptOptions, formatConversationDate],
  );

  const selectedTranscriptDate = useMemo(
    () => formatConversationDate(selectedTranscriptStartTime),
    [selectedTranscriptStartTime, formatConversationDate],
  );

  // ---------------------------------------------------------------------
  // Session picker (`renderSessionPicker()`)
  //
  // A conversation can be saved as several sessions when the user went idle
  // and reconnected. The workspace reports them once a transcript is analysed;
  // until then the picker stays empty and disabled.
  // ---------------------------------------------------------------------
  const sessionOptions = useMemo(() => meta.sessions ?? [], [meta.sessions]);

  const sessionPickerOptions = useMemo<CommandOption[]>(() => {
    if (!sessionOptions.length) return [];
    const rows: CommandOption[] = [];
    if (sessionOptions.length > 1) {
      rows.push({
        id: "all",
        icon: <TextBulletListSquare20Regular />,
        primary: (
          <>
            All sessions{" "}
            <span className={mergeClasses(surface.badge, surface.badgeNeutral)}>
              {sessionOptions.length}
            </span>
          </>
        ),
        secondary: meta.sessionSpanText,
      });
    }
    for (const session of sessionOptions) {
      rows.push({
        id: String(session.n),
        group: sessionOptions.length > 1 ? "Sessions in this conversation" : undefined,
        icon: <Clock20Regular />,
        primary: `Session ${session.n}`,
        secondary: [session.startText, session.type, dedupeOutcome(session.outcome), session.turnText]
          .filter(Boolean)
          .join(" \u00b7 "),
        badge: session.idleText ? (
          <span className={mergeClasses(surface.badge, surface.badgeWarn)}>
            idle {session.idleText}
          </span>
        ) : undefined,
      });
    }
    return rows;
  }, [sessionOptions, meta.sessionSpanText, surface]);

  const sessionDisplayLabel = useMemo(() => {
    if (!sessionOptions.length) return "No sessions yet";
    if (selectedSessionId === "all") {
      return sessionOptions.length === 1 ? "Session 1" : "All sessions";
    }
    return `Session ${selectedSessionId}`;
  }, [sessionOptions, selectedSessionId]);

  const sessionDisplayDate = useMemo(() => {
    if (!sessionOptions.length) return "";
    if (selectedSessionId === "all") {
      return sessionOptions.length === 1
        ? sessionOptions[0].startText
        : (meta.sessionSpanText ?? "");
    }
    return sessionOptions.find((s) => String(s.n) === selectedSessionId)?.startText ?? "";
  }, [sessionOptions, selectedSessionId, meta.sessionSpanText]);

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  /** Locale choices come from the selected bot's language configuration. */
  const localeOptions = useMemo<FilterOption[]>(() => {
    const options: FilterOption[] = [
      { value: "all", label: "All locales" },
      ...(botLanguageOptions ?? []),
    ];
    if (
      filters.locale !== "all" &&
      !options.some((option) => option.value === filters.locale)
    ) {
      options.push({ value: filters.locale, label: filters.locale });
    }
    if (!selectedAgent) return options;
    if (botLanguagesLoading) {
      options.push({
        value: "__loading",
        label: "Loading bot languages...",
        disabled: true,
      });
    } else if (botLanguagesError) {
      options.push({
        value: "__error",
        label: "Couldn't load bot languages",
        disabled: true,
      });
    } else if (!botLanguageOptions?.length) {
      options.push({
        value: "__empty",
        label: "No bot languages configured",
        disabled: true,
      });
    }
    return options;
  }, [
    botLanguageOptions,
    botLanguagesError,
    botLanguagesLoading,
    filters.locale,
    selectedAgent,
  ]);

  const stepTypeOptions = useMemo(() => {
    const found = new Set<string>(filters.stepTypes);
    for (const transcript of scannedData) {
      for (const type of transcript.facets.stepTypes) found.add(type);
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [scannedData, filters.stepTypes]);

  const canAnalyzeTranscript = !!(selectedAgent && selectedTranscriptName.trim());

  const handleAnalyzeTranscript = () => {
    if (!selectedAgent || !selectedTranscriptName) return;
    // Every fresh analysis returns to the design's landing tab.
    setActiveTab("performance");
    setAnalysisProps({
      mode: "transcript",
      agentId: selectedAgent.id,
      environmentUrl: selectedAgent.environmentUrl ?? "",
      environmentId: selectedAgent.environmentId ?? "",
      botId: selectedAgent.botId ?? "",
      agentName: selectedAgent.name,
      transcriptId: selectedTranscriptName,
    });
  };

  const handleMetaChange = useCallback((next: AnalysisMeta) => {
    setMeta(next);
    if (next.isReady && scanNoticeKey) {
      setDismissedScanNoticeKey(scanNoticeKey);
    }
  }, [scanNoticeKey, setDismissedScanNoticeKey]);

  const handleSnapshotParsed = useCallback((data: SnapshotData | null) => {
    setSnapshotData(data);
    if (data) {
      setMode("snapshot");
      setSnapshotDialogOpen(false);
      setActiveTab("performance");
      setAnalysisProps({
        mode: "snapshot",
        snapshotActivities: data.activities,
        snapshotComponentNames: data.componentNames,
        snapshotBotName: data.botName,
        snapshotConversationId: data.conversationId,
        snapshotStartTime: data.startTime,
      });
    } else {
      setMode("transcript");
      setAnalysisProps(null);
    setMeta(EMPTY_META);
    }
  }, []);

  const emptySubtext = "Choose an agent and conversation, then click Analyze.";

  const transcriptLoadingPlaceholder = transcriptsLoading
    ? isFiltered
      ? "Scanning conversations for applied filters..."
      : "Loading conversations..."
    : "Search or select conversation";

  const isDeepLinkLoading =
    hasDeepLinkRequest &&
    !deepLinkResolution.error &&
    !selectedAgentId &&
    !analysisProps;

  return (
    <FluentProvider theme={agentDebuggerLightTheme} style={{ backgroundColor: "transparent" }}>
      <div className="w-shell">
        <div ref={appRef} className="w-app">
        {isDeepLinkLoading && (
          <div
            className={styles.deepLinkLoadingScreen}
            role="status"
            aria-live="polite"
            aria-label="Opening Agent Debugger"
          >
            <div className={styles.deepLinkLoadingContent}>
              <Spinner size="extra-large" />
              <Text as="h2" className={styles.deepLinkLoadingTitle}>
                Opening Agent Debugger
              </Text>
              <Text className={styles.deepLinkLoadingText}>
                Finding the agent and loading this conversation...
              </Text>
            </div>
          </div>
        )}
        <header ref={headerRef} className="w-hdr">
          {/* `.w-hdr-top` — no app icon precedes the title (design review). */}
          <div className="w-hdr-top">
            <div className="w-hdr-txt">
              <h1>Agent Debugger</h1>
              <p>
                Analyze and visualize agent conversation transcripts, thought
                processes and connected agents.
              </p>
            </div>
            <Button
              type="button"
              appearance="transparent"
              className="w-btn outline"
              onClick={() =>
                mode === "snapshot"
                  ? handleSnapshotParsed(null)
                  : setSnapshotDialogOpen(true)
              }
            >
              <DocumentArrowUp20Regular className="w-ic" />
              {mode === "snapshot" ? "Use transcript" : "Upload snapshot"}
            </Button>
            <Tooltip content="Help" relationship="label">
              <Button
                type="button"
                appearance="transparent"
                className="w-iconbtn w-header-help"
                aria-label="Help"
                icon={<QuestionCircle20Regular className="w-ic" />}
                onClick={() =>
                  window.open(
                    "https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_DEBUGGER.md",
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              />
            </Tooltip>
          </div>

          {/*
            `.w-cmd` — the design's command bar carries only the three pickers
            that identify what to analyse (Agent, Conversation, Session). Every
            other predicate lives in the Advanced filters drawer and returns as
            a removable chip in `.w-tags` below.
          */}
          <div className="w-cmd">
            <div className="w-cmdrow">
            {mode === "transcript" ? (
              <>
                <CommandCombobox
                  className="w-grow"
                  label="Agent"
                  disabled={agentsLoading}
                  searchPlaceholder="Search agents or environments…"
                  emptyText={(q) => agentsDiscovering
                    ? "Loading agents from other environments..."
                    : (q ? `No agent matches “${q}”` : "No agents available")}
                  onLoadMore={hasMoreAgents ? loadRemainingAgents : undefined}
                  loadingMore={agentsDiscovering}
                  display={
                    // The design shows only the agent label once one is picked
                    // (`renderPicker()` -> `<span class="l1">${cur.label}</span>`);
                    // the environment is the group heading inside the list.
                    <span className="lines one">
                    <span className={selectedAgent ? 'l1' : 'l1 placeholder'}>
                        {selectedAgent?.name ??
                          (agentsLoading ? "Loading agents…" : "Select an agent")}
                      </span>
                    </span>
                  }
                  options={agentPickerOptions}
                  selectedId={selectedAgentId || null}
                  onSelect={handleAgentPick}
                  onQueryChange={(query) => {
                    setAgentSearch(query);
                    if (query.trim() || agentsDiscovering) loadRemainingAgents(query);
                  }}
                />

                <CommandCombobox
                  className="w-cmdfield"
                  label="Conversation"
                  disabled={!selectedAgent || transcriptsLoading}
                  searchPlaceholder="Search by conversation ID or date…"
                  emptyText={(q) =>
                    conversationSearchLoading
                      ? "Loading conversations..."
                      : q
                        ? `No conversation matches “${q}”`
                        : transcriptLoadingPlaceholder
                  }
                  display={
                    <span className="lines one">
                      <span className={selectedTranscriptName ? 'l1 mono' : 'l1 placeholder'}>
                        {selectedTranscriptName ||
                          (selectedAgent ? transcriptLoadingPlaceholder : "Select an agent first")}
                      </span>
                      {selectedTranscriptDate && (
                        <span className="dt">
                          <CalendarLtr20Regular aria-hidden="true" />
                          {selectedTranscriptDate}
                        </span>
                      )}
                    </span>
                  }
                  options={conversationPickerOptions}
                  selectedId={selectedTranscriptName || null}
                  onSelect={handleConversationPick}
                  onQueryChange={setTranscriptSearch}
                  onClear={handleConversationClear}
                  clearLabel="Clear conversation"
                  trailingAction={selectedTranscriptName ? (
                    <CopyButton
                      value={selectedTranscriptName}
                      label="Copy conversation ID"
                      successMessage="Conversation ID copied"
                      errorMessage="Couldn't copy conversation ID"
                      style={{ width: 22, minWidth: 22, height: 22 }}
                    />
                  ) : undefined}
                />

                {/*
                  The Session picker is only meaningful once a transcript has
                  been analysed *and* that conversation actually spans more than
                  one session — otherwise it is a permanently disabled control.
                  Changing the selection re-filters in place; no second Analyze
                  run is needed.
                */}
                {sessionOptions.length > 1 && (
                <CommandCombobox
                  className="w-cmdfield"
                  label={
                    <>
                      Session
                      {sessionOptions.length > 1 && (
                        <span className="w-count">{sessionOptions.length}</span>
                      )}
                    </>
                  }
                  disabled={sessionOptions.length === 0}
                  searchPlaceholder="Search by session or date…"
                  emptyText={(q) => (q ? `No session matches “${q}”` : "Analyze a conversation first")}
                  display={
                    <span
                      className={mergeClasses(
                        "lines one session-lines",
                        selectedSessionId !== "all" && "individual",
                      )}
                    >
                      <span className={sessionOptions.length ? 'l1' : 'l1 placeholder'}>{sessionDisplayLabel}</span>
                      {sessionDisplayDate && (
                        <span className="dt">
                          <CalendarLtr20Regular aria-hidden="true" />
                          {sessionDisplayDate}
                        </span>
                      )}
                    </span>
                  }
                  options={sessionPickerOptions}
                  selectedId={selectedSessionId}
                  onSelect={setSelectedSessionId}
                />
                )}
                {/* `.w-actions` — trailing action group. */}
                <div className="w-actions">
                  <Button
                    type="button"
                    appearance="transparent"
                    className="w-btn outline"
                    aria-haspopup="dialog"
                    aria-expanded={filterDrawerOpen}
                    onClick={() => setFilterDrawerOpen(true)}
                  >
                    <Filter20Regular className="w-ic" />
                    Advanced filters
                    {activeFilterCount > 0 && (
                      <span className="w-count">{activeFilterCount}</span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    appearance="transparent"
                    className="w-btn primary"
                    disabled={!canAnalyzeTranscript}
                    onClick={handleAnalyzeTranscript}
                  >
                    <Play20Regular className="w-ic" />
                    Analyze
                  </Button>
                  <span ref={setExportActionTarget} />
                </div>
              </>
            ) : (
              <div className={styles.snapshotZone}>
                <div className="w-snapstate">
                  <DocumentArrowUp20Regular className="w-ic" />
                  <span className="w-snapstate-label">
                    {snapshotData
                      ? `Snapshot loaded — ${snapshotData.botName || "Agent"} · ${snapshotData.activities.length} activities`
                      : "No snapshot loaded"}
                  </span>
                  <Button type="button" appearance="transparent" className="w-btn" onClick={() => setSnapshotDialogOpen(true)}>
                    Replace snapshot
                  </Button>
                  <span ref={setExportActionTarget} />
                </div>
              </div>
            )}
            </div>

            {mode === "transcript" && (
              <FilterTags
                filters={filters}
                customRangeLabel={customRangeLabel}
                localeOptions={localeOptions}
                onClear={(key) => applyFilters(clearFilterKey(filters, key))}
                onClearAll={() => applyFilters({ ...FILTER_DEFAULTS })}
              />
            )}
          </div>

          <div className={styles.messages}>
          {deepLinkResolution.error && (
            <MessageBar intent={deepLinkResolution.incomplete ? "warning" : "error"}>
              <MessageBarBody>{deepLinkResolution.error}</MessageBarBody>
            </MessageBar>
          )}

          {mode === "transcript" && isFiltered && scannedLoading && (
            <MessageBar intent="info">
              <MessageBarBody>
                Scanning transcript content for the applied filters. This may take a moment.
              </MessageBarBody>
            </MessageBar>
          )}

          {mode === "transcript" && !isFiltered && recentTranscriptsError && (
            <MessageBar intent="warning">
              <MessageBarBody>{recentTranscriptsError.message}</MessageBarBody>
            </MessageBar>
          )}
          {showScanNotice && scanNoticeKind === "error" && (
            <MessageBar intent="warning">
              <MessageBarBody>
                Couldn't scan conversations for the applied filters. Try a narrower date range.
              </MessageBarBody>
            </MessageBar>
          )}

          {showScanNotice &&
            scanNoticeKind === "incomplete" &&
            scanResult &&
            !scanResult.isComplete && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  Results are incomplete. Scanned {scanResult.recordsScanned} transcript records
                  before reaching the {scanResult.stopReason === "time-budget"
                    ? "time limit"
                    : scanResult.stopReason === "page-error"
                      ? "Dataverse paging error"
                      : `${scanResult.recordLimit}-record limit`}. Narrow the date range to verify
                  all matches.
                </MessageBarBody>
              </MessageBar>
            )}
          </div>

          {/*
            `.w-tabs` — the design's underlined tab strip with count badges.
            Fluent's TabList handles the keyboard model; the design classes
            still supply the underlined chrome and count badges.
          */}
          {analysisProps && (
            <TabList
              className="w-tabs"
              selectedValue={activeTab}
              aria-label="Analysis views"
              onTabSelect={(_, data) => setActiveTab(data.value as AnalysisTabKey)}
            >
              {ANALYSIS_TAB_DEFS.map(({ key, label, icon }, tabIndex) => {
                const Icon = icon;
                const count = tabCount(key);
                return (
                  <Tab
                    key={key}
                    value={key}
                    icon={<Icon className="w-ic" aria-hidden="true" />}
                    data-tabbtn={tabIndex + 1}
                    id={`analysis-tab-${key}`}
                    aria-controls="analysis-panel"
                    className="w-tab"
                  >
                    <span>{label}</span>
                    {count !== null && (
                      <span
                        className={mergeClasses("w-count", key === "insights" && meta.hasHighSeverity && "danger")}
                      >
                        {count}
                      </span>
                    )}
                  </Tab>
                );
              })}
            </TabList>
          )}
        </header>

        <main className="w-panel" id="analysis-panel" role="tabpanel">
          <FeatureErrorBoundary>
            <Suspense fallback={<Spinner label="Analyzing..." />}>
              {analysisProps ? (
                analysisProps.mode === "transcript" ? (
                  <AnalysisWorkspace
                    key={`transcript-${analysisProps.agentId}-${analysisProps.transcriptId}`}
                    enableAnalysisExport
                    exportActionTarget={exportActionTarget}
                    agentId={analysisProps.agentId}
                    environmentUrl={analysisProps.environmentUrl}
                    environmentId={analysisProps.environmentId}
                    botId={analysisProps.botId}
                    agentName={analysisProps.agentName}
                    transcriptId={analysisProps.transcriptId}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    selectedSessionId={selectedSessionId}
                    onMetaChange={handleMetaChange}
                  />
                ) : (
                  <AnalysisWorkspace
                    key={`snapshot-${analysisProps.snapshotConversationId}-${analysisProps.snapshotStartTime}`}
                    enableAnalysisExport
                    exportActionTarget={exportActionTarget}
                    snapshotActivities={analysisProps.snapshotActivities}
                    snapshotComponentNames={analysisProps.snapshotComponentNames}
                    snapshotBotName={analysisProps.snapshotBotName}
                    snapshotConversationId={analysisProps.snapshotConversationId}
                    snapshotStartTime={analysisProps.snapshotStartTime}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    selectedSessionId={selectedSessionId}
                    onMetaChange={handleMetaChange}
                  />
                )
              ) : mode === "transcript" ? (
                <div className={styles.emptyState}>
                  <img
                    src={noResultsImage}
                    alt=""
                    role="presentation"
                    className={styles.emptyStateImg}
                  />
                  <Text className={styles.emptyStateText}>
                    Select filters to analyze a conversation
                  </Text>
                  <Text className={styles.emptyStateSubtext}>{emptySubtext}</Text>
                </div>
              ) : null}
            </Suspense>
          </FeatureErrorBoundary>
        </main>
      </div>

      {/*
        `.w-drawer` — advanced filters. Rendered outside `.w-app` so the
        overlay is not clipped by the shell's max-width container.
      */}
      <AdvancedFiltersDrawer
        open={filterDrawerOpen}
        filters={filters}
        localeOptions={localeOptions}
        stepTypeOptions={stepTypeOptions}
        scanError={scannedError ? scanError?.message : undefined}
        onApply={applyFilters}
        onDismiss={() => setFilterDrawerOpen(false)}
      />

      {/*
        `#snapDialog` — the design opens the uploader in a modal. Fluent's
        `Dialog` supplies the focus trap, Escape handling and backdrop; the
        design classes supply the surface chrome so it matches the prototype.
      */}
      <Dialog
        open={snapshotDialogOpen}
        onOpenChange={(_, data) => setSnapshotDialogOpen(data.open)}
      >
        <DialogSurface className="w-dialog-surface snap">
          <div className="w-dialog-hdr">
            <h2 id="snapTitle">Upload snapshot</h2>
            <span style={{ flex: 1 }} />
            <Button
              type="button"
              appearance="transparent"
              className="w-iconbtn"
              aria-label="Close"
              icon={<Dismiss20Regular className="w-ic" />}
              onClick={() => setSnapshotDialogOpen(false)}
            />
          </div>
          <div className="w-dialog-body">
            <SnapshotUpload onSnapshotParsed={handleSnapshotParsed} />
          </div>
          <div className="w-dialog-actions">
            <span style={{ flex: 1 }} />
            <Button
              type="button"
              appearance="transparent"
              className="w-btn"
              onClick={() => setSnapshotDialogOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogSurface>
        </Dialog>
      </div>
    </FluentProvider>
  );
}
