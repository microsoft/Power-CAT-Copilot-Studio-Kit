import { ReviewError } from "../../agent-review/server/types.js";
import type { ConversationTranscriptRecord } from "../core/transcript-merge.js";
import type { ConversationTranscriptJson } from "../contracts/diagnostics.js";

export const TRANSCRIPT_EXPORT_LIMITS = { maxItems: 500, maxBytes: 8 * 1024 * 1024 };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseObject(text: string | undefined, field: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text ?? "");
    if (!record(value)) throw new Error("Expected an object.");
    return value;
  } catch {
    throw new ReviewError("TRANSCRIPT_INVALID", `The saved transcript ${field} is not valid JSON.`);
  }
}

export function exportConversationTranscript(
  conversationId: string,
  source: readonly ConversationTranscriptRecord[],
): ConversationTranscriptJson {
  if (!source.length) throw new ReviewError("TRANSCRIPT_NOT_FOUND", "No saved transcript records were found for this exact conversation ID.");
  if (source.length > TRANSCRIPT_EXPORT_LIMITS.maxItems) {
    throw new ReviewError("TRANSCRIPT_TOO_LARGE", "Full JSON is limited to 500 transcript records and an 8 MiB response.");
  }
  let activityCount = 0;
  const records = source.map((row) => {
    if (row.name !== conversationId) {
      throw new ReviewError("TRANSCRIPT_MISMATCH", "The saved records do not belong to the requested conversation.");
    }
    const content = parseObject(row.content, "content");
    if (!Array.isArray(content.activities) || !content.activities.every(record)) {
      throw new ReviewError("TRANSCRIPT_INVALID", "The saved transcript activities are invalid.");
    }
    const activities = content.activities.map((activity) => {
      const { mergedSessionKey: _internal, ...saved } = activity;
      return saved;
    });
    activityCount += activities.length;
    return {
      ...row,
      content: { ...content, activities },
      metadata: row.metadata ? parseObject(row.metadata, "metadata") : undefined,
    };
  });
  const result = { conversationId, recordCount: records.length, activityCount, records };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > TRANSCRIPT_EXPORT_LIMITS.maxBytes) {
    throw new ReviewError("TRANSCRIPT_TOO_LARGE", "Full JSON is limited to 500 transcript records and an 8 MiB response.");
  }
  return result;
}
