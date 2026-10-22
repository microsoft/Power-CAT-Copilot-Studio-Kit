import type { UsageDiagnostics } from "../contracts/diagnostics.js";
import type { Activity, ProcessedTranscript, StepExecution } from "../contracts/transcript.js";
import { guessStepSubtitle } from "./step-classification.js";

export const CREDIT_RATE_REFERENCE = "https://learn.microsoft.com/microsoft-copilot-studio/requirements-messages-management#copilot-credits-billing-rates";
export const CREDIT_RATES = { classicAnswer: 1, generativeAnswer: 2, agentAction: 5 } as const;

const RESPONSE_KEYS = [
  "summarizationOpenAIResponse", "queryRewrittingOpenAIResponse",
  "queryRewritingOpenAIResponse", "completionOpenAIResponse", "openAIResponse",
];
const ACTION_TYPES = new Set(["Flow", "Tool", "Skill", "Connected agent", "Child agent", "Connector Action", "Code"]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function number(value: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = value[key];
    if (typeof raw !== "number" && !(typeof raw === "string" && raw.trim())) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function usageObjects(activity: Activity): Array<{ path: string; value: Record<string, unknown> }> {
  const out: Array<{ path: string; value: Record<string, unknown> }> = [];
  const value = record(activity.value);
  const feedback = record(record(activity.channelData)?.["pva:gpt-feedback"]);
  for (const [prefix, source] of [["value", value], ["feedback", feedback]] as const) {
    if (!source) continue;
    const direct = record(source.CapiResourceUsage) ?? record(source.usageMetrics);
    if (direct) {
      out.push({ path: `${prefix}.usage`, value: direct });
      continue;
    }
    for (const key of RESPONSE_KEYS) {
      const response = record(source[key]);
      if (!response) continue;
      out.push({
        path: `${prefix}.${key.replace("queryRewritting", "queryRewriting")}`,
        value: { ...(record(response.CapiResourceUsage) ?? response), RequestId: response.RequestId ?? response.requestId ?? record(response.CapiResourceUsage)?.RequestId },
      });
    }
    const prediction = record(record(source.observation)?.predictionOutput);
    if (prediction) out.push({ path: `${prefix}.predictionOutput`, value: record(prediction.CapiResourceUsage) ?? prediction });
  }
  return out;
}

function completed(step: StepExecution): boolean {
  if (step.errorMessage || step.blockedError) return false;
  if (typeof step.state === "number") return step.state === 1;
  if (/fail|error|exception|cancel|block|skip|running|pending|progress/i.test(String(step.state ?? ""))) return false;
  return Boolean(step.finishedAt) || /complete|success|succeed|done/i.test(String(step.state ?? ""));
}

export function deriveUsageInsights(
  transcript: ProcessedTranscript,
  experience: "classic" | "generative",
): UsageDiagnostics {
  const reported: UsageDiagnostics["reported"] = {
    tokenRecords: 0, creditRecords: 0, models: [], source: "not-reported",
  };
  type Metrics = Pick<UsageDiagnostics["reported"], "copilotCredits" | "aiBuilderCredits" | "promptTokens" | "completionTokens" | "totalTokens">;
  const observations = new Map<string, Metrics>();
  let hasRawUsage = false;
  const addUsage = (value: Record<string, unknown>, key: string) => {
    const observed = observations.get(key) ?? {};
    const copilot = number(value, "CopilotCredits", "copilotCredits");
    const aiBuilder = number(value, "AIBuilderCredits", "aiBuilderCredits");
    const prompt = number(value, "PromptTokens", "promptTokens");
    const completion = number(value, "CompletionTokens", "completionTokens");
    const directTotal = number(value, "TotalTokens", "totalTokens");
    for (const [field, metric] of [
      ["copilotCredits", copilot], ["aiBuilderCredits", aiBuilder], ["totalTokens", directTotal],
      ["promptTokens", prompt], ["completionTokens", completion],
    ] as const) {
      if (metric !== undefined) observed[field] = metric;
    }
    const model = value.ModelName ?? value.model;
    if (typeof model === "string" && model.trim() && !reported.models.includes(model.trim())) {
      reported.models.push(model.trim());
    }
    observations.set(key, observed);
  };

  transcript.raw.activities.forEach((activity, index) => {
    for (const usage of usageObjects(activity)) {
      hasRawUsage = true;
      const requestId = usage.value.RequestId ?? usage.value.requestId;
      const activityId = typeof activity.id === "string" && activity.id.trim() ? activity.id : `index:${index}`;
      const identity = typeof requestId === "string" && requestId.trim()
        ? `request:${requestId.trim()}` : `${activityId}:${usage.path}`;
      addUsage(usage.value, `${activity.mergedSessionKey ?? ""}:${identity}`);
    }
  });
  if (!hasRawUsage) {
    // Turn summaries and step observations can describe the same request.
    // Prefer the turn summary; use step records only when that summary is absent.
    for (const turn of transcript.turns) {
      if (turn.debugInfo?.tokenInfo) {
        addUsage({ ...turn.debugInfo.tokenInfo }, `turn:${turn.id}`);
      } else {
        for (const step of turn.debugInfo?.stepExecutions ?? []) {
          if (step.tokenInfo) addUsage({ ...step.tokenInfo }, `step:${turn.id}:${step.taskDialogId}:${step.stepId}`);
        }
      }
    }
  }
  for (const observed of observations.values()) {
    const total = observed.totalTokens ?? (observed.promptTokens !== undefined && observed.completionTokens !== undefined ? observed.promptTokens + observed.completionTokens : undefined);
    if (total !== undefined) observed.totalTokens = total;
    if (observed.copilotCredits !== undefined || observed.aiBuilderCredits !== undefined) reported.creditRecords += 1;
    if (observed.totalTokens !== undefined || observed.promptTokens !== undefined || observed.completionTokens !== undefined) reported.tokenRecords += 1;
    for (const field of ["copilotCredits", "aiBuilderCredits", "totalTokens", "promptTokens", "completionTokens"] as const) {
      if (observed[field] !== undefined) reported[field] = (reported[field] ?? 0) + observed[field];
    }
  }
  if (hasRawUsage && (reported.tokenRecords || reported.creditRecords || reported.models.length)) reported.source = "activity-usage";
  if (!hasRawUsage && reported.tokenRecords) reported.source = "processed-token-observations";

  const executions: StepExecution[] = [];
  const executionKeys = new Set<string>();
  for (const turn of transcript.turns) {
    const session = turn.activities.find((activity) => activity.mergedSessionKey)?.mergedSessionKey ?? "";
    for (const step of turn.debugInfo?.stepExecutions ?? []) {
      const key = `${session}:${step.planIdentifier || step.triggeredAt || turn.id}:${step.taskDialogId}:${step.stepId}`;
      if (executionKeys.has(key) || !completed(step)) continue;
      executionKeys.add(key);
      executions.push(step);
    }
  }
  const typeOf = (step: StepExecution) =>
    step.subtitle || guessStepSubtitle(step.taskDialogId, step.type, undefined, step.observation);
  const actions = executions.filter((step) => ACTION_TYPES.has(typeOf(step))).length;
  const knowledge = experience === "generative"
    ? executions.filter((step) => typeOf(step) === "Knowledge").length : 0;
  let userSeen = false;
  const classicAnswers = experience === "classic" ? transcript.turns.filter((turn) => {
    if (turn.role === "user") { userSeen = true; return false; }
    if (!userSeen || !turn.content.trim()) return false;
    userSeen = false;
    return true;
  }).length : 0;
  const groups: UsageDiagnostics["groups"] = [];
  const add = (kind: string, label: string, count: number, rate: number, confidence: "low" | "medium", evidence: string) => {
    if (count) groups.push({ kind, label, count, rate, credits: count * rate, confidence, evidence });
  };
  add("actions", "Completed agent actions", actions, CREDIT_RATES.agentAction, "medium", "Completed tool, flow, skill, or connected-agent execution.");
  add("knowledge", "Knowledge answer signals", knowledge, CREDIT_RATES.generativeAnswer, "low", "Assumes one generative answer per completed knowledge search; a search is not proof of a billed answer.");
  add("classic", "Classic response signals", classicAnswers, CREDIT_RATES.classicAnswer, "low", "Assumes one classic answer per recorded response to a user turn.");
  return {
    reported,
    estimatedCredits: groups.length ? groups.reduce((sum, group) => sum + group.credits, 0) : undefined,
    confidence: !groups.length ? "none" : groups.some((group) => group.confidence === "low") ? "low" : "medium",
    groups,
    notes: [
      "This is a diagnostic estimate, not a billing statement. Reported metrics and estimates are separate.",
      "Only saved parent-agent data included in this analysis is counted (up to 500 transcript records). Connected-agent internal usage can be missing.",
      "Licensing, tenant Graph grounding, internal flow action units, content-processing units, AI-tool rates, and voice meters are not calculated.",
      "Failed attempts and generative replies without a recorded answer signal are excluded. Excluded work can still consume credits.",
      "Token fields are reported observations, not proof of complete token usage. Turn summaries are not added to their step observations.",
      "Direct activity usage fields take priority over nested response fields. This avoids adding summary usage twice.",
    ],
  };
}
