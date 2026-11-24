import type { AnalysisReportInput } from "../contracts/analysis-report";
import { fmtMs } from "./format-ms";
import { sessionKey } from "./report-privacy";
import { activityTimestampMs, normalizeTimestampMs } from "./transcript/timestamp";

/** Reconciles export summary fields against captured sessions and user turns, not UI defaults. */
export function conversationReportSummary(input: AnalysisReportInput): Record<string, unknown> {
  const { turns, raw } = input.transcript;
  const info = input.conversation.generalInfo;
  const recordedBySession = new Map<string, Record<string, unknown>>();
  for (const activity of raw.activities) {
    if (activity.valueType === "SessionInfo" && activity.value &&
      typeof activity.value === "object" && !Array.isArray(activity.value)) {
      recordedBySession.set(activity.mergedSessionKey ?? "__single__", activity.value as Record<string, unknown>);
    }
  }
  const recordedSessions = [...recordedBySession.values()];
  const sessions = input.sessions.length ? input.sessions : recordedSessions;
  const bounds = sessions.map(session => ({
    start: normalizeTimestampMs(session.startTimeUtc),
    end: normalizeTimestampMs(session.endTimeUtc),
  }));
  const valid = bounds.filter((span): span is { start: number; end: number } =>
    span.start !== undefined && span.end !== undefined && span.end >= span.start);
  const activityTimes = raw.activities.map(activityTimestampMs).filter((time): time is number => time !== undefined);
  const starts = bounds.flatMap(span => span.start === undefined ? [] : [span.start]);
  const start = starts.length ? Math.min(...starts) : activityTimes.length ? Math.min(...activityTimes) : undefined;
  const duration = sessions.length
    ? valid.length === sessions.length ? valid.reduce((total, span) => total + span.end - span.start, 0) : undefined
    : undefined;
  const outcomes = [...new Set(recordedSessions.flatMap(session =>
    typeof session.outcome === "string" && session.outcome.trim() ? [session.outcome.trim()] : []))];
  const completeOutcomes = sessions.length > 0 && recordedSessions.length === sessions.length &&
    recordedSessions.every(session => typeof session.outcome === "string" && !!session.outcome.trim());
  const models = [...new Set([
    info.modelName,
    ...turns.flatMap(turn => [turn.debugInfo?.tokenInfo?.model,
      ...(turn.debugInfo?.stepExecutions ?? []).map(step => step.tokenInfo?.model)]),
  ].filter((model): model is string => typeof model === "string" && !!model.trim()).map(model => model.trim()))];
  return {
    Agent: input.agentName,
    "Conversation ID": info.conversationId || input.conversationId || input.conversation.id,
    Environment: input.environmentUrl,
    Sessions: sessions.length || new Set(turns.map(sessionKey)).size,
    "User turns": turns.filter(turn => turn.role === "user").length,
    Outcome: completeOutcomes ? outcomes.length === 1 ? outcomes[0] : `Mixed (${outcomes.join(", ")})` : undefined,
    "Session duration": duration === undefined ? undefined : fmtMs(duration),
    Start: start === undefined ? undefined : new Date(start).toISOString(),
    Channel: info.channelId,
    Model: models.length ? models.join(", ") : undefined,
  };
}
