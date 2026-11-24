import type { AnalysisReport, AnalysisReportBlock, AnalysisReportContentBlock, AnalysisReportInput, AnalysisReportStep } from "../contracts/analysis-report";
import type { Activity, ProcessedTurn, StepExecution } from "../contracts/transcript";
import { resolveBestTitle } from "./build-flow-steps";
import { fmtMs } from "./format-ms";
import { hasStepTiming } from "./turn-timing";
import { stepDurationMs } from "./timeline-insights";
import { normalizeTimestampMs } from "./transcript/timestamp";
import { reportEvidence } from "./report-evidence";
import { completeHtmlEvidence, observedToolEvidence, safeHtmlEvidence } from "./html-report-evidence";
import { exchanges, isReasoning, reasoningCallIds, reasoningTaskIds, sessionKey, stepType } from "./report-privacy";
import { htmlActivitySteps } from "./html-report-activities";
import { addHtmlMessageEvidence } from "./html-report-analysis";
import { conversationReportSummary } from "./conversation-report-summary";
import { captureOfflinePresentation } from "./offline-presentation";

const missing = "Not recorded";

function text(value: unknown): string {
  if (value === undefined || value === null || value === "") return missing;
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function fields(values: Record<string, unknown>): AnalysisReportContentBlock {
  return { kind: "fields", fields: Object.entries(values).map(([label, value]) => ({ label, value: text(value) })) };
}

function detail(label: string, value: unknown): AnalysisReportContentBlock[] {
  return [{ kind: "heading", text: label }, ...reportEvidence(value)];
}

function sessionNumbers(turns: ProcessedTurn[], activities: Activity[]): Map<string, number> {
  const numbers = new Map<string, number>();
  const add = (key: string) => {
    if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
  };
  // Match the workspace summaries: metadata-only sessions come before turn buckets.
  for (const activity of activities) {
    if (activity.valueType === "SessionInfo" && activity.value) add(activity.mergedSessionKey ?? "__single__");
  }
  for (const turn of turns) add(sessionKey(turn));
  return numbers;
}

function recordedSpan(start: unknown, end: unknown): boolean {
  const startMs = normalizeTimestampMs(start);
  const endMs = normalizeTimestampMs(end);
  return startMs !== undefined && endMs !== undefined && endMs >= startMs;
}

function stepStatus(step: StepExecution): string {
  if (step.blockedError) return "Blocked";
  if (step.errorMessage) return "Failed";
  if (typeof step.state === "number") {
    return step.state === 0 ? "Running" : step.state === 1 ? "Completed" : "Failed";
  }
  return step.state ? step.state[0].toUpperCase() + step.state.slice(1) : missing;
}

function addTurns(
  report: AnalysisReport,
  turns: ProcessedTurn[],
  input: AnalysisReportInput,
  prefix = "",
): void {
  const raw = prefix ? turns.flatMap((t) => t.activities) : input.transcript.raw.activities;
  const captureInput = prefix ? { ...input, transcript: { ...input.transcript, turns, raw: { activities: raw } } } : input;
  const restrictedTasks = reasoningTaskIds(captureInput);
  const numbers = sessionNumbers(turns, raw);
  const sessionNo = (turn: ProcessedTurn) => numbers.get(sessionKey(turn));
  const execution: AnalysisReportBlock[] = [];
  let turnNumber = 0;
  const seen = new Set<string>();
  for (const [exchangeIndex, group] of exchanges(turns).entries()) {
    const first = group[0];
    const label = first.role === "user" ? `Turn ${++turnNumber}` : "Conversation start";
    const executions = group.flatMap((turn) => turn.debugInfo?.stepExecutions ?? []).filter((step) => {
      const key = [sessionKey(first), exchangeIndex, step.taskDialogId, step.stepId, step.triggeredAt].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const reasoningCalls = reasoningCallIds(group, captureInput);
    const steps: AnalysisReportStep[] = [{
      heading: first.role === "user" ? "User prompt" : "Conversation start",
      category: "prompt",
      blocks: reportEvidence(first.role === "user" ? first.content : "No user prompt recorded for startup work."),
    }];
    const activities = [...new Set(group.flatMap(turn => turn.activities))];
    const traceValue = (step: StepExecution, names: string[]): Record<string, unknown> | undefined => {
      const activity = activities.find(a => names.includes(a.name ?? "") && a.value &&
        typeof a.value === "object" && "toolCallId" in a.value && a.value.toolCallId === step.stepId);
      return activity?.value as Record<string, unknown> | undefined;
    };
    for (const step of executions) {
      const name = resolveBestTitle(step.taskDialogId, step.displayName, input.componentNames);
      const type = stepType(step, input);
      const observed = observedToolEvidence(step, activities);
      const start = observed.evidence.correlationQuality === "ambiguous" ? undefined : traceValue(step, ["ToolCallTrace:Started"]);
      const completion = observed.evidence.correlationQuality === "ambiguous" ? undefined : traceValue(step, ["ToolCallTrace:Completed", "ToolCallTrace:Failed"]);
      const parameters = { ...step.arguments };
      for (const source of [start?.filledParameters, start?.hiddenFilledParameters,
        completion?.filledParameters, completion?.hiddenFilledParameters]) {
        if (source && typeof source === "object" && !Array.isArray(source)) Object.assign(parameters, source);
      }
      const category = isReasoning(step, input) || reasoningCalls.has(step.stepId) || restrictedTasks.has(step.taskDialogId)
        ? "reasoning" : type === "Skill" ? "skill" : "tool";
      const metadataValues = {
        Status: stepStatus(step),
        Duration: hasStepTiming(step) ? fmtMs(stepDurationMs(step)) : missing,
        ...(category !== "reasoning" ? { "Parsed execution ID": step.stepId || missing } : {}),
        ...(step.triggeredAt ? { Time: step.triggeredAt } : {}),
        ...(category !== "reasoning" && completion?.httpStatusCode !== undefined ? { "HTTP status": completion.httpStatusCode } : {}),
      };
      const metadata = Object.fromEntries(Object.entries(metadataValues)
        .filter(([, value]) => category === "tool" || value !== missing));
      const sourceResult = completion?.result ?? step.observation;
      const result = safeHtmlEvidence(sourceResult, reasoningCalls);
      const hasResult = result !== undefined && result !== null && result !== "";
      steps.push({ heading: category === "reasoning" && step.taskDialogId === "GEN:ThinkingTrace"
        ? "Reasoning" : `${name} | ${category === "reasoning" ? "Reasoning" : type || "Tool"}`, category,
        ...(step.parentStepKey ? { parentHeading: resolveBestTitle(step.parentStepKey.slice(0, step.parentStepKey.lastIndexOf(":")), undefined, input.componentNames) } : {}),
        ...(category !== "reasoning" ? { observedEvidence: observed.evidence } : {}),
        blocks: [
          ...(Object.keys(metadata).length ? [fields(metadata)] : []),
          ...(category === "reasoning" ? step.thought?.trim()
            ? [{ kind: "markdown" as const, text: step.thought }] : [] : [
          ...(category !== "skill" || Object.keys(parameters).length
            ? detail(category === "skill" ? "Input passed to skill" : "Input passed to tool", Object.keys(parameters).length
              ? safeHtmlEvidence(parameters, reasoningCalls) : undefined) : []),
          ...(category !== "skill" || hasResult ? detail("Result returned", result) : []),
          ...(step.errorMessage ? detail("Error", step.errorMessage) : []),
          ...(completion?.errorCode || completion?.errorMessage ? [
            fields({ ...(completion.errorCode ? { "Error code": completion.errorCode } : {}),
              ...(completion.errorMessage ? { "Error message": completion.errorMessage } : {}) }),
          ] : []),
          ...(step.blockedError ? detail("Blocked", step.blockedError) : []),
          ...completeHtmlEvidence("Complete recorded step evidence", step, reasoningCalls),
          ...completeHtmlEvidence("Observed tool events", observed.events.map(event => ({
            name: event.name, timestamp: event.timestamp ?? event.timestampMs, value: event.value,
          })), reasoningCalls),
          ]),
        ] });
    }
    steps.push(...htmlActivitySteps(group, executions, captureInput, reasoningCalls));
    const replies = group.filter(turn => turn.role === "assistant" && turn.content.trim()).map(turn => turn.content);
    steps.push({ heading: "Agent response", category: "response",
      blocks: reportEvidence(replies.length ? replies.join("\n\n") : undefined) });
    execution.push({ kind: "exchange", heading: `Session ${sessionNo(first)} | ${label}`, steps,
      messages: group.map(turn => ({
        role: turn.role, text: turn.content, timestamp: turn.timestamp, id: turn.id,
      })) });
  }
  report.sections.push({ heading: `${prefix}Tool call trace`, blocks: execution.length ? execution : [
    { kind: "text", text: "No tool calls were identified in the available analysis. This does not establish that no tools were used." },
  ] });
  addHtmlMessageEvidence(report, turns, captureInput, prefix);
}

/** Captures recorded conversation flows across all sessions without fetching or mutating analysis. */
export function buildAnalysisReport(input: AnalysisReportInput, generatedAt = new Date()): AnalysisReport {
  const id = input.conversationId || input.conversation.id || "conversation";
  const safeId = Array.from(id.replace(/[<>:"/\\|?*]/g, "_"))
    .filter((c) => c.charCodeAt(0) >= 32).join("").slice(0, 120).replace(/[. ]+$/g, "") || "conversation";
  const numbers = sessionNumbers(input.transcript.turns, input.transcript.raw.activities);
  const report: AnalysisReport = {
    title: "Agent Debugger analysis",
    filename: `agent-debugger-${safeId}.html`,
    sections: [{
      heading: "Conversation summary",
      blocks: [
        fields({ ...conversationReportSummary(input), "Captured at": generatedAt.toISOString() }),
        ...input.warnings.map((warning): AnalysisReportBlock => ({ kind: "text", text: `Analysis warning: ${warning}` })),
      ],
    }, {
      heading: "Sessions",
      blocks: input.sessions.length ? input.sessions.flatMap((s): AnalysisReportBlock[] => [
        { kind: "heading", category: "group", text: `Session ${s.n} | ${text(s.type)} | ${text(s.outcome)}` },
        fields({ Start: s.startTimeUtc, End: s.endTimeUtc,
          Duration: recordedSpan(s.startTimeUtc, s.endTimeUtc)
            ? fmtMs(normalizeTimestampMs(s.endTimeUtc)! - normalizeTimestampMs(s.startTimeUtc)!) : missing,
          "User turns": input.transcript.turns.filter(turn =>
            turn.role === "user" && numbers.get(sessionKey(turn)) === s.n).length }),
      ]) : [{ kind: "text", text: "Session details not recorded." }],
    }],
  };
  addTurns(report, input.transcript.turns, input);
  const children = new Set<string>();
  if (input.connectedAgents.length) {
    report.sections.push({
      heading: "Connected agent availability",
      blocks: [{
        kind: "table", columns: ["Invocation", "Agent", "Details"],
        rows: input.connectedAgents.map((agent, index) => [
          String(index + 1),
          resolveBestTitle(agent.dialogSchemaName || agent.botSchemaName, agent.displayName, input.componentNames),
          agent.fetchError ? `Failed to load: ${agent.fetchError}` :
            agent.isFetching ? "Still loading at capture time" : agent.isFetched ? "Loaded" : "Not loaded",
        ]),
      }],
    });
  }
  for (const agent of input.connectedAgents) {
    const childKey = agent.childConversationId || agent.sessionId;
    const name = resolveBestTitle(agent.dialogSchemaName || agent.botSchemaName, agent.displayName, input.componentNames);
    if (agent.childTranscript?.length && !children.has(childKey)) {
      children.add(childKey);
      addTurns(report, agent.childTranscript, input, `${name} - `);
    }
  }
  report.offline = captureOfflinePresentation(input);
  report.offline.generalSections = structuredClone(report.sections.slice(0, 2).map(section => ({
    heading: section.heading,
    blocks: section.blocks.filter((block): block is AnalysisReportContentBlock => block.kind !== "exchange"),
  })));
  return report;
}
