import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConversationTranscriptJson } from "../agent-debugger/contracts/diagnostics.js";
import { mineEvaluationTranscript } from "./mining.js";

function transcript(pairs = 2): ConversationTranscriptJson {
  const activities = Array.from({ length: pairs }, (_, index) => [
    { id: `user-${index}`, type: "message", text: `Question ${index}`, from: { role: 1 }, timestamp: "2026-10-09T10:00:00Z" },
    { id: `agent-${index}`, type: "message", text: `Observed answer ${index}`, from: { role: 0 }, timestamp: "2026-10-09T10:00:01Z" },
  ]).flat();
  return { conversationId: "conversation-a", recordCount: 1, activityCount: activities.length,
    records: [{ conversationtranscriptid: "record-a", content: { activities } }] };
}
test("each single-response question keeps its exact evidence identity and a blank expectation", () => {
  const cases = mineEvaluationTranscript(transcript(), "single-response");
  assert.equal(cases.length, 2);
  assert.equal(cases[0].question, "Question 0");
  assert.equal(cases[1].question, "Question 1");
  assert.notEqual(cases[0].id, cases[1].id);
  assert.equal(cases[0].turns[0].expectedResponse, "");
  assert.equal(cases[0].turns[0].observedResponse, "Observed answer 0");
  assert.equal(cases[0].provenance.conversationId, "conversation-a");
  assert.equal(cases[0].provenance.transcriptId, "record-a");
  assert.deepEqual(cases[0].provenance.userTurnIds, ["user-0"]);
  assert.equal(cases[0].outcome, "unknown");
});
test("conversation drafts keep all ordered pairs rather than offering one pair as a full conversation", () => {
  const cases = mineEvaluationTranscript(transcript(7), "conversation");
  assert.equal(cases.length, 1);
  assert.equal(cases[0].turns.length, 7);
  assert.equal(cases[0].turns[6].question, "Question 6");
  assert.equal(cases[0].turns[6].expectedResponse, "");
});
test("different questions may share a path but cannot share their answer identity", () => {
  const cases = mineEvaluationTranscript(transcript(), "single-response");
  assert.equal(cases.length, 2);
  assert.equal(cases[0].pathKey, cases[1].pathKey);
  assert.notEqual(cases[0].id, cases[1].id);
  assert.notEqual(cases[0].turns[0].observedResponse, cases[1].turns[0].observedResponse);
});
test("case IDs are stable and distinguish equal turn IDs from different records", () => {
  const data = transcript(1);
  data.records.push({ ...structuredClone(data.records[0]), conversationtranscriptid: "record-b" });
  data.recordCount = 2;
  const first = mineEvaluationTranscript(data, "single-response");
  assert.equal(first.length, 2);
  assert.notEqual(first[0].id, first[1].id);
  assert.deepEqual(first, mineEvaluationTranscript(data, "single-response"));
});
test("malformed activities are visible errors, not empty successful drafts", () => {
  const data = transcript();
  data.records[0].content.activities.push({ type: 99, from: { role: "user" } });
  assert.throws(() => mineEvaluationTranscript(data, "single-response"), /activity/i);
});
test("ordered record fragments keep a question and its complete response with both original record identities", () => {
  const data = transcript(1);
  const [question, answer] = data.records[0].content.activities;
  data.records = [
    { conversationtranscriptid: "record-b", metadata: { BatchId: 1 }, conversationstarttime: "2026-10-09T10:00:00Z", content: { activities: [answer] } },
    { conversationtranscriptid: "record-a", metadata: { BatchId: 0 }, conversationstarttime: "2026-10-09T10:00:00Z", content: { activities: [question] } },
  ];
  data.recordCount = 2;
  const cases = mineEvaluationTranscript(data, "single-response");
  assert.equal(cases.length, 1);
  assert.equal(cases[0].turns[0].observedResponse, "Observed answer 0");
  assert.equal(cases[0].provenance.transcriptId, "record-a");
  assert.deepEqual(cases[0].provenance.transcriptIds, ["record-a", "record-b"]);
  assert.deepEqual(cases[0].provenance.activityIds, ["user-0", "agent-0"]);
});
test("one conversation ID can contain separate sessions without linking a response to a different session", () => {
  const data = transcript(1);
  const [question, answer] = data.records[0].content.activities;
  data.records = [
    { conversationtranscriptid: "session-a", conversationstarttime: "2026-10-09T10:00:00Z", content: { activities: [{ ...question, from: { role: "user" } }] } },
    { conversationtranscriptid: "session-b", conversationstarttime: "2026-10-09T11:00:00Z", content: { activities: [answer, { ...question, id: "user-b", text: "Question in session B" }] } },
  ];
  data.recordCount = 2;
  const single = mineEvaluationTranscript(data, "single-response");
  assert.equal(single[0].turns[0].observedResponse, "");
  assert.equal(single[1].turns[0].question, "Question in session B");
  const conversations = mineEvaluationTranscript(data, "conversation");
  assert.equal(conversations.length, 2);
});
