/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Activity, ProcessedTurn } from "../contracts/transcript";
import type { FlowStep } from "../contracts/flow-step";
import type { ComponentInfo } from "../services/botcomponents-service";
import {
  guessStepSubtitle,
  isCodeTool,
  isReasonerTool,
  parseMcpTaskDialogId,
  resolveExecutionTimeString,
} from "./step-classification";
import { GENERATIVE_THINKING_TASK_ID } from "./transcript/parse-generative-transcript";
import { normalizeTimestampMs } from "./transcript/timestamp";

type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as UnknownRecord;
}

export function readString(
  rec: UnknownRecord | undefined,
  key: string
): string | undefined {
  const v = rec?.[key];
  return typeof v === "string" ? v : undefined;
}

export function readNumber(
  rec: UnknownRecord | undefined,
  key: string
): number | undefined {
  const v = rec?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function readBoolean(
  rec: UnknownRecord | undefined,
  key: string
): boolean | undefined {
  const v = rec?.[key];
  return typeof v === "boolean" ? v : undefined;
}

type PlanFromActivity = {
  steps: string[];
  stepNames?: string[];
};

function observationHasContent(obs: unknown): boolean {
  if (obs == null) return false;
  if (typeof obs === "string") return obs.trim().length > 0;
  if (Array.isArray(obs)) return obs.length > 0;
  if (typeof obs === "object") {
    const rec = obs as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length === 0) return false;
    if (keys.length === 1 && typeof rec.text === "string") return rec.text.trim().length > 0;
    return true;
  }
  return true;
}

function formatExecutionTimeSeconds(
  executionTime?: string
): string | undefined {
  if (!executionTime) return undefined;

  // Expected format: "hh:mm:ss.fffffff" (e.g. "00:00:02.2827466")
  const s = String(executionTime).trim();
  const parts = s.split(":");
  if (parts.length < 2) return undefined;

  const safeNumber = (v: string): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const secondsPart = parts[parts.length - 1] ?? "0";
  const minutesPart = parts[parts.length - 2] ?? "0";
  const hoursPart = parts.length >= 3 ? parts[parts.length - 3] ?? "0" : "0";

  const totalSeconds =
    safeNumber(hoursPart) * 3600 +
    safeNumber(minutesPart) * 60 +
    safeNumber(secondsPart);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return undefined;

  if (totalSeconds === 0) return "0ms";
  if (totalSeconds < 1) return `${Math.round(totalSeconds * 1000)}ms`;
  if (totalSeconds >= 60) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.round(totalSeconds % 60);
    return `${m}m ${s}s`;
  }
  return `${totalSeconds.toFixed(2)}s`;
}

export function formatTaskName(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("P:")) return s.slice(2);
  // For dotted schema names (e.g. "cr7f9_agentOcfRqq.action.PromptSummarizeWikiResults"),
  // use just the last segment so the display is consistent with the Execution Flow
  // and Performance Timeline, which both use the last segment as the fallback name.
  const segments = s.split(".");
  const last = segments[segments.length - 1];
  if (last && last !== s) return last.replace(/-/g, " — ");
  return s;
}

function extractCodePreviewFromObservation(observation: unknown): string | undefined {
  const obsRec = asRecord(observation);
  const code = readString(obsRec, "code");
  if (!code) return undefined;
  const trimmed = code.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractCodeResponseFromObservation(observation: unknown): string | undefined {
  const obsRec = asRecord(observation);
  const response = readString(obsRec, "response") ?? readString(obsRec, "responseContent");
  if (!response) return undefined;
  const trimmed = response.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getLatestCodeTraceForTool(
  activities: Activity[],
  taskDialogId: string
): { code?: string; response?: string; file?: unknown } | undefined {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const a = activities[i];
    if (a?.name !== "CodeTraceData" && a?.valueType !== "CodeTraceData") continue;
    const v = asRecord(a.value);
    const toolId = readString(v, "toolId") ?? "";
    if (toolId && toolId !== taskDialogId) continue;
    const code = readString(v, "code") ?? undefined;
    const response = readString(v, "responseContent") ?? undefined;
    const file = v?.file;
    return { code, response, file };
  }
  return undefined;
}

export function lookupComponentDisplayName(
  taskDialogId: string,
  componentNameBySchemaName?: Record<string, ComponentInfo>
): string {
  if (!componentNameBySchemaName) return "";
  const raw = String(taskDialogId ?? "");
  if (!raw) return "";

  const direct = componentNameBySchemaName[raw];
  if (!direct) return "";
  // Prefer modelDisplayName from OBI data, fallback to name column
  return (direct.modelDisplayName?.trim() || direct.name)?.trim() || "";
}

export function resolveBestTitle(
  taskDialogId: string,
  nameFromPlan: string | undefined,
  componentNameBySchemaName?: Record<string, ComponentInfo>
): string {
  const raw = String(taskDialogId ?? "");

  if (isCodeTool(raw)) return "Code";
  if (isReasonerTool(raw)) return "Reason with advanced model";
  if (raw.startsWith("P:UniversalSearchTool")) return "Search Sources";

  // MCP tool calls: MCP:<serverSchemaName>:<toolIdentifier>
  const mcp = parseMcpTaskDialogId(raw);
  if (mcp) {
    return mcp.toolIdentifier;
  }

  // If we have a bot-component display name from the component table, use it
  const mapped = lookupComponentDisplayName(raw, componentNameBySchemaName);
  if (mapped) return mapped;

  // Fall back to plan name if available
  const fromPlan = typeof nameFromPlan === "string" ? nameFromPlan.trim() : "";
  if (fromPlan) return fromPlan;

  return formatTaskName(raw) || "Step";
}

export function getStepDisplayDescription(step: FlowStep): string {
  const description = (step.modelDescription || step.description || "").trim();
  if (description) return description;
  if (step.subtitle === "Flow") return step.title.trim();
  return "";
}

export function formatActivityTimestamp(ts?: string | number): string {
  if (ts === undefined || ts === null) return "";
  const timestamp = normalizeTimestampMs(ts);
  if (timestamp === undefined) return "";
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}

export function formatScorePercentage(score?: number): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "";
  return `${(score * 100).toFixed(2)}%`;
}

export function extractCapiResourceUsage(value: unknown): UnknownRecord | undefined {
  const v = asRecord(value);
  if (!v) return undefined;

  const candidates = [
    "summarizationOpenAIResponse",
    "queryRewrittingOpenAIResponse",
    "queryRewritingOpenAIResponse",
    "completionOpenAIResponse",
    "openAIResponse",
  ];

  const hasNonZeroTokens = (u: UnknownRecord): boolean => {
    const prompt = readNumber(u, "PromptTokens") ?? 0;
    const completion = readNumber(u, "CompletionTokens") ?? 0;
    const total = readNumber(u, "TotalTokens") ?? 0;
    return prompt > 0 || completion > 0 || total > 0;
  };

  // First pass: find a CapiResourceUsage with non-zero tokens
  for (const key of candidates) {
    const response = asRecord(v[key]);
    const usage = asRecord(response?.["CapiResourceUsage"]);
    if (usage && hasNonZeroTokens(usage)) return usage;
  }

  // Second pass: fall back to top-level token fields on the response itself
  // (some payloads have PromptTokens/CompletionTokens at the response level
  // while CapiResourceUsage is empty)
  for (const key of candidates) {
    const response = asRecord(v[key]);
    if (!response) continue;
    const prompt = readNumber(response, "PromptTokens") ?? 0;
    const completion = readNumber(response, "CompletionTokens") ?? 0;
    if (prompt > 0 || completion > 0) {
      // Build a synthetic usage record from top-level fields
      const capiUsage = asRecord(response["CapiResourceUsage"]);
      return {
        PromptTokens: prompt,
        CompletionTokens: completion,
        TotalTokens: (readNumber(response, "TotalTokens") ?? prompt + completion),
        ModelName: readString(capiUsage, "ModelName") ?? readString(response, "ModelName") ?? "",
        PartnerSource: readString(capiUsage, "PartnerSource") ?? readString(response, "PartnerSource") ?? "",
        ReasoningTokens: readNumber(capiUsage, "ReasoningTokens") ?? readNumber(response, "ReasoningTokens") ?? 0,
        InputTokens: readNumber(capiUsage, "InputTokens") ?? readNumber(response, "InputTokens") ?? 0,
        OutputTokens: readNumber(capiUsage, "OutputTokens") ?? readNumber(response, "OutputTokens") ?? 0,
        CachedTokens: readNumber(capiUsage, "CachedTokens") ?? readNumber(response, "CachedTokens") ?? 0,
      };
    }
  }

  // Last resort: return any CapiResourceUsage that exists (even with zeros)
  for (const key of candidates) {
    const response = asRecord(v[key]);
    const usage = asRecord(response?.["CapiResourceUsage"]);
    if (usage) return usage;
  }

  return undefined;
}

export function buildFlowSteps(
  turn: ProcessedTurn | null,
  componentNameBySchemaName?: Record<string, ComponentInfo>,
  _mcpTools?: unknown[], // Kept for API compatibility, using mcpServerFallbackName instead
  mcpServerFallbackName?: string,
): FlowStep[] {
  if (!turn?.debugInfo) return [];

  const activities: Activity[] = Array.isArray(turn.activities)
    ? turn.activities
    : [];

  // Build a best-effort execution order from activities.
  // We prefer the first time a task shows up in step events (triggered/bind/finished),
  // which reflects actual runtime order better than plan/stepExecutions ordering.
  const executionOrderIndexByTask = new Map<string, number>();
  for (let i = 0; i < activities.length; i += 1) {
    const a = activities[i];
    const name = typeof a?.name === "string" ? a.name : "";
    const valueType = typeof a?.valueType === "string" ? a.valueType : "";
    const isStepEvent =
      name === "DynamicPlanStepTriggered" ||
      name === "DynamicPlanStepBindUpdate" ||
      name === "DynamicPlanStepFinished" ||
      valueType === "DynamicPlanStepTriggered" ||
      valueType === "DynamicPlanStepBindUpdate" ||
      valueType === "DynamicPlanStepFinished";
    if (!isStepEvent) continue;

    const v = asRecord(a.value);
    const taskDialogId = readString(v, "taskDialogId") ?? "";
    if (!taskDialogId) continue;
    if (!executionOrderIndexByTask.has(taskDialogId))
      executionOrderIndexByTask.set(taskDialogId, i);
  }

  const genAiActivityIndex = (() => {
    for (let i = 0; i < activities.length; i += 1) {
      const a = activities[i];
      if (
        a?.name === "GenerativeAnswersSupportData" ||
        a?.valueType === "GenerativeAnswersSupportData"
      )
        return i;
    }
    return undefined;
  })();

  const variableAssignments = (() => {
    const items: Array<{
      activityIndex: number;
      name: string;
      scope: string;
      newValue: unknown;
      timestamp: string;
    }> = [];
    for (let i = 0; i < activities.length; i += 1) {
      const a = activities[i];
      if (a?.valueType !== "VariableAssignment") continue;
      const v = asRecord(a.value);
      items.push({
        activityIndex: i,
        name: readString(v, "name") ?? "",
        scope: readString(v, "type") ?? "",
        newValue: v?.["newValue"],
        timestamp: formatActivityTimestamp(a.timestamp),
      });
    }
    return items;
  })();

  const intentRecognitions = (() => {
    const items: Array<{
      activityIndex: number;
      title: string;
      score?: number;
    }> = [];
    for (let i = 0; i < activities.length; i += 1) {
      const a = activities[i];
      const isIntentRecognition =
        a?.valueType === "IntentRecognition" ||
        a?.name === "IntentRecognition";
      if (!isIntentRecognition) continue;

      const v = asRecord(a.value);
      const scoreRec = asRecord(v?.intentScore);
      items.push({
        activityIndex: i,
        title:
          readString(v, "intentTitle") ||
          readString(v, "intentId") ||
          "IntentRecognition",
        score: readNumber(scoreRec, "score"),
      });
    }
    return items;
  })();

  const errorEvents = (() => {
    const items: Array<{
      activityIndex: number;
      title: string;
      errorCode?: string;
      errorSubCode?: string;
      errorMessage?: string;
      taskDialogId?: string;
      stepId?: string;
    }> = [];

    for (let i = 0; i < activities.length; i += 1) {
      const a = activities[i];
      const v = asRecord(a?.value);

      const isErrorTrace =
        a?.type === "trace" &&
        (a?.valueType === "ErrorTraceData" || a?.name === "ErrorTraceData");
      if (isErrorTrace) {
        const relatedBlocked = (() => {
          for (let j = i - 1; j >= 0; j -= 1) {
            const prev = activities[j];
            if (prev?.name !== "DynamicPlanStepBlocked") continue;
            if (
              a?.replyToId &&
              prev?.replyToId &&
              String(prev.replyToId) !== String(a.replyToId)
            )
              continue;
            return prev;
          }
          return undefined;
        })();

        const blockedValue = asRecord(relatedBlocked?.value);
        const errorCode = readString(v, "errorCode") || undefined;
        const rawSubCode = readString(v, "errorSubCode") || undefined;
        const errorSubCode = rawSubCode && rawSubCode.toLowerCase() !== "undefined" ? rawSubCode : undefined;
        const errorMessage = readString(v, "errorMessage") || undefined;
        items.push({
          activityIndex: i,
          title: errorCode || "ErrorTraceData",
          errorCode,
          errorSubCode,
          errorMessage,
          taskDialogId: readString(blockedValue, "taskDialogId") || undefined,
          stepId: readString(blockedValue, "stepId") || undefined,
        });
      }
    }

    return items;
  })();

  // NodeTraceData records are the only evidence for several classic/system
  // topic executions. Group their low-level nodes into one logical topic row
  // so the flow remains readable while every trace stays available in details.
  const nodeTraceTopics = (() => {
    const groups = new Map<
      string,
      {
        title: string;
        activityIndices: number[];
        firstActivityIndex: number;
        traceActivities: NonNullable<FlowStep["traceActivities"]>;
      }
    >();
    for (let i = 0; i < activities.length; i += 1) {
      const activity = activities[i];
      if (activity?.valueType !== "NodeTraceData" && activity?.name !== "NodeTraceData") continue;
      const value = asRecord(activity.value);
      const title = readString(value, "topicDisplayName")?.trim();
      if (!title) continue;
      const identity = title.toLocaleLowerCase();
      const group = groups.get(identity);
      const traceActivity = {
        activityIndex: i,
        nodeType: readString(value, "nodeType"),
        nodeId: readString(value, "nodeId"),
        topic: title,
        outcome: readString(value, "nodeExit"),
        reason: readString(value, "nodeExitReason"),
        startTime: readString(value, "startTime"),
        endTime: readString(value, "endTime"),
      };
      if (group) {
        group.activityIndices.push(i);
        group.traceActivities.push(traceActivity);
      } else {
        groups.set(identity, {
          title,
          activityIndices: [i],
          firstActivityIndex: i,
          traceActivities: [traceActivity],
        });
      }
    }
    return Array.from(groups.values());
  })();

  // Plan
  const planSteps = turn.debugInfo.plan?.steps ?? [];
  const planStepNames = turn.debugInfo.plan?.stepNames ?? [];

  const planFromActivities: PlanFromActivity | undefined = (() => {
    // Extract steps from DynamicPlanStepTriggered events to get actual execution order
    const steps: string[] = [];
    for (let i = 0; i < activities.length; i += 1) {
      const a = activities[i];
      if (
        a?.name === "DynamicPlanStepTriggered" ||
        a?.valueType === "DynamicPlanStepTriggered"
      ) {
        const v = asRecord(a.value);
        const taskId = readString(v, "taskDialogId") ?? "";
        if (taskId && !steps.includes(taskId)) {
          steps.push(taskId);
        }
      }
    }
    return steps.length ? { steps } : undefined;
  })();

  const effectivePlanSteps = planSteps.length
    ? planSteps
    : planFromActivities?.steps ?? [];
  const effectivePlanNames = planStepNames.length
    ? planStepNames
    : planFromActivities?.stepNames ?? [];

  // Names should follow the task id, not the display index (because we may reorder tasks).
  const nameByTaskDialogId = new Map<string, string>();
  for (let i = 0; i < effectivePlanSteps.length; i += 1) {
    const task = String(effectivePlanSteps[i] ?? "");
    const name =
      typeof effectivePlanNames[i] === "string"
        ? String(effectivePlanNames[i])
        : "";
    if (task && name) nameByTaskDialogId.set(task, name);
  }

  // Finished durations from activities (more reliable than stepExecutions map)
  const durationByTask = new Map<string, string>();
  for (const a of activities) {
    if (
      a?.name === "DynamicPlanStepFinished" ||
      a?.valueType === "DynamicPlanStepFinished"
    ) {
      const v = asRecord(a.value);
      const task = readString(v, "taskDialogId") ?? "";
      const execTime = readString(v, "executionTime");
      const dur =
        typeof execTime === "string"
          ? formatExecutionTimeSeconds(execTime)
          : undefined;
      if (task && dur) durationByTask.set(task, dur);
    }
  }

  const executions = turn.debugInfo.stepExecutions ?? [];
  const normalizeIdentity = (value: unknown): string =>
    typeof value === "string"
      ? value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "")
      : "";
  const representedTopicIdentities = executions.flatMap((exec) => {
    const component = componentNameBySchemaName?.[String(exec.taskDialogId ?? "")];
    return [
      exec.displayName,
      exec.taskDialogId,
      component?.modelDisplayName,
      component?.name,
    ]
      .map(normalizeIdentity)
      .filter(Boolean);
  });
  const missingNodeTraceTopics = nodeTraceTopics.filter((topic) => {
    const identity = normalizeIdentity(topic.title);
    if (!identity) return false;
    return !representedTopicIdentities.some(
      (candidate) => candidate === identity || candidate.endsWith(identity),
    );
  });

  const tasksFromPlan = effectivePlanSteps.map((x) => String(x));
  const tasksFromDurations = Array.from(durationByTask.keys());
  const tasksFromExecutions = executions
    .map((e) => String(e.taskDialogId ?? ""))
    .filter(Boolean);

  const orderedTasks = (
    tasksFromPlan.length ? tasksFromPlan : tasksFromExecutions
  ).slice();
  // Do not create brand-new steps from a lone DynamicPlanStepFinished event.
  // Connected-agent flows can emit late "Finished" on a later user turn
  // (e.g. final answer turn) after the step was already attached to the
  // triggering turn. If we push duration-only tasks here, the UI can render a
  // duplicate card with no corresponding execution on this turn.
  //
  // Keep duration data as enrichment for already-known tasks only.
  for (const t of tasksFromDurations) {
    if (orderedTasks.includes(t)) continue;
    const hasTriggerOrBindInTurn = activities.some((a) => {
      const n = String(a?.name ?? a?.valueType ?? "");
      if (
        n !== "DynamicPlanStepTriggered" &&
        n !== "DynamicPlanStepBindUpdate"
      ) {
        return false;
      }
      const v = asRecord(a.value);
      return (readString(v, "taskDialogId") ?? "") === t;
    });
    if (hasTriggerOrBindInTurn) orderedTasks.push(t);
  }

  // Enforce execution order if we have it.
  // Keep stable ordering for tasks without an observed execution index.
  const baseIndex = new Map<string, number>();
  for (let i = 0; i < orderedTasks.length; i += 1)
    baseIndex.set(orderedTasks[i], i);
  orderedTasks.sort((a, b) => {
    const oa = executionOrderIndexByTask.get(a);
    const ob = executionOrderIndexByTask.get(b);
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    return (baseIndex.get(a) ?? 0) - (baseIndex.get(b) ?? 0);
  });

  const steps: FlowStep[] = [];

  // MCP server nodes - ONLY show if DynamicServerInitialize is in THIS turn's activities
  // (not just because we have transcript-level mcpServerInfo)
  const hasMcpInitInThisTurn = activities.some(
    (a) => a.name === "DynamicServerInitialize"
  );

  // Support multiple MCP servers: prefer mcpServers array, fall back to single mcpServerInfo
  const mcpServersList = turn.debugInfo.mcpServers?.length
    ? turn.debugInfo.mcpServers
    : turn.debugInfo.mcpServerInfo
      ? [turn.debugInfo.mcpServerInfo]
      : [];

  if (mcpServersList.length > 0 && hasMcpInitInThisTurn) {
    for (const server of mcpServersList) {
      const mcpSchemaName = server.schemaName;
      // Try to look up the friendly display name from bot components
      const componentInfo: ComponentInfo | undefined = mcpSchemaName
        ? componentNameBySchemaName?.[mcpSchemaName]
        : undefined;

      // Find llmIdentifierPrefix from mcpTools that match this server's schemaName
      const matchingTool = (_mcpTools as any[])?.find(
        (t: any) => t?.schemaName === mcpSchemaName
      );
      const llmPrefix = matchingTool?.llmIdentifierPrefix;

      // Prefer llmIdentifierPrefix, then modelDisplayName, then name column, then server name
      const mcpTitle =
        llmPrefix ||
        componentInfo?.modelDisplayName?.trim() ||
        componentInfo?.name?.trim() ||
        server.name ||
        "DynamicServerInitialize";
      const mcpModelDescription = componentInfo?.modelDescription;

      steps.push({
        key: `mcp:server:${mcpSchemaName || server.name}`,
        kind: "mcp",
        title: mcpTitle,
        subtitle: "Model Context Protocol",
        statusText: "Initialized",
        modelDescription: mcpModelDescription,
        mcpServerSchemaName: mcpSchemaName,
      });
    }
  }

  const hasGenAiSupport = Boolean(
    turn.debugInfo.genAiSupportData || turn.debugInfo.tokenInfo
  );

  if (!orderedTasks.length) {
    // If no tasks from plan but we have step executions, show them
    if (executions.length > 0) {
      for (const exec of executions) {
        if (exec.taskDialogId) {
          orderedTasks.push(String(exec.taskDialogId));
        }
      }
    } else {
      // No tasks and no executions, show variables and GenAI data
      for (const ir of intentRecognitions) {
        steps.push({
          key: `intent:${ir.activityIndex}`,
          kind: "intent",
          title: ir.title,
          subtitle: "Intent Recognition",
          statusText: "",
          activityIndex: ir.activityIndex,
        });
      }

      for (const va of variableAssignments) {
        steps.push({
          key: `var:${va.activityIndex}`,
          kind: "vars",
          title: va.name || "VariableAssignment",
          subtitle: va.scope ? `Scope: ${va.scope}` : "Variable assignment",
          statusText: "Captured",
          activityIndex: va.activityIndex,
        });
      }
      for (const err of errorEvents) {
        steps.push({
          key: `error:${err.activityIndex}`,
          kind: "error",
          title: err.title,
          subtitle: "Error",
          statusText: err.errorCode || "Captured",
          activityIndex: err.activityIndex,
          taskDialogId: err.taskDialogId,
          stepId: err.stepId,
          errorCode: err.errorCode,
          errorSubCode: err.errorSubCode,
          errorMessage: err.errorMessage,
        });
      }
      for (const topic of missingNodeTraceTopics) {
        steps.push({
          key: `trace:${topic.firstActivityIndex}:${normalizeIdentity(topic.title)}`,
          kind: "trace",
          title: topic.title,
          subtitle: "Topic",
          statusText: `${topic.activityIndices.length} activit${topic.activityIndices.length === 1 ? "y" : "ies"}`,
          activityIndex: topic.firstActivityIndex,
          activityIndices: topic.activityIndices,
          traceActivities: topic.traceActivities,
        });
      }
      if (hasGenAiSupport) {
        const usage = extractCapiResourceUsage(turn.debugInfo.genAiSupportData);
        const totalTokens =
          readNumber(usage, "TotalTokens") !== undefined
            ? (readNumber(usage, "TotalTokens") as number)
            : typeof turn.debugInfo.tokenInfo?.totalTokens === "number"
            ? turn.debugInfo.tokenInfo.totalTokens
            : undefined;

        steps.push({
          key: "meta:GenerativeAnswersSupportData",
          kind: "genai",
          title: "GenerativeAnswers",
          subtitle: "",
          statusText:
            totalTokens !== undefined
              ? ""
              : "",
        });
      }

      return steps;
    }
  }

  // Build task flow steps and insert GenerativeAnswersSupportData in activity order.
  // Use stepId to uniquely identify each execution (same taskDialogId can be invoked multiple times)
  const taskSteps: Array<{
    step: FlowStep;
    activityIndex?: number;
    baseIndex: number;
  }> = [];

  const addedStepIds = new Set<string>();

  // First, add steps from executions (which have unique stepIds)
  for (let idx = 0; idx < executions.length; idx += 1) {
    const exec = executions[idx];
    const taskDialogId = String(exec.taskDialogId ?? "");
    const stepId = String(exec.stepId ?? "");
    if (!taskDialogId) continue;

    // Use composite key to handle multiple invocations of same action
    const uniqueKey = stepId ? `${taskDialogId}:${stepId}` : taskDialogId;
    if (addedStepIds.has(uniqueKey)) continue;
    addedStepIds.add(uniqueKey);

    // Generative reasoning (ThinkingTrace) — render as its own standalone box
    // (before the tool it precedes) with markdown-formatted content.
    if (taskDialogId === GENERATIVE_THINKING_TASK_ID) {
      taskSteps.push({
        activityIndex: executionOrderIndexByTask.get(taskDialogId) ?? idx,
        baseIndex: idx,
        step: {
          key: `thinking:${uniqueKey}`,
          kind: "thinking",
          taskDialogId,
          stepId,
          title: exec.displayName?.trim() || "Reasoning",
          subtitle: exec.subtitle?.trim() || "Chain of thought",
          thought: typeof exec.thought === "string" ? exec.thought : undefined,
        },
      });
      continue;
    }

    const nameFromPlan = nameByTaskDialogId.get(taskDialogId);
    // Resolve duration: resolveExecutionTimeString prefers the reported string
    // when non-zero, then falls back to finishedAt-triggeredAt timestamps so
    // nested-plan steps that get "00:00:00" from the orchestrator still show
    // a real duration instead of "0ms".
    const duration = (() => {
      const resolved = resolveExecutionTimeString(exec);
      if (resolved) return formatExecutionTimeSeconds(resolved);
      return durationByTask.get(taskDialogId);
    })();

    const thought =
      typeof exec?.thought === "string" ? exec.thought : undefined;

    // Try exec.observation first, then fall back to raw DynamicPlanStepFinished activity
    let codePreview = extractCodePreviewFromObservation(exec?.observation);
    let codeResponse = extractCodeResponseFromObservation(exec?.observation);
    if (!codePreview && isCodeTool(taskDialogId)) {
      const finishedActivity = activities.find(
        (a) =>
          a?.name === "DynamicPlanStepFinished" &&
          asRecord(a.value)?.["taskDialogId"] === taskDialogId
      );
      if (finishedActivity) {
        const fallbackObs = asRecord(finishedActivity.value)?.["observation"];
        codePreview = extractCodePreviewFromObservation(fallbackObs);
        if (!codeResponse) codeResponse = extractCodeResponseFromObservation(fallbackObs);
      }
      if (!codePreview || !codeResponse) {
        const trace = getLatestCodeTraceForTool(activities, taskDialogId);
        if (!codePreview && trace?.code) codePreview = trace.code;
        if (!codeResponse && trace?.response) codeResponse = trace.response;
      }
    }
    const hideOriginalStep = Boolean(codePreview) && isCodeTool(taskDialogId);

    const mcp = parseMcpTaskDialogId(taskDialogId);
    const componentInfo = componentNameBySchemaName?.[taskDialogId];
    const description =
      typeof componentInfo?.description === "string"
        ? componentInfo.description
        : undefined;
    // Extract modelDescription and triggerQueries from parsed OBI data
    const modelDescription =
      typeof componentInfo?.modelDescription === "string"
        ? componentInfo.modelDescription
        : undefined;
    const triggerQueries = Array.isArray(componentInfo?.triggerQueries)
      ? componentInfo.triggerQueries
      : undefined;

    // Get llmIdentifierPrefix from mcpTools for MCP tool steps
    // This is the user-friendly name like "Dataverse MCP Server (Deprecated)"
    const mcpServerDisplayName = mcp?.toolIdentifier
      ? (() => {
          const toolDef = (_mcpTools ?? []).find(
            (t: any) => t?.identifier === mcp.toolIdentifier
          );
          // Use llmIdentifierPrefix from tools list (primary), fallback to mcpServerInfo.name
          const llmPrefix = (toolDef as any)?.llmIdentifierPrefix;
          return llmPrefix || mcpServerFallbackName || "";
        })()
      : undefined;

    if (!hideOriginalStep) {
      const stepArgs = exec?.arguments && typeof exec.arguments === "object"
        ? exec.arguments as Record<string, unknown>
        : undefined;
      const hasDetail = Boolean(
        description || modelDescription || thought ||
        (stepArgs && Object.keys(stepArgs).length > 0) ||
        observationHasContent(exec?.observation) ||
        (triggerQueries && triggerQueries.length) ||
        mcp?.toolIdentifier ||
        codePreview || codeResponse ||
        (exec as { blockedError?: unknown })?.blockedError ||
        (exec as { genAiSupportData?: unknown })?.genAiSupportData
      );
      taskSteps.push({
        activityIndex: executionOrderIndexByTask.get(taskDialogId) ?? idx,
        baseIndex: idx,
        step: {
          key: `step:${uniqueKey}`,
          kind: "step",
          taskDialogId,
          stepId,
          title:
            exec?.displayName?.trim() ||
            resolveBestTitle(
              taskDialogId,
              nameFromPlan,
              componentNameBySchemaName
            ),
          subtitle:
            exec?.subtitle?.trim() ||
            guessStepSubtitle(taskDialogId, exec?.type, componentInfo, exec?.observation),
          duration,
          mcpServerSchemaName: mcp?.serverSchemaName,
          mcpToolIdentifier: mcp?.toolIdentifier,
          mcpServerDisplayName,
          thought,
          description,
          modelDescription,
          triggerQueries,
          finishedState: typeof exec?.state === "string" ? exec.state : undefined,
          blockedError: (exec as { blockedError?: FlowStep["blockedError"] })?.blockedError,
          // Inputs bound to this step (from DynamicPlanStepBindUpdate).
          // Reuses codeInputs so the existing DetailInputsSection renders them.
          codeInputs: exec?.arguments && typeof exec.arguments === "object"
            ? exec.arguments as Record<string, unknown>
            : undefined,
          // Step-level GenAI/parent-step propagation so the producing step's
          // detail panel can render its own token-usage / sources, and so the
          // UI can identify nested-plan children of a parent agent step.
          genAiSupportData: (exec as { genAiSupportData?: unknown })?.genAiSupportData,
          tokenInfo: (exec as { tokenInfo?: FlowStep["tokenInfo"] })?.tokenInfo,
          parentStepKey: (exec as { parentStepKey?: string })?.parentStepKey,
          hasDetail,
        },
      });
    }

    if (codePreview) {
      taskSteps.push({
        activityIndex: executionOrderIndexByTask.get(taskDialogId) ?? idx,
        baseIndex: idx + 0.1,
        step: {
          key: `code:${uniqueKey}`,
          kind: "code",
          taskDialogId,
          stepId,
          title: resolveBestTitle(
            taskDialogId,
            nameFromPlan,
            componentNameBySchemaName
          ),
          subtitle: guessStepSubtitle(taskDialogId, exec?.type, componentInfo, exec?.observation),
          duration,
          thought,
          codePreview,
          codeResponse,
          codeInputs: exec?.arguments && typeof exec.arguments === "object"
            ? exec.arguments as Record<string, unknown>
            : undefined,
          finishedState: typeof exec?.state === "string" ? exec.state : undefined,
        },
      });
    }
  }

  // Fallback: Add any orderedTasks that weren't covered by executions
  for (let idx = 0; idx < orderedTasks.length; idx += 1) {
    const taskDialogId = orderedTasks[idx];
    // Check if we already have a step for this taskDialogId
    const alreadyAdded = taskSteps.some(
      (ts) => ts.step.taskDialogId === taskDialogId
    );
    if (alreadyAdded) continue;

    const nameFromPlan = nameByTaskDialogId.get(taskDialogId);
    const duration = durationByTask.get(taskDialogId);

    const mcp = parseMcpTaskDialogId(taskDialogId);
    const componentInfo = componentNameBySchemaName?.[taskDialogId];
    const description =
      typeof componentInfo?.description === "string"
        ? componentInfo.description
        : undefined;
    const modelDescription =
      typeof componentInfo?.modelDescription === "string"
        ? componentInfo.modelDescription
        : undefined;
    const triggerQueries = Array.isArray(componentInfo?.triggerQueries)
      ? componentInfo.triggerQueries
      : undefined;

    // Get llmIdentifierPrefix from mcpTools for MCP tool steps
    const mcpServerDisplayName = mcp?.toolIdentifier
      ? (() => {
          const toolDef = (_mcpTools ?? []).find(
            (t: any) => t?.identifier === mcp.toolIdentifier
          );
          // Use llmIdentifierPrefix from tools list (primary), fallback to mcpServerInfo.name
          const llmPrefix = (toolDef as any)?.llmIdentifierPrefix;
          return llmPrefix || mcpServerFallbackName || "";
        })()
      : undefined;

    // Look up the DynamicPlanStepFinished activity for this task (used for code preview + observation)
    const finishedActivity = activities.find(
      (a) =>
        (a?.name === "DynamicPlanStepFinished" || a?.valueType === "DynamicPlanStepFinished") &&
        asRecord(a.value)?.["taskDialogId"] === taskDialogId
    );
    const fallbackObs = finishedActivity ? asRecord(finishedActivity.value)?.["observation"] : undefined;

    // Look up thought and arguments from raw activities (used when stepExecutions is missing)
    const triggeredActivity = activities.find(
      (a) =>
        (a?.name === "DynamicPlanStepTriggered" || a?.valueType === "DynamicPlanStepTriggered") &&
        asRecord(a.value)?.["taskDialogId"] === taskDialogId
    );
    const fallbackThoughtForStep = triggeredActivity
      ? readString(asRecord(triggeredActivity.value), "thought")
      : undefined;
    const bindUpdateActivity = activities.find(
      (a) =>
        (a?.name === "DynamicPlanStepBindUpdate" || a?.valueType === "DynamicPlanStepBindUpdate") &&
        asRecord(a.value)?.["taskDialogId"] === taskDialogId
    );
    const fallbackArgsRec = bindUpdateActivity
      ? asRecord(asRecord(bindUpdateActivity.value)?.["arguments"] as unknown)
      : undefined;

    // Code step detection for fallback path (same as executions loop)
    let fallbackCodePreview: string | undefined;
    let fallbackCodeResponse: string | undefined;
    if (isCodeTool(taskDialogId) && finishedActivity) {
      fallbackCodePreview = extractCodePreviewFromObservation(fallbackObs);
      fallbackCodeResponse = extractCodeResponseFromObservation(fallbackObs);
    }
    if ((!fallbackCodePreview || !fallbackCodeResponse) && isCodeTool(taskDialogId)) {
      const trace = getLatestCodeTraceForTool(activities, taskDialogId);
      if (!fallbackCodePreview && trace?.code) fallbackCodePreview = trace.code;
      if (!fallbackCodeResponse && trace?.response)
        fallbackCodeResponse = trace.response;
    }
    const fallbackHideOriginal = Boolean(fallbackCodePreview) && isCodeTool(taskDialogId);

    if (!fallbackHideOriginal) {
      taskSteps.push({
        activityIndex: executionOrderIndexByTask.get(taskDialogId),
        baseIndex: executions.length + idx,
        step: {
          key: `step:${taskDialogId}:${idx}`,
          kind: "step",
          taskDialogId,
          title: resolveBestTitle(
            taskDialogId,
            nameFromPlan,
            componentNameBySchemaName
          ),
          subtitle: guessStepSubtitle(taskDialogId, undefined, componentInfo, fallbackObs),
          duration,
          thought: fallbackThoughtForStep,
          codeInputs: fallbackArgsRec ?? undefined,
          mcpServerSchemaName: mcp?.serverSchemaName,
          mcpToolIdentifier: mcp?.toolIdentifier,
          mcpServerDisplayName,
          description,
          modelDescription,
          triggerQueries,
        },
      });
    }

    if (fallbackCodePreview) {
      // Find thought from the triggered event
      const triggeredActivity = activities.find(
        (a) =>
          (a?.name === "DynamicPlanStepTriggered" || a?.valueType === "DynamicPlanStepTriggered") &&
          asRecord(a.value)?.["taskDialogId"] === taskDialogId
      );
      const fallbackThought = triggeredActivity
        ? readString(asRecord(triggeredActivity.value), "thought")
        : undefined;

      taskSteps.push({
        activityIndex: executionOrderIndexByTask.get(taskDialogId) ?? (executions.length + idx),
        baseIndex: executions.length + idx + 0.1,
        step: {
          key: `code:${taskDialogId}:${idx}`,
          kind: "code",
          taskDialogId,
          title: resolveBestTitle(taskDialogId, nameFromPlan, componentNameBySchemaName),
          subtitle: guessStepSubtitle(taskDialogId, undefined, componentInfo, fallbackObs),
          duration,
          thought: fallbackThought ?? undefined,
          codePreview: fallbackCodePreview,
          codeResponse: fallbackCodeResponse,
        },
      });
    }
  }

  const merged: Array<{
    step: FlowStep;
    activityIndex?: number;
    baseIndex: number;
  }> = [...taskSteps];

  for (const ir of intentRecognitions) {
    const scorePct = formatScorePercentage(ir.score);
    const scoreLabel = scorePct ? `score: ${scorePct}` : "";
    merged.push({
      activityIndex: ir.activityIndex,
      baseIndex: -3,
      step: {
        key: `intent:${ir.activityIndex}`,
        kind: "intent",
        title: ir.title,
        subtitle: "Intent Recognition",
        statusText: scoreLabel || "Captured",
        activityIndex: ir.activityIndex,
      },
    });
  }

  for (const va of variableAssignments) {
    merged.push({
      activityIndex: va.activityIndex,
      baseIndex: -2,
      step: {
        key: `var:${va.activityIndex}`,
        kind: "vars",
        title: va.name || "VariableAssignment",
        subtitle: va.scope ? `Scope: ${va.scope}` : "Variable assignment",
        statusText: "Captured",
        activityIndex: va.activityIndex,
      },
    });
  }

  for (const err of errorEvents) {
    merged.push({
      activityIndex: err.activityIndex,
      baseIndex: -4,
      step: {
        key: `error:${err.activityIndex}`,
        kind: "error",
        title: err.title,
        subtitle: "Error",
        statusText: err.errorCode || "Captured",
        activityIndex: err.activityIndex,
        taskDialogId: err.taskDialogId,
        stepId: err.stepId,
        errorCode: err.errorCode,
        errorSubCode: err.errorSubCode,
        errorMessage: err.errorMessage,
      },
    });
  }

  for (const topic of missingNodeTraceTopics) {
    merged.push({
      activityIndex: topic.firstActivityIndex,
      baseIndex: -5,
      step: {
        key: `trace:${topic.firstActivityIndex}:${normalizeIdentity(topic.title)}`,
        kind: "trace",
        title: topic.title,
        subtitle: "Topic",
        statusText: `${topic.activityIndices.length} activit${topic.activityIndices.length === 1 ? "y" : "ies"}`,
        activityIndex: topic.firstActivityIndex,
        activityIndices: topic.activityIndices,
        traceActivities: topic.traceActivities,
      },
    });
  }

  if (hasGenAiSupport) {
    const usage = extractCapiResourceUsage(turn.debugInfo.genAiSupportData);
    const totalTokens =
      readNumber(usage, "TotalTokens") !== undefined
        ? (readNumber(usage, "TotalTokens") as number)
        : typeof turn.debugInfo.tokenInfo?.totalTokens === "number"
        ? turn.debugInfo.tokenInfo.totalTokens
        : undefined;

    merged.push({
      activityIndex: genAiActivityIndex,
      baseIndex: -1,
      step: {
        key: "meta:GenerativeAnswersSupportData",
        kind: "genai",
        title: "GenerativeAnswers",
        subtitle: "",
        statusText:
          totalTokens !== undefined
            ? `TotalTokens: ${totalTokens}`
            : "Captured",
      },
    });
  }

  merged.sort((a, b) => {
    const ai = a.activityIndex;
    const bi = b.activityIndex;
    const aHas = ai !== undefined;
    const bHas = bi !== undefined;
    if (aHas && bHas) return (ai as number) - (bi as number);
    if (aHas) return -1;
    if (bHas) return 1;
    return a.baseIndex - b.baseIndex;
  });

  for (const item of merged) steps.push(item.step);

  return steps;
}
