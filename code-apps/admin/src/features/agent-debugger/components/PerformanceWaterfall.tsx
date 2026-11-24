/**
 * PerformanceWaterfall — Option E: Turn-Based Waterfall.
 *
 * Renders one collapsible section per user turn so that each turn's steps are
 * scaled to that turn's own wall-clock window rather than the conversation
 * total.  This makes a 500 ms tool call inside a 10-second turn as visible as
 * a 5-second call in a 100-second turn.
 *
 * Layout per turn:
 *   ┌─ Turn N: "user message"  ──────────────── [1m 5s] ─┐
 *   │  4 steps · Slowest: SummarizeResume  17.33s         │
 *   │  0s ─────────── 30s ─────────────── 1m 5s           │
 *   │  ResumeUpload  ██                         2.37s     │
 *   │  Summarize       ████████████            17.33s ⚠   │
 *   └──────────────────────────────────────────────────── ┘
 */

/* eslint-disable react-hooks/preserve-manual-memoization */

import { useMemo, useState } from "react";
import {
  Badge,
  Body1Strong,
  Button,
  Caption1,
  Caption1Strong,
  Card,
  CardHeader,
  Subtitle2,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowExpandAll20Regular,
  ArrowCollapseAll20Regular,
  ArrowRight16Regular,
  ChevronDown16Regular,
  ChevronDown20Regular,
  ChevronRight16Regular,
  ChevronUp20Regular,
  Info16Regular,
  Timer20Regular,
} from "@fluentui/react-icons";
import type { ProcessedTurn, MCPServerInfo } from "../contracts/transcript";
import type { ComponentInfo } from "../services/botcomponents-service";
import type { ConnectedAgentInfo } from "../contracts/connected-agent";
import {
  guessStepSubtitle,
  resolveExecutionTimeString,
  resolveStepName,
  execTimeToMs,
  fmtDuration,
} from "../utils/step-classification";
import { GENERATIVE_THINKING_TASK_ID } from "../utils/transcript/parse-generative-transcript";
import { activityTimestampMs } from "../utils/transcript/timestamp";
import { componentColor } from "../theme/component-colors";

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------

const FAILED_COLOR = tokens.colorPaletteRedBorderActive;  // keep token for accessibility contrast

const TIMELINE_NAME_COLUMN_PX = 172;
const TIMELINE_NAME_MAX_CHARS = 26;
const SLOW_THRESHOLD_MS = 5_000;
/** Minimum turn idle time before it's surfaced (below this is measurement noise). */
const IDLE_MIN_MS = 50;
const TICK_PCTS = [0, 25, 50, 75, 100] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(value: string, maxChars: number): string {
  if (!value || value.length <= maxChars) return value;
  if (maxChars <= 3) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 3)}...`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  // ── Card wrapper (non-contained mode) ───────────────────────────────────
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  infoIcon: {
    color: tokens.colorNeutralForeground3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "unset",
    width: "20px",
    height: "20px",
    padding: 0,
    border: "none",
    backgroundColor: "transparent",
    cursor: "help",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL} ${tokens.spacingVerticalM}`,
  },

  // ── Global summary stats ────────────────────────────────────────────────
  summaryRow: {
    display: "flex",
    gap: tokens.spacingHorizontalXL,
    flexWrap: "wrap",
    paddingBottom: tokens.spacingVerticalXS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
  },
  statLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  statValue: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  statValueSlow: { color: tokens.colorPaletteRedForeground1 },

  // ── Turn section ────────────────────────────────────────────────────────
  turnSection: {
    display: "flex",
    flexDirection: "column",
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
  },

  // ── Turn header (clickable) ─────────────────────────────────────────────
  turnHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    cursor: "pointer",
    userSelect: "none" as const,
    "&:hover": {
      backgroundColor: tokens.colorSubtleBackgroundHover,
    },
  },
  turnHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
    flex: 1,
  },
  turnLabel: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  turnMessage: {
    color: tokens.colorNeutralForeground1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  turnHeaderRight: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    flexShrink: 0,
  },

  // ── Turn body ───────────────────────────────────────────────────────────
  turnBody: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  turnStats: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    paddingBottom: tokens.spacingVerticalXXS,
  },
  turnStatChip: {
    color: tokens.colorNeutralForeground3,
  },
  turnStatChipSlow: {
    color: tokens.colorPaletteYellowForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },

  // ── Per-turn time axis ──────────────────────────────────────────────────
  timeAxis: {
    display: "flex",
    justifyContent: "space-between",
    paddingLeft: `${TIMELINE_NAME_COLUMN_PX + 12}px`,
    paddingRight: "64px",
  },
  timeTick: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },

  // ── Step rows ───────────────────────────────────────────────────────────
  stepRows: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
  },
  // Connected-agent grouping box — mirrors the debug view's connected-agent box
  // so the agent's child steps are clearly delineated on the timeline.
  connectedBox: {
    marginTop: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalS,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    borderInlineStartWidth: tokens.strokeWidthThick,
    borderInlineStartStyle: "solid",
    borderInlineStartColor: "#9373C0",
    borderTopRightRadius: tokens.borderRadiusMedium,
    borderBottomRightRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  connectedBoxHeader: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalXXS,
  },
  connectedBoxDot: {
    width: "8px",
    height: "8px",
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: "#9373C0",
    flexShrink: 0,
  },
  stepRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    minHeight: "22px",
  },
  stepName: {
    width: `${TIMELINE_NAME_COLUMN_PX}px`,
    minWidth: `${TIMELINE_NAME_COLUMN_PX}px`,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  barTrack: {
    flex: 1,
    position: "relative" as const,
    height: "18px",
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusSmall,
    overflow: "hidden",
  },
  bar: {
    position: "absolute" as const,
    top: "0",
    height: "100%",
    borderRadius: tokens.borderRadiusSmall,
    minWidth: "3px",
  },
  durationLabel: {
    width: "56px",
    minWidth: "56px",
    textAlign: "right" as const,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
  durationLabelSlow: {
    color: tokens.colorPaletteYellowForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  durationLabelFailed: {
    color: tokens.colorPaletteRedForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  idleName: {
    width: `${TIMELINE_NAME_COLUMN_PX}px`,
    minWidth: `${TIMELINE_NAME_COLUMN_PX}px`,
    fontSize: tokens.fontSizeBase200,
    fontStyle: "italic",
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  idleSegment: {
    position: "absolute" as const,
    top: "0",
    height: "100%",
    minWidth: "2px",
    borderRadius: tokens.borderRadiusSmall,
    backgroundImage: `repeating-linear-gradient(45deg, ${tokens.colorNeutralStroke1} 0, ${tokens.colorNeutralStroke1} 2px, transparent 2px, transparent 5px)`,
  },
  idleSwatch: {
    width: "10px",
    height: "10px",
    borderRadius: tokens.borderRadiusSmall,
    flexShrink: 0,
    backgroundImage: `repeating-linear-gradient(45deg, ${tokens.colorNeutralStroke1} 0, ${tokens.colorNeutralStroke1} 2px, transparent 2px, transparent 5px)`,
  },

  // ── Legend ───────────────────────────────────────────────────────────────
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalXS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  legendSwatch: {
    width: "10px",
    height: "10px",
    borderRadius: tokens.borderRadiusSmall,
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WaterfallEntry {
  id: string;
  name: string;
  type: string;
  color: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  failed: boolean;
  turnIndex: number;
  /** Friendly name of the owning connected agent — set on child steps so the
   *  timeline can group them in a labeled box, mirroring the debug view. */
  connectedAgentName?: string;
}

interface TurnGroup {
  turnIndex: number;
  userMessage: string;
  turnStartMs: number;
  turnEndMs: number;
  turnDurationMs: number;
  entries: WaterfallEntry[];
  failedCount: number;
  slowestEntry: WaterfallEntry;
  /** Spans within the turn where no tracked activity was executing. */
  idleIntervals: Array<[number, number]>;
  /** Total idle time in the turn (sum of idleIntervals). */
  idleMs: number;
}

/** `value` payload of the DynamicServerInitialize / DynamicServerToolsList events. */
interface McpServerEventValue {
  dialogSchemaName?: string;
}

/**
 * Computes the idle intervals within a turn — spans inside [turnStartMs, turnEndMs]
 * where NO tracked activity is executing. Activity intervals are merged first
 * (connected-agent parent bars overlap their children and parallel tools can
 * overlap), so only genuine gaps between the merged busy periods count as idle.
 * Works for both classic and new-designer transcripts since every entry carries a
 * real start/end time.
 */
function computeTurnIdle(
  entries: WaterfallEntry[],
  turnStartMs: number,
  turnEndMs: number,
): { idleIntervals: Array<[number, number]>; idleMs: number } {
  const active = entries
    .map((e) => [e.startMs, e.endMs] as [number, number])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of active) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const idleIntervals: Array<[number, number]> = [];
  let cursor = turnStartMs;
  for (const [s, e] of merged) {
    if (s > cursor) idleIntervals.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (turnEndMs > cursor) idleIntervals.push([cursor, turnEndMs]);
  const idleMs = idleIntervals.reduce((sum, [s, e]) => sum + (e - s), 0);
  return { idleIntervals, idleMs };
}

interface PerformanceWaterfallProps {
  turns: ProcessedTurn[];
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  connectedAgents?: ConnectedAgentInfo[];
  /** When true renders only the chart content — no Card wrapper. */
  isContained?: boolean;
  /** Called with the user message activity ID when the user clicks a "Turn N →" link. */
  onTurnSelect?: (messageId: string) => void;
}

function buildAgentInfoLookup(
  connectedAgents?: ConnectedAgentInfo[],
): Map<string, ConnectedAgentInfo> {
  const map = new Map<string, ConnectedAgentInfo>();
  for (const ca of connectedAgents ?? []) {
    if (ca.stepId) map.set(`step:${ca.stepId}`, ca);
    if (ca.dialogSchemaName) map.set(`tdi:${ca.dialogSchemaName}`, ca);
    if (ca.botSchemaName) map.set(`bot:${ca.botSchemaName}`, ca);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PerformanceWaterfall({
  turns,
  componentNameBySchemaName,
  connectedAgents,
  isContained = false,
  onTurnSelect,
}: PerformanceWaterfallProps) {
  const styles = useStyles();
  // Collapse state for the whole Card (non-contained mode)
  const [cardCollapsed, setCardCollapsed] = useState(true);
  // Per-turn expanded state: empty set = all collapsed by default
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  const toggleTurn = (turnIndex: number) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnIndex)) next.delete(turnIndex);
      else next.add(turnIndex);
      return next;
    });
  };

  const expandAll = () => setExpandedTurns(new Set(turnGroups.map((g) => g.turnIndex)));
  const collapseAll = () => setExpandedTurns(new Set());

  // ── Build flat entry list (unchanged logic) ────────────────────────────
  const entries = useMemo<WaterfallEntry[]>(() => {
    const out: WaterfallEntry[] = [];
    const agentInfoByKey = buildAgentInfoLookup(connectedAgents);

    turns.forEach((turn, turnIndex) => {
      const execs = turn.debugInfo?.stepExecutions;

      if (execs?.length) {
        for (const exec of execs) {
          if (!exec.taskDialogId) continue;
          if (
            exec.taskDialogId === "P:CaptureContextTool" ||
            exec.taskDialogId === "P:SendMessageTool"
          ) continue;
          // Reasoning (ThinkingTrace) is not a timed operation — exclude it from
          // the performance timeline, which measures step durations.
          if (exec.taskDialogId === GENERATIVE_THINKING_TASK_ID) continue;

          const startTs = exec.triggeredAt ? new Date(exec.triggeredAt).getTime() : 0;
          const resolvedStr = resolveExecutionTimeString(exec);
          const resolvedMs = resolvedStr ? execTimeToMs(resolvedStr) : 0;
          // Skills (and other Completed-only steps) carry no triggeredAt — derive
          // a start from finishedAt minus duration so their turn still appears on
          // the timeline instead of being dropped.
          let effectiveStart = startTs;
          if (!effectiveStart || !Number.isFinite(effectiveStart)) {
            const fin = exec.finishedAt ? new Date(exec.finishedAt).getTime() : 0;
            if (fin && Number.isFinite(fin)) effectiveStart = resolvedMs > 0 ? fin - resolvedMs : fin;
          }
          if (!effectiveStart || !Number.isFinite(effectiveStart)) continue;

          let endTs: number;
          if (resolvedMs > 0) {
            endTs = effectiveStart + resolvedMs;
          } else {
            endTs = exec.finishedAt ? new Date(exec.finishedAt).getTime() : 0;
            if (!endTs || !Number.isFinite(endTs) || endTs < effectiveStart) endTs = effectiveStart;
          }

          const failed =
            String(exec.state) === "failed" ||
            String(exec.state) === "error" ||
            String(exec.state) === "faulted" ||
            String(exec.state) === "blocked";
          const type =
            exec.subtitle?.trim() ||
            guessStepSubtitle(
              exec.taskDialogId,
              exec.type,
              componentNameBySchemaName?.[exec.taskDialogId],
              exec.observation,
            );

          out.push({
            id: `${turn.id}:${exec.taskDialogId}:${exec.stepId}`,
            name:
              exec.displayName?.trim() ||
              resolveStepName(exec.taskDialogId, componentNameBySchemaName),
            type,
            color: failed ? FAILED_COLOR : componentColor(type),
            startMs: effectiveStart,
            endMs: endTs,
            durationMs: Math.max(0, endTs - effectiveStart),
            failed,
            turnIndex,
          });

          // Expand child transcript steps for connected/child agents
          if (type !== "Connected agent" && type !== "Child agent") continue;
          const agentInfo =
            agentInfoByKey.get(`step:${String(exec.stepId)}`) ??
            agentInfoByKey.get(`tdi:${exec.taskDialogId}`) ??
            agentInfoByKey.get(`bot:${exec.taskDialogId}`);
          if (!agentInfo) continue;

          // Friendly connected-agent name (resolved like ConnectedAgentCard) used
          // to group the agent's child steps into a labeled box in the timeline.
          // Prefer the component-resolved name, then the friendly step displayName
          // (generative toolDisplayName, e.g. "Interview Agent"), and only fall
          // back to the schema-derived agentInfo.displayName as a last resort.
          const connectedAgentName =
            componentNameBySchemaName?.[agentInfo.dialogSchemaName]?.modelDisplayName?.trim() ||
            componentNameBySchemaName?.[agentInfo.dialogSchemaName]?.name?.trim() ||
            componentNameBySchemaName?.[agentInfo.botSchemaName]?.modelDisplayName?.trim() ||
            componentNameBySchemaName?.[agentInfo.botSchemaName]?.name?.trim() ||
            exec.displayName?.trim() ||
            agentInfo.displayName?.trim() ||
            "Connected agent";
          for (const childTurn of agentInfo.childTranscript ?? []) {
            for (const childExec of childTurn.debugInfo?.stepExecutions ?? []) {
              if (!childExec.taskDialogId) continue;
              // Reasoning (ThinkingTrace) is not a timed operation — exclude it.
              if (childExec.taskDialogId === GENERATIVE_THINKING_TASK_ID) continue;
              if (
                childExec.taskDialogId === "P:CaptureContextTool" ||
                childExec.taskDialogId === "P:SendMessageTool"
              ) continue;
              const cStr = resolveExecutionTimeString(childExec);
              const cMs  = cStr ? execTimeToMs(cStr) : 0;
              // Derive a start from finishedAt for Completed-only child steps
              // (e.g. skills) so they aren't dropped.
              let cStart = childExec.triggeredAt ? new Date(childExec.triggeredAt).getTime() : 0;
              if (!cStart || !Number.isFinite(cStart)) {
                const cFin = childExec.finishedAt ? new Date(childExec.finishedAt).getTime() : 0;
                if (cFin && Number.isFinite(cFin)) cStart = cMs > 0 ? cFin - cMs : cFin;
              }
              if (!cStart || !Number.isFinite(cStart)) continue;
              let cEnd: number;
              if (cMs > 0) cEnd = cStart + cMs;
              else {
                cEnd = childExec.finishedAt ? new Date(childExec.finishedAt).getTime() : 0;
                if (!cEnd || !Number.isFinite(cEnd) || cEnd < cStart) cEnd = cStart;
              }
              const cFailed =
                String(childExec.state) === "failed" ||
                String(childExec.state) === "error" ||
                String(childExec.state) === "faulted";
              const cType =
                childExec.subtitle?.trim() ||
                guessStepSubtitle(
                  childExec.taskDialogId,
                  childExec.type,
                  componentNameBySchemaName?.[childExec.taskDialogId],
                  childExec.observation,
                );
              out.push({
                id: `${turn.id}:child:${agentInfo.sessionId ?? exec.stepId}:${childExec.taskDialogId}:${childExec.stepId}`,
                name:
                  childExec.displayName?.trim() ||
                  resolveStepName(childExec.taskDialogId, componentNameBySchemaName),
                type: cType,
                color: cFailed ? FAILED_COLOR : componentColor(cType),
                startMs: cStart,
                endMs: cEnd,
                durationMs: Math.max(0, cEnd - cStart),
                failed: cFailed,
                turnIndex,
                connectedAgentName,
              });
            }
          }
        }
      }

      // MCP server initialization bars
      const mcpServers: MCPServerInfo[] = turn.debugInfo?.mcpServers?.length
        ? turn.debugInfo.mcpServers
        : turn.debugInfo?.mcpServerInfo
          ? [turn.debugInfo.mcpServerInfo]
          : [];
      const acts = turn.activities as unknown as Array<Record<string, unknown>>;
      const hasMcpInit = acts.some((a) => a?.name === "DynamicServerInitialize");

      if (hasMcpInit && mcpServers.length > 0) {
        for (const server of mcpServers) {
          const sn = server.schemaName ?? "";
          const initAct = acts.find(
            (a) => a.name === "DynamicServerInitialize" &&
              (!sn || String((a.value as McpServerEventValue | undefined)?.dialogSchemaName ?? "") === sn),
          );
          const toolsAct = acts.find(
            (a) => a.name === "DynamicServerToolsList" &&
              (!sn || String((a.value as McpServerEventValue | undefined)?.dialogSchemaName ?? "") === sn),
          );
          if (!initAct) continue;
          const startTs = activityTimestampMs(initAct) ?? 0;
          if (!startTs || !Number.isFinite(startTs)) continue;
          const endTs = activityTimestampMs(toolsAct) ?? startTs;
          const componentInfo = sn ? componentNameBySchemaName?.[sn] : undefined;
          out.push({
            id: `${turn.id}:mcp:${sn || server.name}`,
            name: componentInfo?.modelDisplayName?.trim() || componentInfo?.name?.trim() || server.name || "MCP Server",
            type: "Tool",
            color: componentColor(undefined),
            startMs: startTs,
            endMs: Math.max(startTs, endTs),
            durationMs: Math.max(0, endTs - startTs),
            failed: false,
            turnIndex,
          });
        }
      }
    });

    out.sort((a, b) => a.startMs - b.startMs || a.turnIndex - b.turnIndex);
    return out;
  }, [turns, componentNameBySchemaName, connectedAgents]);

  // ── Group entries by turn ───────────────────────────────────────────────
  const turnGroups = useMemo<TurnGroup[]>(() => {
    const grouped = new Map<number, WaterfallEntry[]>();
    for (const entry of entries) {
      const list = grouped.get(entry.turnIndex) ?? [];
      list.push(entry);
      grouped.set(entry.turnIndex, list);
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([turnIndex, groupEntries]) => {
        const turnStartMs = Math.min(...groupEntries.map((e) => e.startMs));
        const turnEndMs   = Math.max(...groupEntries.map((e) => e.endMs));
        const turnDurationMs = Math.max(1, turnEndMs - turnStartMs);
        const slowestEntry = groupEntries.reduce((a, b) =>
          a.durationMs >= b.durationMs ? a : b,
        );
        const { idleIntervals, idleMs } = computeTurnIdle(groupEntries, turnStartMs, turnEndMs);
        return {
          turnIndex,
          userMessage: turns[turnIndex]?.content ?? "",
          turnStartMs,
          turnEndMs,
          turnDurationMs,
          entries: groupEntries,
          failedCount: groupEntries.filter((e) => e.failed).length,
          slowestEntry,
          idleIntervals,
          idleMs,
        };
      });
  }, [entries, turns]);

  if (!turnGroups.length) return null;

  const allExpanded = turnGroups.length > 0 && expandedTurns.size === turnGroups.length;

  // ── Global summary stats ────────────────────────────────────────────────
  const totalSteps    = entries.length;
  const totalFailed   = entries.filter((e) => e.failed).length;
  const globalSlowest = entries.reduce((a, b) => (a.durationMs >= b.durationMs ? a : b));
  const globalSpanMs  = (() => {
    const gStart = Math.min(...entries.map((e) => e.startMs));
    const gEnd   = Math.max(...entries.map((e) => e.endMs));
    return Math.max(0, gEnd - gStart);
  })();
  const legendTypes   = [...new Set(entries.map((e) => e.type))];

  // ── Content block ───────────────────────────────────────────────────────
  const contentBlock = (
    <div className={styles.content}>

      {/* Expand / Collapse all turn controls */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          appearance="transparent"
          size="small"
          icon={allExpanded ? <ArrowCollapseAll20Regular aria-hidden="true" /> : <ArrowExpandAll20Regular aria-hidden="true" />}
          onClick={allExpanded ? collapseAll : expandAll}
          aria-label={allExpanded ? "Collapse all turns" : "Expand all turns"}
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </Button>
      </div>

      {/* Global summary stats */}
      <div className={styles.summaryRow}>
        <div className={styles.statItem}>
          <Text className={styles.statLabel}>Steps</Text>
          <Body1Strong className={styles.statValue}>{totalSteps}</Body1Strong>
        </div>
        <div className={styles.statItem}>
          <Text className={styles.statLabel}>Total span</Text>
          <Body1Strong className={styles.statValue}>{fmtDuration(globalSpanMs)}</Body1Strong>
        </div>
        <div className={styles.statItem}>
          <Text className={styles.statLabel}>Slowest</Text>
          <Tooltip content={globalSlowest.name} relationship="description">
            <Body1Strong
              className={mergeClasses(
                styles.statValue,
                globalSlowest.durationMs > SLOW_THRESHOLD_MS ? styles.statValueSlow : undefined,
              )}
            >
              {fmtDuration(globalSlowest.durationMs)}
            </Body1Strong>
          </Tooltip>
        </div>
        {totalFailed > 0 && (
          <div className={styles.statItem}>
            <Text className={styles.statLabel}>Failed</Text>
            <Body1Strong className={mergeClasses(styles.statValue, styles.statValueSlow)}>
              {totalFailed}
            </Body1Strong>
          </div>
        )}
      </div>

      {/* Turn sections */}
      {turnGroups.map((group) => {
        const isExpanded = expandedTurns.has(group.turnIndex);
        const ticks = TICK_PCTS.map((pct) => fmtDuration((group.turnDurationMs * pct) / 100));

        return (
          <div key={group.turnIndex} className={styles.turnSection} role="region" aria-label={`Turn ${group.turnIndex + 1}`}>

            {/* Clickable turn header */}
            <div
              className={styles.turnHeader}
              onClick={() => toggleTurn(group.turnIndex)}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleTurn(group.turnIndex);
                }
              }}
            >
              <div className={styles.turnHeaderLeft}>
                {isExpanded
                  ? <ChevronDown16Regular aria-hidden="true" style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }} />
                  : <ChevronRight16Regular aria-hidden="true" style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }} />
                }
                <Caption1 className={styles.turnLabel}>
                  Turn {group.turnIndex + 1}
                </Caption1>
                {group.userMessage && (
                  <Tooltip
                    content={group.userMessage}
                    relationship="description"
                    positioning="below-start"
                  >
                    <Caption1Strong className={styles.turnMessage}>
                      {truncate(group.userMessage, 72)}
                    </Caption1Strong>
                  </Tooltip>
                )}
              </div>

              <div className={styles.turnHeaderRight}>
                {group.failedCount > 0 && (
                  <Badge
                    appearance="tint"
                    color="danger"
                    shape="rounded"
                    size="small"
                  >
                    {group.failedCount} failed
                  </Badge>
                )}
                <Badge
                  appearance={group.turnIndex === globalSlowest.turnIndex ? "filled" : "tint"}
                  color={group.turnIndex === globalSlowest.turnIndex ? "danger" : group.turnDurationMs > 30_000 ? "warning" : "informative"}
                  shape="rounded"
                  size={group.turnIndex === globalSlowest.turnIndex ? "medium" : "small"}
                >
                  {fmtDuration(group.turnDurationMs)}
                </Badge>
                {onTurnSelect && turns[group.turnIndex]?.role === "user" && (
                  <Tooltip
                    content={`Jump to turn ${group.turnIndex + 1} in Conversation Preview`}
                    relationship="description"
                  >
                    <Button
                      appearance="transparent"
                      size="small"
                      icon={<ArrowRight16Regular aria-hidden="true" />}
                      onClick={(e) => { e.stopPropagation(); onTurnSelect(turns[group.turnIndex].id); }}
                      aria-label={`Go to turn ${group.turnIndex + 1}`}
                    />
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Collapsible turn body */}
            {isExpanded && (
              <div className={styles.turnBody}>

                {/* Per-turn stats line */}
                <div className={styles.turnStats}>
                  <Caption1 className={styles.turnStatChip}>
                    {group.entries.length} step{group.entries.length !== 1 ? "s" : ""}
                  </Caption1>
                  {group.entries.length > 1 && (
                    <Tooltip content={group.slowestEntry.name} relationship="description">
                      <Caption1
                        className={mergeClasses(
                          styles.turnStatChip,
                          group.slowestEntry.durationMs > SLOW_THRESHOLD_MS
                            ? styles.turnStatChipSlow
                            : undefined,
                        )}
                      >
                        Slowest: {truncate(group.slowestEntry.name, 24)} {fmtDuration(group.slowestEntry.durationMs)}
                      </Caption1>
                    </Tooltip>
                  )}
                  {group.failedCount > 0 && (
                    <Caption1 className={mergeClasses(styles.turnStatChip, styles.turnStatChipSlow)}>
                      {group.failedCount} failed
                    </Caption1>
                  )}
                  {group.idleMs >= IDLE_MIN_MS && (
                    <Tooltip content="Time within this turn where no tracked activity was running (overhead / latency between steps)." relationship="description">
                      <Caption1 className={styles.turnStatChip}>
                        Idle: {fmtDuration(group.idleMs)}
                      </Caption1>
                    </Tooltip>
                  )}
                </div>

                {/* Per-turn time axis */}
                <div className={styles.timeAxis}>
                  {ticks.map((label, i) => (
                    <span key={i} className={styles.timeTick}>{label}</span>
                  ))}
                </div>

                {/* Step rows */}
                <div className={styles.stepRows} role="list" aria-label={`Steps in turn ${group.turnIndex + 1}`}>
                  {(() => {
                    const renderRow = (entry: WaterfallEntry) => {
                      const leftPct = group.turnDurationMs > 1
                        ? Math.max(0, (entry.startMs - group.turnStartMs) / group.turnDurationMs * 100)
                        : 0;
                      const widthPct = group.turnDurationMs > 1
                        ? Math.max(0.4, entry.durationMs / group.turnDurationMs * 100)
                        : 0.4;
                      const isSlow = !entry.failed && entry.durationMs > SLOW_THRESHOLD_MS;

                      return (
                        <div key={entry.id} className={styles.stepRow} role="listitem">
                          <Tooltip content={`${entry.name} (${entry.type})`} relationship="label">
                            <span className={styles.stepName} title={entry.name}>
                              {truncate(entry.name, TIMELINE_NAME_MAX_CHARS)}
                            </span>
                          </Tooltip>

                          <div className={styles.barTrack}>
                            <Tooltip
                              content={`${entry.name} — ${entry.type} — ${fmtDuration(entry.durationMs)}${entry.failed ? " (failed)" : ""}`}
                              relationship="description"
                            >
                              <div
                                className={styles.bar}
                                style={{
                                  left: `${leftPct}%`,
                                  width: `${widthPct}%`,
                                  backgroundColor: entry.color,
                                  opacity: isSlow ? 0.9 : 1,
                                }}
                                role="img"
                                tabIndex={0}
                                aria-label={`${entry.name}: ${fmtDuration(entry.durationMs)}${entry.failed ? " (failed)" : isSlow ? " (slow)" : ""}`}
                              />
                            </Tooltip>
                          </div>

                          <span
                            className={mergeClasses(
                              styles.durationLabel,
                              entry.failed ? styles.durationLabelFailed : undefined,
                              isSlow ? styles.durationLabelSlow : undefined,
                            )}
                          >
                            {fmtDuration(entry.durationMs)}
                          </span>
                        </div>
                      );
                    };

                    // Render rows, grouping each connected agent's child steps into
                    // a labeled box so the connected agent is clearly delineated.
                    const nodes: React.ReactNode[] = [];
                    const list = group.entries;
                    let i = 0;
                    while (i < list.length) {
                      const label = list[i].connectedAgentName;
                      if (label) {
                        const boxRows: WaterfallEntry[] = [];
                        while (i < list.length && list[i].connectedAgentName === label) {
                          boxRows.push(list[i]);
                          i += 1;
                        }
                        nodes.push(
                          <div key={`box:${label}:${boxRows[0].id}`} className={styles.connectedBox}>
                            <div className={styles.connectedBoxHeader}>
                              <span className={styles.connectedBoxDot} aria-hidden="true" />
                              {label} · Connected agent
                            </div>
                            {boxRows.map(renderRow)}
                          </div>
                        );
                      } else {
                        nodes.push(renderRow(list[i]));
                        i += 1;
                      }
                    }
                    return nodes;
                  })()}

                  {/* Idle row — shaded segments where no tracked activity was running */}
                  {group.idleMs >= IDLE_MIN_MS && (
                    <div className={styles.stepRow} role="listitem">
                      <span className={styles.idleName} title="Idle — no tracked activity running">
                        Idle
                      </span>
                      <div className={styles.barTrack}>
                        {group.idleIntervals.map(([s, e], idx) => {
                          const leftPct = group.turnDurationMs > 1
                            ? Math.max(0, (s - group.turnStartMs) / group.turnDurationMs * 100)
                            : 0;
                          const widthPct = group.turnDurationMs > 1
                            ? Math.max(0.4, (e - s) / group.turnDurationMs * 100)
                            : 0.4;
                          return (
                            <Tooltip key={idx} content={`Idle ${fmtDuration(e - s)}`} relationship="description">
                              <div
                                className={styles.idleSegment}
                                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                role="img"
                                aria-label={`Idle ${fmtDuration(e - s)}`}
                              />
                            </Tooltip>
                          );
                        })}
                      </div>
                      <span className={styles.durationLabel}>{fmtDuration(group.idleMs)}</span>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div className={styles.legend} aria-label="Legend">
        {legendTypes.map((type) => (
          <div key={type} className={styles.legendItem}>
            <span
              aria-hidden="true"
              className={styles.legendSwatch}
              style={{ backgroundColor: componentColor(type) }}
            />
            <span className={styles.legendLabel}>{type}</span>
          </div>
        ))}
        {totalFailed > 0 && (
          <div className={styles.legendItem}>
            <span aria-hidden="true" className={styles.legendSwatch} style={{ backgroundColor: FAILED_COLOR }} />
            <span className={styles.legendLabel}>Failed</span>
          </div>
        )}
        {turnGroups.some((g) => g.idleMs >= IDLE_MIN_MS) && (
          <div className={styles.legendItem}>
            <span aria-hidden="true" className={styles.idleSwatch} />
            <span className={styles.legendLabel}>Idle</span>
          </div>
        )}
      </div>

    </div>
  );

  // Contained mode: render content directly (parent controls visibility)
  if (isContained) return contentBlock;

  // Card mode: wrap in a collapsible Card
  return (
    <Card appearance="filled">
      <CardHeader
        header={
          <div className={styles.headerRow}>
            <Timer20Regular />
            <Subtitle2>Performance timeline</Subtitle2>
            <Tooltip
              content="Turn-by-turn timeline of every step execution. Each section is scaled to its own turn's duration."
              relationship="description"
            >
              <Button
                appearance="transparent"
                size="small"
                className={styles.infoIcon}
                aria-label="Performance timeline info"
              >
                <Info16Regular />
              </Button>
            </Tooltip>
          </div>
        }
        action={
          <Button
            appearance="subtle"
            icon={cardCollapsed ? <ChevronDown20Regular /> : <ChevronUp20Regular />}
            onClick={() => setCardCollapsed((c) => !c)}
            aria-label={cardCollapsed ? "Expand timeline" : "Collapse timeline"}
          />
        }
      />
      {!cardCollapsed && contentBlock}
    </Card>
  );
}
