/**
 * TopicFlowDiagram — SVG-based directed flow chart of the conversation's
 * execution path. Top-level rows are either standalone step nodes or
 * Connected-agent containers that group the agent's child step executions.
 */

import { useMemo, useState } from "react";
import {
  Body1Strong,
  Card,
  CardHeader,
  Subtitle2,
  Text,
  Tooltip,
  Button,
  tokens,
  makeStyles,
} from "@fluentui/react-components";
import {
  ChevronDown20Regular,
  ChevronUp20Regular,
  Info16Regular,
  Flow20Regular,
} from "@fluentui/react-icons";
import type { ProcessedTurn, StepExecution, MCPServerInfo } from "../contracts/transcript";
import type { ConnectedAgentInfo } from "../contracts/connected-agent";
import type { ComponentInfo } from "../services/botcomponents-service";
import {
  guessStepSubtitle,
  resolveExecutionTimeString,
  resolveStepName,
  execTimeToMs,
  fmtDuration,
} from "../utils/step-classification";
import { GENERATIVE_THINKING_TASK_ID } from "../utils/transcript/parse-generative-transcript";
import { activityTimestampMs } from "../utils/transcript/timestamp";

// ---------------------------------------------------------------------------
// Chart colour palette — Fluent UI v9 design tokens
// ---------------------------------------------------------------------------

interface NodeStyle {
  stroke: string;
  fill: string;
}

// Four semantic groups; everything else falls to DEFAULT_STYLE (neutral grey).
const STEP_TYPE_STYLES: Record<string, NodeStyle> = {
  Topic: {
    stroke: "#637CEF",  // Data 1 — Primary series
    fill: tokens.colorPaletteCornflowerBackground2,
  },
  Knowledge: {
    stroke: "#2AA0A4",  // Data 3 — Tertiary series
    fill: tokens.colorPaletteTealBackground2,
  },
  Skill: {
    stroke: "#C19C00",  // Data 8 — amber for loaded skills
    fill: "#FBF3D5",
  },
  "Connected agent": {
    stroke: "#9373C0",  // Data 4
    fill: tokens.colorPalettePurpleBackground2,
  },
  "Child agent": {
    stroke: "#9373C0",  // Data 4
    fill: tokens.colorPalettePurpleBackground2,
  },
  "Chain of thought": {
    stroke: "#8764B8",  // violet — reasoning (visually softer than agent purple)
    fill: tokens.colorNeutralBackground3,
  },
};
const DEFAULT_STYLE: NodeStyle = {
  stroke: tokens.colorNeutralStroke1,
  fill: tokens.colorNeutralBackground2,
};
const FAILED_STYLE: NodeStyle = {
  stroke: tokens.colorPaletteRedBorderActive,
  fill: tokens.colorPaletteRedBackground2,
};

// ---------------------------------------------------------------------------
// Plan correlation — child step → owning connected-agent step
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

function readString(
  r: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const v = r?.[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Walks the turn's activities to correlate descendant step executions with
 * their owning connected-agent step. Uses DynamicPlanReceived
 * (parentPlanStepIdentifier) to map child plans to parent agent steps, then
 * DynamicPlanStepTriggered to attach each step to its agent ancestor.
 */
function buildAgentOwnership(turn: ProcessedTurn): Map<string, string> {
  const owner = new Map<string, string>();
  const activities = Array.isArray(turn.activities) ? turn.activities : [];

  const planParentStepByPlanId = new Map<string, string>();
  for (const a of activities) {
    if (
      a?.name !== "DynamicPlanReceived" &&
      a?.valueType !== "DynamicPlanReceived"
    )
      continue;
    const v = asRecord(a.value);
    const planId = readString(v, "planIdentifier") ?? "";
    const parentStepId = readString(v, "parentPlanStepIdentifier") ?? "";
    if (planId && parentStepId) planParentStepByPlanId.set(planId, parentStepId);
  }

  const agentStepIds = new Set<string>();
  for (const a of activities) {
    if (
      a?.name !== "DynamicPlanStepTriggered" &&
      a?.valueType !== "DynamicPlanStepTriggered"
    )
      continue;
    const v = asRecord(a.value);
    const stepId = readString(v, "stepId") ?? "";
    const taskDialogId = readString(v, "taskDialogId") ?? "";
    const planIdentifier = readString(v, "planIdentifier") ?? "";
    const rawType = readString(v, "type") ?? "";
    if (!stepId || !taskDialogId) continue;

    const isAgent =
      rawType === "Agent" ||
      taskDialogId.includes(".agent.") ||
      taskDialogId.includes("InvokeConnectedAgentTaskAction");

    if (isAgent) {
      agentStepIds.add(stepId);
      owner.set(stepId, stepId);
      continue;
    }

    const parentPlanStepId = planParentStepByPlanId.get(planIdentifier) ?? "";
    const owningAgent =
      owner.get(parentPlanStepId) ??
      (agentStepIds.has(parentPlanStepId) ? parentPlanStepId : "");
    if (owningAgent) owner.set(stepId, owningAgent);
  }

  return owner;
}

// ---------------------------------------------------------------------------
// SVG layout constants
// ---------------------------------------------------------------------------

const STANDALONE_WIDTH = 240;
const STANDALONE_HEIGHT = 52;
const CHILD_WIDTH = 192;
const CHILD_HEIGHT = 48;
const CHILD_GAP = 12;
const CONTAINER_PAD_X = 14;
const CONTAINER_HEADER_HEIGHT = 28;
const CONTAINER_HEADER_GAP = 8;
const CONTAINER_PAD_Y_TOP = 6;
const CONTAINER_PAD_Y_BOTTOM = 14;
const CONTAINER_HEIGHT =
  CONTAINER_PAD_Y_TOP +
  CONTAINER_HEADER_HEIGHT +
  CONTAINER_HEADER_GAP +
  CHILD_HEIGHT +
  CONTAINER_PAD_Y_BOTTOM;
const ROW_HEIGHT = Math.max(STANDALONE_HEIGHT, CONTAINER_HEIGHT);
const NODE_RX = 8;
const CONTAINER_RX = 12;
const GAP_X = 44;
const PAD_X = 24;
const PAD_Y = 20;
const TURN_GAP = 44;
const TURN_LABEL_HEIGHT = 16;
const USER_MSG_HEIGHT = 16;
const HEADER_HEIGHT = TURN_LABEL_HEIGHT + USER_MSG_HEIGHT + 4;
const SVG_HEIGHT = PAD_Y + HEADER_HEIGHT + ROW_HEIGHT + PAD_Y;
const DURATION_RIGHT = 8;
const USER_MSG_MAX_CHARS = 56;
const LABEL_ICON_AND_GAP_PX = 24;
const LABEL_RIGHT_PADDING_PX = 10;
const MIN_VISIBLE_LABEL_CHARS = 6;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
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
  content: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL} ${tokens.spacingVerticalM}`,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  svgWrapper: {
    overflowX: "auto",
    overflowY: "hidden",
  },
  statsRow: {
    display: "flex",
    gap: tokens.spacingHorizontalXL,
    flexWrap: "wrap",
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
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  legendSwatch: {
    width: tokens.spacingVerticalM,
    height: tokens.spacingVerticalM,
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

interface FlowNode {
  id: string;
  label: string;
  type: string;
  stroke: string;
  fill: string;
  failed: boolean;
  duration?: string;
  isConnectedAgent: boolean;
  turnIndex: number;
  isTurnStart: boolean;
}

type FlowRow =
  | { kind: "standalone"; node: FlowNode }
  | { kind: "agent"; node: FlowNode; children: FlowNode[] };

/** `value` payload of the DynamicServerInitialize / DynamicServerToolsList events. */
interface McpServerEventValue {
  dialogSchemaName?: string;
}

interface TopicFlowDiagramProps {
  turns: ProcessedTurn[];
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  connectedAgents?: ConnectedAgentInfo[];
  /** When true, renders only the diagram content — no Card, no CardHeader. Parent controls visibility. */
  isContained?: boolean;
  /** Called with the user message activity ID when the user clicks a "Turn N" hyperlink. */
  onTurnSelect?: (messageId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopicFlowDiagram({
  turns,
  componentNameBySchemaName,
  connectedAgents,
  isContained = false,
  onTurnSelect,
}: TopicFlowDiagramProps) {
  const styles = useStyles();
  const [collapsed, setCollapsed] = useState(true);

  // Map of turnIndex → the preceding user message content
  const userMessageByTurnIndex = useMemo(() => {
    const map = new Map<number, string>();
    let lastUserMessage = "";
    turns.forEach((turn, idx) => {
      if (turn.role === "user") {
        lastUserMessage = (turn.content ?? "").trim();
      } else if (turn.role === "assistant" && lastUserMessage) {
        map.set(idx, lastUserMessage);
      }
    });
    return map;
  }, [turns]);

  // Map turnIndex → user message activity ID for turn navigation links.
  const userTurnIdByIndex = useMemo(() => {
    const m = new Map<number, string>();
    turns.forEach((turn, idx) => {
      if (turn.role === "user") m.set(idx, turn.id);
    });
    return m;
  }, [turns]);

  // Lookup for standard (heavyweight) connected agents whose children live in a
  // separately-fetched child transcript (ConnectedAgentInfo.childTopics).
  const agentInfoByKey = useMemo(() => {
    const map = new Map<string, ConnectedAgentInfo>();
    for (const ca of connectedAgents ?? []) {
      if (ca.stepId) map.set(`step:${ca.stepId}`, ca);
      if (ca.dialogSchemaName) map.set(`tdi:${ca.dialogSchemaName}`, ca);
      if (ca.botSchemaName) map.set(`bot:${ca.botSchemaName}`, ca);
    }
    return map;
  }, [connectedAgents]);

  const rows = useMemo<FlowRow[]>(() => {
    const out: FlowRow[] = [];

    turns.forEach((turn, turnIndex) => {
      // Reasoning (ThinkingTrace) is surfaced as inline plain text in the Debug
      // panel, not as a node in this flow diagram — exclude it here.
      const execs = (turn.debugInfo?.stepExecutions ?? []).filter(
        (e) => e.taskDialogId !== GENERATIVE_THINKING_TASK_ID
      );
      // Collect MCP servers initialized in this turn (mirrors Debug Info panel)
      const mcpServers: MCPServerInfo[] = turn.debugInfo?.mcpServers?.length
        ? turn.debugInfo.mcpServers
        : turn.debugInfo?.mcpServerInfo
          ? [turn.debugInfo.mcpServerInfo]
          : [];
      const hasMcpInit = mcpServers.length > 0 && turn.activities.some(
        (a) => a.name === "DynamicServerInitialize"
      );
      // Skip turns that have neither step executions nor MCP server init
      if (!execs.length && !hasMcpInit) return;

      const ownerByStepId = buildAgentOwnership(turn);

      const sorted = [...execs].sort((a, b) => {
        const ta = a.triggeredAt ? new Date(a.triggeredAt).getTime() : 0;
        const tb = b.triggeredAt ? new Date(b.triggeredAt).getTime() : 0;
        if (ta && tb) return ta - tb;
        return 0;
      });

      const toFlowNode = (exec: StepExecution, isAgent: boolean): FlowNode => {
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
        const execTimeStr = resolveExecutionTimeString(exec);
        const durationMs = execTimeStr ? execTimeToMs(execTimeStr) : 0;
        const isThinking = exec.taskDialogId === GENERATIVE_THINKING_TASK_ID;
        const style = failed
          ? FAILED_STYLE
          : (STEP_TYPE_STYLES[type] ?? DEFAULT_STYLE);
        return {
          id: `${turn.id}:${exec.taskDialogId}:${exec.stepId}`,
          label:
            exec.displayName?.trim() ||
            resolveStepName(exec.taskDialogId, componentNameBySchemaName),
          type,
          stroke: style.stroke,
          fill: style.fill,
          failed,
          // Reasoning is not a timed operation — omit its duration badge.
          duration: isThinking ? undefined : fmtDuration(durationMs),
          isConnectedAgent: isAgent,
          turnIndex,
          isTurnStart: false,
        };
      };

      const agentByStepId = new Map<
        string,
        { node: FlowNode; children: FlowNode[]; invokeExec: StepExecution }
      >();
      const perTurnRows: FlowRow[] = [];
      const seenTopLevel = new Set<string>();
      const seenChildrenPerAgent = new Map<string, Set<string>>();
      let firstForTurn = true;

      // Add MCP server initialization nodes (mirrors Debug Info panel behavior)
      if (hasMcpInit) {
        for (const server of mcpServers) {
          const sn = server.schemaName ?? "";
          const acts = turn.activities;
          const initAct = acts.find(
            (a) => a.name === "DynamicServerInitialize" &&
              (!sn || String((a.value as McpServerEventValue | undefined)?.dialogSchemaName ?? "") === sn)
          );
          const toolsAct = acts.find(
            (a) => a.name === "DynamicServerToolsList" &&
              (!sn || String((a.value as McpServerEventValue | undefined)?.dialogSchemaName ?? "") === sn)
          );
          const startMs = activityTimestampMs(initAct) ?? 0;
          const endMs = activityTimestampMs(toolsAct) ?? startMs;
          const durationMs = Math.max(0, endMs - startMs);
          const componentInfo = sn ? componentNameBySchemaName?.[sn] : undefined;
          const label =
            componentInfo?.modelDisplayName?.trim() ||
            componentInfo?.name?.trim() ||
            server.name ||
            "MCP Server";
          const mcpNode: FlowNode = {
            id: `${turn.id}:mcp:${sn || server.name}`,
            label,
            type: "Tool",
            stroke: DEFAULT_STYLE.stroke,
            fill: DEFAULT_STYLE.fill,
            failed: false,
            duration: durationMs > 0 ? fmtDuration(durationMs) : "",
            isConnectedAgent: false,
            turnIndex,
            isTurnStart: firstForTurn,
          };
          if (firstForTurn) firstForTurn = false;
          perTurnRows.push({ kind: "standalone", node: mcpNode });
        }
      }

      for (const exec of sorted) {
        if (!exec.taskDialogId) continue;
        if (
          exec.taskDialogId === "P:CaptureContextTool" ||
          exec.taskDialogId === "P:SendMessageTool"
        )
          continue;

        const type =
          exec.subtitle?.trim() ||
          guessStepSubtitle(
            exec.taskDialogId,
            exec.type,
            componentNameBySchemaName?.[exec.taskDialogId],
            exec.observation,
          );
        const isAgent = type === "Connected agent" || type === "Child agent";
        const owner = ownerByStepId.get(String(exec.stepId)) ?? "";
        const isChildOfAgent =
          !isAgent && owner.length > 0 && agentByStepId.has(owner);

        if (isChildOfAgent) {
          // Deduplicate by stepId (unique per invocation) so repeated calls of
          // the same tool within one agent are each shown, matching the
          // Performance Timeline which counts every individual execution.
          const seen = seenChildrenPerAgent.get(owner) ?? new Set<string>();
          const childKey = exec.stepId || exec.taskDialogId;
          if (seen.has(childKey)) continue;
          seen.add(childKey);
          seenChildrenPerAgent.set(owner, seen);
          agentByStepId.get(owner)!.children.push(toFlowNode(exec, false));
          continue;
        }

        // Top-level steps: deduplicate by stepId so multiple invocations of
        // the same action within a turn are each counted.
        const topLevelKey = exec.stepId || exec.taskDialogId;
        if (seenTopLevel.has(topLevelKey)) continue;
        seenTopLevel.add(topLevelKey);

        const node = toFlowNode(exec, isAgent);
        node.isTurnStart = firstForTurn;
        firstForTurn = false;

        if (isAgent) {
          const entry = {
            node,
            children: [] as FlowNode[],
            invokeExec: exec,
          };
          agentByStepId.set(String(exec.stepId), entry);
          seenChildrenPerAgent.set(String(exec.stepId), new Set());
          perTurnRows.push({ kind: "agent", node, children: entry.children });
        } else {
          perTurnRows.push({ kind: "standalone", node });
        }
      }

      // Fallback: for agents with no in-turn children, populate from
      // ConnectedAgentInfo.childTopics (heavyweight agents with fetched child
      // transcripts).
      for (const entry of agentByStepId.values()) {
        if (entry.children.length > 0) continue;
        const invokeExec = entry.invokeExec;
        const info =
          agentInfoByKey.get(`step:${String(invokeExec.stepId)}`) ??
          agentInfoByKey.get(`tdi:${invokeExec.taskDialogId}`) ??
          agentInfoByKey.get(`bot:${invokeExec.taskDialogId}`);
        if (!info) continue;

        // Override the container's display name with the friendliest available
        // agent name: prefer the resolved botcomponents display name (same as the
        // ConnectedAgentCard), then a friendly name already on the node
        // (generative agent steps carry toolDisplayName, e.g. "Interview Agent"),
        // and only fall back to the schema-derived info.displayName when there is
        // nothing better — so the flow never shows a raw schema name.
        const resolvedAgentName =
          componentNameBySchemaName?.[info.dialogSchemaName]?.modelDisplayName?.trim() ||
          componentNameBySchemaName?.[info.dialogSchemaName]?.name?.trim() ||
          componentNameBySchemaName?.[info.botSchemaName]?.modelDisplayName?.trim() ||
          componentNameBySchemaName?.[info.botSchemaName]?.name?.trim() ||
          "";
        if (resolvedAgentName) {
          entry.node.label = resolvedAgentName;
        } else if (!invokeExec.displayName?.trim() && info.displayName?.trim()) {
          entry.node.label = info.displayName.trim();
        }

        const seen = new Set<string>();
        const childTopicList = info.childTopics ?? [];
        for (let ti = 0; ti < childTopicList.length; ti++) {
          const topic = childTopicList[ti];
          // Reasoning (ThinkingTrace) is surfaced as inline plain text, never as a
          // node in the execution flow.
          if (topic.schemaId === GENERATIVE_THINKING_TASK_ID) continue;
          // Deduplicate per invocation (stepId) — matching the Performance Timeline
          // and the in-turn children path — NOT by schemaId (tool name). Deduping by
          // schemaId collapsed repeated calls of the same tool (e.g. 4 searches +
          // 2 read_query + 1 describe showed as just 3 nodes instead of 7).
          const baseKey = topic.schemaId || topic.displayName || "step";
          const key = topic.stepId ? `${baseKey}:${topic.stepId}` : `${baseKey}:${ti}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const childType = guessStepSubtitle(
            topic.schemaId,
            topic.type,
            componentNameBySchemaName?.[topic.schemaId],
            topic.observation,
          );
          const childStyle = STEP_TYPE_STYLES[childType] ?? DEFAULT_STYLE;
          const durationMs =
            typeof topic.executionTimeSeconds === "number"
              ? topic.executionTimeSeconds * 1000
              : execTimeToMs(topic.executionTime);

          // Prefer the canonical botcomponents friendly name (tier 2) over
          // the schema-derived name populated by extractChildTopics (tier 3).
          const componentInfo = componentNameBySchemaName?.[topic.schemaId];
          const friendlyName =
            componentInfo?.modelDisplayName?.trim() ||
            componentInfo?.name?.trim() ||
            "";
          const label = friendlyName || topic.displayName || topic.schemaId;

          entry.children.push({
            id: `${entry.node.id}:child:${key}`,
            label,
            type: childType,
            stroke: childStyle.stroke,
            fill: childStyle.fill,
            failed: false,
            duration: fmtDuration(durationMs),
            isConnectedAgent: false,
            turnIndex: entry.node.turnIndex,
            isTurnStart: false,
          });
        }
      }

      out.push(...perTurnRows);
    });

    return out;
  }, [turns, componentNameBySchemaName, agentInfoByKey]);

  if (!rows.length) return null;

  // Widths
  const rowWidth = (row: FlowRow): number => {
    if (row.kind === "standalone") return STANDALONE_WIDTH;
    const n = row.children.length;
    const innerWidth =
      n > 0
        ? n * CHILD_WIDTH + (n - 1) * CHILD_GAP
        : STANDALONE_WIDTH - CONTAINER_PAD_X * 2;
    return Math.max(STANDALONE_WIDTH, innerWidth + CONTAINER_PAD_X * 2);
  };

  const rowTop = PAD_Y + HEADER_HEIGHT;
  const centerY = rowTop + ROW_HEIGHT / 2;

  // Stats + legend inputs
  const failedCount = rows.reduce((acc, r) => {
    const self = r.node.failed ? 1 : 0;
    const kids = r.kind === "agent" ? r.children.filter((c) => c.failed).length : 0;
    return acc + self + kids;
  }, 0);
  const agentCount = rows.filter((r) => r.kind === "agent").length;
  const stepCount = rows.reduce(
    (acc, r) => acc + 1 + (r.kind === "agent" ? r.children.length : 0),
    0,
  );
  const typeSet = new Set<string>();
  for (const r of rows) {
    typeSet.add(r.node.type);
    if (r.kind === "agent") for (const c of r.children) typeSet.add(c.type);
  }
  const legendTypes = [...typeSet];

  // X positions
  let cursorX = PAD_X;
  const rowPositions = rows.map((row, i) => {
    const needsTurnHeader = row.node.isTurnStart && i > 0;
    if (needsTurnHeader) cursorX += TURN_GAP;
    const x = cursorX;
    const w = rowWidth(row);
    cursorX += w + GAP_X;
    return { x, w, needsTurnHeader };
  });
  const svgWidth = cursorX - GAP_X + PAD_X;

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max - 1) + "…" : text;

  const estimateTextWidthPx = (text: string, fontSizePx: number): number =>
    text.length * fontSizePx * 0.58;

  const getMaxCharsForWidth = (widthPx: number, fontSizePx: number): number => {
    const charWidthPx = Math.max(5, fontSizePx * 0.58);
    return Math.max(MIN_VISIBLE_LABEL_CHARS, Math.floor(widthPx / charWidthPx));
  };

  const truncateToFitWidth = (
    text: string,
    maxWidthPx: number,
    fontSizePx: number,
  ): string => {
    const maxChars = getMaxCharsForWidth(maxWidthPx, fontSizePx);
    return truncate(text, maxChars);
  };

  // Helper: render a step rectangle (standalone or child chip)
  const renderStepRect = (
    node: FlowNode,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const cy = y + height / 2;
    const labelAvailableWidth = Math.max(
      24,
      width - LABEL_ICON_AND_GAP_PX - LABEL_RIGHT_PADDING_PX,
    );
    const label = truncateToFitWidth(node.label, labelAvailableWidth, 11);
    return (
      <g key={node.id}>
        <title>{`${node.label} - ${node.type}`}</title>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={NODE_RX}
          ry={NODE_RX}
          fill={node.fill}
          stroke={node.stroke}
          strokeWidth={node.failed ? 2 : 1.5}
        />
        <circle
          cx={x + 14}
          cy={cy}
          r={5}
          fill={
            node.failed
              ? tokens.colorStatusDangerBackground3
              : tokens.colorStatusSuccessBackground3
          }
        />
        {node.failed ? (
          <text
            x={x + 14}
            y={cy + 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="8"
            fontWeight="700"
            fill={tokens.colorNeutralForegroundOnBrand}
          >
            !
          </text>
        ) : (
          <path
            d={`M ${x + 11} ${cy} l 2 2 l 4 -4`}
            fill="none"
            stroke={tokens.colorNeutralForegroundOnBrand}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        <text
          x={x + 24}
          y={y + 18}
          fontSize="11"
          fontWeight="600"
          fill={tokens.colorNeutralForeground1}
        >
          {label}
        </text>
        <text
          x={x + 24}
          y={y + height - 10}
          fontSize="10"
          fill={tokens.colorNeutralForeground3}
        >
          {node.type}
        </text>
        {node.duration && (
          <text
            x={x + width - DURATION_RIGHT}
            y={y + height - 10}
            textAnchor="end"
            fontSize="10"
            fontWeight="500"
            fill={
              node.failed
                ? tokens.colorStatusDangerForeground1
                : tokens.colorNeutralForeground3
            }
          >
            {node.duration}
          </text>
        )}
      </g>
    );
  };

  const contentBlock = (
    <div className={styles.content}>
          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <Text className={styles.statLabel}>Steps</Text>
              <Body1Strong className={styles.statValue}>{stepCount}</Body1Strong>
            </div>
            {agentCount > 0 && (
              <div className={styles.statItem}>
                <Text className={styles.statLabel}>Agent handoffs</Text>
                <Body1Strong className={styles.statValue}>
                  {agentCount}
                </Body1Strong>
              </div>
            )}
            {failedCount > 0 && (
              <div className={styles.statItem}>
                <Text className={styles.statLabel}>Failed</Text>
                <Body1Strong
                  className={styles.statValue}
                  style={{ color: tokens.colorStatusDangerForeground1 }}
                >
                  {failedCount}
                </Body1Strong>
              </div>
            )}
          </div>

          <div className={styles.svgWrapper}>
            <svg
              width={svgWidth}
              height={SVG_HEIGHT}
              viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
              role="img"
              aria-label="Topic execution flow diagram"
              style={{ display: "block" }}
            >
              <defs>
                <marker
                  id="flow-arrow"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    fill={tokens.colorNeutralStrokeAccessible}
                  />
                </marker>
                <marker
                  id="flow-arrow-fail"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    fill={tokens.colorPaletteRedBorderActive}
                  />
                </marker>
              </defs>

              {rows.map((row, i) => {
                const { x, w, needsTurnHeader } = rowPositions[i]!;
                const isLast = i === rows.length - 1;
                const next = !isLast ? rows[i + 1] : undefined;
                const nextPos = !isLast ? rowPositions[i + 1]! : undefined;
                const nextIsTurnStart = next?.node.isTurnStart ?? false;
                const nextFailed = next?.node.failed ?? false;
                const nextIsAgent = next?.kind === "agent";
                const isTurnStart = row.node.isTurnStart;
                const userMsg = isTurnStart
                  ? userMessageByTurnIndex.get(row.node.turnIndex)
                  : undefined;
                const userMsgTruncated = userMsg
                  ? userMsg.length > USER_MSG_MAX_CHARS
                    ? userMsg.slice(0, USER_MSG_MAX_CHARS - 1) + "…"
                    : userMsg
                  : "";
                const turnMsgId = isTurnStart
                  ? userTurnIdByIndex.get(row.node.turnIndex)
                  : undefined;
                return (
                  <g key={row.node.id}>
                    {/* Turn separator (only between turns, not before first) */}
                    {needsTurnHeader && (
                      <line
                        x1={x - TURN_GAP / 2}
                        y1={PAD_Y}
                        x2={x - TURN_GAP / 2}
                        y2={PAD_Y + HEADER_HEIGHT + ROW_HEIGHT}
                        stroke={tokens.colorNeutralStroke2}
                        strokeWidth={1}
                        strokeDasharray="4,3"
                      />
                    )}
                    {/* Turn label + user message (shown on every turn's first row) */}
                    {isTurnStart && (
                      <>
                        <text
                          x={x}
                          y={PAD_Y + TURN_LABEL_HEIGHT - 3}
                          fontSize="11"
                          fontWeight="600"
                          fill={onTurnSelect && turnMsgId ? tokens.colorBrandForeground1 : tokens.colorNeutralForeground3}
                          textDecoration={onTurnSelect && turnMsgId ? "underline" : undefined}
                          cursor={onTurnSelect && turnMsgId ? "pointer" : undefined}
                          role={onTurnSelect && turnMsgId ? "button" : undefined}
                          tabIndex={onTurnSelect && turnMsgId ? 0 : undefined}
                          aria-label={onTurnSelect && turnMsgId ? `Navigate to Turn ${row.node.turnIndex + 1} in conversation preview` : undefined}
                          onClick={onTurnSelect && turnMsgId ? () => onTurnSelect(turnMsgId) : undefined}
                          onKeyDown={onTurnSelect && turnMsgId ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTurnSelect(turnMsgId); } } : undefined}
                        >
                          Turn {row.node.turnIndex + 1}
                        </text>

                        {userMsgTruncated && (
                          <text
                            x={x}
                            y={PAD_Y + TURN_LABEL_HEIGHT + USER_MSG_HEIGHT - 3}
                            fontSize="11"
                            fontStyle="italic"
                            fill={tokens.colorNeutralForeground2}
                          >
                            <title>{userMsg}</title>
                            "{userMsgTruncated}"
                          </text>
                        )}
                      </>
                    )}

                    {/* Edge to next row */}
                    {!isLast && nextPos && (
                      <line
                        x1={x + w}
                        y1={centerY}
                        x2={nextPos.x}
                        y2={centerY}
                        stroke={
                          nextFailed
                            ? tokens.colorPaletteRedBorderActive
                            : tokens.colorNeutralStrokeAccessible
                        }
                        strokeWidth={1.5}
                        strokeDasharray={
                          nextIsTurnStart
                            ? "3,4"
                            : nextIsAgent
                              ? "5,3"
                              : undefined
                        }
                        markerEnd={
                          nextFailed
                            ? "url(#flow-arrow-fail)"
                            : "url(#flow-arrow)"
                        }
                      />
                    )}

                    {/* Row body */}
                    {row.kind === "standalone" ? (
                      renderStepRect(
                        row.node,
                        x,
                        rowTop + (ROW_HEIGHT - STANDALONE_HEIGHT) / 2,
                        STANDALONE_WIDTH,
                        STANDALONE_HEIGHT,
                      )
                    ) : (
                      <>
                        <title>{`${row.node.label} - ${row.node.type}`}</title>
                        {/* Container outer rectangle */}
                        <rect
                          x={x}
                          y={rowTop}
                          width={w}
                          height={ROW_HEIGHT}
                          rx={CONTAINER_RX}
                          ry={CONTAINER_RX}
                          fill={row.node.fill}
                          stroke={row.node.stroke}
                          strokeWidth={row.node.failed ? 2 : 1.5}
                          strokeDasharray="6,3"
                        />
                        {/* Agent header: name */}
                        <text
                          x={x + CONTAINER_PAD_X}
                          y={rowTop + CONTAINER_PAD_Y_TOP + 18}
                          fontSize="12"
                          fontWeight="700"
                          fill={tokens.colorNeutralForeground1}
                        >
                          {(() => {
                            const durationText = row.node.duration ?? "";
                            const durationWidthPx = durationText
                              ? estimateTextWidthPx(durationText, 11) + 12
                              : 0;
                            const labelAvailableWidth = Math.max(
                              32,
                              w - CONTAINER_PAD_X * 2 - durationWidthPx,
                            );
                            return truncateToFitWidth(
                              row.node.label,
                              labelAvailableWidth,
                              12,
                            );
                          })()}
                        </text>
                        {/* Agent header: type label */}
                        <text
                          x={x + CONTAINER_PAD_X}
                          y={rowTop + CONTAINER_PAD_Y_TOP + 18}
                          dy="12"
                          fontSize="10"
                          fill={tokens.colorNeutralForeground3}
                        >
                          {row.node.type}
                          {row.children.length > 0
                            ? ` · ${row.children.length} step${row.children.length > 1 ? "s" : ""}`
                            : ""}
                        </text>
                        {/* Duration right-aligned */}
                        {row.node.duration && (
                          <text
                            x={x + w - CONTAINER_PAD_X}
                            y={rowTop + CONTAINER_PAD_Y_TOP + 18}
                            textAnchor="end"
                            fontSize="11"
                            fontWeight="500"
                            fill={
                              row.node.failed
                                ? tokens.colorStatusDangerForeground1
                                : tokens.colorNeutralForeground3
                            }
                          >
                            {row.node.duration}
                          </text>
                        )}
                        {/* Empty state */}
                        {row.children.length === 0 && (
                          <text
                            x={x + w / 2}
                            y={
                              rowTop +
                              CONTAINER_PAD_Y_TOP +
                              CONTAINER_HEADER_HEIGHT +
                              CONTAINER_HEADER_GAP +
                              CHILD_HEIGHT / 2 +
                              4
                            }
                            textAnchor="middle"
                            fontSize="11"
                            fontStyle="italic"
                            fill={tokens.colorNeutralForeground3}
                          >
                            No child steps captured
                          </text>
                        )}
                        {/* Children chips + inner arrows */}
                        {row.children.map((child, ci) => {
                          const cx =
                            x +
                            CONTAINER_PAD_X +
                            ci * (CHILD_WIDTH + CHILD_GAP);
                          const cy =
                            rowTop +
                            CONTAINER_PAD_Y_TOP +
                            CONTAINER_HEADER_HEIGHT +
                            CONTAINER_HEADER_GAP;
                          const isLastChild = ci === row.children.length - 1;
                          return (
                            <g key={child.id}>
                              {!isLastChild && (
                                <line
                                  x1={cx + CHILD_WIDTH}
                                  y1={cy + CHILD_HEIGHT / 2}
                                  x2={cx + CHILD_WIDTH + CHILD_GAP}
                                  y2={cy + CHILD_HEIGHT / 2}
                                  stroke={tokens.colorNeutralStrokeAccessible}
                                  strokeWidth={1}
                                  markerEnd="url(#flow-arrow)"
                                />
                              )}
                              {renderStepRect(
                                child,
                                cx,
                                cy,
                                CHILD_WIDTH,
                                CHILD_HEIGHT,
                              )}
                            </g>
                          );
                        })}
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className={styles.legend} aria-label="Legend">
            {legendTypes.map((type) => (
              <div key={type} className={styles.legendItem}>
                <span
                  aria-hidden="true"
                  className={styles.legendSwatch}
                  style={{
                    backgroundColor:
                      (STEP_TYPE_STYLES[type] ?? DEFAULT_STYLE).stroke,
                  }}
                />
                <span className={styles.legendLabel}>{type}</span>
              </div>
            ))}
            {failedCount > 0 && (
              <div className={styles.legendItem}>
                <span
                  aria-hidden="true"
                  className={styles.legendSwatch}
                  style={{ backgroundColor: FAILED_STYLE.stroke }}
                />
                <span className={styles.legendLabel}>Failed</span>
              </div>
            )}
          </div>
        </div>
  );

  if (isContained) return contentBlock;

  return (
    <Card appearance="filled">
      <CardHeader
        header={
          <div className={styles.headerRow}>
            <Flow20Regular />
            <Subtitle2>Execution flow</Subtitle2>
            <Tooltip
              content="Execution path across the conversation. Connected agents appear as containers grouping their child steps."
              relationship="description"
            >
              <span
                className={styles.infoIcon}
                tabIndex={0}
                role="img"
                aria-label="Info"
              >
                <Info16Regular />
              </span>
            </Tooltip>
          </div>
        }
        action={
          <Button
            appearance="subtle"
            icon={collapsed ? <ChevronDown20Regular /> : <ChevronUp20Regular />}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand execution flow" : "Collapse execution flow"}
          />
        }
      />
      {!collapsed && contentBlock}
    </Card>
  );
}
