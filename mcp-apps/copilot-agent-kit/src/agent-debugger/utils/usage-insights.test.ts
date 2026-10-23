import assert from "node:assert/strict";
import test from "node:test";
import type { Activity, ProcessedTranscript, StepExecution } from "../contracts/transcript.js";
import { deriveUsageInsights } from "./usage-insights.js";

function transcript(activities: Activity[] = [], steps: StepExecution[] = []): ProcessedTranscript {
  return {
    generalInfo: { durationMs: 0, turnCount: 1 },
    turns: [
      { id: "user", role: "user", content: "Help", timestamp: "2026-10-07T10:00:00.000Z", activities: [] },
      { id: "assistant", role: "assistant", content: "Here is a response.", timestamp: "2026-10-07T10:00:01.000Z", activities: [], debugInfo: { stepExecutions: steps } },
    ],
    raw: { activities },
  };
}
const activity = (value: unknown, id = "usage"): Activity => ({ id, type: "event", value });
const step = (stepId: string, subtitle: string, state: string | number = "Completed"): StepExecution => ({
  stepId, taskDialogId: `agent.action.${stepId}`, subtitle, state,
  finishedAt: "2026-10-07T10:00:01.000Z",
});

test("missing usage stays unknown; answer length is not a generative billing signal", () => {
  const input = transcript();
  input.turns[1].content = "x".repeat(20000);
  const result = deriveUsageInsights(input, "generative");
  assert.equal(result.reported.totalTokens, undefined);
  assert.equal(result.reported.copilotCredits, undefined);
  assert.equal(result.estimatedCredits, undefined);
  assert.equal(result.confidence, "none");
});

test("reported zero remains zero and credit meters stay separate", () => {
  const result = deriveUsageInsights(transcript([activity({ CapiResourceUsage: { CopilotCredits: 0, AIBuilderCredits: 3, TotalTokens: 0, PromptTokens: 0, CompletionTokens: 0 } })]), "generative");
  assert.equal(result.reported.copilotCredits, 0);
  assert.equal(result.reported.aiBuilderCredits, 3);
  assert.equal(result.reported.totalTokens, 0);
  assert.equal(result.reported.tokenRecords, 1);
  assert.equal(result.estimatedCredits, undefined);
});

test("partial token fields do not invent missing totals or zero completion usage", () => {
  const result = deriveUsageInsights(transcript([activity({ openAIResponse: { CapiResourceUsage: { PromptTokens: 30, ModelName: "model" } } })]), "generative");
  assert.equal(result.reported.promptTokens, 30);
  assert.equal(result.reported.completionTokens, undefined);
  assert.equal(result.reported.totalTokens, undefined);
  assert.deepEqual(result.reported.models, ["model"]);
});

test("duplicates, aliases, request mirrors, and parsed summaries are not added twice", () => {
  const usage = { PromptTokens: 30, CompletionTokens: 10, TotalTokens: 40, RequestId: "request" };
  const raw = activity({ queryRewrittingOpenAIResponse: { CapiResourceUsage: usage }, queryRewritingOpenAIResponse: { CapiResourceUsage: usage } });
  const input = transcript([raw, raw, activity({ completionOpenAIResponse: { CapiResourceUsage: usage } }, "mirror")]);
  input.turns[1].debugInfo = { tokenInfo: { promptTokens: 30, completionTokens: 10, totalTokens: 40 } };
  const result = deriveUsageInsights(input, "generative");
  assert.equal(result.reported.totalTokens, 40);
  assert.equal(result.reported.tokenRecords, 1);
});

test("equal metrics on distinct response requests remain distinct observations", () => {
  const usage = { PromptTokens: 30, CompletionTokens: 10 };
  const result = deriveUsageInsights(transcript([activity({ queryRewritingOpenAIResponse: usage, summarizationOpenAIResponse: usage })]), "generative");
  assert.equal(result.reported.totalTokens, 80);
  assert.equal(result.reported.tokenRecords, 2);
});

test("empty activity and request identifiers do not collapse unrelated usage observations", () => {
  const result = deriveUsageInsights(transcript([
    activity({ openAIResponse: { RequestId: "", TotalTokens: 10 } }, ""),
    activity({ openAIResponse: { RequestId: "", TotalTokens: 20 } }, ""),
  ]), "generative");
  assert.equal(result.reported.totalTokens, 30);
  assert.equal(result.reported.tokenRecords, 2);
});

test("request fragments merge without double counts and later reported values win", () => {
  const result = deriveUsageInsights(transcript([
    activity({ openAIResponse: { RequestId: "request", PromptTokens: 10 } }, "a"),
    activity({ openAIResponse: { RequestId: "request", CompletionTokens: 5, PromptTokens: 20 } }, "b"),
  ]), "generative");
  assert.equal(result.reported.totalTokens, 25);
  assert.equal(result.reported.tokenRecords, 1);
});

test("direct usage summaries take priority and raw missing tokens do not become parsed zero", () => {
  const input = transcript([activity({ CapiResourceUsage: { CopilotCredits: 5 }, completionOpenAIResponse: { CopilotCredits: 5, TotalTokens: 90 } })]);
  input.turns[1].debugInfo = { tokenInfo: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  const result = deriveUsageInsights(input, "generative");
  assert.equal(result.reported.copilotCredits, 5);
  assert.equal(result.reported.totalTokens, undefined);
});

test("parsed token fallback does not add matching turn and step observations", () => {
  const input = transcript([], [{ ...step("tool", "Tool"), tokenInfo: { promptTokens: 20, completionTokens: 10, totalTokens: 30 } }]);
  input.turns[1].debugInfo!.tokenInfo = { promptTokens: 20, completionTokens: 10, totalTokens: 30 };
  const result = deriveUsageInsights(input, "generative");
  assert.equal(result.reported.totalTokens, 30);
  assert.equal(result.reported.source, "processed-token-observations");
});

test("only supported completed signals contribute to estimates", () => {
  const input = transcript([], [
    step("tool", "Tool"), step("knowledge", "Knowledge"), step("failed", "Flow", "Failed"),
    { ...step("blocked", "Tool"), blockedError: { code: "blocked", message: "blocked", reasonCode: "policy" } },
    { stepId: "running", taskDialogId: "agent.action.running", subtitle: "Tool", state: "Running" },
    step("unsupported", "AI Builder"),
  ]);
  const result = deriveUsageInsights(input, "generative");
  assert.equal(result.estimatedCredits, 7);
  assert.deepEqual(result.groups.map(group => [group.kind, group.count, group.rate]), [["actions", 1, 5], ["knowledge", 1, 2]]);
  assert.equal(result.confidence, "low");
  assert.ok(result.notes.some(note => note.includes("not a billing statement")));
});

test("repeated execution traces are counted once and classic response signals are explicit", () => {
  const action = step("tool", "Tool");
  const input = transcript([], [action, action]);
  const result = deriveUsageInsights(input, "classic");
  assert.equal(result.estimatedCredits, 6);
  assert.deepEqual(result.groups.map(group => [group.kind, group.count]), [["actions", 1], ["classic", 1]]);
  assert.equal(deriveUsageInsights({ ...input, turns: [] }, "classic").estimatedCredits, undefined);
});

test("successful numeric states and reused step IDs on distinct executions are counted correctly", () => {
  const first = { ...step("tool", "Tool", 1), triggeredAt: "2026-10-07T10:00:00.000Z", finishedAt: undefined };
  const second = { ...first, triggeredAt: "2026-10-07T10:01:00.000Z" };
  const running = { ...first, stepId: "running", state: 0 };
  const result = deriveUsageInsights(transcript([], [first, second, running]), "generative");
  assert.equal(result.estimatedCredits, 10);
  assert.equal(result.groups[0].count, 2);
});
