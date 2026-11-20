import type { AnalysisReportInput } from "../contracts/analysis-report";
import type { OfflineConversationSnapshot } from "../contracts/offline-viewer";
import type { Activity, ProcessedDebugInfo, ProcessedTurn, StepExecution } from "../contracts/transcript";
import type { ConnectedAgentInfo } from "../contracts/connected-agent";
import type { Activity as ChatActivity } from "../components/ui/types";
import { exchanges, isReasoning, isReasoningActivity, reasoningCallIds, reasoningTaskIds, recommendationTranscript, sessionKey, stepType } from "./report-privacy";
import { ownedAgentsByExchange } from "./offline-agent-ownership";
import { observedToolEvidence, safeHtmlEvidence } from "./html-report-evidence";
import { turnTimeBounds } from "./turn-timing";
import { classicActivityExecutions } from "./html-report-activities";
import { isUserMessageActivity } from "./transcript/turn-activities";
import { fmtMs } from "./format-ms";
import { hasStepTiming } from "./turn-timing";
import { stepDurationMs } from "./timeline-insights";

const eventNames = new Set([
  "DynamicPlanReceived", "DynamicPlanStepTriggered", "DynamicPlanStepBindUpdate", "DynamicPlanStepFinished",
  "DynamicPlanStepBlocked", "DynamicPlanFinished", "DynamicServerInitialize", "DynamicServerToolsList",
  "ErrorTraceData", "VariableAssignment", "DialogTracing", "ResponseGeneratorSupportData", "KnowledgeTraceData",
  "UniversalSearchToolTraceData", "GPTAnswerTraceData", "CodeTraceData", "GenerativeAnswersSupportData",
  "ToolCallTrace:Started", "ToolCallTrace:Completed", "ToolCallTrace:Failed", "feedback", "message/submitAction",
]);
const debugKeys = ["variables", "ask", "searchQuery", "searchKeywords", "knowledgeSources", "genAiSupportData",
  "citations", "searchResults", "responseGeneratorData", "codeExecution", "executionTime", "tokenInfo",
  "initialTopic", "timestamps", "mcpServerInfo", "mcpServers", "mcpTools"] as const;
const executionKeys = ["stepId", "taskDialogId", "type", "state", "displayName", "subtitle", "toolKind",
  "arguments", "observation", "executionTime", "triggeredAt", "finishedAt", "parentStepKey", "planIdentifier",
  "blockedError", "errorMessage", "tokenInfo", "knowledgeSources", "genAiSupportData"] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pick(value: object, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter(key => key in value).map(key => [key, (value as Record<string, unknown>)[key]]));
}

function projectExecution(step: StepExecution, input: AnalysisReportInput, calls: Set<string>, tasks: Set<string>): StepExecution {
  if (isReasoning(step, input) || tasks.has(step.taskDialogId) || calls.has(step.stepId)) {
    const status = typeof step.state === "number"
      ? step.state === 0 ? "Running" : step.state === 1 ? "Completed" : "Failed" : step.state;
    return { ...pick(step, ["stepId", "taskDialogId", "displayName", "state", "executionTime", "triggeredAt", "finishedAt",
      "parentStepKey", "planIdentifier"]),
      subtitle: "Deep reasoning", offlineReasoning: {
        name: "Reasoning", text: step.offlineReasoning?.text ?? step.thought,
        status, duration: hasStepTiming(step) ? fmtMs(stepDurationMs(step)) : undefined,
      } } as StepExecution;
  }
  return { ...safeHtmlEvidence(pick(step, executionKeys), calls, tasks) as StepExecution, subtitle: stepType(step, input) };
}

function activityCopy(activity: Activity, calls: Set<string>, tasks: Set<string>): Activity {
  return safeHtmlEvidence(pick(activity, ["id", "type", "name", "valueType", "timestamp", "timestampMs",
    "from", "text", "value", "attachments", "replyToId", "mergedSessionKey", "suggestedActions"]), calls, tasks) as Activity;
}

function localAttachment(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(localAttachment);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !["url", "contentUrl", "thumbnailUrl", "image"].includes(key)).map(([key, item]) => [key, localAttachment(item)]));
}

/** Captures only the typed props needed by existing presentation components, before the renderer import. */
export function captureOfflinePresentation(input: AnalysisReportInput, restrictedTasks = reasoningTaskIds(input)): OfflineConversationSnapshot {
  const safe = (value: unknown, calls: Set<string>) => safeHtmlEvidence(value, calls, restrictedTasks);
  const snapshot: OfflineConversationSnapshot = { transcriptData: { activities: [] }, exchanges: [],
    componentNames: {}, messageLabels: {}, turnDurationByMessageId: {},
    identity: { agentName: input.agentName, conversationId: input.conversation.generalInfo.conversationId || input.conversationId } };
  for (const [key, component] of Object.entries(input.componentNames)) {
    const restricted = restrictedTasks.has(key) || isReasoning({ stepId: "", taskDialogId: key }, input);
    snapshot.componentNames[key] = structuredClone(pick(component, restricted ? ["name", "modelDisplayName"] :
      ["name", "description", "modelDisplayName", "modelDescription", "triggerQueries", "componentType"]) as typeof component);
  }
  const sessions = new Map<string, number>();
  for (const activity of input.transcript.raw.activities) {
    if (activity.valueType === "SessionInfo") {
      const key = activity.mergedSessionKey ?? "__single__";
      if (!sessions.has(key)) sessions.set(key, sessions.size + 1);
    }
  }
  const safeActivities = new Set(recommendationTranscript(input).turns.flatMap(turn => turn.activities));
  const standardRoles = input.transcript.raw.activities.some(activity => activity.type === "message" && activity.from?.role === 0);
  let turnNumber = 0;
  const groups = exchanges(input.transcript.turns);
  const ownedAgents = ownedAgentsByExchange(groups, input.connectedAgents);
  for (const [index, group] of groups.entries()) {
    const first = group[0];
    const session = sessionKey(first);
    if (!sessions.has(session)) sessions.set(session, sessions.size + 1);
    const label = `Session ${sessions.get(session)} | ${first.role === "user" ? `Turn ${++turnNumber}` : "Conversation start"}`;
    const calls = reasoningCallIds(group, input);
    const sourceActivities = [...new Set(group.flatMap(turn => turn.activities))];
    const ids = new Map<string, string>();
    for (const activity of sourceActivities) {
      if (activity.id && !ids.has(activity.id)) ids.set(activity.id, `message-${index}-${ids.size}`);
    }
    const messageId = ids.get(first.id) ?? `message-${index}-start`;
    ids.set(first.id, messageId);
    const activities = sourceActivities.filter(activity => safeActivities.has(activity) &&
      (activity.type === "message" || eventNames.has(activity.name ?? activity.valueType ?? "")))
      .map(activity => activityCopy(activity, calls, restrictedTasks));
    for (const activity of activities) {
      if (activity.id) activity.id = ids.get(activity.id) ?? activity.id;
      if (activity.replyToId) activity.replyToId = ids.get(activity.replyToId) ?? activity.replyToId;
      if (activity.type === "message") {
        const owner = group.find(turn => ids.get(turn.id) === activity.id);
        activity.text = activity.text ?? owner?.content;
        activity.from = { ...activity.from, id: activity.from?.id ?? "",
          role: owner ? owner.role === "user" ? "user" : "bot" : isUserMessageActivity(activity, standardRoles) ? "user" : "bot" };
        activity.timestamp = activity.timestamp ?? owner?.timestamp ?? "";
        activity.attachments = localAttachment(activity.attachments) as unknown[];
        const chat = activity as ChatActivity;
        if (chat.suggestedActions) chat.suggestedActions = localAttachment(chat.suggestedActions) as ChatActivity["suggestedActions"];
        snapshot.messageLabels[activity.id ?? ""] = label;
      }
    }
    for (const turn of group) {
      const id = ids.get(turn.id) ?? `message-${index}-${activities.length}`;
      if (!activities.some(activity => activity.type === "message" && activity.id === id)) {
        activities.push({ id, type: "message", text: turn.content, timestamp: turn.timestamp,
          from: { id: "", role: turn.role === "user" ? "user" : "bot" } });
        snapshot.messageLabels[id] = label;
      }
    }
    const executions = group.flatMap(turn => turn.debugInfo?.stepExecutions ?? []);
    const projected = executions.map(step => projectExecution(step, input, calls, restrictedTasks));
    projected.push(...classicActivityExecutions(activities, executions).map(({ step }) => projectExecution(step, input, calls, restrictedTasks)));
    for (const activity of activities.filter(activity => /^ToolCallTrace:/.test(activity.name ?? ""))) {
      const value = record(activity.value);
      if (typeof value.toolCallId !== "string" || projected.some(step => step.stepId === value.toolCallId)) continue;
      projected.push({ stepId: value.toolCallId, taskDialogId: String(value.toolName ?? "CapturedToolCall"),
        displayName: String(value.toolDisplayName ?? value.toolName ?? "Observed tool event"),
        subtitle: restrictedTasks.has(String(value.toolName)) ? "Deep reasoning" : undefined,
        state: typeof value.toolCallStatus === "string" ? value.toolCallStatus : undefined });
    }
    for (const activity of sourceActivities.filter(activity => isReasoningActivity(activity, input) ||
      restrictedTasks.has(String(record(activity.value).taskDialogId ?? record(activity.value).toolName ?? "")))) {
      const value = record(activity.value);
      const stepId = String(value.toolCallId ?? value.stepId ?? `reasoning-${projected.length}`);
      if (!projected.some(step => step.stepId === stepId)) {
        projected.push({ stepId, taskDialogId: String(value.taskDialogId ?? value.toolName ?? "GEN:ThinkingTrace"),
          subtitle: "Deep reasoning",
          displayName: "Reasoning", state: typeof value.state === "number" || typeof value.state === "string" ? value.state :
            typeof value.toolCallStatus === "string" ? value.toolCallStatus : undefined,
          triggeredAt: activity.timestamp === undefined ? undefined : String(activity.timestamp) });
      }
    }
    const debugInfo: ProcessedDebugInfo = {};
    for (const turn of group) Object.assign(debugInfo, safe(pick(turn.debugInfo ?? {}, debugKeys), calls));
    projected.splice(0, projected.length, ...projected.map(step => projectExecution(step, input, calls, restrictedTasks)));
    debugInfo.stepExecutions = projected;
    const turn: ProcessedTurn = { id: messageId, role: first.role, content: first.content, timestamp: first.timestamp,
      activities, debugInfo };
    for (const step of projected.filter(step => !isReasoning(step, input) && !calls.has(step.stepId))) {
      const observed = observedToolEvidence(step, sourceActivities);
      if (observed.evidence.correlationQuality !== "ambiguous") {
        for (const event of observed.events) {
          const value = record(event.value);
          for (const parameters of [value.filledParameters, value.hiddenFilledParameters]) {
            if (parameters && typeof parameters === "object" && !Array.isArray(parameters)) {
              Object.assign(step.arguments ??= {}, safe(parameters, calls));
            }
          }
          if (value.result !== undefined) step.observation = safe(value.result, calls);
          if (typeof value.errorMessage === "string") step.errorMessage = value.errorMessage;
        }
      }
    }
    const connectedAgents = ownedAgents[index].map((agent, childIndex): ConnectedAgentInfo => {
      const childInput = { ...input, transcript: { ...input.transcript, turns: agent.childTranscript ?? [],
        raw: { activities: (agent.childTranscript ?? []).flatMap(childTurn => childTurn.activities) } }, connectedAgents: [] };
      const child = captureOfflinePresentation(childInput, restrictedTasks);
      const childCalls = reasoningCallIds(childInput.transcript.turns, childInput);
      const childTurns = child.exchanges.map((exchange, childTurnIndex) => ({
        ...exchange.turn, id: `child-${index}-${childIndex}-${childTurnIndex}`,
      }));
      return {
        ...pick(agent, ["agentKind", "botSchemaName", "sessionId", "parentBotSchemaName", "dialogSchemaName",
          "displayName", "childConversationId", "executionTime", "executionTimeSeconds", "stepId", "parentReplyToId",
          "isFetched", "isFetching", "fetchError"]),
        childTopics: agent.childTopics.map(topic => {
          const step = projectExecution({ ...topic, taskDialogId: topic.schemaId, stepId: topic.stepId ?? "" }, childInput, childCalls, restrictedTasks);
          return { ...pick(topic, ["displayName", "schemaId", "executionTime", "executionTimeSeconds",
            "hasExecution", "stepId", "state"]), type: step.subtitle, arguments: step.arguments, observation: step.observation,
            offlineReasoning: step.offlineReasoning };
        }), childTranscript: childTurns,
      } as ConnectedAgentInfo;
    });
    snapshot.exchanges.push({ label, messageId, turn, connectedAgents });
    const { startMs, endMs } = turnTimeBounds(group);
    snapshot.turnDurationByMessageId[messageId] = endMs - startMs;
    snapshot.transcriptData.activities.push(...activities as ChatActivity[]);
  }
  return structuredClone(snapshot);
}
