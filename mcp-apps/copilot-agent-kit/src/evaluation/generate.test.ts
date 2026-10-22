import assert from "node:assert/strict";
import { test } from "node:test";
import { selectGeneratedCases } from "./generate.js";
import type { EvaluationCase } from "./contracts.js";

function candidate(id: string, conversationId: string, question: string, options: { failed?: boolean; steps?: number; answer?: string } = {}): EvaluationCase {
  const path = Array.from({ length: options.steps ?? 1 }, (_, index) => ({ name: `step-${index}`, kind: "tool", recordedState: options.failed && index === 0 ? "failed" : "completed" }));
  return {
    id, question, outcome: options.failed ? "recorded-failure" : "recorded-success", path, pathKey: id,
    turns: [{ question, observedResponse: options.answer ?? `Answer to ${question}`, expectedResponse: "", userTurnId: `${id}-u`, assistantTurnIds: [`${id}-a`] }],
    provenance: { conversationId, transcriptId: `${conversationId}-t`, userTurnIds: [`${id}-u`], activityIds: [] },
  };
}

test("generated cases rank recorded failures first, then longer recorded paths", () => {
  const output = selectGeneratedCases([
    candidate("a", "c1", "Check the window display please", { steps: 2 }),
    candidate("b", "c2", "Find the planogram for Store 104", { failed: true, steps: 1 }),
    candidate("c", "c3", "Plan the fall refresh for Store 104", { steps: 7 }),
  ]);
  assert.deepEqual(output.map(item => item.id), ["b", "c", "a"]);
});

test("generated cases drop duplicate questions and short context-dependent follow-ups", () => {
  const output = selectGeneratedCases([
    candidate("a", "c1", "Audit bay W-3 against the standards"),
    candidate("b", "c1", "Thanks for trying"),
    candidate("c", "c2", "audit bay  W-3 against the standards"),
    candidate("d", "c3", "Hi"),
  ]);
  assert.deepEqual(output.map(item => item.id), ["a", "d"]);
});

test("generated expectations are pre-filled from the recorded answer and marked for review", () => {
  const [item] = selectGeneratedCases([candidate("a", "c1", "Summarize the standards", { answer: "Recorded answer" })]);
  assert.equal(item.turns[0].expectedResponse, "Recorded answer");
  assert.equal(item.turns[0].observedResponse, "Recorded answer");
  assert.equal(item.expectationSource, "recorded-response");
  assert.deepEqual(item.recordedMessages?.map(message => message.role), ["user", "assistant"]);
  assert.equal(item.recordedMessageCount, 2);
});

test("generated cases respect the case limit and skip multi-turn candidates", () => {
  const many = Array.from({ length: 15 }, (_, index) => candidate(`id-${index}`, `c-${index}`, `Distinct question number ${index} for the agent`));
  const multi = { ...candidate("multi", "c-x", "Multi turn question for the agent"), turns: [...candidate("x", "c-x", "q1 is long enough to keep").turns, ...candidate("y", "c-x", "q2 is long enough to keep").turns] };
  const output = selectGeneratedCases([multi, ...many], 10);
  assert.equal(output.length, 10);
  assert.ok(!output.some(item => item.id === "multi"));
});
