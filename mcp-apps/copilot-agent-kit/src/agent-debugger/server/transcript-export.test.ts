import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationTranscriptRecord } from "../core/transcript-merge.js";
import { ReviewError } from "../../agent-review/server/types.js";
import { exportConversationTranscript, TRANSCRIPT_EXPORT_LIMITS } from "./transcript-export.js";

const id = "saved-conversation";
const row = (text = ""): ConversationTranscriptRecord => ({
  conversationtranscriptid: "11111111-1111-1111-1111-111111111111",
  name: id, conversationstarttime: "2026-10-07T10:00:00.000Z",
  content: JSON.stringify({ custom: "retained", activities: [{ id: "activity", type: "message", text, value: { custom: true }, mergedSessionKey: "internal" }] }),
  metadata: JSON.stringify({ BatchId: 1, custom: { recorded: true } }),
});
const code = (expected: string) => (error: unknown) => error instanceof ReviewError && error.code === expected;

test("full JSON includes every saved record, metadata, and activity without internal session fields", () => {
  const input = [row("first"), { ...row("second"), conversationtranscriptid: "22222222-2222-2222-2222-222222222222" }];
  const result = exportConversationTranscript(id, input);
  assert.equal(result.recordCount, 2);
  assert.equal(result.activityCount, 2);
  assert.deepEqual(result.records.map(record => record.content.activities[0].text), ["first", "second"]);
  assert.deepEqual(result.records[0].metadata, { BatchId: 1, custom: { recorded: true } });
  assert.equal(result.records[0].content.custom, "retained");
  assert.deepEqual(result.records[0].content.activities[0].value, { custom: true });
  assert.equal("mergedSessionKey" in result.records[0].content.activities[0], false);
  assert.equal(JSON.parse(input[0].content ?? "").activities[0].mergedSessionKey, "internal");
});

test("full JSON rejects empty, mismatched, malformed, and partial content", () => {
  assert.throws(() => exportConversationTranscript(id, []), code("TRANSCRIPT_NOT_FOUND"));
  assert.throws(() => exportConversationTranscript(id, [{ ...row(), name: `${id}-child` }]), code("TRANSCRIPT_MISMATCH"));
  for (const content of ["{", "null", "[]", "{}", '{"activities":[null]}']) {
    assert.throws(() => exportConversationTranscript(id, [{ ...row(), content }]), code("TRANSCRIPT_INVALID"));
  }
  assert.throws(() => exportConversationTranscript(id, [{ ...row(), metadata: "[" }]), code("TRANSCRIPT_INVALID"));
});

test("full JSON accepts exactly 500 records and rejects the next record", () => {
  const records = Array.from({ length: TRANSCRIPT_EXPORT_LIMITS.maxItems }, () => row());
  assert.equal(exportConversationTranscript(id, records).recordCount, 500);
  assert.throws(() => exportConversationTranscript(id, [...records, row()]), code("TRANSCRIPT_TOO_LARGE"));
});

test("full JSON enforces the exact 8 MiB UTF-8 output boundary", () => {
  const overhead = Buffer.byteLength(JSON.stringify(exportConversationTranscript(id, [row()])), "utf8");
  const text = "x".repeat(TRANSCRIPT_EXPORT_LIMITS.maxBytes - overhead);
  const output = exportConversationTranscript(id, [row(text)]);
  assert.equal(Buffer.byteLength(JSON.stringify(output), "utf8"), 8 * 1024 * 1024);
  assert.throws(() => exportConversationTranscript(id, [row(`${text}x`)]), code("TRANSCRIPT_TOO_LARGE"));
  assert.throws(() => exportConversationTranscript(id, [row(`${text}é`)]), code("TRANSCRIPT_TOO_LARGE"));
});
