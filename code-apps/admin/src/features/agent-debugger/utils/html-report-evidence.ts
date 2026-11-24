import type { AnalysisReportContentBlock, ObservedToolEvidence } from "../contracts/analysis-report";
import type { Activity, StepExecution } from "../contracts/transcript";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const reasoningNames = /^(GEN:ThinkingTrace|P:ReasonerTool|Chain of thought|Deep reasoning|Thinking|Intent Recognition)$/i;

/** Removes private reasoning before any HTML-only payload is serialized. */
export function safeHtmlEvidence(value: unknown, reasoningCalls: ReadonlySet<string>, reasoningTasks: ReadonlySet<string> = new Set()): unknown {
  if (typeof value === "string" && /^[{[]/.test(value.trim())) {
    try {
      const parsed: unknown = JSON.parse(value);
      const safe = safeHtmlEvidence(parsed, reasoningCalls, reasoningTasks);
      return JSON.stringify(parsed) === JSON.stringify(safe) ? value : JSON.stringify(safe);
    } catch { return value; }
  }
  if (Array.isArray(value)) return value.map(item => safeHtmlEvidence(item, reasoningCalls, reasoningTasks));
  if (!record(value)) return value;
  const isReasoning = [value.taskDialogId, value.subtitle, value.type, value.toolName]
    .some(name => typeof name === "string" && (reasoningNames.test(name) || reasoningTasks.has(name))) ||
    [value.toolCallId, value.stepId].some(id => typeof id === "string" && reasoningCalls.has(id));
  const entries = Object.entries(value).filter(([key]) => isReasoning
    ? ["displayName", "taskDialogId", "state", "status", "triggeredAt", "finishedAt", "executionTime", "timestamp"].includes(key)
    : !/thought|reasoning|chain.?of.?thought/i.test(key));
  return Object.fromEntries(entries.map(([key, item]) => [key, safeHtmlEvidence(item, reasoningCalls, reasoningTasks)]));
}

/** Keeps the complete safe payload alongside the readable, protocol-unwrapped view. */
export function completeHtmlEvidence(label: string, value: unknown, reasoningCalls: ReadonlySet<string>): AnalysisReportContentBlock[] {
  if (value === undefined) return [];
  const safe = safeHtmlEvidence(value, reasoningCalls);
  const groups: Record<string, AnalysisReportContentBlock["exportProvenance"]> = {
    "Complete recorded step evidence": "step", "Observed tool events": "events",
    "Complete classic execution evidence": "events", "Unmatched recorded tool events": "events",
    "Recorded message evidence": "message",
  };
  const exportProvenance = groups[label];
  return [{ kind: "heading", text: label, exportProvenance }, { kind: "code", exportProvenance,
    text: typeof safe === "string" ? safe : JSON.stringify(safe, null, 2) }];
}

/** Matches only events already owned by the parsed exchange; never uses temporal attribution. */
export function observedToolEvidence(step: StepExecution, activities: Activity[]): {
  evidence: ObservedToolEvidence; events: Activity[];
} {
  const events = activities.filter(a => /^ToolCallTrace:(Started|Completed|Failed)$/.test(a.name ?? "") &&
    record(a.value) && a.value.toolCallId === step.stepId);
  const starts = events.filter(a => a.name === "ToolCallTrace:Started");
  const ends = events.filter(a => a.name !== "ToolCallTrace:Started");
  const ambiguous = starts.length > 1 || ends.length > 1;
  const start = !ambiguous && record(starts[0]?.value) ? starts[0].value : undefined;
  const end = !ambiguous && record(ends[0]?.value) ? ends[0].value : undefined;
  const string = (value: unknown) => value === undefined || value === null ? undefined : String(value);
  const hasQuery = (value: unknown): boolean => record(value)
    ? Object.entries(value).some(([key, item]) => /query|fetchxml|sql/i.test(key) && item !== undefined && item !== null ||
      hasQuery(item)) : Array.isArray(value) && value.some(hasQuery);
  return { events, evidence: {
    toolCallId: events.length ? step.stepId : undefined,
    toolCategory: string(start?.toolCategory ?? end?.toolCategory),
    startedAt: string(start?.timestamp ?? starts[0]?.timestamp ?? starts[0]?.timestampMs),
    completedAt: string(end?.timestamp ?? ends[0]?.timestamp ?? ends[0]?.timestampMs),
    recordedDuration: string(end?.durationMs ?? end?.duration ?? start?.durationMs),
    httpStatus: string(end?.httpStatusCode),
    errorCode: string(end?.errorCode),
    toolCallStatus: string(end?.toolCallStatus),
    queryAvailability: ambiguous ? "ambiguous" : [start, end].some(value =>
      hasQuery(value?.filledParameters) || hasQuery(value?.hiddenFilledParameters))
      ? "recorded" : "not-recorded",
    correlationQuality: ambiguous ? "ambiguous" : starts.length ? ends.length ? "matched" : "start-only"
      : ends.length ? "completion-only" : "missing",
  } };
}
