import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAtomicChangeset, validateAtomicResponse } from "./batch.js";

function response(statuses: number[], ids = statuses.map((_, i) => i + 1)) {
  return "--batch_reply\r\nContent-Type: multipart/mixed; boundary=change_reply\r\n\r\n"
    + statuses.map((status, i) => `--change_reply\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\nContent-ID: ${ids[i]}\r\n\r\nHTTP/1.1 ${status} Response\r\nOData-Version: 4.0\r\n\r\n`).join("")
    + "--change_reply--\r\n--batch_reply--\r\n";
}
const contentType = "multipart/mixed; boundary=batch_reply";
test("all creates are inside one bounded CRLF changeset", () => {
  const payload = buildAtomicChangeset(new URL("https://fixture.crm.dynamics.com"), [
    { entitySet: "botcomponents", body: { name: "Root", data: "kind: EvaluationSet\n" } },
    { entitySet: "botcomponents", body: { name: "Case", data: "kind: MultiTurnEvaluationCase\n" } },
  ]);
  assert.match(payload.contentType, /^multipart\/mixed; boundary=batch_/);
  assert.equal((payload.body.match(/Content-Type: multipart\/mixed/g) ?? []).length, 1);
  assert.equal((payload.body.match(/POST \/api\/data\/v9.2\/botcomponents HTTP\/1.1/g) ?? []).length, 2);
  assert.doesNotMatch(payload.body, /(?<!\r)\n/);
  assert.match(payload.body, /Content-ID: 1\r\n/);
  assert.match(payload.body, /Content-ID: 2\r\n/);
});
test("a successful outer reply still fails if any inner response failed", () => {
  assert.doesNotThrow(() => validateAtomicResponse(contentType, response([204, 201]), 2));
  assert.throws(() => validateAtomicResponse(contentType, response([204, 400]), 2), /400/);
});
test("missing, duplicate, excess or mismatched inner Content-IDs are errors", () => {
  for (const body of [response([204]), response([204, 204], [1, 1]), response([204, 204], [1, 3]), response([204, 204, 204])])
    assert.throws(() => validateAtomicResponse(contentType, body, 2));
});
test("an outer body containing JSON status text is not an inner HTTP success", () => {
  assert.throws(() => validateAtomicResponse("application/json", '{"text":"HTTP/1.1 204 No Content"}', 1));
  assert.throws(() => validateAtomicResponse(contentType, "--batch_reply--\r\n", 1));
});
test("invalid request paths and batches above the engineering bound are rejected", () => {
  assert.throws(() => buildAtomicChangeset(new URL("https://fixture.crm.dynamics.com"), [{ entitySet: "botcomponents\r\nInjected: true", body: {} }]));
  assert.throws(() => buildAtomicChangeset(new URL("https://fixture.crm.dynamics.com"), [{ entitySet: "botcomponents", body: { data: "x".repeat(512 * 1024) } }]), /512/);
});
