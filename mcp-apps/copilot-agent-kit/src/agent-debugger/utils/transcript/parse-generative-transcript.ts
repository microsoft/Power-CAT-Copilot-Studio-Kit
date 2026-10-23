import type {
  Activity,
  ProcessedDebugInfo,
  ProcessedTranscript,
  ProcessedTurn,
  StepExecution,
} from "../../contracts/transcript.js";
import type { TranscriptData } from "../../contracts/transcript.js";
import { toIsoTimestamp } from "../../services/conversation-transcript-service.js";
import { formatMsAsExecutionTime } from "../step-classification.js";
import {
  extractActivityText,
  isNonConversationalUserResponse,
} from "./extract-activity-text.js";
import { activityTimestampMs } from "./timestamp.js";

/**
 * Parser for **generative orchestration** (new agent designer) transcripts.
 *
 * The new engine no longer emits `DynamicPlan*` step events. Instead each tool
 * invocation is a `ToolCallTrace:Started` → `:Completed` / `:Failed` lifecycle
 * (carrying `toolCallId`, `toolName`, `toolKind`, `durationMs`, `result` /
 * `errorMessage`), the planner's reasoning arrives as `ThinkingTrace` events,
 * and turns are bounded by `turn.complete`. This parser maps those onto the
 * SAME {@link ProcessedTranscript} / {@link StepExecution} model the classic
 * parser produces, so the Debug Panel, Execution Flow, Topic Flow, and
 * Performance Waterfall render generative transcripts without change.
 */

/**
 * Synthetic `taskDialogId` marker used for the standalone reasoning
 * (`ThinkingTrace`) step. The Debug Panel, Execution Flow, and Performance
 * Waterfall key off this to render/skip the reasoning box appropriately.
 */
export const GENERATIVE_THINKING_TASK_ID = "GEN:ThinkingTrace";

/** Title shown on the reasoning box. */
export const GENERATIVE_THINKING_TITLE = "Reasoning";

/** Subtitle / type label shown on the reasoning box. */
export const GENERATIVE_THINKING_SUBTITLE = "Chain of thought";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function feedbackComment(value: unknown): string | undefined {
  if (typeof value === "string") {
    const text = value.trim();
    return text || undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const candidate of [value["feedbackText"], value["text"], value["comment"]]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function appendTurnFeedback(
  turn: ProcessedTurn,
  feedback: NonNullable<ProcessedTurn["feedback"]>,
): void {
  turn.feedback = feedback;
  turn.feedbackEvents = [...(turn.feedbackEvents ?? []), feedback];
}

/** Best-precision ISO timestamp (prefers millisecond field). */
function activityTimestamp(activity: Activity): string {
  const ms = activityTimestampMs(activity);
  if (ms !== undefined) return new Date(ms).toISOString();
  return toIsoTimestamp(activity.timestamp);
}

function isUserMessage(activity: Activity, isStandardTranscript: boolean): boolean {
  if (activity.type !== "message") return false;
  const role = activity.from?.role;
  if (role === "user") return true;
  if (role === "bot") return false;
  if (role === 0) return false;
  if (role === 1) return isStandardTranscript || !!activity.from?.aadObjectId;
  return false;
}

/** Maps a generative `toolKind` to the Debug Panel step subtitle. */
function mapToolKindToSubtitle(toolKind: string): string {
  switch (toolKind) {
    case "search":
      return "Knowledge";
    case "agent":
      return "Connected agent";
    case "skill":
      return "Skill";
    case "tool":
    default:
      return "Tool";
  }
}

/** Maps a generative `toolKind` to a classic-compatible step `type`. */
function mapToolKindToType(toolKind: string): string {
  switch (toolKind) {
    case "search":
      return "KnowledgeSource";
    case "agent":
      return "Agent";
    case "skill":
      return "Skill";
    case "tool":
    default:
      return "Action";
  }
}

/**
 * Classifies a generative tool-call activity into its component kind. Loaded
 * skills report `toolName: "skill"` (with the real name in `toolDisplayName`)
 * and carry no `toolKind`, so they must be detected by name and surfaced as a
 * distinct "Skill" component rather than a generic Tool.
 */
function classifyGenerativeTool(
  value: Record<string, unknown>
): { toolKind: string; subtitle: string; type: string } {
  if (String(value["toolName"] ?? "") === "skill") {
    return { toolKind: "skill", subtitle: "Skill", type: "Skill" };
  }
  const toolKind = String(value["toolKind"] ?? "tool");
  return {
    toolKind,
    subtitle: mapToolKindToSubtitle(toolKind),
    type: mapToolKindToType(toolKind),
  };
}

/** Parses a tool `result` string into a structured observation when possible. */
function parseToolResult(result: unknown): unknown {
  if (typeof result !== "string") return result ?? undefined;
  const trimmed = result.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through to raw text */
    }
  }
  return { text: result };
}

/**
 * Generative KnowledgeSearch tools expose the knowledge sources they searched in
 * `hiddenFilledParameters.sources` (a JSON-encoded string array, e.g.
 * `"[\"MDN Web Docs\"]"`). Parse it defensively into a `string[]` so the Debug
 * Panel can surface the searched sources for new-designer transcripts (classic
 * transcripts carry this in the universal-search trace instead).
 */
function parseGenerativeKnowledgeSources(value: Record<string, unknown>): string[] {
  const hidden = value["hiddenFilledParameters"];
  if (!isRecord(hidden)) return [];
  const raw = hidden["sources"];
  let arr: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      arr = JSON.parse(trimmed);
    } catch {
      return [trimmed];
    }
  }
  if (Array.isArray(arr)) {
    return arr.filter((s): s is string => typeof s === "string" && s.length > 0);
  }
  return [];
}

export function parseGenerativeTranscript(data: TranscriptData): ProcessedTranscript {
  const activities = [...(data.activities ?? [])];

  const isStandardTranscript = activities.some(
    (a) => a.type === "message" && a.from?.role === 0
  );

  const turns: ProcessedTurn[] = [];
  let pendingActivities: Activity[] = [];
  // The user turn subsequent tool steps / reasoning are attributed to (preferred
  // attach target), and the most recent turn of any role (fallback target for
  // bot-initiated transcripts that have no user message).
  let currentUserTurn: ProcessedTurn | null = null;
  let currentTurn: ProcessedTurn | null = null;
  // Steps produced before any message turn — attached to the first turn pushed.
  const preTurnSteps: StepExecution[] = [];
  // Global lookup so a `:Completed`/`:Failed` can update the step created by its
  // `:Started`, even across an intervening assistant message.
  const stepByToolCallId = new Map<string, StepExecution>();
  // ThinkingTrace reconstruction. Copilot Studio streams reasoning as delta
  // chunks followed by a cumulative snapshot equal to their concatenation
  // (e.g. "…store" + " it in Dataverse." then the full "…store it in
  // Dataverse."). We rebuild the original discrete thoughts: concatenate deltas
  // into `thinkingBuffer`; when a trace equals the buffer it's the snapshot →
  // that thought is complete, so we emit it AS ITS OWN reasoning box right then,
  // matching Copilot Studio which shows every thought as a separate segment
  // interleaved with tool calls. A partial buffer is also flushed before the
  // next tool/message so reasoning is never merged into or ordered after the
  // component that follows it.
  let thinkingBuffer = "";
  let thinkingBufferTs: string | undefined;
  let lastReasoningText: string | undefined;
  let thinkingSeq = 0;

  let sessionOutcome = "Unknown";
  let sessionOutcomeReason = "";
  let sessionStartMs: number | undefined;
  let sessionEndMs: number | undefined;

  const attachStepToCurrentTurn = (step: StepExecution) => {
    stepByToolCallId.set(step.stepId, step);
    const target = currentUserTurn ?? currentTurn;
    if (target) {
      target.debugInfo = target.debugInfo ?? {};
      const list = target.debugInfo.stepExecutions ?? [];
      list.push(step);
      target.debugInfo.stepExecutions = list;
    } else {
      preTurnSteps.push(step);
    }
  };

  /** Emits a single reasoning thought as its own standalone box. */
  const emitReasoning = (text: string, ts: string | undefined) => {
    const seg = text.trim();
    if (!seg || seg === lastReasoningText) return;
    lastReasoningText = seg;
    attachStepToCurrentTurn({
      stepId: `thinking:${thinkingSeq++}`,
      taskDialogId: GENERATIVE_THINKING_TASK_ID,
      displayName: GENERATIVE_THINKING_TITLE,
      subtitle: GENERATIVE_THINKING_SUBTITLE,
      toolKind: "thinking",
      type: "Thinking",
      thought: seg,
      triggeredAt: ts,
      state: "completed",
    });
  };

  /**
   * Flushes any in-progress reasoning buffer (a thought interrupted before its
   * cumulative snapshot arrived) as its own box before the following component.
   */
  const flushThinking = () => {
    if (thinkingBuffer) {
      emitReasoning(thinkingBuffer, thinkingBufferTs);
      thinkingBuffer = "";
      thinkingBufferTs = undefined;
    }
  };

  const setCurrentTurnDebug = (apply: (info: ProcessedDebugInfo) => void) => {
    const target = currentUserTurn ?? currentTurn;
    if (!target) return;
    target.debugInfo = target.debugInfo ?? {};
    apply(target.debugInfo);
  };

  for (const activity of activities) {
    if (activity.type === "message") {
      // Any reasoning that preceded this message becomes its own box on the
      // current turn, before the message is pushed.
      flushThinking();
      const role: ProcessedTurn["role"] = isUserMessage(activity, isStandardTranscript)
        ? "user"
        : "assistant";

      const hasAdaptiveCard = activity.attachments?.some(
        (a) =>
          (a as Record<string, unknown>)?.["contentType"] ===
          "application/vnd.microsoft.card.adaptive"
      );
      const content =
        extractActivityText({
          text: activity.text,
          speak: activity.speak,
          value: activity.value,
          channelData: activity.channelData,
          attachments: activity.attachments as
            | Array<{ contentType?: string; content?: unknown }>
            | undefined,
        }) || (hasAdaptiveCard ? "[Adaptive Card Message]" : "");

      if (
        role === "user" &&
        isNonConversationalUserResponse(activity.value, content)
      ) {
        if (currentUserTurn) {
          currentUserTurn.activities.push(...pendingActivities, activity);
          pendingActivities = [];
        } else {
          pendingActivities.push(activity);
        }
        continue;
      }

      const turn: ProcessedTurn = {
        id: activity.id || "",
        role,
        content,
        timestamp: toIsoTimestamp(activity.timestamp),
        activities: [activity, ...pendingActivities],
        debugInfo: {},
      };

      turns.push(turn);
      pendingActivities = [];
      lastReasoningText = undefined;

      const wasFirstTurn = currentTurn === null;
      currentTurn = turn;
      if (role === "user") currentUserTurn = turn;

      // Flush steps that arrived before any message turn onto the first turn,
      // regardless of role (covers bot-initiated transcripts with no user turn).
      if (wasFirstTurn && preTurnSteps.length) {
        turn.debugInfo = turn.debugInfo ?? {};
        turn.debugInfo.stepExecutions = [
          ...(turn.debugInfo.stepExecutions ?? []),
          ...preTurnSteps,
        ];
        preTurnSteps.length = 0;
      }
      continue;
    }

    if (activity.type !== "trace" && activity.type !== "event") continue;
    pendingActivities.push(activity);

    const name = typeof activity.name === "string" ? activity.name : "";
    const valueType = typeof activity.valueType === "string" ? activity.valueType : "";
    const value = isRecord(activity.value) ? activity.value : {};

    if (name === "ThinkingTrace") {
      const raw = value["thinkingText"];
      const t = typeof raw === "string" ? raw : "";
      if (t) {
        if (!thinkingBuffer) thinkingBufferTs = activityTimestamp(activity);
        // A trace equal to the accumulated buffer is the cumulative snapshot
        // that closes the current thought → emit it as its own box now.
        // Otherwise it's a delta chunk that extends the current thought.
        if (thinkingBuffer && t === thinkingBuffer) {
          emitReasoning(thinkingBuffer, thinkingBufferTs);
          thinkingBuffer = "";
          thinkingBufferTs = undefined;
        } else {
          thinkingBuffer += t;
        }
      }
      continue;
    }

    if (name === "ToolCallTrace:Started") {
      const toolCallId = String(value["toolCallId"] ?? "");
      if (!toolCallId) continue;
      // Reasoning that preceded this tool call becomes its own box first.
      flushThinking();
      const { toolKind, subtitle, type } = classifyGenerativeTool(value);
      const step: StepExecution = {
        stepId: toolCallId,
        taskDialogId: String(value["toolName"] ?? toolCallId),
        displayName: String(value["toolDisplayName"] ?? value["toolName"] ?? toolCallId),
        subtitle,
        toolKind,
        type,
        arguments: isRecord(value["filledParameters"])
          ? (value["filledParameters"] as Record<string, unknown>)
          : undefined,
        triggeredAt: activityTimestamp(activity),
        state: "running",
      };
      if (toolKind === "search") {
        const searched = parseGenerativeKnowledgeSources(value);
        if (searched.length) {
          step.knowledgeSources = { searched, isKnowledgeSearched: true };
        }
      }
      attachStepToCurrentTurn(step);
      continue;
    }

    if (name === "ToolCallTrace:Completed" || name === "ToolCallTrace:Failed") {
      const toolCallId = String(value["toolCallId"] ?? "");
      const failed = name === "ToolCallTrace:Failed";
      const durationMs =
        typeof value["durationMs"] === "number" ? (value["durationMs"] as number) : undefined;
      let step = stepByToolCallId.get(toolCallId);
      if (!step) {
        // Completion without a matching Started (e.g. a loaded skill emits only
        // :Completed). Flush any reasoning that preceded it so the reasoning box
        // is ordered BEFORE this component, then synthesize a minimal step.
        flushThinking();
        const { toolKind, subtitle, type } = classifyGenerativeTool(value);
        step = {
          stepId: toolCallId || `${name}:${turns.length}`,
          taskDialogId: String(value["toolName"] ?? toolCallId),
          displayName: String(value["toolDisplayName"] ?? value["toolName"] ?? toolCallId),
          subtitle,
          toolKind,
          type,
          arguments: isRecord(value["filledParameters"])
            ? (value["filledParameters"] as Record<string, unknown>)
            : undefined,
        };
        if (toolKind === "search") {
          const searched = parseGenerativeKnowledgeSources(value);
          if (searched.length) {
            step.knowledgeSources = { searched, isKnowledgeSearched: true };
          }
        }
        attachStepToCurrentTurn(step);
      }
      step.finishedAt = activityTimestamp(activity);
      if (durationMs !== undefined) step.executionTime = formatMsAsExecutionTime(durationMs);
      step.state = failed ? "failed" : "completed";
      if (failed) {
        const err = String(value["errorMessage"] ?? value["status"] ?? "");
        step.errorMessage = err || undefined;
        step.observation = { error: err };
      } else {
        step.observation = parseToolResult(value["result"]);
      }
      continue;
    }

    if (
      name === "ConnectedAgentInitializeTraceData" ||
      valueType === "ConnectedAgentInitializeTraceData"
    ) {
      setCurrentTurnDebug((info) => {
        info.connectedAgentInitialize = { ...(value as ProcessedDebugInfo["connectedAgentInitialize"]) };
      });
      continue;
    }

    if (
      name === "ConnectedAgentCompletedTraceData" ||
      valueType === "ConnectedAgentCompletedTraceData"
    ) {
      setCurrentTurnDebug((info) => {
        info.connectedAgentCompleted = { ...(value as ProcessedDebugInfo["connectedAgentCompleted"]) };
      });
      continue;
    }

    if (valueType === "SessionInfo") {
      if (typeof value["outcome"] === "string") sessionOutcome = value["outcome"] as string;
      if (typeof value["outcomeReason"] === "string")
        sessionOutcomeReason = value["outcomeReason"] as string;
      if (typeof value["startTimeUtc"] === "string")
        sessionStartMs = Date.parse(value["startTimeUtc"] as string);
      if (typeof value["endTimeUtc"] === "string")
        sessionEndMs = Date.parse(value["endTimeUtc"] as string);
      continue;
    }

    // Feedback events (thumbs up/down) — attach to the assistant message they
    // reference, falling back to the most recent assistant turn.
    const oldStyleRating =
      name === "feedback" && isRecord(value) && typeof value["rating"] === "string"
        ? value["rating"].toLowerCase()
        : "";
    const actionValue =
      name === "message/submitAction" &&
      isRecord(value) &&
      value["actionName"] === "feedback" &&
      isRecord(value["actionValue"])
        ? value["actionValue"]
        : undefined;
    const actionReaction =
      typeof actionValue?.["reaction"] === "string"
        ? actionValue["reaction"].toLowerCase()
        : "";
    const rating: "thumbsUp" | "thumbsDown" | undefined =
      oldStyleRating === "thumbsup" || actionReaction === "like" || actionReaction === "thumbsup"
        ? "thumbsUp"
        : oldStyleRating === "thumbsdown" || actionReaction === "dislike" || actionReaction === "thumbsdown"
          ? "thumbsDown"
          : undefined;

    if (rating) {
      const comment = actionValue
        ? feedbackComment(actionValue["feedback"])
        : feedbackComment(value["comment"]);
      let target: ProcessedTurn | undefined;
      if (activity.replyToId) {
        target = turns.find(
          (turn) => turn.role === "assistant" && turn.id === activity.replyToId,
        );
      }
      if (!target) {
        for (let i = turns.length - 1; i >= 0; i -= 1) {
          if (turns[i].role === "assistant") {
            target = turns[i];
            break;
          }
        }
      }
      if (target) {
        appendTurnFeedback(target, { rating, comment });
      }
    }
  }

  // Tail flush: emit any trailing reasoning as its own box, then guard against a
  // degenerate transcript that carried tool steps but no message turns.
  flushThinking();
  if (preTurnSteps.length && turns.length === 0) {
    turns.push({
      id: "",
      role: "assistant",
      content: "",
      timestamp: toIsoTimestamp(activities[0]?.timestamp),
      activities: [...activities],
      debugInfo: { stepExecutions: [...preTurnSteps] },
    });
    preTurnSteps.length = 0;
  }

  // Duration: prefer SessionInfo start/end, else first→last activity timestamp.
  const timestampMsAt = (a: Activity | undefined): number | undefined => {
    return activityTimestampMs(a);
  };
  const firstMs = sessionStartMs ?? timestampMsAt(activities[0]);
  const lastMs =
    sessionEndMs ??
    timestampMsAt([...activities].reverse().find((a) => timestampMsAt(a) !== undefined));
  const durationMs =
    firstMs !== undefined && lastMs !== undefined && Number.isFinite(firstMs) && Number.isFinite(lastMs) && lastMs >= firstMs
      ? lastMs - firstMs
      : 0;

  const outcomeDisplay = sessionOutcomeReason
    ? `${sessionOutcome} (${sessionOutcomeReason})`
    : sessionOutcome;

  return {
    generalInfo: {
      durationMs,
      duration: `${Math.floor(durationMs / 1000)}s`,
      turnCount: turns.length,
      outcome: outcomeDisplay,
    },
    turns,
    raw: { activities },
  };
}
