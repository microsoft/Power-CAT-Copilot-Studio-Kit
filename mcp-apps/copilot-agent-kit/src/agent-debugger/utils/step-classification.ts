/**
 * Shared step-classification helpers used to label step executions consistently
 * across the parent debug panel and the connected-agent (child) topic display.
 *
 * Keeps the parent and child sides on the same logic so a step that is
 * classified as "Topic" / "Knowledge" / "Tool" / "Connector Action" / "Code" /
 * "Custom Prompt" / "Flow" / "Connected agent" / "Child agent" /
 * "Deep reasoning" in the parent is classified the same in a child transcript.
 */

import type { ComponentInfo } from "../services/botcomponents-service.js";
import { formatDuration } from "./format-duration.js";

/**
 * Returns the best executionTime string ("hh:mm:ss.fffffff") for a step exec.
 *
 * The DynamicPlanStepFinished payload often reports `"00:00:00"` for
 * sub-steps inside a child agent's plan even when the step actually took
 * several seconds (the orchestrator zeroes the field for nested plans).
 * When that happens we fall back to `finishedAt - triggeredAt` derived from
 * the activity timestamps so the UI can still surface a duration.
 */
export function resolveExecutionTimeString(exec: {
  executionTime?: string;
  triggeredAt?: string;
  finishedAt?: string;
}): string | undefined {
  const reported = typeof exec.executionTime === "string" ? exec.executionTime : "";
  const reportedSeconds = parseExecTimeStringToSeconds(reported);
  if (reportedSeconds && reportedSeconds > 0) return reported;

  if (exec.triggeredAt && exec.finishedAt) {
    const diffMs = Date.parse(exec.finishedAt) - Date.parse(exec.triggeredAt);
    if (Number.isFinite(diffMs) && diffMs > 0) {
      return formatMsAsExecutionTime(diffMs);
    }
  }
  return reported || undefined;
}

function parseExecTimeStringToSeconds(executionTime: string): number | undefined {
  if (!executionTime) return undefined;
  const parts = executionTime.split(":");
  if (parts.length !== 3) return undefined;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseFloat(parts[2]) || 0;
  return h * 3600 + m * 60 + s;
}

export function formatMsAsExecutionTime(totalMs: number): string {
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = Math.floor(totalMs % 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Pad fractional seconds to 7 digits to match the .NET TimeSpan format the
  // orchestrator emits (e.g. "00:00:02.2827466"). Downstream parsers only look
  // at seconds + fractional, so the extra zero-padding is harmless.
  const frac = String(millis).padStart(3, "0").padEnd(7, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${frac}`;
}

/** Parses an MCP task dialog id of the form `MCP:<serverSchemaName>:<toolIdentifier>`. */
export function parseMcpTaskDialogId(
  taskDialogId: string
): { serverSchemaName: string; toolIdentifier: string } | undefined {
  const raw = String(taskDialogId ?? "").trim();
  if (!raw.startsWith("MCP:")) return undefined;
  const parts = raw.split(":");
  if (parts.length < 3) return undefined;
  const toolIdentifier = parts[parts.length - 1] ?? "";
  const serverSchemaName = parts.slice(1, parts.length - 1).join(":");
  if (!serverSchemaName || !toolIdentifier) return undefined;
  return { serverSchemaName, toolIdentifier };
}

export function isCodeTool(taskDialogId: string): boolean {
  return String(taskDialogId ?? "").trim() === "P:CodeTool";
}

export function isReasonerTool(taskDialogId: string): boolean {
  return String(taskDialogId ?? "").trim() === "P:ReasonerTool";
}

function normalizeMetadataToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function metadataContainsActionToken(
  value: string | undefined,
  token: string
): boolean {
  if (!value) return false;
  return normalizeMetadataToken(value).includes(normalizeMetadataToken(token));
}

export function isLikelyFlowAgentComponent(
  componentInfo: ComponentInfo | undefined,
  taskDialogId: string
): boolean {
  if (!componentInfo) return false;
  const fields = [
    componentInfo.name,
    componentInfo.description,
    componentInfo.modelDisplayName,
    componentInfo.modelDescription,
  ].filter(Boolean) as string[];
  const schemaLeaf = taskDialogId.split(".").pop() ?? "";
  if (schemaLeaf) fields.push(schemaLeaf);
  return fields.some(
    (f) =>
      normalizeMetadataToken(f).includes("flowagent") ||
      normalizeMetadataToken(f).includes("invokeflow")
  );
}

function hasPredictionOutput(observation: unknown): boolean {
  if (!observation || typeof observation !== "object") return false;
  const obs = observation as Record<string, unknown>;
  return "predictionOutput" in obs || "predictionId" in obs;
}

export function isCustomPromptAction(
  taskDialogId: string,
  observation?: unknown
): boolean {
  if (hasPredictionOutput(observation)) return true;
  if (taskDialogId.includes("InvokeAIBuilderModelTaskAction")) return true;
  const afterAction = taskDialogId.split(".action.").pop() ?? "";
  return /^customprompt/i.test(afterAction);
}

/**
 * Distinguishes a Power Automate Agent Flow from a Connector Action.
 *
 * Source of truth is the botcomponent's `data` YAML payload, where the
 * `action.kind` field is either `InvokeFlowTaskAction` (Cloud Flow added as
 * an agent action) or `InvokeConnectorTaskAction` (connector action). Those
 * markers come through as `componentInfo.rawData` once
 * `lookupBotComponentNames` has populated the cache.
 *
 * When the botcomponent record can't be fetched (different environment, not
 * yet hydrated), fall back to the schema-name shape: connector actions
 * follow `{prefix}.action.{Connector}-{Operation}` (the dash separates the
 * connector from the operation, e.g. `Office365Outlook-SendEmailV2`); Cloud
 * Flows are named after the flow itself with no dash, e.g. `ResumeUpload`,
 * `CreateJobApplication`, `SummarizeResume_n6M`.
 */
export function isAgentFlowAction(
  taskDialogId: string,
  componentInfo?: ComponentInfo
): boolean {
  const id = String(taskDialogId ?? "");
  if (!id.includes(".action.")) return false;
  if (id.includes("InvokeConnectedAgentTaskAction")) return false;

  // 1) Authoritative: explicit `action.kind: InvokeFlowTaskAction` in the
  //    botcomponent's data field.
  if (
    metadataContainsActionToken(componentInfo?.rawData, "InvokeFlowTaskAction") ||
    isLikelyFlowAgentComponent(componentInfo, id)
  ) {
    return true;
  }

  // 2) Authoritative: explicit `action.kind: InvokeConnectorTaskAction`.
  //    When the metadata exists and says "connector", trust it — don't let
  //    the dash heuristic flip the verdict.
  if (metadataContainsActionToken(componentInfo?.rawData, "InvokeConnectorTaskAction")) {
    return false;
  }

  // 3) Heuristic fallback (no metadata available).
  const actionSegment = id.split(".action.").pop() ?? "";
  if (!actionSegment) return false;
  const looksLikeConnectorPattern = /^[A-Za-z0-9]+-/.test(actionSegment);
  return !looksLikeConnectorPattern;
}

/**
 * Resolves a taskDialogId to a human-readable display name, consulting the
 * botcomponent name map when available.
 */
export function resolveStepName(
  taskDialogId: string,
  map?: Record<string, ComponentInfo>,
): string {
  const raw = taskDialogId ?? "";
  if (raw === "P:CodeTool") return "Code";
  if (raw === "P:ReasonerTool") return "Reason with advanced model";
  if (raw === "CAPIException") return "Content Filtered";
  if (raw.startsWith("P:UniversalSearchTool")) return "Search Sources";
  if (raw.startsWith("MCP:")) {
    const parts = raw.split(":");
    return parts[parts.length - 1] || raw;
  }
  if (map) {
    const info = map[raw];
    if (info) {
      const display = (info.modelDisplayName?.trim() || info.name?.trim()) ?? "";
      if (display) return display;
    }
  }
  const segments = raw.split(".");
  const last = segments[segments.length - 1] ?? raw;
  return last.replace(/-/g, " — ");
}

/** Converts an execution time string (`hh:mm:ss.fffffff`) to milliseconds. */
export function execTimeToMs(executionTime?: string): number {
  if (!executionTime) return 0;
  const parts = executionTime.trim().split(":");
  if (parts.length < 2) return 0;
  const n = (v: string) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const sec = parts[parts.length - 1] ?? "0";
  const min = parts[parts.length - 2] ?? "0";
  const hr  = parts.length >= 3 ? (parts[parts.length - 3] ?? "0") : "0";
  return (n(hr) * 3600 + n(min) * 60 + n(sec)) * 1000;
}

/**
 * Formats a millisecond duration as a human-readable string that scales from
 * milliseconds to days. Delegates to the shared {@link formatDuration} so every
 * duration display in the feature stays consistent.
 */
export function fmtDuration(ms: number): string {
  return formatDuration(ms);
}

/**
 * Classifies a step execution into a UI subtitle ("Topic", "Knowledge", "Tool",
 * "Connector Action", "Code", "Deep reasoning", "Custom Prompt", "Flow",
 * "Connected agent", "Intent Recognition", etc.).
 *
 * Prefers the explicit `stepType` from `DynamicPlanStepTriggered` when available
 * (`Action`/`KnowledgeSource`/`CustomTopic`/`LlmSkill`/`Agent`); otherwise falls
 * back to schema-name heuristics.
 */
export function guessStepSubtitle(
  taskDialogId: string,
  stepType?: string,
  componentInfo?: ComponentInfo,
  observation?: unknown
): string {
  const id = String(taskDialogId ?? "");
  if (isCodeTool(id)) return "Code";
  if (isReasonerTool(id)) return "Deep reasoning";

  const rawType = typeof stepType === "string" ? stepType.trim() : "";
  // "Unknown" is emitted by lightweight connected-agent child steps — treat as missing.
  const shouldInferFromSchema = !rawType || rawType === "Unknown";

  if (!shouldInferFromSchema) {
    if (rawType === "Action" && id.includes("InvokeConnectedAgentTaskAction"))
      return "Connected agent";
    // Custom Prompt must be checked before Flow: hasPredictionOutput(observation) is
    // ground truth — if the step observation contains predictionOutput it IS a Custom
    // Prompt, regardless of whether the schema name looks like a Flow (no-dash heuristic).
    if (rawType === "Action" && isCustomPromptAction(id, observation))
      return "Custom Prompt";
    if (rawType === "Action" && isAgentFlowAction(id, componentInfo)) return "Flow";
    if (
      rawType === "Action" &&
      id.includes(".action.") &&
      !id.includes("InvokeConnectedAgentTaskAction") &&
      !isCustomPromptAction(id, observation)
    )
      return "Connector Action";
    if (rawType === "KnowledgeSource") return "Knowledge";
    if (rawType === "CustomTopic") return "Topic";
    if (rawType === "LlmSkill") return "Tool";
    // `type: "Agent"` is emitted by DynamicPlanStepTriggered for in-app
    // sub-agents (lightweight child agents). True connected agents come in
    // via `InvokeConnectedAgentTaskAction` above.
    if (rawType === "Agent") return "Child agent";
    return rawType;
  }

  // Schema-only fallback (no stepType available — common in finish-only step execs).
  if (id.startsWith("MCP:")) return "MCP tool";
  if (id.startsWith("P:UniversalSearchTool")) return "Knowledge";
  if (id.startsWith("P:")) return "Tool";
  if (id.includes("InvokeConnectedAgentTaskAction")) return "Connected agent";
  if (id.includes(".agent.")) return "Child agent";
  if (id.includes(".topic.")) return "Topic";
  if (isCustomPromptAction(id, observation)) return "Custom Prompt";
  if (isAgentFlowAction(id, componentInfo)) return "Flow";
  if (
    id.includes(".action.") &&
    !id.startsWith("MCP:") &&
    !isCustomPromptAction(id, observation)
  )
    return "Connector Action";
  return "";
}
