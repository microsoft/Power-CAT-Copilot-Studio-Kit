import type { AnalysisReportInput, AnalysisReportStep } from "../contracts/analysis-report";
import type { Activity, ProcessedTurn, StepExecution } from "../contracts/transcript";
import { buildFlowSteps, resolveBestTitle } from "./build-flow-steps";
import { fmtMs } from "./format-ms";
import { completeHtmlEvidence, observedToolEvidence, safeHtmlEvidence } from "./html-report-evidence";
import { isReasoningActivity, recommendationTranscript, stepType } from "./report-privacy";
import { reportEvidence } from "./report-evidence";
import { stepDurationMs } from "./timeline-insights";
import { hasStepTiming } from "./turn-timing";

function value(activity: Activity): Record<string, unknown> {
  return activity.value && typeof activity.value === "object" && !Array.isArray(activity.value)
    ? activity.value as Record<string, unknown> : {};
}

function metadata(values: Record<string, unknown>): AnalysisReportStep["blocks"] {
  return [{ kind: "fields", fields: Object.entries(values).filter(([, item]) => item !== undefined)
    .map(([label, item]) => ({ label, value: String(item) })) }];
}

/** Projects recorded classic events only when the parser supplied no execution for that identity. */
export function classicActivityExecutions(activities: Activity[], executions: StepExecution[]): Array<{ step: StepExecution; events: Activity[] }> {
  const groups = new Map<string, Activity[]>();
  for (const activity of activities) {
    if (!/^DynamicPlanStep(?:Triggered|BindUpdate|Finished|Blocked)$/.test(activity.name ?? activity.valueType ?? "")) continue;
    const data = value(activity);
    if (typeof data.taskDialogId !== "string" || executions.some(step => step.taskDialogId === data.taskDialogId &&
      (!data.stepId || step.stepId === data.stepId))) continue;
    const key = JSON.stringify([data.taskDialogId, data.stepId ?? ""]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(activity);
  }
  return [...groups.values()].map(events => {
    const first = value(events[0]);
    const start = events.find(a => (a.name ?? a.valueType) === "DynamicPlanStepTriggered");
    const binds = events.filter(a => (a.name ?? a.valueType) === "DynamicPlanStepBindUpdate");
    const finish = events.find(a => (a.name ?? a.valueType) === "DynamicPlanStepFinished");
    const end = finish ? value(finish) : {};
    const step: StepExecution = { stepId: String(first.stepId ?? ""), taskDialogId: String(first.taskDialogId),
      state: typeof end.state === "number" || typeof end.state === "string" ? end.state : undefined,
      executionTime: typeof end.executionTime === "string" ? end.executionTime : undefined,
      triggeredAt: start?.timestamp !== undefined ? String(start.timestamp) : undefined,
      finishedAt: finish?.timestamp !== undefined ? String(finish.timestamp) : undefined };
    const type = start ? value(start).type : first.type;
    if (typeof type === "string") step.type = type;
    for (const bind of binds) Object.assign(step.arguments ??= {}, value(bind).arguments);
    step.observation = end.observation;
    return { events, step };
  });
}

function classicFallbacks(activities: Activity[], executions: StepExecution[], input: AnalysisReportInput, reasoningCalls: Set<string>): AnalysisReportStep[] {
  return classicActivityExecutions(activities, executions).map(({ events, step }) => {
    const binds = events.filter(a => (a.name ?? a.valueType) === "DynamicPlanStepBindUpdate");
    const reasoning = reasoningCalls.has(step.stepId) || events.some(a => isReasoningActivity(a, input));
    const status = step.state === 1 ? "Completed" : step.state === 0 ? "Running" : step.state === 2 ? "Failed" : step.state ?? "Not recorded";
    return {
      heading: reasoning ? "Reasoning" : `${resolveBestTitle(step.taskDialogId, undefined, input.componentNames)} | ${stepType(step, input)}`,
      category: reasoning ? "reasoning" : "tool",
      blocks: [
        ...metadata({ Status: status, Duration: hasStepTiming(step) ? fmtMs(stepDurationMs(step)) : undefined,
          Start: step.triggeredAt, Completion: step.finishedAt }),
        ...(reasoning ? [] : [
          ...metadata({ "Parsed execution ID": step.stepId || "Not recorded",
            "Correlation quality": events.filter(a => (a.name ?? a.valueType) === "DynamicPlanStepTriggered").length > 1
              ? "Ambiguous classic events" : "Classic activity-only fallback; no ToolCallTrace evidence" }),
          { kind: "heading" as const, text: "Recorded inputs" },
          ...binds.flatMap(a => reportEvidence(safeHtmlEvidence(value(a).arguments, reasoningCalls))),
          { kind: "heading" as const, text: "Recorded result" },
          ...reportEvidence(safeHtmlEvidence(step.observation, reasoningCalls)),
          ...completeHtmlEvidence("Complete classic execution evidence", events.map(a => ({
            name: a.name ?? a.valueType, timestamp: a.timestamp ?? a.timestampMs, value: a.value,
          })), reasoningCalls),
        ]),
      ],
    };
  });
}

/** Adds safe unmatched tool, classic fallback and diagnostic nodes without changing parser ownership. */
export function htmlActivitySteps(group: ProcessedTurn[], executions: StepExecution[], input: AnalysisReportInput, reasoningCalls: Set<string>): AnalysisReportStep[] {
  const activities = [...new Set(group.flatMap(turn => turn.activities))];
  const result: AnalysisReportStep[] = classicFallbacks(activities, executions, input, reasoningCalls);
  const unmatched = new Set(activities.filter(a => /^ToolCallTrace:/.test(a.name ?? "") &&
    typeof value(a).toolCallId === "string").map(a => String(value(a).toolCallId))
    .filter(id => !executions.some(step => step.stepId === id)));
  for (const id of unmatched) {
    const observed = observedToolEvidence({ stepId: id, taskDialogId: "" }, activities);
    if (reasoningCalls.has(id) || observed.events.some(event => isReasoningActivity(event, input))) {
      result.push({ heading: "Reasoning", category: "reasoning", blocks: metadata({
        Status: observed.evidence.toolCallStatus, Duration: observed.evidence.recordedDuration,
        Start: observed.evidence.startedAt, Completion: observed.evidence.completedAt,
      }) });
    } else result.push({ heading: "Observed tool event | No parsed execution", category: "tool",
      observedEvidence: observed.evidence,
      blocks: completeHtmlEvidence("Unmatched recorded tool events", observed.events.map(event => ({
        name: event.name, timestamp: event.timestamp ?? event.timestampMs, value: event.value,
      })), reasoningCalls) });
  }
  const safeActivities = new Set(recommendationTranscript(input).turns.flatMap(turn => turn.activities));
  for (const turn of group) {
    const safeTurn = { ...turn, debugInfo: turn.debugInfo ?? {}, activities: turn.activities.filter(a => safeActivities.has(a)) };
    for (const node of buildFlowSteps(safeTurn, input.componentNames).filter(node => ["error", "vars", "condition"].includes(node.kind))) {
      result.push({ heading: `${node.title} | ${node.subtitle}`, category: "tool", blocks: completeHtmlEvidence("Recorded diagnostic", {
        title: node.title, type: node.subtitle, errorCode: node.errorCode, errorSubCode: node.errorSubCode,
        errorMessage: node.errorMessage, conditionBranch: node.conditionBranch,
        ...(node.activityIndex !== undefined ? { activity: safeTurn.activities[node.activityIndex]?.value,
          timestamp: safeTurn.activities[node.activityIndex]?.timestamp } : {}),
      }, reasoningCalls) });
    }
  }
  return result;
}
