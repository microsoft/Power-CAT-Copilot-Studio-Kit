/* eslint-disable react-hooks/preserve-manual-memoization */

import type {
  Activity,
  ProcessedTurn,
  StepExecution,
  MCPTool,
} from "../contracts/transcript";
import type { ConnectedAgentInfo, ConnectedAgentChildTopic } from "../contracts/connected-agent";
import type { ComponentInfo } from "../services/botcomponents-service";
import { useMemo, useState } from "react";
import "../prism-overrides.css";
import { ReasoningBlock } from "./ui/ReasoningBlock";
import { SkillIcon } from "./ui/SkillIcon";
import { ConnectedAgentCard } from "./ui/ConnectedAgentCard";
import { buildConnectedAgentTopicDetails, collectExecutionEntries, getTopicIcon } from "./ui/connected-agent-card-helpers";
import type { ConnectedAgentTopicDetail } from "./ui/connected-agent-card-helpers";
import {
  isReasonerTool,
  parseMcpTaskDialogId,
  resolveExecutionTimeString,
} from "../utils/step-classification";
import {
  Button,
  Badge,
  Card,
  Text,
  Spinner,
  tokens,
  mergeClasses,
} from "@fluentui/react-components";
import {
  Dismiss24Regular,
  ErrorCircle24Filled,
  BotSparkle24Regular,
  TasksApp24Regular,
  DataUsage24Filled,
  BranchFork20Regular,
  // Step-type icons — Fluent UI replacements for former custom PNG icons
  Code20Regular,
  ChatSparkle20Regular,
  Settings20Regular,
  BookOpenLightbulb20Regular,
  Connector20Regular,
  Wrench20Regular,
  Flow20Regular,
  Server20Regular,
  BrainSparkle20Regular,
  Prompt20Regular,
  Bot20Regular,
  PuzzlePiece20Regular,
} from "@fluentui/react-icons";
import type { FlowStep } from "../contracts/flow-step";
import {
  asRecord,
  buildFlowSteps,
  getStepDisplayDescription,
  readString,
  resolveBestTitle,
} from "../utils/build-flow-steps";
import {
  getLatestGPTAnswerTrace,
  getLatestResponseGeneratorSupport,
  getLatestUniversalSearchTrace,
} from "../utils/activity-trace-selectors";
import { useDebugStyles } from "../styles/useDebugStyles";
import {
  ConditionBranchDetails,
  DetailEmptyText,
  DetailInputsSection,
  DetailOutputField,
  DetailSectionTitle,
  DetailTextSection,
  DetailValueField,
  ErrorDetails,
  GenAiSupportDetails,
  IntentRecognitionDetails,
  ReasoningDetails,
  StepDetails,
  VariableAssignmentDetails,
} from "./activities/detail-renderers";

interface DebugPanelProps {
  turn: ProcessedTurn | null;
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  /** Connected agents detected from the parent transcript */
  connectedAgents?: ConnectedAgentInfo[];
  /** Callback to fetch the child transcript for a connected agent.
   *  Omit in snapshot mode — child transcripts are not fetchable from a local file. */
  onFetchChildTranscript?: (agent: ConnectedAgentInfo) => void;
  /** Custom message shown when no turn is selected */
  emptyMessage?: string;
  /** Show loading spinner while auto-selecting first message */
  isLoadingSteps?: boolean;
  /** Dataverse org URL for constructing Dataverse record links */
  environmentUrl?: string;
  /** True when analyzing a snapshot file — disables Dataverse-dependent features */
  snapshotMode?: boolean;
}

/**
 * True when a step observation carries renderable content. Treats null/undefined,
 * empty objects, and `{ text: "" }` (an empty tool result) as no content.
 */
// Step classification helpers (parseMcpTaskDialogId, isCodeTool, isReasonerTool,
// isCustomPromptAction, guessStepSubtitle) are imported from
// utils/step-classification so the parent debug panel and the connected-agent
// child topic display use the exact same logic.

/** Icon component shown on a step card and in the detail-panel header. */
type StepIconComponent = React.ComponentType<{ style?: React.CSSProperties }>;

/** Maps step kinds and subtypes to their Fluent UI icon component. */
function pickStepIcon(step: FlowStep): StepIconComponent {
  if (step.kind === "code") return Code20Regular;
  if (step.kind === "thinking") return BrainSparkle20Regular;
  if (isReasonerTool(step.taskDialogId ?? "")) return BrainSparkle20Regular;
  if (step.kind === "error") return ErrorCircle24Filled;
  if (step.kind === "mcp") return Server20Regular;
  if (step.kind === "genai") return Prompt20Regular;
  if (step.kind === "vars") return DataUsage24Filled;
  if (step.kind === "condition") return BranchFork20Regular;
  if (step.kind === "intent") return ChatSparkle20Regular;
  if (step.subtitle === "Knowledge") return BookOpenLightbulb20Regular;
  if (step.subtitle === "Skill") return SkillIcon;
  if (step.subtitle === "Custom Prompt") return Prompt20Regular;
  if (step.subtitle === "Connector Action") return Connector20Regular;
  if (step.subtitle === "Flow") return Flow20Regular;
  if (step.subtitle === "Tool") return Wrench20Regular;
  if (step.subtitle === "System Topic") return Settings20Regular;
  if (step.subtitle === "Connected agent" || step.subtitle === "Child agent")
    return Bot20Regular;
  return ChatSparkle20Regular;
}

function pickDetailStepIcon(step: FlowStep): StepIconComponent {
  return step.subtitle === "Skill" ? PuzzlePiece20Regular : pickStepIcon(step);
}

function getStepIconStyle(step: FlowStep): string {
  if (step.kind === "code") return "code";
  if (step.kind === "thinking") return "reasoning";
  if (isReasonerTool(step.taskDialogId ?? "")) return "reasoning";
  if (step.kind === "error") return "error";
  if (step.subtitle === "Topic") return "topic";
  if (step.subtitle === "System Topic") return "system";
  if (step.subtitle === "Knowledge") return "knowledge";
  if (step.subtitle === "Skill") return "skill";
  if (step.subtitle === "Tool") return "tool";
  if (step.subtitle === "Connector Action") return "connector";
  if (step.subtitle === "Flow") return "flow";
  if (step.kind === "mcp") return "tool"; // MCP server initialization uses green tool color
  return "default";
}

/**
 * Checks if a value is JSON-like (object or array) and should be rendered as a
 * syntax-highlighted JSON code block
 */
/**
 * Parses a value to get the JSON object for rendering
 */
/** Renders code with Prism.js syntax highlighting */
/**
 * Smart component that renders JSON values as a syntax-highlighted code block and plain text otherwise
 */
/** Built-in Copilot Studio knowledge source types → friendly display names. */
/** Search result Type field values → friendly display names. */
// ── Lightweight Connected Agent Support ──────────────────────────────

/** Support tools that get folded into the lightweight connected-agent card. */
function isLightweightConnectedAgentSupportTool(taskDialogId: string): boolean {
  return (
    taskDialogId === "P:CaptureContextTool" ||
    taskDialogId === "P:SendMessageTool"
  );
}

interface LightweightConnectedAgentState {
  /** Synthesised ConnectedAgentInfo keyed by the parent agent's stepId. */
  agentsByStepId: Map<string, ConnectedAgentInfo>;
  /** Composite execution keys (taskDialogId:stepId) of descendants to hide from the main timeline. */
  descendantExecutionKeys: Set<string>;
  /** taskDialogIds of descendants to hide from the main timeline. */
  descendantTaskDialogIds: Set<string>;
}

function buildLightweightConnectedAgentState(
  turn: ProcessedTurn | null,
  componentNameBySchemaName?: Record<string, ComponentInfo>
): LightweightConnectedAgentState {
  const empty: LightweightConnectedAgentState = {
    agentsByStepId: new Map(),
    descendantExecutionKeys: new Set(),
    descendantTaskDialogIds: new Set(),
  };

  if (!turn?.debugInfo || !Array.isArray(turn.activities)) return empty;

  const activities: Activity[] = turn.activities;
  const executions = turn.debugInfo.stepExecutions ?? [];

  // Map stepExecutions by composite key for lookup
  const stepExecutionByKey = new Map<string, StepExecution>();
  for (const exec of executions) {
    const tid = String(exec.taskDialogId ?? "");
    const sid = String(exec.stepId ?? "");
    if (tid && sid) stepExecutionByKey.set(`${tid}:${sid}`, exec);
    if (tid) stepExecutionByKey.set(tid, exec);
  }

  // 1. Build plan-parent correlation from DynamicPlanReceived events.
  //    parentPlanStepIdentifier links a child plan to the parent agent's stepId.
  const planParentStepByPlanId = new Map<string, string>();
  for (const a of activities) {
    if (a?.name !== "DynamicPlanReceived" && a?.valueType !== "DynamicPlanReceived") continue;
    const v = asRecord(a.value);
    const planId = readString(v, "planIdentifier") ?? "";
    const parentStepId = readString(v, "parentPlanStepIdentifier") ?? "";
    if (planId && parentStepId) planParentStepByPlanId.set(planId, parentStepId);
  }

  // 2. Identify lightweight agent steps and correlate descendants.
  interface AgentMeta {
    stepId: string;
    taskDialogId: string;
    thought?: string;
    executionTime?: string;
    displayName: string;
  }
  const agentMetaByStepId = new Map<string, AgentMeta>();
  const stepToOwningAgent = new Map<string, string>();

  for (const a of activities) {
    if (
      a?.name !== "DynamicPlanStepTriggered" &&
      a?.valueType !== "DynamicPlanStepTriggered"
    ) continue;

    const v = asRecord(a.value);
    const stepId = readString(v, "stepId") ?? "";
    const taskDialogId = readString(v, "taskDialogId") ?? "";
    const planIdentifier = readString(v, "planIdentifier") ?? "";
    const rawType = readString(v, "type") ?? "";

    if (!stepId || !taskDialogId) continue;

    const isLightweightAgent =
      rawType === "Agent" || taskDialogId.includes(".agent.");

    if (isLightweightAgent) {
      const execution =
        stepExecutionByKey.get(`${taskDialogId}:${stepId}`) ??
        stepExecutionByKey.get(taskDialogId);

      agentMetaByStepId.set(stepId, {
        stepId,
        taskDialogId,
        thought: readString(v, "thought") ?? execution?.thought,
        executionTime: execution?.executionTime,
        displayName: resolveBestTitle(
          taskDialogId,
          undefined,
          componentNameBySchemaName
        ),
      });
      stepToOwningAgent.set(stepId, stepId);
      continue;
    }

    // Check if this step belongs to a child plan of a lightweight agent
    const parentPlanStepId = planParentStepByPlanId.get(planIdentifier) ?? "";
    const owningAgentStepId =
      stepToOwningAgent.get(parentPlanStepId) ??
      (agentMetaByStepId.has(parentPlanStepId) ? parentPlanStepId : "");

    if (!owningAgentStepId) continue;

    // This step is a descendant of a lightweight agent.
    stepToOwningAgent.set(stepId, owningAgentStepId);

    // Hide ALL descendants from the main timeline — they will be surfaced as
    // child topics inside the agent's card. Support tools (SendMessageTool /
    // CaptureContextTool) remain hidden entirely (they're internal scaffolding
    // for lightweight agents and add noise to the card).
    empty.descendantExecutionKeys.add(`${taskDialogId}:${stepId}`);
    empty.descendantTaskDialogIds.add(taskDialogId);
  }

  // 2b. Second pass: catch support tools whose parent lightweight agent fired in
  //     a PREVIOUS user turn.  In that case its DynamicPlanStepTriggered is not
  //     in the current activity slice, so the first pass above never registers it
  //     as a known agent → owningAgentStepId stays empty → support tools slip
  //     through.  We recover by reading parentStepKey from the step executions
  //     (set by the parser from DynamicPlanReceived.parentPlanStepIdentifier).
  for (const exec of executions) {
    const tid = String(exec.taskDialogId ?? "");
    const sid = String(exec.stepId ?? "");
    if (!tid || !sid) continue;
    if (!isLightweightConnectedAgentSupportTool(tid)) continue;
    const parentKey = (exec as { parentStepKey?: string }).parentStepKey ?? "";
    if (!parentKey) continue;
    const colonIdx = parentKey.indexOf(":");
    if (colonIdx < 0) continue;
    // parentStepKey = "taskDialogId:stepId"; the taskDialogId portion identifies
    // whether the owning step is a lightweight agent (.agent. schema).
    if (parentKey.slice(0, colonIdx).includes(".agent.")) {
      empty.descendantExecutionKeys.add(`${tid}:${sid}`);
      empty.descendantTaskDialogIds.add(tid);
    }
  }

  // 3. If no lightweight agents found, return early
  if (agentMetaByStepId.size === 0) return empty;

  // 4. Build child-topic lists per agent from descendant step executions, so
  //    UniversalSearchTool / connector actions / nested topics show up INSIDE
  //    the agent card (and clicking them opens their full detail panel).
  const childTopicsByAgent = new Map<string, ConnectedAgentChildTopic[]>();
  for (const [stepId, owningAgentStepId] of stepToOwningAgent.entries()) {
    if (stepId === owningAgentStepId) continue; // skip the agent step itself
    const exec = (() => {
      // Find the step exec for this stepId by scanning (we don't have a
      // by-stepId index, but executions are small per-turn).
      for (const e of executions) {
        if (String(e.stepId ?? "") === stepId) return e;
      }
      return undefined;
    })();
    if (!exec) continue;

    const taskDialogId = String(exec.taskDialogId ?? "");
    if (!taskDialogId) continue;
    // Skip support tools entirely — they're internal scaffolding.
    if (isLightweightConnectedAgentSupportTool(taskDialogId)) continue;

    const list = childTopicsByAgent.get(owningAgentStepId) ?? [];
    // Sub-steps inside a child agent's plan often carry executionTime
    // "00:00:00" even when triggeredAt→finishedAt timestamps span seconds —
    // the orchestrator zeroes the field for nested plans. Recover the real
    // duration from the activity timestamps so the card still shows it.
    const execTime = resolveExecutionTimeString(exec);
    list.push({
      schemaId: taskDialogId,
      displayName: resolveBestTitle(taskDialogId, undefined, componentNameBySchemaName),
      type: typeof exec.type === "string" ? exec.type : "",
      executionTime: execTime,
      executionTimeSeconds: execTime ? parseExecTimeToSeconds(execTime) : undefined,
      hasExecution: true,
      stepId,
      thought: typeof exec.thought === "string" ? exec.thought : undefined,
      arguments: exec.arguments && typeof exec.arguments === "object"
        ? (exec.arguments as Record<string, unknown>)
        : undefined,
      observation: exec.observation,
      state: typeof exec.state === "string" || typeof exec.state === "number"
        ? exec.state
        : undefined,
    });
    childTopicsByAgent.set(owningAgentStepId, list);
  }

  // 5. Synthesise ConnectedAgentInfo for each lightweight agent — now with
  //    full child-topic data so the card mirrors the heavyweight agent's
  //    behaviour (clickable child topics → step detail panel).
  for (const [agentStepId, meta] of agentMetaByStepId) {
    const agentExec = stepExecutionByKey.get(`${meta.taskDialogId}:${agentStepId}`) ??
      stepExecutionByKey.get(meta.taskDialogId);

    const execTimeStr = resolveExecutionTimeString({
      executionTime: meta.executionTime ?? agentExec?.executionTime,
      triggeredAt: agentExec?.triggeredAt,
      finishedAt: agentExec?.finishedAt,
    });
    const info: ConnectedAgentInfo = {
      agentKind: "child",
      botSchemaName: meta.taskDialogId,
      sessionId: `lightweight:${agentStepId}`,
      parentBotSchemaName: "",
      dialogSchemaName: meta.taskDialogId,
      displayName: meta.displayName,
      childConversationId: "",
      executionTime: execTimeStr,
      executionTimeSeconds: parseExecTimeToSeconds(execTimeStr),
      instruction: meta.thought,
      childTopics: childTopicsByAgent.get(agentStepId) ?? [],
      stepId: agentStepId,
      isFetched: true, // No fetch needed — data synthesised from parent turn
      isFetching: false,
    };
    empty.agentsByStepId.set(agentStepId, info);
  }

  return empty;
}

/** Parses an execution time string like "00:00:37.3264078" into seconds. */
function parseExecTimeToSeconds(timeStr?: string): number | undefined {
  if (!timeStr) return undefined;
  const parts = timeStr.split(":");
  if (parts.length !== 3) return undefined;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 100) / 100;
}


export function DebugPanel({
  turn,
  componentNameBySchemaName,
  connectedAgents,
  onFetchChildTranscript,
  emptyMessage,
  isLoadingSteps,
  environmentUrl,
  snapshotMode,
}: DebugPanelProps) {
  const styles = useDebugStyles();
  const [selection, setSelection] = useState<{
    turn: ProcessedTurn | null;
    stepKey: string | null;
    connectedAgentTopic: string | null;
  }>({
    turn: null,
    stepKey: null,
    connectedAgentTopic: null,
  });

  const mcpToolsList = useMemo(
    () =>
      Array.isArray(turn?.debugInfo?.mcpTools)
        ? turn.debugInfo.mcpTools
        : [],
    [turn?.debugInfo?.mcpTools]
  );

  // Get fallback server name from mcpServerInfo for transcripts without llmIdentifierPrefix
  const mcpServerFallbackName = turn?.debugInfo?.mcpServerInfo?.name;

  const steps = useMemo(
    () =>
      buildFlowSteps(
        turn,
        componentNameBySchemaName,
        mcpToolsList,
        mcpServerFallbackName,
      ),
    [turn, componentNameBySchemaName, mcpToolsList, mcpServerFallbackName]
  );

  // Lightweight connected-agent state (synthesised from parent turn)
  const lightweightAgentState = useMemo(
    () => buildLightweightConnectedAgentState(turn, componentNameBySchemaName),
    [turn, componentNameBySchemaName]
  );

  // Merge lightweight agents with standard connected agents for the rendering loop
  const allConnectedAgents = useMemo(() => {
    const standard = connectedAgents ?? [];
    const lightweight = Array.from(lightweightAgentState.agentsByStepId.values());
    return [...standard, ...lightweight];
  }, [connectedAgents, lightweightAgentState]);

  const firstSelectableStep = useMemo(
    () =>
      steps.find((step) => {
        if (step.taskDialogId && step.stepId) {
          const compositeKey = `${step.taskDialogId}:${step.stepId}`;
          if (lightweightAgentState.descendantExecutionKeys.has(compositeKey)) {
            return false;
          }
        }

        if (
          isLightweightConnectedAgentSupportTool(step.taskDialogId ?? "") &&
          lightweightAgentState.descendantTaskDialogIds.has(step.taskDialogId ?? "")
        ) {
          return false;
        }

        if (step.kind === "thinking") {
          return false;
        }

        return !(
          (step.subtitle === "Tool" || step.subtitle === "Skill") &&
          step.hasDetail === false
        );
      }),
    [steps, lightweightAgentState]
  );

  const hasSelectionForCurrentTurn = selection.turn === turn;
  const selectedKey = hasSelectionForCurrentTurn
    ? selection.stepKey
    : firstSelectableStep?.key ?? null;
  const selectedConnectedAgentTopic = hasSelectionForCurrentTurn
    ? selection.connectedAgentTopic
    : null;

  const selectStep = (
    stepKey: string | null,
    connectedAgentTopic: string | null = null
  ) => {
    setSelection({
      turn,
      stepKey,
      connectedAgentTopic,
    });
  };

  const selectedStep = useMemo(() => {
    if (!selectedKey) return null;
    return steps.find((s) => s.key === selectedKey) ?? null;
  }, [steps, selectedKey]);

  /**
   * Locates the ConnectedAgentInfo that powers the card for `step`. Match
   * priority: stepId (unique per invocation) → positional index among
   * same-dialogSchemaName entries (handles parallel invocations of the same
   * connected agent, e.g. scheduling interviews for two candidates at once)
   * → first agent with matching dialogSchemaName.
   */
  const findAgentForStep = (step: FlowStep): ConnectedAgentInfo | undefined => {
    if (!allConnectedAgents.length) return undefined;
    const byStepId = allConnectedAgents.find(
      (ca) => ca.stepId && ca.stepId === step.stepId
    );
    if (byStepId) return byStepId;
    const sameDialog = allConnectedAgents.filter(
      (ca) => ca.dialogSchemaName === step.taskDialogId
    );
    if (sameDialog.length === 0) return undefined;
    if (sameDialog.length === 1) return sameDialog[0];
    const stepsForDialog = steps.filter(
      (s) => s.taskDialogId === step.taskDialogId
    );
    const positionalIndex = stepsForDialog.indexOf(step);
    return sameDialog[positionalIndex] ?? sameDialog[0];
  };

  const showDetails = Boolean(selectedStep);

  // Map by both taskDialogId and stepId to support multiple invocations of same action
  const stepExecutionByKey = useMemo(() => {
    const map = new Map<string, StepExecution>();
    const executions = turn?.debugInfo?.stepExecutions ?? [];
    for (const exec of executions) {
      const task = String(exec.taskDialogId ?? "");
      const stepId = String(exec.stepId ?? "");
      if (!task) continue;
      // Use composite key: taskDialogId:stepId for uniqueness
      const key = stepId ? `${task}:${stepId}` : task;
      map.set(key, exec);
      // Also store by taskDialogId only for backward compatibility (fallback)
      if (!map.has(task)) {
        map.set(task, exec);
      }
    }
    return map;
  }, [turn]);

  // Render a stable left-side panel even before a message is selected.
  if (!turn?.debugInfo) {
    return (
      <div className={mergeClasses(styles.cardContent, styles.emptyState)}>
        {isLoadingSteps ? (
          <Spinner size="small" label="Loading debug steps..." />
        ) : (
          <div className={styles.emptyStateBox}>
            {emptyMessage || "Select a message to view debug steps."}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.cardContent}>
        <div className={showDetails ? styles.gridDouble : styles.gridSingle}>
          <div
            className={
              showDetails ? styles.stepsListDouble : styles.stepsContainer
            }
          >
            <div className={styles.stepsList}>
              {steps.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    minHeight: "200px",
                    flex: 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: tokens.fontSizeBase300,
                      color: tokens.colorNeutralForeground3,
                    }}
                  >
                    No step details available for this message.
                  </Text>
                </div>
              ) : (
                steps.map((step, idx) => {
                  // Hide ALL descendants of a lightweight connected-agent —
                  // they are surfaced as child topics inside the agent's card.
                  // (Support tools like SendMessageTool / CaptureContextTool
                  // are also hidden here; the lightweight state already
                  // identifies them as descendants.)
                  if (step.taskDialogId && step.stepId) {
                    const compositeKey = `${step.taskDialogId}:${step.stepId}`;
                    if (lightweightAgentState.descendantExecutionKeys.has(compositeKey)) {
                      return null;
                    }
                  }
                  // Fallback: the plan-only step-building path can produce steps that
                  // have a taskDialogId but no stepId.  In that case the composite-key
                  // check above won't fire, so we catch lightweight support tools
                  // (P:SendMessageTool / P:CaptureContextTool) by taskDialogId alone.
                  if (
                    isLightweightConnectedAgentSupportTool(step.taskDialogId ?? "") &&
                    lightweightAgentState.descendantTaskDialogIds.has(step.taskDialogId ?? "")
                  ) {
                    return null;
                  }

                  // Reasoning (ThinkingTrace) renders as inline plain text — not a
                  // clickable card/box — matching how Copilot Studio surfaces it.
                  // Wrapped in the same flex-column + connector structure as cards so
                  // the vertical timeline line continues through reasoning steps.
                  if (step.kind === "thinking") {
                    return (
                      <div
                        key={step.key}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          width: "100%",
                        }}
                      >
                        <div style={{ maxWidth: "560px", width: "100%" }}>
                          <ReasoningBlock text={step.thought ?? ""} />
                        </div>
                        {idx < steps.length - 1 && (
                          <div className={styles.connector}>
                            <div className={styles.connectorLine} />
                          </div>
                        )}
                      </div>
                    );
                  }

                  const isSelected = selectedKey === step.key;
                  const Icon = pickStepIcon(step);
                  const iconStyle = getStepIconStyle(step);
                  const isMcpTool =
                    step.kind === "step" && step.subtitle === "Tool";
                  const isMcpServer = step.kind === "mcp";

                  // Determine the icon background style
                  const getIconClassName = () => {
                    if (isMcpServer) return styles.stepCardIconMcp;
                    if (iconStyle === "error") return styles.stepCardIconError;
                    if (iconStyle === "connector") return styles.stepCardIconConnector;
                    if (iconStyle === "flow") return styles.stepCardIconFlow;
                    if (iconStyle === "knowledge") return styles.stepCardIconKnowledge;
                    if (iconStyle === "skill") return styles.stepCardIconSkill;
                    if (iconStyle === "tool") return styles.stepCardIconTool;
                    if (iconStyle === "code") return styles.stepCardIconCode;
                    if (iconStyle === "reasoning") return styles.stepCardIconReasoning;
                    if (iconStyle === "topic" || iconStyle === "system") return styles.stepCardIconTopic;
                    return styles.stepCardIconTopic;
                  };

                  // MCP Tool with nested card structure
                  if (isMcpTool && step.mcpServerDisplayName) {
                    return (
                      <div
                        key={step.key}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          width: "100%",
                        }}
                      >
                        <Card
                          appearance="filled"
                          className={mergeClasses(
                            styles.stepCard,
                            styles.mcpOuterCard,
                            isSelected && styles.stepButtonSelected,
                            isSelected ? styles.mcpOuterCardSelected : styles.mcpOuterCardDefault
                          )}
                          style={{ cursor: "pointer" }}
                          onClick={() =>
                            selectStep(isSelected ? null : step.key)
                          }
                          tabIndex={0}
                          role="button"
                          aria-pressed={isSelected}
                          aria-label={`${step.mcpServerDisplayName ?? "MCP Server"}: ${step.title}, ${isSelected ? "selected" : "select to view details"}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectStep(isSelected ? null : step.key);
                            }
                          }}
                        >
                          {/* MCP Server info */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: tokens.spacingHorizontalM,
                              paddingBottom: tokens.spacingVerticalXS,
                            }}
                          >
                            <div
                              className={mergeClasses(
                                styles.stepCardIcon,
                                styles.stepCardIconMcp
                              )}
                            >
                              <Server20Regular style={{ width: "24px", height: "24px" }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                              <Text className={styles.stepCardTitle}>
                                {step.mcpServerDisplayName}
                              </Text>
                              <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
                                <Text className={styles.stepCardSubtitle}>
                                  Model Context Protocol
                                </Text>
                                {step.statusText === "Initialized" && (
                                  <span className={styles.mcpStatusBadge}>
                                    Initialized
                                  </span>
                                )}
                              </div>
                            </div>
                            {step.duration && (
                              <div className={styles.stepCardRight}>
                                <Text className={styles.stepCardDuration}>
                                  {step.duration}
                                </Text>
                              </div>
                            )}
                          </div>
                          {/* Tool name inline */}
                          <div className={styles.mcpToolInnerCard}>
                            <Text className={styles.stepCardSubtitle}>
                              Tool: <Text style={{ fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 }}>{step.title}</Text>
                            </Text>
                          </div>
                        </Card>

                        {idx < steps.length - 1 && (
                          <div className={styles.connector}>
                            <div className={styles.connectorLine} />
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Agent step — render the ConnectedAgentCard for both
                  // CONNECTED agents (InvokeConnectedAgentTaskAction, separate
                  // published agent) and CHILD agents (in-app sub-agent surfaced
                  // via DynamicPlanStepTriggered with type "Agent" / .agent. schema).
                  // Generative (new designer) connected agents have no such
                  // taskDialogId marker (the toolName is the agent name), so also
                  // match when a ConnectedAgentInfo was detected for this step.
                  const isAgentStep =
                    (step.subtitle === "Connected agent" || step.subtitle === "Child agent") && (
                      step.taskDialogId?.includes("InvokeConnectedAgentTaskAction") ||
                      step.taskDialogId?.includes(".agent.") ||
                      Boolean(findAgentForStep(step))
                    );

                  if (isAgentStep && allConnectedAgents.length) {
                    const matchedAgent = findAgentForStep(step);

                    if (matchedAgent) {
                      return (
                        <div
                          key={step.key}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            width: "100%",
                          }}
                        >
                          <div style={{ maxWidth: "560px", width: "100%" }}>
                            <ConnectedAgentCard
                              connectedAgent={matchedAgent}
                              onFetchChildTranscript={onFetchChildTranscript}
                              componentNameBySchemaName={componentNameBySchemaName}
                              selectedTopicKey={selectedKey === step.key ? selectedConnectedAgentTopic : null}
                              onTopicSelect={(topicKey) => {
                                selectStep(step.key, topicKey);
                              }}
                              onSelect={() => selectStep(step.key)}
                              environmentUrl={environmentUrl}
                              snapshotMode={snapshotMode}
                              initiallyExpanded={firstSelectableStep?.key === step.key}
                              flushTop={firstSelectableStep?.key === step.key}
                            />
                          </div>
                          {idx < steps.length - 1 && (
                            <div className={styles.connector}>
                              <div className={styles.connectorLine} />
                            </div>
                          )}
                        </div>
                      );
                    }
                  }

                  // Tools/Skills with nothing to show in the detail panel render as
                  // a static, non-clickable rectangle (like Reasoning) so clicking
                  // never opens an empty panel.
                  const isStaticCard =
                    (step.subtitle === "Tool" || step.subtitle === "Skill") &&
                    step.hasDetail === false;

                  // Regular card structure for non-MCP tools
                  return (
                    <div
                      key={step.key}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        width: "100%",
                      }}
                    >
                      <Card
                        appearance="filled"
                        className={mergeClasses(
                          styles.stepCard,
                          !isStaticCard && isSelected && styles.stepButtonSelected,
                          !isStaticCard && isSelected ? styles.regularCardSelected : styles.regularCardDefault
                        )}
                        style={{
                          maxWidth: "560px",
                          cursor: isStaticCard ? "default" : "pointer",
                        }}
                        onClick={isStaticCard ? undefined : () =>
                          selectStep(isSelected ? null : step.key)
                        }
                        tabIndex={isStaticCard ? undefined : 0}
                        role={isStaticCard ? undefined : "button"}
                        aria-pressed={isStaticCard ? undefined : isSelected}
                        aria-label={isStaticCard
                          ? `${step.title}, ${step.subtitle}`
                          : `${step.title}, ${step.subtitle}. ${isSelected ? "Selected" : "Select to view details"}`}
                        onKeyDown={isStaticCard ? undefined : (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectStep(isSelected ? null : step.key);
                          }
                        }}
                      >
                        <div
                          className={mergeClasses(
                            styles.stepCardIcon,
                            getIconClassName()
                          )}
                        >
                          <Icon style={{ width: "24px", height: "24px" }} />
                        </div>
                        <div className={styles.stepCardInfo}>
                          <Text className={styles.stepCardTitle}>
                            {step.title}
                          </Text>
                          <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
                            <Text className={styles.stepCardSubtitle}>
                              {step.subtitle}
                            </Text>
                            {step.statusText === "Initialized" && (
                              <span className={styles.mcpStatusBadge}>
                                Initialized
                              </span>
                            )}
                            {step.finishedState === "failed" && (
                              <Badge
                                appearance="outline"
                                shape="rounded"
                                className={styles.badgeError}
                              >
                                Failed
                              </Badge>
                            )}
                          </div>
                        </div>
                        {step.duration && (
                          <div className={styles.stepCardRight}>
                            <Text className={styles.stepCardDuration}>
                              {step.duration}
                            </Text>
                          </div>
                        )}
                      </Card>

                      {idx < steps.length - 1 && (
                        <div className={styles.connector}>
                          <div className={styles.connectorLine} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {selectedStep && (() => {
            // Resolve which child topic (if any) is selected so we can render
            // the topic's own icon + title in the detail header. When no
            // child topic is selected, fall back to the parent step's icon.
            let childTopicDetail: ConnectedAgentTopicDetail | null = null;
            if (
              (selectedStep.subtitle === "Connected agent" ||
                selectedStep.subtitle === "Child agent") &&
              selectedConnectedAgentTopic
            ) {
              const matchedCA = findAgentForStep(selectedStep);
              if (matchedCA) {
                const topicDetails = buildConnectedAgentTopicDetails(
                  matchedCA,
                  componentNameBySchemaName
                );
                childTopicDetail =
                  topicDetails.find((d) => d.key === selectedConnectedAgentTopic) ?? null;
              }
            }

            // Pick the header icon. For child topics use getTopicIcon (which
            // mirrors the small-card icons inside ConnectedAgentCard); for
            // every other step reuse the same pickStepIcon/getStepIconStyle
            // helpers that drive the activity-card icons so the detail panel
            // stays visually consistent with the card it was opened from.
            const headerIcon: StepIconComponent | null = childTopicDetail
              ? (childTopicDetail.rawType === "Skill"
                ? PuzzlePiece20Regular
                : getTopicIcon(
                  childTopicDetail.schemaId,
                  childTopicDetail.rawType,
                  childTopicDetail.observation,
                ))
              : (selectedStep.subtitle === "Connected agent"
                ? BotSparkle24Regular
                : selectedStep.subtitle === "Child agent"
                ? TasksApp24Regular
                : pickDetailStepIcon(selectedStep));
            const headerIconStyle = childTopicDetail
              ? "topic"
              : getStepIconStyle(selectedStep);
            const headerIconClass = (() => {
              // For connected agent child topics, derive the CSS colour class from
              // the topic's raw type so the detail-panel header matches the small
              // topic-card icons inside ConnectedAgentCard (MCP→green, Tool→blue…).
              if (childTopicDetail) {
                const rt = childTopicDetail.rawType;
                const sid = childTopicDetail.schemaId;
                if (rt === "MCPServer") return styles.stepCardIconMcp;
                if (sid === "P:CodeTool") return styles.stepCardIconCode;
                if (sid === "P:ReasonerTool") return styles.stepCardIconReasoning;
                if (rt === "KnowledgeSource" || sid.startsWith("P:UniversalSearch"))
                  return styles.stepCardIconKnowledge;
                if (rt === "Skill") return styles.stepCardIconSkill;
                // "LlmSkill" is an LLM-invocable tool (labelled "Tool"), not a skill.
                if (rt === "LlmSkill") return styles.stepCardIconTool;
                if (rt === "Flow" || sid.includes("InvokeFlowTaskAction"))
                  return styles.stepCardIconFlow;
                // Classic connector actions (ConnectorAction type or `.action.` schemaId).
                if (rt === "ConnectorAction" || sid.includes(".action."))
                  return styles.stepCardIconConnector;
                // New-designer generic/MCP tools (type "Action") → tool colour.
                if (rt === "Action" || rt === "Tool") return styles.stepCardIconTool;
                return styles.stepCardIconTopic;
              }
              if (selectedStep.kind === "mcp") return styles.stepCardIconMcp;
              if (headerIconStyle === "error") return styles.stepCardIconError;
              if (headerIconStyle === "connector") return styles.stepCardIconConnector;
              if (headerIconStyle === "flow") return styles.stepCardIconFlow;
              if (headerIconStyle === "knowledge") return styles.stepCardIconKnowledge;
              if (headerIconStyle === "skill") return styles.stepCardIconSkill;
              if (headerIconStyle === "tool") return styles.stepCardIconTool;
              if (headerIconStyle === "code") return styles.stepCardIconCode;
              if (headerIconStyle === "reasoning") return styles.stepCardIconReasoning;
              return styles.stepCardIconTopic;
            })();

            return (
            <div className={styles.detailsPanel}>
              <div className={styles.detailsHeader}>
                {headerIcon && (
                  <div className={mergeClasses(styles.stepCardIcon, headerIconClass)} aria-hidden>
                    {(() => {
                      const IconComp = headerIcon;
                      return <IconComp style={{ width: "24px", height: "24px" }} />;
                    })()}
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  {childTopicDetail ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
                        <Text className={styles.detailsTitle}>{childTopicDetail.displayName}</Text>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
                        <Text className={styles.stepSubtitle}>{childTopicDetail.typeLabel}</Text>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: tokens.spacingHorizontalS,
                        }}
                      >
                        <Text className={styles.detailsTitle}>
                          {selectedStep.mcpServerDisplayName || selectedStep.title}
                        </Text>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
                        <Text className={styles.stepSubtitle}>
                          {selectedStep.mcpServerDisplayName
                            ? "Model Context Protocol"
                            : selectedStep.subtitle}
                        </Text>
                        {selectedStep.statusText === "Initialized" && (
                          <span className={styles.mcpStatusBadge}>
                            {selectedStep.statusText}
                          </span>
                        )}
                        {selectedStep.statusText && selectedStep.statusText !== "Initialized" && selectedStep.kind !== "error" && selectedStep.kind !== "vars" && (
                          <span className={styles.mcpStatusBadge}>
                            {selectedStep.statusText}
                          </span>
                        )}
                        {selectedStep.finishedState === "failed" && (
                          <Badge appearance="outline" shape="rounded" className={styles.badgeError}>
                            Failed
                          </Badge>
                        )}
                        {selectedStep.finishedState === "blocked" && (
                          <Badge appearance="tint" color="warning" shape="rounded">
                            Blocked
                          </Badge>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <Button
                  appearance="subtle"
                  icon={<Dismiss24Regular />}
                  onClick={() => selectStep(null)}
                  aria-label="Close details"
                />
              </div>

              <div className={styles.detailsContent}>
                {/* Agent detail panel — handles both connected and child agents */}
                {(selectedStep.subtitle === "Connected agent" || selectedStep.subtitle === "Child agent") && (() => {
                  const caTask = selectedStep.taskDialogId ? String(selectedStep.taskDialogId) : "";
                  const caStepId = selectedStep.stepId ? String(selectedStep.stepId) : "";
                  const caExecKey = caStepId ? `${caTask}:${caStepId}` : caTask;
                  const caExec = caExecKey ? stepExecutionByKey.get(caExecKey) : undefined;
                  const caArgs = caExec?.arguments;
                  const caArgEntries = caArgs && typeof caArgs === "object" ? Object.entries(caArgs) : [];

                  const isLightweight = lightweightAgentState.agentsByStepId.has(caStepId);

                  // Find the matched connected agent for topic detail building
                  const matchedCA = findAgentForStep(selectedStep);

                  // If a child topic is selected, render using StepDetails (same as regular activity nodes)
                  if (selectedConnectedAgentTopic && matchedCA) {
                    const topicDetails = buildConnectedAgentTopicDetails(matchedCA, componentNameBySchemaName);
                    const selectedDetail = topicDetails.find((d) => d.key === selectedConnectedAgentTopic);
                    if (selectedDetail) {
                      // Get the raw execution for the selected topic from child transcript.
                      // Correlate by the unique per-invocation stepId first — matching by
                      // taskDialogId alone returns the FIRST exec of that tool, so repeated
                      // calls of the same tool (e.g. 4 distinct "search" queries) would all
                      // show the first call's input/output. Fall back to taskDialogId for
                      // legacy/plan-only topics that carry no stepId.
                      const childExecEntries = collectExecutionEntries(matchedCA);
                      const childExec =
                        (selectedDetail.stepId
                          ? childExecEntries.find((e) => e.stepId === selectedDetail.stepId)
                          : undefined) ??
                        childExecEntries.find((e) => e.taskDialogId === selectedDetail.schemaId);
                      const childArgs = childExec?.arguments && typeof childExec.arguments === "object"
                        ? Object.entries(childExec.arguments) as Array<[string, unknown]>
                        : selectedDetail.inputs.map(([k, v]) => [k, v] as [string, unknown]);
                      // For lightweight agents (no child transcript), fall back to the
                      // observation we already extracted into the topic detail.
                      const childObs = childExec?.observation ?? selectedDetail.observation;
                      const isKnowledge = selectedDetail.rawType === "KnowledgeSource" ||
                        selectedDetail.schemaId.startsWith("P:UniversalSearch");

                      // Locate the per-step exec on the parent turn (lightweight case)
                      // so we can surface its bound knowledgeSources / genAiSupportData
                      // in the same panel a top-level step would show.
                      const parentTurnExec = (turn?.debugInfo?.stepExecutions ?? []).find(
                        (e) =>
                          e.stepId === selectedDetail.stepId ||
                          e.taskDialogId === selectedDetail.schemaId
                      ) as StepExecution & {
                        knowledgeSources?: { searched?: string[]; output?: string[]; cited?: string[] };
                        genAiSupportData?: unknown;
                        tokenInfo?: FlowStep["tokenInfo"];
                      } | undefined;

                      // Activity-derived sources (parent transcript scan) — same data
                      // a regular top-level step would receive.
                      const turnActivities: Activity[] = Array.isArray(turn?.activities)
                        ? turn.activities
                        : [];
                      const responseSupport = isKnowledge
                        ? getLatestResponseGeneratorSupport(turnActivities)
                        : undefined;
                      const universalSearchTrace = isKnowledge
                        ? getLatestUniversalSearchTrace(turnActivities)
                        : undefined;

                      // Cited sources: prefer step-level (bound by parser to the
                      // producing step), fall back to turn-level for back-compat.
                      const citedKnowledgeSources =
                        parentTurnExec?.knowledgeSources?.cited ??
                        turn?.debugInfo?.knowledgeSources?.cited;

                      // MCP tools nested inside a child/connected agent live in the
                      // CHILD transcript turns, not the parent turn. Gather them once
                      // so both the MCPServer-view and tool-invocation branch can use
                      // them — this reuses the same parsing/rendering logic as
                      // top-level MCP steps end-to-end.
                      const childTranscriptTurns: ProcessedTurn[] =
                        Array.isArray(matchedCA.childTranscript)
                          ? (matchedCA.childTranscript as ProcessedTurn[])
                          : [];

                      // ── MCPServer child topic ──────────────────────────────────
                      // Render the same tools-table view as a top-level MCP step.
                      if (selectedDetail.rawType === "MCPServer") {
                        const childMcpTools = (() => {
                          for (const ct of childTranscriptTurns) {
                            const tools = Array.isArray(ct.debugInfo?.mcpTools)
                              ? (ct.debugInfo.mcpTools as MCPTool[])
                              : [];
                            if (tools.length === 0) continue;
                            const filtered = tools.filter(
                              (t) => t.schemaName === selectedDetail.schemaId
                            );
                            return filtered.length > 0 ? filtered : tools;
                          }
                          return [] as MCPTool[];
                        })();
                        const childCompInfo =
                          componentNameBySchemaName?.[selectedDetail.schemaId];
                        const mcpDesc =
                          childCompInfo?.modelDescription ||
                          childCompInfo?.description ||
                          "";
                        return (
                          <div className={styles.spaceY4}>
                            <DetailTextSection
                              title="Description"
                              content={mcpDesc}
                            />
                            <div style={{ marginBottom: tokens.spacingVerticalXS }}>
                              <DetailSectionTitle>Tools</DetailSectionTitle>
                              {childMcpTools.length > 0 ? (
                                <div style={{ marginTop: tokens.spacingVerticalS }}>
                                  <div className={styles.toolsTableHeader}>
                                    <Text
                                      className={styles.toolsTableHeaderCell}
                                      style={{ width: "140px", flexShrink: 0 }}
                                    >
                                      Tool name
                                    </Text>
                                    <Text
                                      className={styles.toolsTableHeaderCell}
                                      style={{ flex: 1 }}
                                    >
                                      Description
                                    </Text>
                                  </div>
                                  <div className={styles.mcpToolsList}>
                                    {childMcpTools.map((tool) => (
                                      <div
                                        key={tool.identifier}
                                        className={styles.toolsTableRow}
                                      >
                                        <div
                                          className={mergeClasses(
                                            styles.toolsTableCell,
                                            styles.toolsTableCellName
                                          )}
                                        >
                                          {tool.displayName || tool.identifier}
                                        </div>
                                        <div
                                          className={mergeClasses(
                                            styles.toolsTableCell,
                                            styles.toolsTableCellDesc
                                          )}
                                        >
                                          {tool.description || "—"}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <DetailEmptyText>
                                  No MCP tools captured for this server.
                                </DetailEmptyText>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // ── MCP tool-invocation child step ─────────────────────────
                      // Look up the tool definition first in the parent turn
                      // (lightweight agents run MCP inline), then fall back to
                      // child transcript turns (connected agents use their own
                      // MCP session).
                      const childMcpParsed = parseMcpTaskDialogId(
                        selectedDetail.schemaId
                      );
                      const childMcpTool = (() => {
                        const identifier = childMcpParsed?.toolIdentifier;
                        if (!identifier) return undefined;
                        // 1. Parent turn (lightweight / inline MCP)
                        const parentTools = Array.isArray(turn?.debugInfo?.mcpTools)
                          ? turn.debugInfo.mcpTools
                          : [];
                        const fromParent = parentTools.find(
                          (t) => String(t?.identifier ?? "") === identifier
                        );
                        if (fromParent) return fromParent;
                        // 2. Child transcript turns (connected-agent MCP session)
                        for (const ct of childTranscriptTurns) {
                          const tools = Array.isArray(ct.debugInfo?.mcpTools)
                            ? (ct.debugInfo.mcpTools as MCPTool[])
                            : [];
                          const found = tools.find(
                            (t) => String(t?.identifier ?? "") === identifier
                          );
                          if (found) return found;
                        }
                        return undefined;
                      })();

                      // Generative (new designer) KnowledgeSearch inside a
                      // connected agent exposes its searched sources on the step
                      // exec (knowledgeSources.searched, parsed from
                      // hiddenFilledParameters). Surface them via generativeKnowledge
                      // so StepDetails renders Query, Sources and Results — matching
                      // the parent agent. Without it the connected KnowledgeSearch
                      // fell back to the classic universal-search path (which relies
                      // on the parent turn's trace) and showed only the query.
                      const knowledgeExec = (childExec ?? parentTurnExec) as
                        | { toolKind?: string; knowledgeSources?: { searched?: string[] } }
                        | undefined;
                      const generativeKnowledge =
                        isKnowledge && knowledgeExec?.toolKind === "search"
                          ? { sources: knowledgeExec?.knowledgeSources?.searched ?? [] }
                          : undefined;

                      return (
                        <>
                          <StepDetails
                            argsEntries={childArgs}
                            observation={childObs}
                            showSearchSources={isKnowledge}
                            generativeKnowledge={generativeKnowledge}
                            responseSupport={responseSupport}
                            universalSearchTrace={universalSearchTrace}
                            citedKnowledgeSources={citedKnowledgeSources}
                            thought={selectedDetail.thought}
                            componentNameBySchemaName={componentNameBySchemaName}
                            mcpTool={childMcpTool}
                            mcpToolIdentifier={childMcpParsed?.toolIdentifier}
                          />
                          {/* Step-level GenerativeAnswers (token usage,
                              endpoints, key details) when this child step was
                              the producer. Query and Sources are suppressed
                              because StepDetails above already renders them
                              from the same data. */}
                          {parentTurnExec?.genAiSupportData && (
                            <GenAiSupportDetails
                              debugInfo={{
                                genAiSupportData: parentTurnExec.genAiSupportData,
                                tokenInfo: parentTurnExec.tokenInfo,
                              } as ProcessedTurn["debugInfo"]}
                              hideQuery={isKnowledge}
                              hideSources={isKnowledge}
                            />
                          )}
                        </>
                      );
                    }
                  }

                  // Base connected agent details (no child topic selected)
                  const caDescription = (() => {
                    if (selectedStep.modelDescription || selectedStep.description) {
                      return selectedStep.modelDescription || selectedStep.description || "";
                    }
                    if (matchedCA?.botSchemaName && componentNameBySchemaName) {
                      const agentInfo = componentNameBySchemaName[matchedCA.botSchemaName];
                      return agentInfo?.modelDescription?.trim() || agentInfo?.description?.trim() || "";
                    }
                    return "";
                  })();

                  // Lightweight agents: extract Outputs from P:CaptureContextTool / P:SendMessageTool
                  const lightweightOutputs = (() => {
                    if (!isLightweight) return { entries: [] as [string, unknown][], fallback: "" };
                    const allExecs = turn?.debugInfo?.stepExecutions ?? [];
                    const captureExec = allExecs.find(
                      (e) => e.taskDialogId === "P:CaptureContextTool"
                    );
                    const captureArgs = captureExec?.arguments && typeof captureExec.arguments === "object"
                      ? captureExec.arguments as Record<string, unknown>
                      : undefined;
                    const captureContext = captureArgs?.context && typeof captureArgs.context === "object"
                      ? captureArgs.context as Record<string, unknown>
                      : undefined;
                    const outputEntries = captureContext
                      ? Object.entries(captureContext)
                      : [];

                    let fallbackOutput = "";
                    if (outputEntries.length === 0) {
                      const sendExec = allExecs.find(
                        (e) => e.taskDialogId === "P:SendMessageTool"
                      );
                      const sendArgs = sendExec?.arguments && typeof sendExec.arguments === "object"
                        ? sendExec.arguments as Record<string, unknown>
                        : undefined;
                      fallbackOutput = typeof sendArgs?.message === "string" ? sendArgs.message : "";
                    }
                    return { entries: outputEntries, fallback: fallbackOutput };
                  })();

                  const caThought = (() => {
                    const execThought = typeof caExec?.thought === "string" ? caExec.thought.trim() : "";
                    if (execThought) return execThought;
                    if (isLightweight) {
                      const lwAgent = lightweightAgentState.agentsByStepId.get(caStepId);
                      return lwAgent?.instruction?.trim() || "";
                    }
                    return "";
                  })();

                  // Generative (new designer) connected agents embed the connected
                  // agent's response inside the agent tool result JSON
                  // ({ conversation_id, agent_response, is_error }). Surface it as the
                  // Output. The child conversation-id link lives on the activity card
                  // (ConnectedAgentCard), same as classic. Classic transcripts don't
                  // populate agent_response, so this is additive only.
                  const caResult =
                    caExec?.observation &&
                    typeof caExec.observation === "object" &&
                    !Array.isArray(caExec.observation)
                      ? (caExec.observation as Record<string, unknown>)
                      : undefined;
                  const isGenerativeConnectedAgent =
                    typeof caResult?.["conversation_id"] === "string" ||
                    typeof caResult?.["agent_response"] === "string";

                  return (
                    <div className={styles.spaceY4}>
                      <DetailTextSection
                        title="Description"
                        content={caDescription}
                      />
                      {caThought && (
                        <DetailTextSection
                          title="Thought"
                          content={caThought}
                        />
                      )}
                      <DetailInputsSection inputs={caArgEntries} emptyMessage="No inputs captured for this agent." />
                      {isGenerativeConnectedAgent && caResult && (
                        <div style={{ marginBottom: tokens.spacingVerticalXS }}>
                          <DetailOutputField
                            label="Output"
                            value={caResult}
                            maxHeight="360px"
                            displayMode="json-code"
                          />
                        </div>
                      )}
                      {isLightweight && lightweightOutputs.entries.length > 0 && (
                        <div style={{ marginBottom: tokens.spacingVerticalXS }}>
                          <DetailSectionTitle>Outputs</DetailSectionTitle>
                          <div className={styles.spaceY3} style={{ marginTop: tokens.spacingVerticalS }}>
                            {lightweightOutputs.entries.map(([key, val]) => (
                              <DetailValueField key={key} label={key} value={val} />
                            ))}
                          </div>
                        </div>
                      )}
                      {isLightweight && lightweightOutputs.entries.length === 0 && lightweightOutputs.fallback && (
                        <div style={{ marginBottom: tokens.spacingVerticalXS }}>
                          <DetailSectionTitle>Output</DetailSectionTitle>
                          <div className={styles.spaceY3} style={{ marginTop: tokens.spacingVerticalS }}>
                            <DetailValueField label="Message" value={lightweightOutputs.fallback} showType={false} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {selectedStep.subtitle === "Topic" && (
                  <div className={styles.spaceY4}>
                    {/* Description Section - prefer modelDescription from OBI, fallback to description column */}
                    {(selectedStep.modelDescription || selectedStep.description) && (
                      <DetailTextSection
                        title="Description"
                        content={
                          selectedStep.modelDescription ||
                          selectedStep.description ||
                          ""
                        }
                      />
                    )}

                    {/* Phrases Section (trigger queries) */}
                    {selectedStep.triggerQueries &&
                      selectedStep.triggerQueries.length > 0 && (
                        <div style={{ marginBottom: tokens.spacingVerticalXS }}>
                          <DetailSectionTitle>Phrases</DetailSectionTitle>
                          <div
                            className={styles.spaceY2}
                            style={{ marginTop: tokens.spacingVerticalS }}
                          >
                            {selectedStep.triggerQueries.map((phrase, idx) => (
                              <Text
                                key={idx}
                                className={styles.descriptionText}
                                style={{ display: "block" }}
                              >
                                {phrase}
                              </Text>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Thought Section */}
                    <DetailTextSection
                      title="Thought"
                      content={selectedStep.thought || ""}
                    />
                  </div>
                )}

                {selectedStep.kind === "mcp" ? (
                  <div className={styles.spaceY4}>
                    {/* Description Section - prefer modelDescription from OBI data */}
                    {(() => {
                      const description =
                        selectedStep.modelDescription ||
                        (() => {
                          // Use selected step's schema name, falling back to first mcpServerInfo
                          const mcpSchemaName =
                            selectedStep.mcpServerSchemaName ||
                            turn?.debugInfo?.mcpServerInfo?.schemaName;
                          const componentInfo = mcpSchemaName
                            ? componentNameBySchemaName?.[mcpSchemaName]
                            : undefined;
                          return (
                            componentInfo?.modelDescription ||
                            componentInfo?.description
                          );
                        })();
                      return (
                        <DetailTextSection
                          title="Description"
                          content={description || ""}
                        />
                      );
                    })()}

                    {/* Tools Section as Table */}
                    <div style={{ marginBottom: tokens.spacingVerticalXS }}>
                      <DetailSectionTitle>Tools</DetailSectionTitle>
                      {(() => {
                        // Filter tools to show only those matching this server's schemaName
                        const allTools = Array.isArray(turn?.debugInfo?.mcpTools)
                          ? turn.debugInfo.mcpTools
                          : [];
                        const filteredTools = selectedStep.mcpServerSchemaName
                          ? allTools.filter(
                              (t) => t.schemaName === selectedStep.mcpServerSchemaName
                            )
                          : allTools;
                        return filteredTools.length ? (
                        <div style={{ marginTop: tokens.spacingVerticalS }}>
                          {/* Table Header */}
                          <div className={styles.toolsTableHeader}>
                            <Text
                              className={styles.toolsTableHeaderCell}
                              style={{ width: "140px", flexShrink: 0 }}
                            >
                              Tool name
                            </Text>
                            <Text
                              className={styles.toolsTableHeaderCell}
                              style={{ flex: 1 }}
                            >
                              Description
                            </Text>
                          </div>
                          {/* Table Rows */}
                          <div className={styles.mcpToolsList}>
                            {filteredTools.map((tool) => (
                              <div
                                key={tool.identifier}
                                className={styles.toolsTableRow}
                              >
                                <div
                                  className={mergeClasses(
                                    styles.toolsTableCell,
                                    styles.toolsTableCellName
                                  )}
                                >
                                  {tool.displayName || tool.identifier}
                                </div>
                                <div
                                  className={mergeClasses(
                                    styles.toolsTableCell,
                                    styles.toolsTableCellDesc
                                  )}
                                >
                                  {tool.description || "—"}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <DetailEmptyText>
                          No MCP tools captured for this turn.
                        </DetailEmptyText>
                      );
                      })()}
                    </div>
                  </div>
                ) : selectedStep.kind === "genai" ? (
                  selectedStep.key === "meta:GPTAnswer" ? (
                    (() => {
                      const gptAnswerTrace = getLatestGPTAnswerTrace(
                        Array.isArray(turn?.activities) ? turn.activities : []
                      );

                      const messageText = gptAnswerTrace?.text ?? "";
                      const promptTokens = gptAnswerTrace?.promptTokens ?? 0;
                      const completionTokens =
                        gptAnswerTrace?.completionTokens ?? 0;
                      const totalTokens = promptTokens + completionTokens;

                      return (
                        <div className={styles.spaceY4}>
                          <div>
                            <Text className={styles.sectionTitle}>
                              GPT Answer
                            </Text>
                            {gptAnswerTrace?.gptAnswerState && (
                              <Text
                                style={{
                                  fontSize: tokens.fontSizeBase200,
                                  color: tokens.colorNeutralForeground3,
                                  marginTop: tokens.spacingVerticalXXS,
                                  display: "block",
                                }}
                              >
                                State: {gptAnswerTrace.gptAnswerState}
                              </Text>
                            )}
                          </div>

                          {messageText && (
                            <div>
                              <Text className={styles.sectionTitle}>Response</Text>
                              <div
                                className={styles.dataBox}
                                style={{
                                  maxHeight: "256px",
                                  overflowY: "auto",
                                }}
                              >
                                {messageText}
                              </div>
                            </div>
                          )}

                          {totalTokens > 0 && (
                            <div>
                              <Text className={styles.sectionTitle}>
                                Token Usage
                              </Text>
                              <div className={styles.tokenGrid}>
                                <div className={styles.tokenBox}>
                                  <Text className={styles.tokenLabel}>
                                    Prompt Tokens
                                  </Text>
                                  <Text
                                    className={mergeClasses(
                                      styles.tokenValue,
                                      styles.tokenBlue
                                    )}
                                  >
                                    {promptTokens}
                                  </Text>
                                </div>
                                <div className={styles.tokenBox}>
                                  <Text className={styles.tokenLabel}>
                                    Completion Tokens
                                  </Text>
                                  <Text
                                    className={mergeClasses(
                                      styles.tokenValue,
                                      styles.tokenIndigo
                                    )}
                                  >
                                    {completionTokens}
                                  </Text>
                                </div>
                                <div className={styles.tokenBox}>
                                  <Text className={styles.tokenLabel}>
                                    Total Tokens
                                  </Text>
                                  <Text
                                    className={mergeClasses(
                                      styles.tokenValue,
                                      styles.tokenPurple
                                    )}
                                  >
                                    {totalTokens}
                                  </Text>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <GenAiSupportDetails debugInfo={turn?.debugInfo} />
                  )
                ) : selectedStep.kind === "intent" ? (
                  <IntentRecognitionDetails
                    turn={turn}
                    activityIndex={selectedStep.activityIndex}
                  />
                ) : selectedStep.kind === "error" ? (
                  <ErrorDetails
                    turn={turn}
                    activityIndex={selectedStep.activityIndex}
                    fallbackStep={selectedStep}
                    componentNameBySchemaName={componentNameBySchemaName}
                  />
                ) : selectedStep.kind === "condition" ? (
                  <ConditionBranchDetails step={selectedStep} />
                ) : selectedStep.kind === "vars" ? (
                  <VariableAssignmentDetails
                    turn={turn}
                    activityIndex={selectedStep.activityIndex}
                  />
                ) : selectedStep.kind === "code" ? (
                  <div className={styles.spaceY4}>
                    {selectedStep.thought && (
                      <DetailTextSection
                        title="Thought"
                        content={selectedStep.thought}
                      />
                    )}
                    {selectedStep.codeInputs && Object.keys(selectedStep.codeInputs).length > 0 && (
                      <DetailInputsSection
                        inputs={Object.entries(selectedStep.codeInputs)}
                      />
                    )}
                    {(selectedStep.codeResponse || selectedStep.codePreview) && (
                      <div style={{ marginBottom: tokens.spacingVerticalXS }}>
                        <DetailSectionTitle>Outputs</DetailSectionTitle>
                        <div className={styles.spaceY3} style={{ marginTop: tokens.spacingVerticalS }}>
                          {selectedStep.codeResponse && (
                            <DetailOutputField
                              label="Result"
                              value={selectedStep.codeResponse}
                              maxHeight="520px"
                            />
                          )}
                          {selectedStep.codePreview && (
                            <div style={{ marginTop: tokens.spacingVerticalS }}>
                              <DetailOutputField
                                label="Python"
                                value={selectedStep.codePreview}
                                maxHeight="520px"
                                displayMode="code"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : isReasonerTool(selectedStep.taskDialogId ?? "") ? (
                  <ReasoningDetails turn={turn} step={selectedStep} />
                ) : selectedStep.subtitle === "Topic" ? null : selectedStep.subtitle === "Connected agent" || selectedStep.subtitle === "Child agent" ? null : ( // Topics and Connected/Child agents are handled by their specific sections above
                  (() => {
                    const task = selectedStep.taskDialogId
                      ? String(selectedStep.taskDialogId)
                      : "";
                    const stepId = selectedStep.stepId
                      ? String(selectedStep.stepId)
                      : "";
                    // Use composite key to get the correct execution for this specific step
                    const execKey = stepId ? `${task}:${stepId}` : task;
                    const exec = execKey
                      ? stepExecutionByKey.get(execKey)
                      : undefined;
                    // Fall back to codeInputs on the FlowStep when exec is not
                    // found in stepExecutionByKey (e.g. plan-only fallback path).
                    const args = exec?.arguments ?? selectedStep.codeInputs;
                    const argEntries =
                      args && typeof args === "object"
                        ? Object.entries(args as Record<string, unknown>)
                        : [];
                    const activities: Activity[] = Array.isArray(
                      turn?.activities
                    )
                      ? turn.activities
                      : [];
                    const activityObs = (() => {
                      // Fallback to raw DynamicPlanStepFinished payload when
                      // stepExecutions map does not carry observation for a step.
                      for (let i = activities.length - 1; i >= 0; i -= 1) {
                        const a = activities[i];
                        if (
                          a?.name !== "DynamicPlanStepFinished" &&
                          a?.valueType !== "DynamicPlanStepFinished"
                        ) {
                          continue;
                        }
                        const v = asRecord(a.value);
                        const activityTask = readString(v, "taskDialogId") ?? "";
                        const activityStepId = readString(v, "stepId") ?? "";
                        if (activityTask !== task) continue;
                        if (stepId && activityStepId && activityStepId !== stepId)
                          continue;
                        return v?.observation;
                      }
                      return undefined;
                    })();
                    const obs = exec?.observation ?? activityObs;
                    const responseSupport =
                      getLatestResponseGeneratorSupport(activities);
                    const universalSearchTrace =
                      getLatestUniversalSearchTrace(activities);

                    const isUniversalSearch = task === "P:UniversalSearchTool";
                    const isKnowledgeStep =
                      selectedStep.subtitle === "Knowledge";
                    const showSearchSources =
                      isUniversalSearch || isKnowledgeStep;
                    // Generative (new designer) knowledge steps carry toolKind
                    // "search" and expose the searched sources on the step (from
                    // hiddenFilledParameters). Classic knowledge relies on the
                    // universal-search trace instead, so this is additive only.
                    const isGenerativeKnowledge =
                      isKnowledgeStep && exec?.toolKind === "search";
                    const generativeKnowledge = isGenerativeKnowledge
                      ? { sources: exec?.knowledgeSources?.searched ?? [] }
                      : undefined;

                    const mcpParsed = parseMcpTaskDialogId(task);

                    const mcpToolDef = (() => {
                      const identifier = mcpParsed?.toolIdentifier;
                      if (!identifier) return undefined;
                      const tools = Array.isArray(turn?.debugInfo?.mcpTools)
                        ? turn.debugInfo.mcpTools
                        : [];
                      return tools.find(
                        (t) => String(t?.identifier ?? "") === identifier
                      );
                    })();

                    return (
                      <>
                        {selectedStep.blockedError && (
                          <div className={styles.spaceY4} style={{ marginBottom: tokens.spacingVerticalM }}>
                            <DetailTextSection
                              title="Block Reason"
                              content={selectedStep.blockedError.message || "Content was blocked by Responsible AI restrictions."}
                            />
                            <DetailOutputField
                              label="Details"
                              value={JSON.stringify(
                                Object.fromEntries(
                                  (
                                    [
                                      ["code", selectedStep.blockedError.code],
                                      selectedStep.blockedError.reasonCode
                                        ? ["reasonCode", selectedStep.blockedError.reasonCode]
                                        : null,
                                    ] as Array<[string, string] | null>
                                  ).filter((e): e is [string, string] => e !== null)
                                ),
                                null,
                                2
                              )}
                              displayMode="json-code"
                            />
                          </div>
                        )}
                        <StepDetails
                          topicActivities={turn?.activities}
                          topicId={selectedStep.subtitle === "Topic" ? task : undefined}
                          argsEntries={argEntries}
                          observation={obs}
                          showSearchSources={showSearchSources}
                          generativeKnowledge={generativeKnowledge}
                          responseSupport={responseSupport}
                          universalSearchTrace={universalSearchTrace}
                          citedKnowledgeSources={
                            turn?.debugInfo?.knowledgeSources?.cited
                          }
                          componentNameBySchemaName={componentNameBySchemaName}
                          mcpTool={mcpToolDef}
                          mcpToolIdentifier={mcpParsed?.toolIdentifier}
                          thought={selectedStep.thought}
                          description={getStepDisplayDescription(selectedStep)}
                        />
                        {/* Step-level GenAI: bound by parse-transcript when this
                            step is the producer. Shows token usage, endpoints,
                            and key details. Query / Sources are suppressed for
                            Knowledge steps because StepDetails above already
                            renders the same data. */}
                        {selectedStep.genAiSupportData && (
                          <GenAiSupportDetails
                            debugInfo={{
                              genAiSupportData: selectedStep.genAiSupportData,
                              tokenInfo: selectedStep.tokenInfo,
                            } as ProcessedTurn["debugInfo"]}
                            hideQuery={isKnowledgeStep}
                            hideSources={isKnowledgeStep}
                          />
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            </div>
            );
          })()}
        </div>
      </div>
  );
}

export default DebugPanel;
