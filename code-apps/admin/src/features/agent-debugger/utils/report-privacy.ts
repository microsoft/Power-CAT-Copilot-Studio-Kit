import type { AnalysisReportInput } from "../contracts/analysis-report";
import type { Activity, ProcessedTranscript, ProcessedTurn, StepExecution } from "../contracts/transcript";
import { guessStepSubtitle } from "./step-classification";

/** Resolves the same recorded component type as the live debugger. */
export function stepType(step: StepExecution, input: AnalysisReportInput): string {
  return step.subtitle || guessStepSubtitle(step.taskDialogId, step.type, input.componentNames[step.taskDialogId], step.observation);
}

/** Identifies activities whose export is restricted to name, status and timing. */
export function isReasoning(step: StepExecution, input: AnalysisReportInput): boolean {
  return ["GEN:ThinkingTrace", "P:ReasonerTool"].includes(step.taskDialogId) ||
    ["Chain of thought", "Deep reasoning", "Thinking", "Intent Recognition"].includes(stepType(step, input));
}

/** Uses the same classifier for classic and orphan generative event identities. */
export function isReasoningActivity(activity: Activity, input: AnalysisReportInput): boolean {
  const value = activity.value && typeof activity.value === "object" && !Array.isArray(activity.value)
    ? activity.value as Record<string, unknown> : {};
  return isReasoning({ stepId: String(value.toolCallId ?? value.stepId ?? ""),
    taskDialogId: String(value.taskDialogId ?? value.toolName ?? ""),
    subtitle: typeof value.subtitle === "string" ? value.subtitle :
      typeof value.toolDisplayName === "string" ? value.toolDisplayName : undefined,
    type: typeof value.type === "string" ? value.type : undefined,
  }, input) || ["IntentRecognition", "Thinking"].includes(activity.valueType ?? activity.name ?? "");
}

/** Resolves restricted component identities from captured parent, child and raw-only evidence. */
export function reasoningTaskIds(input: AnalysisReportInput): Set<string> {
  const tasks = new Set(["GEN:ThinkingTrace", "P:ReasonerTool"]);
  const turns = [...input.transcript.turns, ...input.connectedAgents.flatMap(agent => agent.childTranscript ?? [])];
  const steps = [...turns.flatMap(turn => turn.debugInfo?.stepExecutions ?? []),
    ...input.connectedAgents.flatMap(agent => agent.childTopics.map(topic => ({
      ...topic, stepId: topic.stepId ?? "", taskDialogId: topic.schemaId,
    })))];
  for (const step of steps) if (isReasoning(step, input)) tasks.add(step.taskDialogId);
  for (const activity of [...input.transcript.raw.activities, ...turns.flatMap(turn => turn.activities)]) {
    if (!isReasoningActivity(activity, input)) continue;
    const value = activity.value as Record<string, unknown> | undefined;
    const task = value?.taskDialogId ?? value?.toolName;
    if (typeof task === "string" && task) tasks.add(task);
  }
  return tasks;
}

/** Collects scoped reasoning IDs before any payload, diagnostic or recommendation projection. */
export function reasoningCallIds(turns: ProcessedTurn[], input: AnalysisReportInput): Set<string> {
  const tasks = reasoningTaskIds(input);
  return new Set([
    ...turns.flatMap(turn => (turn.debugInfo?.stepExecutions ?? [])
      .filter(step => isReasoning(step, input) || tasks.has(step.taskDialogId)).map(step => step.stepId)),
    ...turns.flatMap(turn => turn.activities).filter(activity => {
      const value = activity.value as Record<string, unknown> | undefined;
      return isReasoningActivity(activity, input) || tasks.has(String(value?.taskDialogId ?? value?.toolName ?? ""));
    })
      .map(activity => {
        const value = activity.value as Record<string, unknown> | undefined;
        return String(value?.toolCallId ?? value?.stepId ?? "");
      }),
  ].filter(Boolean));
}

/** Returns the explicit merged session identity without temporal inference. */
export function sessionKey(turn: ProcessedTurn): string {
  return turn.activities.find((a) => a.mergedSessionKey)?.mergedSessionKey ?? "__single__";
}

/** Groups complete exchanges while preserving startup work and session boundaries. */
export function exchanges(turns: ProcessedTurn[]): ProcessedTurn[][] {
  const groups: ProcessedTurn[][] = [];
  for (const turn of turns) {
    const current = groups[groups.length - 1];
    if (turn.role === "user" || !current || sessionKey(current[0]) !== sessionKey(turn)) groups.push([turn]);
    else current.push(turn);
  }
  return groups;
}

/** Applies the export's reasoning boundary before diagnostic error enrichment. */
export function recommendationTranscript(input: AnalysisReportInput): ProcessedTranscript {
  const reasoningTurns = new Set<ProcessedTurn>();
  const reasoningTasks = reasoningTaskIds(input);
  const reasoningCalls = new Set<string>();
  const toolCalls = new Set<string>();
  const owners = new Map<Activity, ProcessedTurn>();
  const ownersById = new Map<string, ProcessedTurn>();
  const sessionOwners = new Map<string, Set<ProcessedTurn>>();
  const groupNumbers = new Map(exchanges(input.transcript.turns).flatMap((group, index) =>
    group.map(turn => [turn, index] as const)));
  const key = (session: string, id: unknown, owner?: ProcessedTurn) =>
    `${session}|${owner ? groupNumbers.get(owner) : "unknown"}|${String(id ?? "")}`;
  for (const turn of input.transcript.turns) {
    const session = sessionKey(turn);
    for (const activity of turn.activities) {
      owners.set(activity, turn);
      if (activity.id) {
        ownersById.set(key(session, activity.id, turn), turn);
        const identity = `${session}|${activity.id}`;
        if (!sessionOwners.has(identity)) sessionOwners.set(identity, new Set());
        sessionOwners.get(identity)!.add(turn);
      }
    }
    for (const step of turn.debugInfo?.stepExecutions ?? []) {
      if (isReasoning(step, input)) {
        reasoningTurns.add(turn);
        reasoningTasks.add(step.taskDialogId);
        if (step.stepId) reasoningCalls.add(key(session, step.stepId, turn));
      } else if (step.stepId) toolCalls.add(key(session, step.stepId, turn));
    }
  }
  for (const group of exchanges(input.transcript.turns)) {
    for (const activity of group.flatMap(turn => turn.activities).filter(activity => isReasoningActivity(activity, input))) {
      const value = activity.value as Record<string, unknown> | undefined;
      const id = value?.toolCallId ?? value?.stepId;
      for (const turn of group) {
        reasoningTurns.add(turn);
        if (id) reasoningCalls.add(key(sessionKey(turn), id, turn));
      }
    }
    if (group.some(turn => reasoningTurns.has(turn))) {
      for (const turn of group) reasoningTurns.add(turn);
    }
  }
  const keep = (activity: Activity) => {
    const value = activity.value && typeof activity.value === "object" && !Array.isArray(activity.value)
      ? activity.value as Record<string, unknown> : undefined;
    const container = owners.get(activity) ??
      ownersById.get(key(activity.mergedSessionKey ?? "__single__", activity.id));
    const replySession = container ? sessionKey(container) : activity.mergedSessionKey ?? "__single__";
    const replyCandidates = sessionOwners.get(`${replySession}|${activity.replyToId}`);
    const replyOwner = ownersById.get(key(replySession, activity.replyToId, container)) ??
      (replyCandidates?.size === 1 ? [...replyCandidates][0] : undefined);
    const owner = replyOwner?.role === "user" ? replyOwner : container ?? replyOwner;
    const session = owner ? sessionKey(owner) : activity.mergedSessionKey ?? "__single__";
    const call = key(session, value?.toolCallId ?? value?.stepId, owner);
    if (reasoningTasks.has(String(value?.taskDialogId ?? value?.toolName ?? "")) || reasoningCalls.has(call) ||
      isReasoningActivity(activity, input)) return false;
    // Unattributed errors sharing a reasoning exchange must not leak via recommendations.
    if (activity.valueType === "ErrorTraceData" && !toolCalls.has(call)) {
      return owner ? !reasoningTurns.has(owner) : reasoningTurns.size === 0;
    }
    return true;
  };
  return {
    ...input.transcript,
    raw: { ...input.transcript.raw, activities: input.transcript.raw.activities.filter(keep) },
    turns: input.transcript.turns.map(turn => ({
      ...turn, activities: turn.activities.filter(keep),
      ...(turn.debugInfo ? { debugInfo: { ...turn.debugInfo,
        stepExecutions: turn.debugInfo.stepExecutions?.filter(step => !isReasoning(step, input) &&
          !reasoningTasks.has(step.taskDialogId)),
      } } : {}),
    })),
  };
}
