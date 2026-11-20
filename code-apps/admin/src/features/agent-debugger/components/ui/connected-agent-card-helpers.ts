import type { ComponentType, CSSProperties } from "react";
import { Code20Regular, ChatSparkle20Regular, BookOpenLightbulb20Regular, Connector20Regular, Wrench20Regular, Flow20Regular, Server20Regular, BrainSparkle20Regular, Prompt20Regular, Bot20Regular } from "@fluentui/react-icons";
import type { ConnectedAgentInfo } from "../../contracts/connected-agent";
import type { ComponentInfo } from "../../services/botcomponents-service";
import { guessStepSubtitle, resolveExecutionTimeString } from "../../utils/step-classification";
import { formatDuration as formatDurationMs } from "../../utils/format-duration";
import { COMPONENT_COLORS, DEFAULT_COMPONENT_COLOR } from "../../theme/component-colors";
import { SkillIcon } from "./SkillIcon";



/**
 * Normalizes spaced acronyms in display names.
 * "Meeting Management M C P Server" → "Meeting Management MCP Server"
 * Matches sequences of 2+ single uppercase letters separated by spaces.
 */
export function normalizeSpacedAcronyms(name: string): string {
  return name.replace(
    /\b([A-Z])(?: ([A-Z]))+\b/g,
    (match) => match.replace(/ /g, "")
  );
}


/** Look up botcomponent display name for a schema name. */
export function resolveComponentName(
  schemaName: string | undefined,
  map?: Record<string, ComponentInfo>
): string {
  if (!map || !schemaName) return "";
  const info = map[schemaName];
  if (!info) return "";
  return (info.modelDisplayName?.trim() || info.name)?.trim() || "";
}


// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Returns the user-facing subtitle for a child topic. Prefers `guessStepSubtitle`
 * (shared with the parent debug panel) when we have a real schemaId — that way
 * "Topic" / "Knowledge" / "Tool" / "Connector Action" / "Code" / "Custom Prompt"
 * / "Flow" / "Connected agent" / "Deep reasoning" classifications match the
 * parent exactly. Falls back to a coarse type → label map for plan-only entries
 * extracted from `DynamicPlanReceived` (no execution data, schemaId-only).
 */
export function formatTopicType(
  type: string,
  observation?: unknown,
  schemaId?: string,
  componentInfo?: ComponentInfo
): string {
  // MCPServer is synthesized by extractChildTopics from DynamicServerInitialize
  // — it isn't a plan step, so don't try guessStepSubtitle (which would just
  // echo the raw type string back).
  if (type === "MCPServer") return "Model Context Protocol";
  if (schemaId) {
    const subtitle = guessStepSubtitle(schemaId, type, componentInfo, observation);
    if (subtitle) return subtitle;
  }
  // Custom prompt override (legacy fallback when no schemaId).
  if ((type === "ConnectorAction" || type === "Action") && hasPredictionOutput(observation))
    return "Custom Prompt";
  switch (type) {
    case "CustomTopic":
      return "Topic";
    case "KnowledgeSource":
      return "Knowledge";
    case "ConnectorAction":
      return "Connector Action";
    case "LlmSkill":
      return "Tool";
    case "Action":
      return "Action";
    case "BuiltIn":
      return "Built-in Tool";
    default:
      return type || "Step";
  }
}


/** Checks whether an observation contains predictionOutput — definitive AI Builder signal. */
function hasPredictionOutput(observation: unknown): boolean {
  if (!observation || typeof observation !== "object") return false;
  const obs = observation as Record<string, unknown>;
  return "predictionOutput" in obs || "predictionId" in obs;
}


/**
 * Returns a Fluent UI icon component for connected agent child topics. Mirrors the
 * parent flow's `pickStepIcon` so the SAME component type shows the SAME icon
 * everywhere (parent activity cards, connected-agent topics, and the detail-panel
 * header) across both classic and new-designer transcripts.
 */
export function getTopicIcon(
  schemaId: string,
  type: string,
  observation?: unknown
): ComponentType<{
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean;
}> {
  if (type === "MCPServer") return Server20Regular;
  if (schemaId === "P:CodeTool") return Code20Regular;
  if (schemaId === "P:ReasonerTool") return BrainSparkle20Regular;
  if (type === "KnowledgeSource" || schemaId.startsWith("P:UniversalSearch"))
    return BookOpenLightbulb20Regular;
  // Real new-designer skills (InlineAgentSkill) → custom purple-gradient skill glyph.
  if (type === "Skill") return SkillIcon;
  // "LlmSkill" is Copilot Studio's internal name for an LLM-invocable *tool* (e.g. an
  // MCP/connector tool). It is labelled "Tool" everywhere (see guessStepSubtitle /
  // formatTopicType), so it must use the wrench tool icon — not the skill glyph.
  // Checked before the connector / ".action." branches so its label and icon agree.
  if (type === "LlmSkill") return Wrench20Regular;
  // Connected / child agents → bot (consistent with the parent flow).
  if (type === "Agent") return Bot20Regular;
  if (type === "CustomTopic" || schemaId.includes(".topic."))
    return ChatSparkle20Regular;
  if (schemaId.includes("InvokeFlowTaskAction") || type === "Flow")
    return Flow20Regular;
  // Custom Prompt detection: observation ground truth first, then name pattern
  if (hasPredictionOutput(observation) || schemaId.includes("InvokeAIBuilderModelTaskAction") || /\.action\.customprompt/i.test(schemaId))
    return Prompt20Regular;
  // Power Automate Cloud Flow added as agent action (no `{Connector}-{Operation}` dash).
  if (schemaId.includes(".action.")) {
    const actionSegment = schemaId.split(".action.").pop() ?? "";
    if (actionSegment && !/^[A-Za-z0-9]+-/.test(actionSegment)) return Flow20Regular;
  }
  // Classic connector actions — ConnectorAction type or `.action.` schemaId.
  if (type === "ConnectorAction" || schemaId.includes(".action."))
    return Connector20Regular;
  // New-designer generic/MCP tools (toolKind "tool" → type "Action") → wrench,
  // matching the parent flow's "Tool" icon (was incorrectly the connector icon).
  if (type === "Action" || type === "Tool") return Wrench20Regular;
  return ChatSparkle20Regular;
}


/**
 * Icon colour (hex) for a connected-agent topic — mirrors the parent flow's
 * `stepCardIcon*` palette so a given component type is the same colour in the
 * connected-agent card as it is on the parent activity cards.
 */
export function getTopicIconColor(schemaId: string, type: string): string {
  if (type === "MCPServer") return COMPONENT_COLORS["MCP server"];
  if (schemaId === "P:CodeTool") return COMPONENT_COLORS.Code;
  if (schemaId === "P:ReasonerTool") return COMPONENT_COLORS["Deep reasoning"];
  if (type === "KnowledgeSource" || schemaId.startsWith("P:UniversalSearch"))
    return COMPONENT_COLORS.Knowledge;
  if (type === "Skill") return COMPONENT_COLORS.Skill;
  if (type === "LlmSkill") return COMPONENT_COLORS.Tool; // LLM tool (labelled "Tool")
  if (schemaId.includes("InvokeFlowTaskAction") || type === "Flow") return COMPONENT_COLORS.Flow;
  if (schemaId.includes(".action.")) {
    const seg = schemaId.split(".action.").pop() ?? "";
    if (seg && !/^[A-Za-z0-9]+-/.test(seg)) return COMPONENT_COLORS.Flow; // cloud flow added as action
  }
  if (type === "ConnectorAction" || schemaId.includes(".action."))
    return COMPONENT_COLORS["Connector Action"];
  if (type === "Action" || type === "Tool") return COMPONENT_COLORS.Tool;
  return DEFAULT_COMPONENT_COLOR; // topic / agent / custom prompt / default
}


/** Formats "hh:mm:ss.fffffff" into a short duration label like "16.42s" or "1m 23s". */
export function formatDuration(executionTime?: string): string | undefined {
  if (!executionTime) return undefined;
  const parts = String(executionTime).trim().split(":");
  if (parts.length < 3) return undefined;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (totalSeconds <= 0) return undefined;
  // Delegate to the shared formatter so durations scale (ms -> s -> m -> h -> d)
  // consistently with the rest of the Agent Debugger.
  return formatDurationMs(totalSeconds * 1000);
}


// ─── Topic Detail Types & Helpers ──────────────────────────────────

export interface ConnectedAgentTopicDetail {
  key: string;
  schemaId: string;
  /** Plan step id of the producing step exec — used to correlate with the parent turn's stepExecutions. */
  stepId?: string;
  displayName: string;
  rawType: string;
  typeLabel: string;
  hasExecution: boolean;
  thought?: string;
  stateLabel?: string;
  executionTime?: string;
  inputs: Array<[string, string]>;
  output?: string;
  observation?: unknown;
}


interface StepExecLike {
  taskDialogId?: string;
  stepId?: string;
  thought?: string;
  arguments?: Record<string, unknown>;
  observation?: unknown;
  executionTime?: string;
  triggeredAt?: string;
  finishedAt?: string;
  state?: number | string;
}


/** Collects StepExecution entries from the connected agent's child transcript turns. */
export function collectExecutionEntries(
  connectedAgent: ConnectedAgentInfo
): StepExecLike[] {
  const entries: StepExecLike[] = [];
  if (!connectedAgent.childTranscript) return entries;
  for (const turn of connectedAgent.childTranscript) {
    const execs = turn.debugInfo?.stepExecutions;
    if (Array.isArray(execs)) {
      for (const exec of execs) entries.push(exec as StepExecLike);
    }
  }
  return entries;
}


/** Formats an observation value for display. */
export function formatObservation(obs: unknown): string {
  if (obs === null || obs === undefined) return "";
  if (typeof obs === "string") return obs;

  const rec = obs as Record<string, unknown>;

  // Search results format
  const searchResult = rec?.search_result as Record<string, unknown> | undefined;
  const searchResults = (searchResult?.search_results ?? rec?.search_results) as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(searchResults) && searchResults.length > 0) {
    const lines = searchResults.slice(0, 5).map((r, i) => {
      const title = String(r?.title ?? r?.name ?? `Result ${i + 1}`);
      const url = String(r?.url ?? "");
      const snippet = String(r?.snippet ?? r?.text ?? "").slice(0, 150);
      return `- ${title}${url ? `\n  ${url}` : ""}${snippet ? `\n  ${snippet}...` : ""}`;
    });
    return `Search results:\n${lines.join("\n")}`;
  }

  // Generic object
  try {
    const json = JSON.stringify(obs, null, 2);
    if (json === "{}" || json === "[]") return "";
    return json;
  } catch {
    return String(obs);
  }
}


/** Builds topic detail records by correlating child topics with child transcript executions. */
export function buildConnectedAgentTopicDetails(
  connectedAgent: ConnectedAgentInfo,
  componentNameBySchemaName?: Record<string, ComponentInfo>
): ConnectedAgentTopicDetail[] {
  const executionEntries = collectExecutionEntries(connectedAgent);

  // Map by taskDialogId → latest execution
  const latestBySchemaId = new Map<string, StepExecLike>();
  for (const exec of executionEntries) {
    if (exec.taskDialogId) latestBySchemaId.set(exec.taskDialogId, exec);
  }

  return connectedAgent.childTopics.map((topic, index) => {
    // Prefer the topic's own execution data (populated by buildChildTopicsFromTurns
    // which iterates step executions one-per-invocation, preserving multiple
    // invocations of the same taskDialogId). Fall back to the global per-schema
    // map for legacy plan-only topics that didn't carry execution data.
    const fallbackExec = latestBySchemaId.get(topic.schemaId);
    const hasExecution = Boolean(topic.hasExecution || fallbackExec);

    const topicThought = typeof topic.thought === "string" ? topic.thought.trim() : "";
    const fallbackThought = fallbackExec?.thought?.trim() || "";
    const thought = topicThought || fallbackThought || undefined;

    const argSource = topic.arguments ?? fallbackExec?.arguments;
    const inputs: Array<[string, string]> = [];
    if (argSource && typeof argSource === "object") {
      for (const [k, v] of Object.entries(argSource)) {
        inputs.push([k, typeof v === "string" ? v : JSON.stringify(v)]);
      }
    }

    const observation = topic.observation ?? fallbackExec?.observation;
    const output = formatObservation(observation);

    const stateLabel = (() => {
      if (!hasExecution) return undefined;
      const s = topic.state ?? fallbackExec?.state;
      if (typeof s === "string") return s === "completed" ? "Completed" : s === "failed" ? "Failed" : s;
      return undefined;
    })();

    const displayName = normalizeSpacedAcronyms(
      resolveComponentName(topic.schemaId, componentNameBySchemaName) || topic.displayName
    );

    // Recover the real duration when the orchestrator zeroed it for nested
    // sub-plans — the resolver falls back to finishedAt-triggeredAt.
    const resolvedExecutionTime = resolveExecutionTimeString({
      executionTime: topic.executionTime ?? fallbackExec?.executionTime,
      triggeredAt: fallbackExec?.triggeredAt,
      finishedAt: fallbackExec?.finishedAt,
    });

    return {
      key: `${topic.schemaId}:${index}`,
      schemaId: topic.schemaId,
      stepId: topic.stepId ?? fallbackExec?.stepId,
      displayName,
      rawType: topic.type,
      typeLabel: formatTopicType(
        topic.type,
        observation,
        topic.schemaId,
        componentNameBySchemaName?.[topic.schemaId]
      ),
      hasExecution,
      thought,
      stateLabel,
      executionTime: resolvedExecutionTime,
      inputs,
      output,
      observation,
    };
  });
}
