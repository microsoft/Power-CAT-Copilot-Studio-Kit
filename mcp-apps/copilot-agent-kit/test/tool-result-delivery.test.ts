import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { gzipSync } from "node:zlib";
import type { App } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { boundedToolResult, getInitialWidgetData } from "../src/tools/initialWidgetPayload.js";
import { createCompleteToolResultReader, readCompleteToolResult } from "../src/widgets/shared/tool-result.js";

function contextReader(token: string, calls: CallToolResult[] = []): App["callServerTool"] {
  return async request => {
    const values = request.arguments;
    if (typeof values?.contextId !== "string") throw new Error("The exact context is required.");
    const result = await getInitialWidgetData(token, {
      contextId: values.contextId,
      ...(typeof values.index === "number" ? { index: values.index } : {}),
      ...(typeof values.sha256 === "string" ? { sha256: values.sha256 } : {}),
    });
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 65_536);
    calls.push(result);
    return result;
  };
}

test("gzip delivery restores complete findings, error text, Unicode and private metadata exactly", async () => {
  const full: CallToolResult = {
    isError: true, content: [{ type: "text", text: "Exact error \u03c0.\n".repeat(8_000) }],
    structuredContent: { state: "failed", view: "review", jobId: "saved-job", evidence: "Every saved field. ".repeat(8_000) },
    _meta: { evaluationSaveGrant: "offline-app-only-grant", ui: { resourceUri: "ui://fixture/review.html" } },
  };
  const original = structuredClone(full);
  const result = boundedToolResult(full, "caller");
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 65_536);
  assert.ok(!JSON.stringify(result.structuredContent).includes("offline-app-only-grant"));
  assert.deepEqual(await readCompleteToolResult(result, contextReader("caller")), full);
  assert.deepEqual(full, original);
});

test("incompressible complete evidence uses bounded caller-scoped immutable chunks", async () => {
  const full: CallToolResult = { content: [], structuredContent: {
    state: "review", model: { evidence: randomBytes(120_000).toString("base64") },
  }, _meta: { privateEvidence: "not exposed in structuredContent" } };
  const result = boundedToolResult(full, "chunk-caller");
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 65_536);
  const calls: CallToolResult[] = [];
  assert.deepEqual(await readCompleteToolResult(result, contextReader("chunk-caller", calls)), full);
  assert.ok(calls.length > 1);
  await assert.rejects(readCompleteToolResult(result, contextReader("other-caller")), /unavailable/);
  const delivery = result._meta?.completeToolResult;
  assert.ok(delivery && typeof delivery === "object" && "contextId" in delivery && typeof delivery.contextId === "string");
  const outside = await getInitialWidgetData("chunk-caller", { contextId: delivery.contextId, index: 255, sha256: "0".repeat(64) });
  assert.equal(outside.isError, true);
  assert.equal(outside.structuredContent?.error && typeof outside.structuredContent.error === "object"
    && "code" in outside.structuredContent.error && outside.structuredContent.error.code, "INITIAL_CONTEXT_CHANGED");
});

test("complete-result decoding rejects changed hashes, byte counts and chunk indices", async () => {
  const full: CallToolResult = { content: [], structuredContent: { state: "review", evidence: "Complete".repeat(20_000) } };
  const result = boundedToolResult(full, "caller");
  const delivery = result._meta?.completeToolResult;
  assert.ok(delivery && typeof delivery === "object");
  for (const changes of [{ sha256: "0".repeat(64) }, { bytes: 1 }]) {
    await assert.rejects(readCompleteToolResult({ ...result, _meta: { completeToolResult: { ...delivery, ...changes } } }, contextReader("caller")), /hash|byte count/);
  }
  const chunked = boundedToolResult({ content: [], structuredContent: { state: "review", evidence: randomBytes(100_000).toString("base64") } }, "caller");
  await assert.rejects(readCompleteToolResult(chunked, async request => {
    const chunk = await contextReader("caller")(request);
    return { ...chunk, structuredContent: { ...chunk.structuredContent, index: 255 } };
  }), /changed/);
});

for (const fault of ["gzip", "hash"] as const) {
  test(`an explicit redelivery after a complete ${fault} failure reads corrected chunks without an automatic retry`, async () => {
    const token = `integrity-${fault}`;
    const full: CallToolResult = {
      content: [], structuredContent: { state: "summary", marker: "alpha", evidence: randomBytes(120_000).toString("base64") },
    };
    const original = boundedToolResult(full, token);
    const manifest = original._meta?.completeToolResult;
    assert.ok(manifest && typeof manifest === "object" && "chunkCount" in manifest && typeof manifest.chunkCount === "number");
    const validChunks: CallToolResult[] = [];
    for (let index = 0; index < manifest.chunkCount; index++) {
      assert.ok("contextId" in manifest && typeof manifest.contextId === "string"
        && "sha256" in manifest && typeof manifest.sha256 === "string");
      validChunks.push(await getInitialWidgetData(token, { contextId: manifest.contextId, index, sha256: manifest.sha256 }));
    }
    const first = validChunks[0].structuredContent?.data;
    assert.equal(typeof first, "string");
    const width = String(first).length;
    const changed = structuredClone(full);
    changed.structuredContent!.marker = "bravo";
    const changedEncoded = gzipSync(Buffer.from(JSON.stringify(changed))).toString("base64");
    assert.equal(Math.ceil(changedEncoded.length / width), manifest.chunkCount);
    let poisoned = true;
    let calls = 0;
    const read = createCompleteToolResultReader(async request => {
      calls += 1;
      const chunk = await contextReader(token)(request);
      if (!poisoned) return chunk;
      const index = request.arguments?.index;
      assert.equal(typeof index, "number");
      const encoded = chunk.structuredContent?.data;
      assert.equal(typeof encoded, "string");
      const data = fault === "hash"
        ? changedEncoded.slice(Number(index) * width, (Number(index) + 1) * width)
        : index === 0 ? `A${String(encoded).slice(1)}` : encoded;
      return { ...chunk, structuredContent: { ...chunk.structuredContent, data } };
    });
    await assert.rejects(read(original));
    assert.equal(calls, manifest.chunkCount);
    poisoned = false;
    assert.deepEqual(await read(original), full);
    assert.equal(calls, 2 * manifest.chunkCount);
    assert.deepEqual(await read(original), full);
    assert.equal(calls, 2 * manifest.chunkCount);
  });
}

for (const invalid of ["{", JSON.stringify({ content: null })]) {
  test(`a complete ${invalid === "{" ? "JSON" : "result schema"} failure discards its chunk cache`, async () => {
    const contextId = "77777777-7777-4777-8777-777777777777";
    const fixture = (text: string): CallToolResult => ({
      content: [], structuredContent: { state: "summary" },
      _meta: { completeToolResult: {
        encoding: "gzip-base64", contextId, chunkCount: 1,
        bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex"),
      } },
    });
    let encoded = gzipSync(Buffer.from(invalid)).toString("base64");
    let calls = 0;
    const read = createCompleteToolResultReader(async request => {
      calls += 1;
      assert.equal(request.arguments?.contextId, contextId);
      assert.equal(request.arguments?.index, 0);
      return { content: [], structuredContent: { index: 0, sha256: request.arguments?.sha256, data: encoded } };
    });
    const failed = fixture(invalid);
    await assert.rejects(read(failed));
    assert.equal(calls, 1);
    await assert.rejects(read(failed));
    assert.equal(calls, 2);
    const complete = { content: [], structuredContent: { state: "summary", evidence: "Corrected complete data" } };
    const text = JSON.stringify(complete);
    encoded = gzipSync(Buffer.from(text)).toString("base64");
    assert.deepEqual(await read(fixture(text)), complete);
    assert.equal(calls, 3);
  });
}

test("chunk caches are isolated across loaders and retain only one immutable manifest", async () => {
  const token = "isolated-loader";
  const full: CallToolResult = { content: [], structuredContent: { state: "summary", evidence: randomBytes(120_000).toString("base64") } };
  const first = boundedToolResult(full, token);
  const nextFull = { ...full, structuredContent: { ...full.structuredContent, selectionId: "next-immutable-payload" } };
  const next = boundedToolResult(nextFull, token);
  const firstCalls: CallToolResult[] = [], otherCalls: CallToolResult[] = [], nextCalls: CallToolResult[] = [];
  const firstLoader = createCompleteToolResultReader(contextReader(token, firstCalls));
  const otherLoader = createCompleteToolResultReader(contextReader(token, otherCalls));
  const nextLoader = createCompleteToolResultReader(contextReader("other-caller", nextCalls));
  assert.deepEqual(await firstLoader(first), full);
  const count = firstCalls.length;
  assert.ok(count > 1);
  assert.deepEqual(await otherLoader(first), full);
  assert.equal(otherCalls.length, count);
  await assert.rejects(nextLoader(first), /unavailable/);
  assert.equal(nextCalls.length, count);
  assert.deepEqual(await firstLoader(next), nextFull);
  assert.deepEqual(await firstLoader(first), full);
  assert.equal(firstCalls.length, 3 * count);
});
