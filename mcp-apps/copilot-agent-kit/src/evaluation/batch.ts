import { randomUUID } from "node:crypto";
import { ReviewError } from "../agent-review/server/types.js";

export interface AtomicCreate {
  entitySet: string;
  body: Record<string, unknown>;
}
export const EVALUATION_BATCH_BYTES = 512 * 1024;

export function buildAtomicChangeset(origin: URL, creates: readonly AtomicCreate[]): { body: string; contentType: string } {
  if (origin.protocol !== "https:" || !creates.length || creates.length > 21) {
    throw new ReviewError("EVALUATION_INVALID_BATCH", "A native Conversation save requires one trusted changeset with a root and at most 20 cases.");
  }
  const batch = `batch_${randomUUID()}`;
  const changeset = `changeset_${randomUUID()}`;
  const lines = [`--${batch}`, `Content-Type: multipart/mixed; boundary=${changeset}`, ""];
  creates.forEach((item, index) => {
    if (!/^[a-z][a-z0-9_]*$/i.test(item.entitySet)) throw new ReviewError("EVALUATION_INVALID_BATCH", "The create path is invalid.");
    lines.push(
      `--${changeset}`, "Content-Type: application/http", "Content-Transfer-Encoding: binary",
      `Content-ID: ${index + 1}`, "", `POST /api/data/v9.2/${item.entitySet} HTTP/1.1`,
      "Content-Type: application/json", "Accept: application/json", "",
      JSON.stringify(item.body),
    );
  });
  lines.push(`--${changeset}--`, `--${batch}--`, "");
  const body = lines.join("\r\n");
  if (Buffer.byteLength(body, "utf8") > EVALUATION_BATCH_BYTES) {
    throw new ReviewError("EVALUATION_BATCH_LIMIT", "The native save exceeds the 512 KiB engineering limit. No write was sent.");
  }
  return { body, contentType: `multipart/mixed; boundary=${batch}` };
}

function parts(contentType: string, body: string): string[] {
  const match = /^multipart\/mixed;\s*boundary=(?:"([a-z0-9_'()+,.-]{1,70})"|([a-z0-9_'()+,.-]{1,70}))$/i.exec(contentType.trim());
  if (!match) throw new ReviewError("EVALUATION_BATCH_RESPONSE", "Dataverse returned an invalid batch content type.");
  const boundary = match[1] ?? match[2];
  const start = `--${boundary}\r\n`;
  const end = `\r\n--${boundary}--`;
  if (!body.startsWith(start) || !body.trimEnd().endsWith(end)) {
    throw new ReviewError("EVALUATION_BATCH_RESPONSE", "Dataverse returned an incomplete batch response.");
  }
  const inner = body.slice(start.length, body.lastIndexOf(end));
  return inner.split(`\r\n--${boundary}\r\n`);
}

function headers(part: string): { values: Map<string, string>; body: string } {
  const end = part.indexOf("\r\n\r\n");
  if (end < 0) throw new ReviewError("EVALUATION_BATCH_RESPONSE", "A batch part has no complete headers.");
  const values = new Map<string, string>();
  for (const line of part.slice(0, end).split("\r\n")) {
    const colon = line.indexOf(":");
    const name = line.slice(0, colon).trim().toLowerCase();
    if (colon < 1 || values.has(name)) throw new ReviewError("EVALUATION_BATCH_RESPONSE", "A batch part has invalid or duplicate headers.");
    values.set(name, line.slice(colon + 1).trim());
  }
  return { values, body: part.slice(end + 4) };
}

export function validateAtomicResponse(contentType: string, body: string, expectedCount: number): void {
  if (Buffer.byteLength(body, "utf8") > EVALUATION_BATCH_BYTES) throw new ReviewError("EVALUATION_BATCH_RESPONSE", "The batch response exceeds the safe size limit.");
  const outer = parts(contentType, body);
  if (outer.length !== 1) throw new ReviewError("EVALUATION_BATCH_RESPONSE", "The response is not one atomic changeset.");
  const changeset = headers(outer[0]);
  const replies = parts(changeset.values.get("content-type") ?? "", changeset.body);
  const ids = new Set<number>();
  for (const reply of replies) {
    const inner = headers(reply);
    if (inner.values.get("content-type")?.toLowerCase() !== "application/http") throw new ReviewError("EVALUATION_BATCH_RESPONSE", "A batch reply is not an HTTP response.");
    const status = /^HTTP\/1\.[01] ([0-9]{3}) [^\r\n]*\r\n/.exec(inner.body);
    if (!status) throw new ReviewError("EVALUATION_BATCH_RESPONSE", "An inner HTTP status is missing.");
    const code = Number(status[1]);
    if (code < 200 || code >= 300) throw new ReviewError("EVALUATION_BATCH_FAILED", `The atomic changeset returned an inner HTTP ${code}. Success was not confirmed.`);
    const id = Number(inner.values.get("content-id"));
    if (!Number.isInteger(id) || id < 1 || id > expectedCount || ids.has(id)) throw new ReviewError("EVALUATION_BATCH_RESPONSE", "The inner response IDs do not match the immutable request.");
    ids.add(id);
  }
  if (ids.size !== expectedCount) throw new ReviewError("EVALUATION_BATCH_RESPONSE", "The changeset did not acknowledge every requested component.");
}
