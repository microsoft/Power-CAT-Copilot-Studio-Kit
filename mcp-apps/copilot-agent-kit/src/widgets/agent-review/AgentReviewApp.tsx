import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Combobox,
  Field,
  Image,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  ProgressBar,
  Spinner,
  Tab,
  TabList,
  Text,
  Title3,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowMaximizeRegular,
  BotSparkle24Color,
  BrainCircuitRegular,
  CheckmarkCircle20Filled,
  CheckmarkCircleRegular,
  Circle20Regular,
  CloudSyncRegular,
  DataUsageRegular,
  Dismiss20Regular,
  DismissCircle20Filled,
  DocumentCheckmarkRegular,
  Info16Regular,
  PuzzlePieceColor,
  SparkleRegular,
} from "@fluentui/react-icons";
import { DatePicker } from "@fluentui/react-datepicker-compat";
import { defaultProjectName } from "../../agent-review/core/project-name.js";
import {
  toSkillReviewProgress,
  type SkillReviewProgress,
} from "../../agent-review/core/index.js";
import {
  buildCopilotReviewProgressStages,
  CopilotReviewResults,
  reachedIndex,
  type ProgressStage,
  type ReviewTabId,
  type ReviewViewModel,
} from "../../agent-review/ui/index.js";
import { normalizeReviewTab, type ReviewMapNavigation, type ReviewNodeFilter } from "../../agent-review/ui/contracts.js";
import { ReviewErrorContent } from "../../agent-review/ui/components/dialogs/ReviewErrorContent.js";
import { ReviewWaitFooter } from "../../agent-review/ui/components/dialogs/ReviewWaitFooter.js";
import {
  WorkflowMark,
  WorkflowMarkColor,
} from "../../agent-review/ui/components/WorkflowMark.js";
import { useMcpApp } from "../shared/McpAppProvider";
import {
  fullscreenHeight,
  fullscreenOffered,
  inlineContentHeight,
  measureFrameInset,
} from "../shared/fullscreen";
import type { InitialDataLoadError } from "../shared/initial-tool-data";
import { hostToolCallId, simulatedStepMs, useSimulatedPlayback } from "../shared/simulatedProgress";
import {
  readActiveAgentReviewSnapshot,
  readAgentReviewSnapshot,
  writeAgentReviewSnapshot,
} from "./agentReviewSession";
import CopilotStudioIcon from "./assets/CopilotStudio_scalable.svg";
import M365CopilotIcon from "./assets/copilot_20_light_and_dark.svg";

interface Environment {
  id: string;
  name: string;
  region: string;
}

interface Agent {
  id: string;
  name: string;
  componentIdUnique: string;
  iconBase64?: string;
}

interface ToolData {
  state?: string;
  environments?: Environment[];
  environment?: Environment;
  environmentId?: string;
  agents?: Agent[];
  agent?: Agent;
  agentId?: string;
  componentIdUnique?: string;
  jobId?: string;
  reviewId?: string;
  selectionId?: string;
  projectName?: string;
  startedAt?: string;
  model?: ReviewViewModel;
  activeTab?: ReviewTabId;
  mapNavigation?: ReviewMapNavigation;
  nodeFilter?: ReviewNodeFilter | null;
  status?: {
    jobId?: string;
    agentName?: string;
    startedAt?: string;
    status: string;
    completedComponents: number;
    totalComponents: number;
    lastCompletedStatus?: string | null;
    nextPollMs: number | null;
    canFinalize: boolean;
    error: string | null;
  };
  error?: { message?: string; code?: string; retryable?: boolean };
  dataLoadError?: InitialDataLoadError;
  restoring?: boolean;
  deferred?: string[];
  /** Optional demo pacing (`true` or `{ stepMs }`). Only a static demo server sends it. */
  simulatedProgress?: unknown;
}

type SavedReviewData = ToolData & { reviewId: string; model: ReviewViewModel };
type ReviewRequestIdentity = Pick<ToolData, "selectionId" | "environmentId" | "agentId" | "componentIdUnique" | "jobId" | "reviewId">;

class ReviewToolError extends Error {
  constructor(message: string, readonly code?: string, readonly retryable?: boolean) {
    super(message);
  }
}

const STATUS_READ_RETRY_DELAYS = [5_000, 15_000, 30_000];

function sameReviewRequest(previous: ReviewRequestIdentity, next: ReviewRequestIdentity): boolean {
  const fields = ["selectionId", "environmentId", "agentId", "componentIdUnique", "jobId", "reviewId"] as const;
  if (fields.some(field => {
    const before = previous[field]?.trim();
    const after = next[field]?.trim();
    return before && after && (field === "selectionId" ? before !== after : before.toLowerCase() !== after.toLowerCase());
  })) return false;
  if ((previous.reviewId && next.reviewId) || (previous.jobId && next.jobId)) return true;
  if (previous.reviewId || next.reviewId) return false;
  return !previous.jobId || Boolean(previous.selectionId && next.selectionId
    && previous.environmentId && next.environmentId && previous.agentId && next.agentId);
}

const useStyles = makeStyles({
  root: {
    padding: tokens.spacingHorizontalL,
    minWidth: 0,
    color: tokens.colorNeutralForeground1,
    backgroundColor: "transparent",
  },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
    maxWidth: "720px",
    margin: "0 auto",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalL,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  dismiss: { minWidth: "32px" },
  fields: {
    display: "grid",
    gap: tokens.spacingVerticalL,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL} 0`,
  },
  assetOptions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalXS,
  },
  assetIcon: {
    width: "16px",
    height: "16px",
    display: "block",
  },
  agentPicker: {
    position: "relative",
  },
  selectedAgentIcon: {
    position: "absolute",
    zIndex: 1,
    left: tokens.spacingHorizontalS,
    top: "50%",
    transform: "translateY(-50%)",
    pointerEvents: "none",
  },
  agentComboboxWithIcon: {
    "& input": {
      paddingLeft: "40px",
    },
  },
  agentOption: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  agentIcon: {
    width: "24px",
    height: "24px",
    borderRadius: tokens.borderRadiusMedium,
    objectFit: "cover",
    flexShrink: 0,
  },
  agentFallbackIcon: {
    width: "24px",
    height: "24px",
    flexShrink: 0,
  },
  optionName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dateSection: { display: "grid", gap: tokens.spacingVerticalS },
  dateLabel: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  dates: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
  },
  datePicker: {
    width: "100%",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalL,
  },
  progress: { display: "grid", gap: tokens.spacingVerticalM, marginTop: tokens.spacingVerticalL },
  progressCard: {
    maxWidth: "720px",
  },
  progressTitle: {
    display: "flex",
    alignItems: "center",
    minWidth: 0,
    gap: tokens.spacingHorizontalS,
  },
  progressTitleText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  progressContent: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
  },
  progressRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
  },
  progressBar: {
    flex: 1,
  },
  progressPercent: {
    minWidth: "36px",
    flexShrink: 0,
    textAlign: "right",
    color: tokens.colorNeutralForeground2,
    fontWeight: 600,
    fontSize: "13px",
  },
  stageList: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  stageRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    minHeight: "20px",
  },
  stagePending: {
    color: tokens.colorNeutralForeground3,
  },
  stageDetail: {
    display: "block",
    marginLeft: "28px",
    marginTop: "-4px",
    color: tokens.colorNeutralForeground3,
  },
  stageAttribution: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
    marginLeft: "auto",
    flexShrink: 0,
  },
  stageAttributionLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: "11px",
    whiteSpace: "nowrap",
  },
  stageAttributionPending: {
    opacity: 0.45,
  },
  stageAttributionLive: {
    color: tokens.colorBrandForeground1,
    animationName: {
      "0%, 100%": { opacity: 0.45 },
      "50%": { opacity: 1 },
    },
    animationDuration: "1.6s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
    "@media (prefers-reduced-motion: reduce)": {
      animationName: "none",
      opacity: 1,
    },
  },
  stageAttributionIdle: {
    color: tokens.colorNeutralForeground3,
  },
  progressActionButton: {
    whiteSpace: "nowrap",
  },
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
  },
  summaryContainer: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    maxWidth: "1440px",
    margin: "0 auto",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  summaryCard: {
    position: "relative",
  },
  summaryExpand: {
    position: "absolute",
    zIndex: 2,
    top: "8px",
    right: "10px",
    minWidth: "32px",
  },
  fullscreenRoot: {
    height: "100vh",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  fullscreenHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    gap: tokens.spacingHorizontalL,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  fullscreenTitle: {
    margin: 0, minWidth: 0, overflowWrap: "anywhere",
  },
  displayFeedback: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
  },
  fullscreenContent: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: tokens.spacingHorizontalXL,
    "@media (max-width: 767px)": { padding: tokens.spacingHorizontalM },
  },
  inlineHeader: {
    borderBottom: "none",
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
  },
  // Inline, the result fits the host height. The map and the findings preview fill the rest.
  inlineContent: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    padding: "0",
    "@media (max-width: 767px)": { padding: "0" },
  },
  inlineMessage: {
    flexShrink: 0,
    margin: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
  },
});

type ResultNavigation = {
  activeTab: ReviewTabId;
  mapNavigation: ReviewMapNavigation | undefined;
  nodeFilter: ReviewNodeFilter | null;
};
/** The navigation that a display request applies only when the host shows the requested mode. */
type NavigationIntent = (navigation: ResultNavigation) => ResultNavigation;

/** Fullscreen opens on the findings of one node, or on all findings. */
const findingsIntent = (nodeFilter: ReviewNodeFilter | null): NavigationIntent =>
  navigation => ({ ...navigation, activeTab: "findings", nodeFilter });

/** A return to inline shows the clean map: no node filter and no selection. */
const cleanMapIntent: NavigationIntent = navigation => ({
  activeTab: "map",
  nodeFilter: null,
  mapNavigation: navigation.mapNavigation && { ...navigation.mapNavigation, selection: null },
});

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDisplayDate(date?: Date): string {
  return date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
    : "";
}

function structured(result: unknown): ToolData {
  return ((result as { structuredContent?: ToolData })?.structuredContent ?? {}) as ToolData;
}

function availableSessionStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function botIconSource(iconBase64: string | undefined): string | undefined {
  const value = iconBase64?.trim();
  if (!value) return undefined;
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value)) return value;
  if (/^[a-z0-9+/=\s]+$/i.test(value)) return `data:image/png;base64,${value}`;
  return undefined;
}

function reviewProgress(
  state: string,
  status: ToolData["status"],
): SkillReviewProgress | null {
  const total = Math.max(0, status?.totalComponents ?? 0);
  const completed = Math.max(0, status?.completedComponents ?? 0);

  if (state === "finalizing") {
    return {
      stage: "persisting",
      percent: 90,
      message: "Saving review results",
      completedUnits: Math.min(completed, total),
      totalUnits: total,
      partialFailures: 0,
    };
  }

  const phase = state === "starting"
    ? "submitting"
    : status?.status === "queued"
      ? "queued"
      : "running";
  const message = phase === "submitting"
    ? "Preparing and submitting the review"
    : phase === "queued"
      ? "Handing off to the review agent"
      : total > 0
        ? `Review agent is analysing ${total} ${total === 1 ? "component" : "components"}`
        : "Review agent is analysing the agent";

  return toSkillReviewProgress({
    phase,
    message,
    componentCount: total,
    completedComponents: phase === "running" ? completed : undefined,
    lastCompleted: status?.lastCompletedStatus ?? undefined,
  });
}

/** Demo pacing: one step for each stage of the real stepper, from Parsing Configuration to Complete. */
const SIMULATED_REVIEW_STEPS = 5;

/** The progress of one demo step, with the messages of the real job phases. */
function simulatedReviewProgress(step: number, skills: number): SkillReviewProgress | null {
  const job = (status: string, completedComponents: number): ToolData["status"] => ({
    status, completedComponents, totalComponents: skills, nextPollMs: null, canFinalize: false, error: null,
  });
  if (step <= 0) return reviewProgress("starting", undefined);
  if (step === 1) {
    const queued = reviewProgress("running", job("queued", 0));
    // The queued phase shows on the next stage, so that each step advances one stage.
    return queued && { ...queued, stage: "deterministic-scan" };
  }
  if (step === 2) return reviewProgress("running", job("running", Math.ceil(skills / 2)));
  if (step === 3) return reviewProgress("finalizing", job("running", skills));
  return { stage: "complete", percent: 100, message: "Review complete.", completedUnits: skills, totalUnits: skills, partialFailures: 0 };
}

function reviewedSkillCount(model: ReviewViewModel | undefined): number {
  return Math.max(model?.skills?.length ?? 0, model?.capabilityChips?.find(chip => chip.kind === "skill")?.count ?? 0);
}

const STAGE_STATUS_LABEL: Record<ProgressStage["status"], string> = {
  completed: "completed",
  active: "in progress",
  error: "failed",
  pending: "not started",
};

function progressTitleIcon(stageName: string, color: string) {
  const style = { fontSize: "24px", color, flexShrink: 0 };
  if (stageName === "Parsing Configuration") return <DataUsageRegular style={style} />;
  if (stageName === "Evaluating Patterns" || stageName === "Checking Compliance") {
    return <BrainCircuitRegular style={style} />;
  }
  if (stageName === "Generating Report") return <DocumentCheckmarkRegular style={style} />;
  if (stageName === "Saving Results") return <CloudSyncRegular style={style} />;
  if (stageName === "Complete") return <CheckmarkCircleRegular style={style} />;
  return <SparkleRegular style={style} />;
}

export function AgentReviewApp() {
  const styles = useStyles();
  const { app, data, host, toolInput, replaceData, replaceMetadata, readInitialResult } = useMcpApp();
  const replayed = (data ?? {}) as ToolData;
  const reviewStorage = useMemo(availableSessionStorage, []);
  const restored = useMemo(() => {
    const exact = readAgentReviewSnapshot(reviewStorage, replayed.selectionId ?? replayed.reviewId);
    if (exact && (!replayed.reviewId || exact.reviewId === replayed.reviewId)) return exact;
    return !replayed.selectionId && !replayed.reviewId && host?.displayMode === "fullscreen"
      ? readActiveAgentReviewSnapshot(reviewStorage)
      : undefined;
  }, [data, host?.displayMode, replayed.selectionId, replayed.reviewId, reviewStorage]);
  const initial: ToolData = restored
    ? { ...replayed, ...restored }
    : replayed;
  const selectionId = initial.selectionId ?? replayed.selectionId ?? initial.reviewId;
  const acknowledgedJobId = initial.jobId?.trim() || initial.status?.jobId?.trim();
  const missingJobId = initial.state === "running" && !acknowledgedJobId;
  const missingJobMessage = "The review result did not include an acknowledged job ID.";
  const savedResultUnavailable = Boolean(initial.reviewId && !initial.model
    && ["error", "load-error", "summary", "fullReview"].includes(initial.state ?? ""));
  const selectionLoadFailed = Boolean(initial.dataLoadError && !acknowledgedJobId && !initial.reviewId);
  const [state, setState] = useState(savedResultUnavailable ? "summary" : missingJobId ? "error"
    : selectionLoadFailed ? "selecting" : initial.state ?? "selecting");
  const [environments, setEnvironments] = useState<Environment[]>(initial.environments ?? []);
  const [agents, setAgents] = useState<Agent[]>(initial.agents ?? []);
  const [environmentId, setEnvironmentId] = useState(initial.environmentId ?? "");
  const [agentId, setAgentId] = useState(initial.agentId ?? "");
  const [environmentFilter, setEnvironmentFilter] = useState(
    initial.environment?.name ?? "",
  );
  const [agentFilter, setAgentFilter] = useState(initial.agent?.name ?? "");
  const [projectName, setProjectName] = useState(() => initial.projectName ?? defaultProjectName());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [startupWaitExpired, setStartupWaitExpired] = useState(false);
  const [error, setError] = useState<string | null>(missingJobId ? missingJobMessage : initial.error?.message ?? null);
  const [displayFeedback, setDisplayFeedback] = useState<{ reviewId: string; message: string } | null>(null);
  // True after the host refused fullscreen for this review. Inline then opens node findings on the inline Findings tab.
  const [fullscreenRefused, setFullscreenRefused] = useState(false);
  const [dataLoadFailed, setDataLoadFailed] = useState(initial.dataLoadError?.source === "initial-data");
  const initialDataError = useRef<string>();
  const [jobId, setJobId] = useState(acknowledgedJobId ?? "");
  const [reviewId, setReviewId] = useState(initial.reviewId ?? "");
  const [status, setStatus] = useState<ToolData["status"]>(initial.status);
  const [model, setModel] = useState<ReviewViewModel | undefined>(initial.model);
  const [activeTab, setActiveTab] = useState<ReviewTabId>(normalizeReviewTab(initial.activeTab));
  const [mapNavigation, setMapNavigation] = useState<ReviewMapNavigation | undefined>(initial.mapNavigation);
  const [nodeFilter, setNodeFilter] = useState<ReviewNodeFilter | null>(
    initial.nodeFilter && initial.nodeFilter.reviewId === initial.reviewId ? initial.nodeFilter : null,
  );
  const [startedAt, setStartedAt] = useState<number | null>(() => {
    const value = initial.status?.startedAt ?? initial.startedAt;
    const parsed = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });
  // Demo pacing: a final review result first plays the real stepper, with timers only.
  const simulatedStep = simulatedStepMs(replayed.simulatedProgress);
  const simulationKey = simulatedStep && replayed.model && (replayed.state === "summary" || replayed.state === "fullReview")
    ? `review:${replayed.selectionId ?? ""}:${replayed.reviewId ?? ""}`
    : undefined;
  const simulation = useSimulatedPlayback(simulationKey, simulatedStep, SIMULATED_REVIEW_STEPS, hostToolCallId(host));
  const timer = useRef<number>();
  const requestRevision = useRef(0);
  const incomingRequestRevision = useRef(0);
  const currentData = useRef(data);
  const localSelectionData = useRef<ToolData>();
  const incomingIdentity: ReviewRequestIdentity = {
    selectionId: initial.selectionId,
    environmentId: initial.environmentId ?? initial.environment?.id,
    agentId: initial.agentId ?? initial.agent?.id,
    componentIdUnique: initial.componentIdUnique ?? initial.agent?.componentIdUnique,
    jobId: acknowledgedJobId,
    reviewId: initial.reviewId,
  };
  const requestIdentity = useRef(incomingIdentity);
  if (currentData.current !== data) {
    const same = data === null
      ? Boolean(requestIdentity.current.jobId || requestIdentity.current.reviewId || state === "starting")
      : sameReviewRequest(requestIdentity.current, incomingIdentity);
    if (!same) {
      requestRevision.current += 1;
      incomingRequestRevision.current += 1;
    }
    const previous = same ? requestIdentity.current : {};
    requestIdentity.current = {
      selectionId: incomingIdentity.selectionId ?? previous.selectionId,
      environmentId: incomingIdentity.environmentId ?? previous.environmentId,
      agentId: incomingIdentity.agentId ?? previous.agentId,
      componentIdUnique: incomingIdentity.componentIdUnique ?? previous.componentIdUnique,
      jobId: incomingIdentity.jobId ?? previous.jobId,
      reviewId: incomingIdentity.reviewId ?? previous.reviewId,
    };
    currentData.current = data;
  }
  const pollPending = useRef<{ jobId: string; revision: number }>();
  const statusReadRetries = useRef(0);
  const savedReadPending = useRef<{
    reviewId: string; presentation: "summary" | "fullReview"; revision: number; promise: Promise<SavedReviewData>;
  }>();
  const clearPoll = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = undefined;
  };
  const progressStagesRef = useRef<ProgressStage[]>();
  const agentRequest = useRef(0);
  const startPending = useRef(false);
  const displayPending = useRef<{ reviewId: string; mode: "inline" | "fullscreen" }>();
  const displayIntent = useRef<NavigationIntent>();
  // The navigation that a refused fullscreen request applies inline.
  const displayRefusedIntent = useRef<NavigationIntent>();
  const resultContext = useRef({ selectionId, reviewId, model });
  resultContext.current = { selectionId, reviewId, model };
  const resultNavigation = useRef<ResultNavigation>({ activeTab, mapNavigation, nodeFilter });
  resultNavigation.current = { activeTab, mapNavigation, nodeFilter };
  const changeResultNavigation = useCallback((next: Partial<ResultNavigation>) => {
    resultNavigation.current = { ...resultNavigation.current, ...next };
    setActiveTab(resultNavigation.current.activeTab);
    setMapNavigation(resultNavigation.current.mapNavigation);
    setNodeFilter(resultNavigation.current.nodeFilter);
    if (displayPending.current?.reviewId === resultContext.current.reviewId
      && !writeAgentReviewSnapshot(reviewStorage, {
        ...resultContext.current,
        ...(displayIntent.current?.(resultNavigation.current) ?? resultNavigation.current),
        state: displayPending.current.mode === "fullscreen" ? "fullReview" : "summary",
      })) {
      setError("The selected review view could not be saved for fullscreen.");
    }
  }, [reviewStorage]);
  const changeTab = useCallback((activeTab: ReviewTabId) => changeResultNavigation({ activeTab }), [changeResultNavigation]);
  const changeMapNavigation = useCallback((mapNavigation: ReviewMapNavigation) =>
    changeResultNavigation({ mapNavigation }), [changeResultNavigation]);
  const changeNodeFilter = useCallback((nodeFilter: ReviewNodeFilter | null) =>
    changeResultNavigation({ nodeFilter }), [changeResultNavigation]);

  const incomingRevision = incomingRequestRevision.current;
  useEffect(() => {
    clearPoll();
    statusReadRetries.current = 0;
    setLoadingResults(false);
    setLoadingInitial(false);
    if (initial.state === "selecting" || selectionLoadFailed) {
      setJobId("");
      setReviewId("");
      setStatus(undefined);
      setModel(undefined);
      setStartedAt(null);
      setState("selecting");
    }
  }, [incomingRevision]);

  const missingInitialData = data === null && !restored && !jobId && !reviewId && state !== "starting";
  useEffect(() => {
    if (!missingInitialData) {
      setStartupWaitExpired(false);
      return;
    }
    const wait = window.setTimeout(() => setStartupWaitExpired(true), 15_000);
    return () => window.clearTimeout(wait);
  }, [missingInitialData]);

  useEffect(() => {
    if (initial.error) {
      initialDataError.current = initial.error.message ?? "Unable to restore Agent Review.";
      setError(initialDataError.current);
    } else if (data !== null && initial.state) {
      const previous = initialDataError.current;
      initialDataError.current = undefined;
      if (previous) setError(current => current === previous ? null : current);
    }
  }, [data]);

  useEffect(() => {
    if (initial.projectName) setProjectName(initial.projectName);
    if (initial.state) setDataLoadFailed(initial.dataLoadError?.source === "initial-data");
    if (initial.reviewId) setReviewId(initial.reviewId);
    if (savedResultUnavailable) {
      setModel(undefined);
      setJobId(acknowledgedJobId ?? requestIdentity.current.jobId ?? "");
      setStatus(initial.status);
      setState("summary");
    }
    if (initial.state === "running") {
      if (acknowledgedJobId) {
        setJobId(acknowledgedJobId);
        if (jobId !== acknowledgedJobId || ["error", "load-error", "failed"].includes(state)) {
          setStatus(initial.status);
          setState("running");
        }
      } else {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = undefined;
        setJobId("");
        setStatus(undefined);
        setError(missingJobMessage);
        setState("error");
      }
    }
    if (!savedResultUnavailable && (initial.state === "failed" || initial.state === "load-error") && acknowledgedJobId) {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = undefined;
      setJobId(acknowledgedJobId);
      setStatus(initial.status);
      setState(initial.state);
    }
    if (initial.environments) setEnvironments(initial.environments);
    if (initial.environmentId) setEnvironmentId(initial.environmentId);
    if (initial.environment) setEnvironmentFilter(initial.environment.name);
    if (initial.agents) {
      if (data !== localSelectionData.current) agentRequest.current += 1;
      setAgents(initial.agents);
      setLoadingAgents(false);
    }
    if (initial.agentId) setAgentId(initial.agentId);
    if (initial.agent) setAgentFilter(initial.agent.name);
    if (initial.model) {
      if (initial.reviewId && initial.reviewId !== reviewId) {
        changeResultNavigation({ activeTab: "map", mapNavigation: undefined, nodeFilter: null });
      }
      setModel(initial.model);
      setReviewId(initial.reviewId ?? "");
      setState(
        initial.state === "fullReview" || host?.displayMode === "fullscreen"
          ? "fullReview"
          : "summary",
      );
    }
  }, [data, host?.displayMode]);

  useEffect(() => {
    if (!model) return;
    setState(current => host?.displayMode === "fullscreen" && current === "summary"
      ? "fullReview"
      : host?.displayMode === "inline" && current === "fullReview" ? "summary" : current);
  }, [host?.displayMode, Boolean(model)]);

  // Full screen ends only by the host close control. Each return to inline shows the clean map, then
  // saves and publishes the same summary data as an app exit request did, so a remount stays inline.
  const shownState = useRef(state);
  // A full review that the view restored without tool data loses its selection when the host returns
  // to inline. Its summary must replace the same saved snapshot, thus the view keeps that selection.
  const fullReviewSelection = useRef<{ selectionId: string; reviewId: string }>();
  if (state === "fullReview" && selectionId && reviewId) fullReviewSelection.current = { selectionId, reviewId };
  useEffect(() => {
    const previous = shownState.current;
    shownState.current = state;
    if (previous !== "fullReview" || state !== "summary") return;
    changeResultNavigation(cleanMapIntent(resultNavigation.current));
    const current = resultContext.current;
    if (!current.reviewId || !current.model) return;
    const kept = fullReviewSelection.current;
    const summary = {
      selectionId: current.selectionId ?? (kept?.reviewId === current.reviewId ? kept.selectionId : undefined),
      reviewId: current.reviewId, model: current.model, ...resultNavigation.current,
    };
    writeAgentReviewSnapshot(reviewStorage, { ...summary, state: "summary" });
    replaceData({ ...replayed, ...summary, state: "summary" });
  }, [state]);

  useEffect(() => {
    setFullscreenRefused(false);
  }, [reviewId]);

  useEffect(() => {
    if (!model || displayPending.current?.reviewId === reviewId || (state !== "summary" && state !== "fullReview")) return;
    writeAgentReviewSnapshot(reviewStorage, {
      selectionId, reviewId, state, model, activeTab, mapNavigation, nodeFilter,
    });
  }, [activeTab, mapNavigation, model, nodeFilter, reviewId, reviewStorage, selectionId, state]);

  useEffect(() => () => {
    agentRequest.current += 1;
    requestRevision.current += 1;
    clearPoll();
  }, []);

  const pendingSelection = Boolean(initial.restoring || initial.deferred || selectionLoadFailed);
  const selectedTargetMatches = initial.environmentId?.toLowerCase() === environmentId.toLowerCase()
    && initial.agentId?.toLowerCase() === agentId.toLowerCase()
    && initial.agent?.id.toLowerCase() === agentId.toLowerCase()
    && (!initial.componentIdUnique || initial.componentIdUnique.toLowerCase() === initial.agent?.componentIdUnique?.toLowerCase());
  const selectedAgent = agents.find(agent => agent.id.toLowerCase() === agentId.toLowerCase())
    ?? (pendingSelection && !initial.agents && selectedTargetMatches ? initial.agent : undefined);
  const selectedEnvironment = environments.find(environment => environment.id.toLowerCase() === environmentId.toLowerCase())
    ?? (pendingSelection && initial.environment?.id.toLowerCase() === environmentId.toLowerCase() ? initial.environment : undefined);
  const availableAgents = selectedAgent && !agents.some(agent => agent.id.toLowerCase() === selectedAgent.id.toLowerCase())
    ? [selectedAgent, ...agents] : agents;
  const availableEnvironments = selectedEnvironment && !environments.some(environment => environment.id.toLowerCase() === selectedEnvironment.id.toLowerCase())
    ? [selectedEnvironment, ...environments] : environments;
  const filteredEnvironments = useMemo(() => {
    const query = environmentFilter.trim().toLocaleLowerCase();
    if (!query || selectedEnvironment?.name === environmentFilter) return availableEnvironments;
    return availableEnvironments.filter((environment) =>
      `${environment.name} ${environment.region}`.toLocaleLowerCase().includes(query));
  }, [environmentFilter, availableEnvironments, selectedEnvironment]);
  const filteredAgents = useMemo(() => {
    const query = agentFilter.trim().toLocaleLowerCase();
    if (!query || selectedAgent?.name === agentFilter) return availableAgents;
    return availableAgents.filter((agent) => agent.name.toLocaleLowerCase().includes(query));
  }, [agentFilter, availableAgents, selectedAgent]);
  const selectionError = agentId && !loadingAgents && !selectedAgent?.componentIdUnique?.trim()
    ? "The selected agent is unavailable. Choose an agent from the list."
    : null;

  const publishSelection = (nextEnvironmentId: string, nextAgentId: string, nextAgents = agents, nextProjectName = projectName) => {
    requestRevision.current += 1;
    requestIdentity.current = { selectionId: initial.selectionId, environmentId: nextEnvironmentId, agentId: nextAgentId };
    const next: ToolData = {
      ...initial, state: "selecting", projectName: nextProjectName, environments: availableEnvironments,
      environmentId: nextEnvironmentId, environment: availableEnvironments.find(environment => environment.id === nextEnvironmentId),
      agentId: nextAgentId, agent: nextAgents.find(agent => agent.id === nextAgentId), agents: nextAgents,
      componentIdUnique: nextAgents.find(agent => agent.id === nextAgentId)?.componentIdUnique,
      jobId: undefined, reviewId: undefined, status: undefined, model: undefined,
      restoring: false, deferred: undefined, error: undefined, dataLoadError: undefined,
    };
    localSelectionData.current = next;
    replaceData(next);
  };

  const resetForm = () => {
    const nextProjectName = defaultProjectName();
    publishSelection("", "", [], nextProjectName);
    agentRequest.current += 1;
    setLoadingAgents(false);
    setEnvironmentId("");
    setAgentId("");
    setEnvironmentFilter("");
    setAgentFilter("");
    setAgents([]);
    setProjectName(nextProjectName);
    setStartDate("");
    setEndDate("");
    setError(null);
    setStartedAt(null);
  };

  const call = async (name: string, args: Record<string, unknown>): Promise<ToolData> => {
    if (!app) throw new Error("Agent Review is not connected.");
    const revision = requestRevision.current;
    const result = await app.callServerTool({ name, arguments: args });
    const output = structured(result);
    if (result.isError || output.state === "error") {
      if (name === "start_agent_review" && revision === requestRevision.current && output.jobId?.trim()) {
        requestIdentity.current.jobId = output.jobId.trim();
        setJobId(output.jobId.trim());
      }
      const message = result.content?.flatMap((item) => item.type === "text" ? [item.text] : []).join("\n");
      throw new ReviewToolError(
        output.error?.message || message || "Agent Review failed.",
        output.error?.code,
        output.error?.retryable,
      );
    }
    return output;
  };

  const readSavedReview = (id: string, presentation: "summary" | "fullReview"): Promise<SavedReviewData> => {
    const revision = requestRevision.current;
    const existing = savedReadPending.current;
    if (existing?.reviewId === id && existing.presentation === presentation && existing.revision === revision) {
      return existing.promise;
    }
    const promise = call("get_agent_review_result", { reviewId: id, presentation }).then(output => {
      if (!output.reviewId || output.reviewId.trim().toLowerCase() !== id.trim().toLowerCase()) {
        throw new Error("The saved Review result does not match the requested review ID.");
      }
      if (!output.model) throw new Error("The response did not include the complete saved findings.");
      return { ...output, reviewId: output.reviewId, model: output.model };
    }).finally(() => {
      if (savedReadPending.current?.promise === promise) savedReadPending.current = undefined;
    });
    savedReadPending.current = { reviewId: id, presentation, revision, promise };
    return promise;
  };

  const selectEnvironment = async (id: string) => {
    const request = ++agentRequest.current;
    const environment = availableEnvironments.find((item) => item.id === id);
    publishSelection(id, "", []);
    setEnvironmentId(id);
    setEnvironmentFilter(environment?.name ?? "");
    setAgentId("");
    setAgentFilter("");
    setAgents([]);
    setError(null);
    if (!id) return;
    setLoadingAgents(true);
    try {
      const output = await call("list_reviewable_agents", { environmentId: id });
      if (request !== agentRequest.current) return;
      setAgents(output.agents ?? []);
    } catch (caught) {
      if (request !== agentRequest.current) return;
      setError(caught instanceof Error ? caught.message : "Unable to load agents.");
    } finally {
      if (request === agentRequest.current) setLoadingAgents(false);
    }
  };

  const schedulePoll = (id: string, delay: number) => {
    clearPoll();
    const revision = requestRevision.current;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      if (revision === requestRevision.current) void poll(id);
    }, delay);
  };

  const poll = async (id: string) => {
    const revision = requestRevision.current;
    if (pollPending.current?.revision === revision) return;
    const pending = { jobId: id, revision };
    pollPending.current = pending;
    const current = () => revision === requestRevision.current;
    try {
      let output: ToolData;
      try {
        output = await call("get_agent_review_status", { jobId: id });
        if (!current()) return;
        if (!output.status) throw new ReviewToolError("The response did not include the existing job status.");
        statusReadRetries.current = 0;
        if (requestIdentity.current.reviewId) return;
      } catch (caught) {
        if (!current()) return;
        if (!(caught instanceof ReviewToolError) || caught.retryable === true) {
          const delay = STATUS_READ_RETRY_DELAYS[statusReadRetries.current];
          if (delay !== undefined) {
            statusReadRetries.current += 1;
            schedulePoll(id, delay);
            return;
          }
        }
        const message = caught instanceof Error ? caught.message : "The status read failed.";
        setError(`Unable to read Review status (get_agent_review_status): ${message}`);
        setDataLoadFailed(true);
        setState("load-error");
        return;
      }
      setDataLoadFailed(false);
      setStatus(output.status);
      let completedReviewId = "";
      try {
        if (output.status?.canFinalize) {
          setState("finalizing");
          const final = await call("finalize_agent_review", { jobId: id });
          if (!current()) return;
          completedReviewId = final.reviewId?.trim() ?? "";
          if (!completedReviewId) throw new Error("Finalization did not return an acknowledged saved review ID.");
          requestIdentity.current.reviewId = completedReviewId;
          setReviewId(completedReviewId);
          const completed = await readSavedReview(completedReviewId, "summary");
          if (!current()) return;
          setModel(completed.model);
          writeAgentReviewSnapshot(reviewStorage, {
            selectionId, reviewId: completedReviewId, state: "summary", model: completed.model,
          });
          replaceData({
            ...replayed, state: "summary", selectionId, jobId: id, status: output.status,
            reviewId: completedReviewId, model: completed.model, error: undefined, dataLoadError: undefined,
          });
          setState("summary");
        } else if (output.status?.status === "failed") {
          setError(output.status.error ?? "The review failed.");
          setState("failed");
        } else {
          setState("running");
          schedulePoll(id, output.status?.nextPollMs ?? 5_000);
        }
      } catch (caught) {
        if (!current()) return;
        const message = caught instanceof Error ? caught.message : "Unable to read review progress.";
        if (completedReviewId) {
          const diagnostic = `Unable to load saved Review results (get_agent_review_result): ${message}`;
          setModel(undefined);
          setError(diagnostic);
          replaceData({
            ...replayed, state: "summary", selectionId, jobId: id, status: output.status,
            reviewId: completedReviewId, model: undefined, error: { message: diagnostic }, dataLoadError: undefined,
          });
          setState("summary");
        } else {
          setError(message);
          setState("failed");
        }
      }
    } finally {
      if (pollPending.current === pending) pollPending.current = undefined;
    }
  };

  const loadSavedResults = async () => {
    const requestedReviewId = reviewId;
    const revision = requestRevision.current;
    if (!requestedReviewId || loadingResults) return;
    const current = () => revision === requestRevision.current && resultContext.current.reviewId === requestedReviewId;
    setLoadingResults(true);
    setError(null);
    try {
      const completed = await readSavedReview(requestedReviewId, "summary");
      if (!current()) return;
      setModel(completed.model);
      setDataLoadFailed(false);
      setLoadingResults(false);
      replaceData({
        ...replayed, state: "summary", selectionId, reviewId: requestedReviewId, model: completed.model,
        error: undefined, dataLoadError: undefined,
      });
      setState("summary");
    } catch (caught) {
      if (!current()) return;
      const message = caught instanceof Error ? caught.message : "The saved results read failed.";
      setError(`Unable to load saved Review results (get_agent_review_result): ${message}`);
    } finally {
      if (current()) setLoadingResults(false);
    }
  };

  const start = async () => {
    if (startPending.current) return;
    if (loadingAgents || !environmentId || !selectedAgent?.componentIdUnique?.trim()) {
      setError(loadingAgents
        ? "Wait for the agent list to load."
        : "The selected agent is unavailable. Choose an agent from the list.");
      return;
    }
    if (!projectName.trim()) {
      setError("Enter a project name before starting the review.");
      return;
    }
    startPending.current = true;
    requestRevision.current += 1;
    const revision = requestRevision.current;
    requestIdentity.current = { selectionId: initial.selectionId, environmentId, agentId: selectedAgent.id, componentIdUnique: selectedAgent.componentIdUnique };
    clearPoll();
    statusReadRetries.current = 0;
    changeResultNavigation({ activeTab: "map", mapNavigation: undefined, nodeFilter: null });
    setError(null);
    setDataLoadFailed(false);
    setStatus(undefined);
    setJobId("");
    setReviewId("");
    setModel(undefined);
    setStartedAt(Date.now());
    progressStagesRef.current = undefined;
    setState("starting");
    try {
      const output = await call("start_agent_review", {
        environmentId,
        agentId: selectedAgent.id,
        componentIdUnique: selectedAgent.componentIdUnique,
        confirmed: true,
        projectName,
        ...(startDate ? { transcriptStart: startDate } : {}),
        ...(endDate ? { transcriptEnd: endDate } : {}),
      });
      if (revision !== requestRevision.current) return;
      const id = output.jobId?.trim();
      if (!id) throw new Error("The review did not return a job ID.");
      requestIdentity.current.jobId = id;
      setJobId(id);
      setState("running");
      schedulePoll(id, 2_000);
    } catch (caught) {
      if (revision !== requestRevision.current) return;
      setError(caught instanceof Error ? caught.message : "Unable to start the review.");
      setState("failed");
    } finally {
      startPending.current = false;
    }
  };

  const checkExistingJob = () => {
    if (!jobId || timer.current || state === "checking") return;
    statusReadRetries.current = 0;
    setError(null);
    setState("checking");
    schedulePoll(jobId, 0);
  };

  const retryReview = () => {
    if (jobId && status?.status !== "failed") {
      checkExistingJob();
      return;
    }
    void start();
  };

  const reloadInitialData = async () => {
    if (!app || loadingInitial || startPending.current || jobId || reviewId) return;
    const revision = requestRevision.current;
    const input = { ...toolInput, resumeOnly: true };
    const request = typeof toolInput?.reviewId === "string"
      ? { name: "get_agent_review_result", arguments: { reviewId: toolInput.reviewId,
        ...(typeof toolInput.presentation === "string" ? { presentation: toolInput.presentation } : {}) } }
      : { name: "open_agent_review", arguments: environmentId && agentId
        ? { environmentId, agentId, startReview: false, resumeOnly: true } : input };
    setLoadingInitial(true);
    setError(null);
    try {
      const result = await app.callServerTool(request);
      if (!readInitialResult) throw new Error("Review data recovery is not available.");
      const restored = await readInitialResult(result);
      if (revision !== requestRevision.current) return;
      replaceMetadata(restored.metadata);
      replaceData(restored.data);
    } catch (caught) {
      if (revision === requestRevision.current) setError(caught instanceof Error ? caught.message : "Unable to restore Agent Review data.");
    } finally {
      if (revision === requestRevision.current) setLoadingInitial(false);
    }
  };

  useEffect(() => {
    if (!app || initial.state !== "running" || timer.current || pollPending.current?.revision === requestRevision.current
      || requestIdentity.current.reviewId || state === "background" || state === "finalizing") return;
    const resumedJobId = acknowledgedJobId;
    if (!resumedJobId) return;
    setJobId(resumedJobId);
    const resumedStartedAt = initial.status?.startedAt ?? initial.startedAt;
    const parsed = resumedStartedAt ? Date.parse(resumedStartedAt) : Number.NaN;
    if (Number.isFinite(parsed)) setStartedAt(parsed);
    schedulePoll(resumedJobId, initial.status?.nextPollMs ?? 0);
  }, [app, data]);

  if (missingInitialData) {
    return <div className={styles.root}>
      {startupWaitExpired || error ? <>
        <MessageBar intent="error" layout="multiline" role="alert">
          <MessageBarBody>{error ?? "The host has not delivered Agent Review data. Reload this view; this read does not start a review."}</MessageBarBody>
        </MessageBar>
        <Button disabled={!app || loadingInitial} onClick={() => void reloadInitialData()}>Reload Review data</Button>
      </> : "Restoring Agent Review…"}
    </div>;
  }

  const requestResultDisplay = async (
    mode: "inline" | "fullscreen",
    savedModel = model,
    intent?: NavigationIntent,
    refusedIntent?: NavigationIntent,
  ) => {
    const requestedReviewId = reviewId;
    const intendedState = mode === "fullscreen" ? "fullReview" : "summary";
    const previousState = state === "fullReview" ? "fullReview" : "summary";
    const intendedNavigation = () => intent?.(resultNavigation.current) ?? resultNavigation.current;
    const save = (resultState: "summary" | "fullReview", navigation = resultNavigation.current) =>
      writeAgentReviewSnapshot(reviewStorage, {
        selectionId, reviewId: requestedReviewId, state: resultState, model: savedModel,
        ...navigation,
      });
    const publish = (resultState: "summary" | "fullReview") => {
      save(resultState);
      setState(resultState);
      replaceData({
        ...replayed, state: resultState, selectionId, reviewId: requestedReviewId,
        model: savedModel, ...resultNavigation.current,
      });
    };
    if (displayPending.current) {
      if (displayPending.current.reviewId === requestedReviewId) {
        if (displayPending.current.mode === mode) {
          displayIntent.current = intent;
          displayRefusedIntent.current = refusedIntent;
        }
        save(intendedState, intendedNavigation());
      }
      return;
    }
    let displayRequested = false;
    try {
      if (!app) throw new Error("Agent Review is not connected.");
      if (!savedModel || !requestedReviewId) throw new Error("The saved review is not available.");
      displayPending.current = { reviewId: requestedReviewId, mode };
      displayIntent.current = intent;
      displayRefusedIntent.current = refusedIntent;
      setError(null);
      setDisplayFeedback(null);
      // A host can remount the app before its display request resolves.
      if (!save(intendedState, intendedNavigation())) throw new Error("The selected review view could not be saved for fullscreen.");
      displayRequested = true;
      const display = await app.requestDisplayMode({ mode });
      if (resultContext.current.reviewId !== requestedReviewId) return;
      if (display.mode !== mode) throw new Error(mode === "fullscreen"
        ? "Fullscreen review is not available in this host."
        : "The host could not return the review to inline mode.");
      const accepted = displayIntent.current;
      displayIntent.current = undefined;
      displayRefusedIntent.current = undefined;
      if (accepted) changeResultNavigation(accepted(resultNavigation.current));
      if (mode === "fullscreen") setFullscreenRefused(false);
      publish(intendedState);
    } catch (caught) {
      const refused = displayRequested ? displayRefusedIntent.current : undefined;
      displayIntent.current = undefined;
      displayRefusedIntent.current = undefined;
      if (resultContext.current.reviewId !== requestedReviewId) return;
      if (refused) {
        // The request is complete. Thus the change does not save a fullscreen snapshot.
        displayPending.current = undefined;
        changeResultNavigation(refused(resultNavigation.current));
      }
      publish(previousState);
      if (displayRequested) {
        if (mode === "fullscreen") setFullscreenRefused(true);
        setDisplayFeedback({
          reviewId: requestedReviewId,
          message: mode === "fullscreen" ? "Fullscreen is not available in this host." : "The host did not return the review to inline mode.",
        });
      } else setError(caught instanceof Error ? caught.message : "Unable to change the review display mode.");
    } finally {
      if (displayPending.current?.reviewId === requestedReviewId) {
        displayPending.current = undefined;
        displayIntent.current = undefined;
        displayRefusedIntent.current = undefined;
      }
    }
  };

  const openFullReview = async () => {
    const requestedReviewId = reviewId;
    const revision = requestRevision.current;
    const current = () => revision === requestRevision.current && resultContext.current.reviewId === requestedReviewId;
    try {
      if (!app) throw new Error("Agent Review is not connected.");
      const output = await readSavedReview(requestedReviewId, "fullReview");
      if (!current()) return;
      setModel(output.model);
      await requestResultDisplay("fullscreen", output.model);
    } catch (caught) {
      if (!current()) return;
      setError(caught instanceof Error ? caught.message : "Unable to load the review.");
    }
  };

  // Full screen relies on the host close control (see the shownState effect).
  const fullscreenAvailable = fullscreenOffered(host) && !fullscreenRefused;
  const activateNode = (filter: ReviewNodeFilter, navigation: ReviewMapNavigation) => {
    if (state === "fullReview" || host?.displayMode === "fullscreen" || !fullscreenAvailable) {
      changeResultNavigation({ activeTab: "findings", nodeFilter: filter, mapNavigation: navigation });
      return;
    }
    // Inline keeps the map while the host opens the node's findings in fullscreen. A refusal shows them inline.
    changeResultNavigation({ mapNavigation: navigation });
    void requestResultDisplay("fullscreen", model, findingsIntent(filter), findingsIntent(filter));
  };
  const viewAllFindings = (filter: ReviewNodeFilter | null) => {
    void requestResultDisplay("fullscreen", model, findingsIntent(filter));
  };

  if (!simulation && (state === "fullReview" || state === "summary") && model) {
    const expanded = state === "fullReview";
    return (
      <div
        className={expanded ? styles.fullscreenRoot : styles.summaryContainer}
        style={{
          height: expanded
            ? fullscreenHeight(host?.containerDimensions, window.screen.availHeight)
            : `${inlineContentHeight(host?.containerDimensions, measureFrameInset().height)}px`,
        }}
      >
        <div className={mergeClasses(styles.fullscreenHeader, !expanded && styles.inlineHeader)}>
          <Text as="h2" size={expanded ? 500 : 300} weight="semibold" className={styles.fullscreenTitle}>{model.summary.agentName}</Text>
          {!expanded && <Tooltip content="Expand to fullscreen" relationship="label">
            <Button
              appearance="secondary"
              size="small"
              icon={<ArrowMaximizeRegular />}
              aria-label="Expand to fullscreen"
              onClick={() => void openFullReview()}
            />
          </Tooltip>}
        </div>
        {displayFeedback?.reviewId === reviewId && <Text size={200} className={styles.displayFeedback}>{displayFeedback.message}</Text>}
        <div className={mergeClasses(styles.fullscreenContent, !expanded && styles.inlineContent)}>
          {error && <MessageBar intent="error" layout="multiline" className={expanded ? undefined : styles.inlineMessage}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
          <CopilotReviewResults
            model={model} reviewId={reviewId} activeTab={activeTab} onTabChange={changeTab}
            showSummary={expanded}
            mapNavigation={mapNavigation} onMapNavigationChange={changeMapNavigation}
            nodeFilter={nodeFilter} onNodeFilterChange={changeNodeFilter} onActivateNode={activateNode}
            fullscreenAvailable={!expanded && fullscreenAvailable}
            onViewAllFindings={viewAllFindings}
            onOpenFullscreen={() => void openFullReview()}
          />
        </div>
      </div>
    );
  }

  if (state === "load-error" || state === "checking") {
    const checking = state === "checking";
    return (
      <div className={styles.root}>
        <div className={styles.card}>
          <div className={styles.header}>
            <Title3>{checking ? "Checking existing job" : "Review data could not be loaded"}</Title3>
            <Button
              className={styles.dismiss}
              appearance="subtle"
              aria-label="Close review error"
              icon={<Dismiss20Regular />}
              disabled={checking}
              onClick={() => setState("background")}
            />
          </div>
          <div className={styles.fields}>
            <Text>Review progress is unknown.</Text>
            <Text>A data-read error does not confirm that the Review job failed.</Text>
            <Text>Job ID: {jobId}</Text>
            {checking && <Spinner size="small" label="Reading existing job status" />}
            {error && (
              <MessageBar intent="error" layout="multiline" role="alert">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </div>
          <div className={styles.actions}>
            <Button appearance="primary" disabled={checking || !jobId} onClick={checkExistingJob}>
              Check existing job
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (simulation || ["starting", "running", "finalizing", "failed"].includes(state)) {
    // A demo step has no job: no status poll, no error, and no background or retry action.
    const simulatedModel = simulation ? replayed.model : undefined;
    const progress = simulation
      ? simulatedReviewProgress(simulation.step, reviewedSkillCount(simulatedModel))
      : reviewProgress(state, status);
    const hasError = !simulation && state === "failed" ? error : null;
    const total = simulation ? reviewedSkillCount(simulatedModel) : Math.max(0, status?.totalComponents ?? 0);
    const nextStages = buildCopilotReviewProgressStages(
      progress,
      Boolean(hasError),
      simulation ? undefined : progressStagesRef.current,
      { canCancelExecution: false },
    );
    const previousStages = simulation ? undefined : progressStagesRef.current;
    const stages = previousStages && reachedIndex(nextStages) < reachedIndex(previousStages)
      ? previousStages
      : nextStages;
    if (!simulation && stages.length > 0) progressStagesRef.current = stages;
    const activeStage = stages.find((stage) => stage.status === "active");
    const errorStage = stages.find((stage) => stage.status === "error");
    const currentProgress = activeStage?.progress
      ?? errorStage?.progress
      ?? (stages.length > 0 ? 100 : 0);
    const agentName = simulatedModel?.summary.agentName ?? selectedAgent?.name ?? status?.agentName ?? "Agent";
    const liveAnnouncement = hasError
      ? `Review of ${agentName} failed`
      : activeStage
        ? [activeStage.stageName, activeStage.detail].filter(Boolean).join(", ")
        : stages.length > 0
          ? "Review complete."
          : `Preparing review for ${agentName}`;
    return (
      <div className={styles.root}>
        <div className={`${styles.card} ${styles.progressCard}`}>
          <div className={styles.header}>
            <div className={styles.progressTitle}>
              {hasError
                ? <DismissCircle20Filled style={{ color: tokens.colorPaletteRedForeground1 }} />
                : progressTitleIcon(activeStage?.stageName ?? (stages.length > 0 ? "Complete" : "Initializing"), tokens.colorBrandForeground1)}
              <Title3 className={styles.progressTitleText}>
                {hasError ? `Review failed for ${agentName}` : `Reviewing ${agentName}...`}
              </Title3>
            </div>
            {hasError && (
              <Button
                className={styles.dismiss}
                appearance="subtle"
                aria-label="Close review error"
                icon={<Dismiss20Regular />}
                onClick={() => {
                  setError(null);
                  setState(jobId ? "background" : "selecting");
                }}
              />
            )}
          </div>
          <div className={styles.progressContent}>
            <div
              className={styles.visuallyHidden}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {liveAnnouncement}
            </div>
            <div className={styles.progressRow}>
              <ProgressBar
                className={styles.progressBar}
                value={currentProgress / 100}
                color={hasError ? "error" : undefined}
                aria-label={hasError
                  ? `Review of ${agentName} failed`
                  : `Reviewing ${agentName}${activeStage ? `: ${activeStage.stageName}` : ""}`}
                aria-valuetext={`${Math.round(currentProgress)}%`}
              />
              <Text className={styles.progressPercent}>{Math.round(currentProgress)}%</Text>
            </div>
            {stages.length > 0 && (
              <div className={styles.stageList}>
                {stages.map((stage) => (
                  <div key={stage.stageName}>
                    <div className={styles.stageRow}>
                      {stage.status === "completed" && (
                        <CheckmarkCircle20Filled
                          style={{ color: tokens.colorPaletteGreenForeground1, flexShrink: 0 }}
                        />
                      )}
                      {stage.status === "active" && (
                        <Spinner
                          size="tiny"
                          aria-label={`${stage.stageName} in progress`}
                          style={{ flexShrink: 0 }}
                        />
                      )}
                      {stage.status === "error" && (
                        <DismissCircle20Filled
                          style={{ color: tokens.colorPaletteRedForeground1, flexShrink: 0 }}
                        />
                      )}
                      {stage.status === "pending" && (
                        <Circle20Regular
                          style={{
                            color: tokens.colorNeutralForegroundDisabled,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <Text
                        size={200}
                        className={stage.status === "pending" ? styles.stagePending : undefined}
                      >
                        {stage.stageName}
                      </Text>
                      <span className={styles.visuallyHidden}>
                        {STAGE_STATUS_LABEL[stage.status]}
                      </span>
                      {stage.attribution === "workflow-agent" && (
                        <span
                          className={mergeClasses(
                            styles.stageAttribution,
                            stage.status !== "completed"
                              && stage.status !== "active"
                              && styles.stageAttributionPending,
                          )}
                        >
                          {stage.status === "completed"
                            ? <WorkflowMarkColor size={16} />
                            : (
                              <WorkflowMark
                                size={16}
                                className={stage.status === "active"
                                  ? styles.stageAttributionLive
                                  : styles.stageAttributionIdle}
                              />
                            )}
                          <span className={styles.stageAttributionLabel}>Agent node</span>
                        </span>
                      )}
                    </div>
                    {stage.detail && (
                      <Text size={100} className={styles.stageDetail}>
                        {stage.detail}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            )}
            <ReviewWaitFooter
              startedAt={simulation?.startedAt ?? startedAt}
              scopeSummary={total > 0
                ? `${total} ${total === 1 ? "skill" : "skills"}`
                : "Agent-wide analysis"}
              failed={Boolean(hasError)}
            />
            {hasError && (
              <ReviewErrorContent title="Review failed" message={hasError} />
            )}
          </div>
          {!simulation && (hasError || jobId) && (
            <div className={styles.actions}>
              {hasError ? (
                <Button
                  className={styles.progressActionButton}
                  appearance="primary"
                  onClick={retryReview}
                >
                  {jobId && status?.status !== "failed" ? "Check existing job" : "Retry"}
                </Button>
              ) : (
                <Button
                  className={styles.progressActionButton}
                  appearance="secondary"
                  onClick={() => {
                    clearPoll();
                    setState("background");
                  }}
                >
                  Continue in background
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state === "background") {
    return (
      <div className={styles.root}>
        <div className={styles.card}>
          <div className={styles.header}>
            <Title3>Review in background</Title3>
            <Text>{projectName}</Text>
          </div>
          <div className={styles.progress}>
            <MessageBar>
              <MessageBarBody>
                {dataLoadFailed
                  ? `Review progress is unknown. Reopen the existing Review with job ID ${jobId}.`
                  : `The workflow continues. Reopen this review with job ID ${jobId}.`}
              </MessageBarBody>
            </MessageBar>
            {dataLoadFailed && error && (
              <MessageBar intent="error" layout="multiline" role="alert">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </div>
          <div className={styles.actions}>
            <Button appearance="primary" onClick={() => {
              if (dataLoadFailed) {
                checkExistingJob();
                return;
              }
              setState("running");
              schedulePoll(jobId, 0);
            }}>
              {dataLoadFailed ? "Check existing job" : "Resume progress"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (state === "summary") {
    return (
      <div className={styles.root}>
        <div className={styles.card}>
          <div className={styles.header}>
            <Title3>Review results could not be loaded</Title3>
          </div>
          <div className={styles.fields}>
            <Text>This view keeps the requested saved review ID. Loading results does not start or finalize a job.</Text>
            <Text>Review ID: {reviewId}</Text>
            {jobId && <Text>Job ID: {jobId}</Text>}
            {loadingResults && <Spinner size="small" label="Loading saved Review results" />}
            {error && (
              <MessageBar intent="error" layout="multiline" role="alert">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </div>
          <div className={styles.actions}>
            <Button appearance="primary" disabled={loadingResults || !reviewId} onClick={() => void loadSavedResults()}>
              Load saved results
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Title3>New review</Title3>
          <Button
            className={styles.dismiss}
            appearance="subtle"
            icon={<Dismiss20Regular />}
            aria-label="Clear review form"
            onClick={resetForm}
          />
        </div>
        <div className={styles.fields}>
          {(error || selectionError) && (
            <MessageBar intent="error" layout="multiline" role="alert"><MessageBarBody>{error || selectionError}</MessageBarBody></MessageBar>
          )}
          {selectionLoadFailed && <Button disabled={loadingInitial} onClick={() => void reloadInitialData()}>Reload Review data</Button>}
          <Field label="Project name" required>
            <Input value={projectName} onChange={(_, value) => setProjectName(value.value)} />
          </Field>
          <Field label="What kind of asset are you reviewing?">
            <TabList
              className={styles.assetOptions}
              appearance="subtle-circular"
              size="small"
              selectedValue="copilot-studio"
              aria-label="Asset type"
            >
              <Tab
                value="copilot-studio"
                icon={<img className={styles.assetIcon} src={CopilotStudioIcon} alt="" />}
              >
                Copilot Studio Agent
              </Tab>
              <Tab
                value="declarative-agent"
                icon={<img className={styles.assetIcon} src={M365CopilotIcon} alt="" />}
                disabled
              >
                Declarative Agent
              </Tab>
              <Tab
                value="skill"
                icon={<PuzzlePieceColor fontSize={16} />}
                disabled
              >
                Skill
              </Tab>
            </TabList>
          </Field>
          <Field label="Choose Environment">
            <Combobox
              value={environmentFilter}
              selectedOptions={environmentId ? [environmentId] : []}
              onChange={(event) => {
                const value = event.target.value;
                setEnvironmentFilter(value);
                if (environmentId && value !== selectedEnvironment?.name) {
                  agentRequest.current += 1;
                  setLoadingAgents(false);
                  setEnvironmentId("");
                  setAgentId("");
                  setAgentFilter("");
                  setAgents([]);
                  publishSelection("", "", []);
                }
              }}
              onOptionSelect={(_, option) => {
                if (option.optionValue) void selectEnvironment(option.optionValue);
              }}
              placeholder="All environments"
            >
              {filteredEnvironments.map((environment) => (
                <Option key={environment.id} value={environment.id} text={environment.name}>
                  {environment.name}
                </Option>
              ))}
              {filteredEnvironments.length === 0 && (
                <Option disabled value="no-environments">No matching environments</Option>
              )}
            </Combobox>
          </Field>
          <Field label="Choose agent" hint={loadingAgents ? "Loading agents..." : undefined}>
            <div className={styles.agentPicker}>
              {selectedAgent && (
                <span className={styles.selectedAgentIcon}>
                  {botIconSource(selectedAgent.iconBase64) ? (
                    <Image
                      src={botIconSource(selectedAgent.iconBase64)}
                      alt=""
                      className={styles.agentIcon}
                    />
                  ) : (
                    <BotSparkle24Color className={styles.agentFallbackIcon} aria-hidden="true" />
                  )}
                </span>
              )}
              <Combobox
                className={selectedAgent ? styles.agentComboboxWithIcon : undefined}
                disabled={!environmentId || loadingAgents}
                value={agentFilter}
                selectedOptions={agentId ? [agentId] : []}
                onChange={(event) => {
                  const value = event.target.value;
                  setAgentFilter(value);
                  if (agentId && value !== selectedAgent?.name) {
                    setAgentId("");
                    publishSelection(environmentId, "");
                  }
                }}
                onOptionSelect={(_, option) => {
                  if (!option.optionValue) return;
                  const id = option.optionValue;
                  const agent = availableAgents.find((item) => item.id === id);
                  setAgentId(id);
                  setAgentFilter(agent?.name ?? "");
                  publishSelection(environmentId, id, availableAgents);
                }}
                placeholder={loadingAgents ? "Loading..." : "Search"}
              >
                {filteredAgents.map((agent) => {
                  const icon = botIconSource(agent.iconBase64);
                  return (
                    <Option key={agent.id} value={agent.id} text={agent.name}>
                      <span className={styles.agentOption}>
                        {icon ? (
                          <Image src={icon} alt="" className={styles.agentIcon} />
                        ) : (
                          <BotSparkle24Color className={styles.agentFallbackIcon} aria-hidden="true" />
                        )}
                        <span className={styles.optionName}>{agent.name}</span>
                      </span>
                    </Option>
                  );
                })}
                {!loadingAgents && environmentId && filteredAgents.length === 0 && (
                  <Option disabled value="no-agents">No matching agents</Option>
                )}
              </Combobox>
            </div>
          </Field>
          <div className={styles.dateSection}>
            <div className={styles.dateLabel}>
              <Text weight="semibold">Date range for transcripts</Text>
              <Info16Regular aria-label="Transcript date range information" />
            </div>
            <div className={styles.dates}>
              <DatePicker
                className={styles.datePicker}
                aria-label="Transcript start date"
                placeholder="Start date"
                value={parseIsoDate(startDate)}
                formatDate={formatDisplayDate}
                onSelectDate={(date) => setStartDate(date ? toIsoDate(date) : "")}
              />
              <Text>to</Text>
              <DatePicker
                className={styles.datePicker}
                aria-label="Transcript end date"
                placeholder="End date"
                value={parseIsoDate(endDate)}
                formatDate={formatDisplayDate}
                onSelectDate={(date) => setEndDate(date ? toIsoDate(date) : "")}
              />
            </div>
            <Text size={200}>Returning up to 100 transcript records</Text>
          </div>
        </div>
        <div className={styles.actions}>
          <Button
            appearance="primary"
            disabled={!environmentId || !selectedAgent?.componentIdUnique?.trim() || !projectName.trim() || loadingAgents}
            onClick={() => void start()}
          >
            Create
          </Button>
          <Button onClick={resetForm}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
