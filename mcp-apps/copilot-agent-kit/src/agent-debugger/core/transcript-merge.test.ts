import assert from "node:assert/strict";
import test from "node:test";
import { mergeConversationTranscriptRecords } from "./transcript-merge.js";

test("merges split transcript batches in session and batch order", () => {
  const merged = mergeConversationTranscriptRecords([
    {
      conversationtranscriptid: "batch-1",
      name: "conversation-42",
      conversationstarttime: "2026-09-24T10:00:00.000Z",
      metadata: JSON.stringify({ BatchId: 1 }),
      content: JSON.stringify({ activities: [{ id: "second" }] }),
    },
    {
      conversationtranscriptid: "session-2",
      name: "conversation-42",
      conversationstarttime: "2026-09-24T11:00:00.000Z",
      metadata: JSON.stringify({ BatchId: 0 }),
      content: JSON.stringify({ activities: [{ id: "third" }] }),
    },
    {
      conversationtranscriptid: "batch-0",
      name: "conversation-42",
      conversationstarttime: "2026-09-24T10:00:00.000Z",
      metadata: JSON.stringify({ BatchId: 0 }),
      content: JSON.stringify({ activities: [{ id: "first" }] }),
    },
  ], "conversation-42");

  const content = JSON.parse(merged.content ?? "{}") as {
    activities?: Array<{ id?: string; mergedSessionKey?: string }>;
  };
  const activities = content.activities ?? [];

  assert.deepEqual(activities.map((activity) => activity.id), [
    "first",
    "second",
    "third",
  ]);
  assert.equal(activities[0]?.mergedSessionKey, activities[1]?.mergedSessionKey);
  assert.notEqual(activities[1]?.mergedSessionKey, activities[2]?.mergedSessionKey);
});

test("returns an empty transcript for an unavailable conversation", () => {
  const merged = mergeConversationTranscriptRecords([], "conversation-42");

  assert.equal(merged.conversationtranscriptid, "conversation-42");
  assert.deepEqual(JSON.parse(merged.content ?? "{}"), { activities: [] });
});

test("rejects malformed transcript content instead of dropping it", () => {
  assert.throws(
    () => mergeConversationTranscriptRecords([{
      conversationtranscriptid: "record-1",
      content: "{not-json",
    }], "conversation-1"),
    /Invalid conversation transcript content/,
  );
});
