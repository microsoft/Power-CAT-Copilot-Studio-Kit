import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../server.js";
import { AgentReviewService } from "../src/agent-review/server/service.js";
import { ReviewError } from "../src/agent-review/server/types.js";
import { createInitialToolDataRecovery } from "../src/widgets/shared/initial-tool-data.js";
import { readCompleteToolResult } from "../src/widgets/shared/tool-result.js";

const reviewId = "55555555-5555-4555-8555-555555555555";
const token = "saved-result-local-fixture-not-a-credential";

async function connected(tokenValue: string | undefined = token) {
  const server = createServer(tokenValue);
  const client = new Client({ name: "saved-result-display-test", version: "1.0.0" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(right);
  await client.connect(left);
  return {
    client,
    call: async (request: Parameters<Client["callTool"]>[0]) => CallToolResultSchema.parse(await client.callTool(request)),
    close: async () => { await client.close(); await server.close(); },
  };
}

test("actual discovery binds the model-callable saved-result tool to the registered Review resource", async () => {
  const { client, close } = await connected();
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 27);
    const opener = tools.find(tool => tool.name === "open_agent_review");
    const saved = tools.find(tool => tool.name === "get_agent_review_result");
    assert.ok(opener?._meta?.ui);
    assert.deepEqual(saved?._meta?.ui, opener._meta.ui);
    assert.equal(saved?.annotations?.readOnlyHint, true);
    const ui = saved._meta?.ui;
    assert.ok(ui && typeof ui === "object" && "resourceUri" in ui && typeof ui.resourceUri === "string");
    const resource = await client.readResource({ uri: ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, "text/html;profile=mcp-app");
    assert.equal(resource.contents[0].uri, ui.resourceUri);
  } finally { await close(); }
});

for (const presentation of [undefined, "summary", "fullReview"] as const) {
  test(`saved-result ${presentation ?? "default"} retains plain data and the Review UI without a job operation`, async context => {
    const data = { reviewId, model: { summary: { agentName: "Saved agent" }, findings: [
      { id: "DUP-01", fact: "First complete saved evidence.", componentIdUnique: "original-component" },
      { id: "DUP-01", fact: "Second complete saved evidence.", componentIdUnique: "original-component" },
    ] } };
    const read = context.mock.method(AgentReviewService.prototype, "getResult", async (id: string) => {
      assert.equal(id, reviewId);
      return structuredClone(data);
    });
    const start = context.mock.method(AgentReviewService.prototype, "start", async () => { throw new Error("No start is permitted."); });
    const status = context.mock.method(AgentReviewService.prototype, "status", async () => { throw new Error("No status is permitted."); });
    const finalize = context.mock.method(AgentReviewService.prototype, "finalize", async () => { throw new Error("No finalize is permitted."); });
    const { client, call, close } = await connected();
    try {
      const { tools } = await client.listTools();
      const reply = await call({ name: "get_agent_review_result", arguments: {
        reviewId, ...(presentation ? { presentation } : {}),
      } });
      assert.deepEqual(reply.structuredContent, { state: presentation ?? "summary", ...data });
      assert.deepEqual(reply._meta?.ui, tools.find(tool => tool.name === "open_agent_review")?._meta?.ui);
      assert.ok(Buffer.byteLength(JSON.stringify(reply), "utf8") <= 65_536);
      assert.equal(read.mock.callCount(), 1);
      assert.equal(start.mock.callCount(), 0);
      assert.equal(status.mock.callCount(), 0);
      assert.equal(finalize.mock.callCount(), 0);
    } finally { await close(); }
  });
}

test("omitted saved-result data recovers once with only the saved ID and presentation", async context => {
  const data = { reviewId, model: { summary: { agentName: "Saved agent" }, findings: [] } };
  context.mock.method(AgentReviewService.prototype, "getResult", async (id: string) => {
    assert.equal(id, reviewId);
    return data;
  });
  const start = context.mock.method(AgentReviewService.prototype, "start", async () => { throw new Error("No start is permitted."); });
  const status = context.mock.method(AgentReviewService.prototype, "status", async () => { throw new Error("No status is permitted."); });
  const finalize = context.mock.method(AgentReviewService.prototype, "finalize", async () => { throw new Error("No finalize is permitted."); });
  const { call, close } = await connected();
  try {
    let current: unknown = null;
    const calls: { name: string; arguments?: Record<string, unknown> }[] = [];
    const recovery = createInitialToolDataRecovery({
      name: "open_agent_review",
      callTool: async request => { calls.push(request); return call(request); },
      getData: () => current, replaceData: data => { current = data; },
      reportError: error => assert.fail(error instanceof Error ? error : String(error)),
    });
    const input = { reviewId, presentation: "fullReview" };
    await recovery.receiveInput({ arguments: input });
    await recovery.ready();
    await recovery.receiveInput({ arguments: input });
    await recovery.ready();
    assert.deepEqual(calls, [{ name: "get_agent_review_result", arguments: input }]);
    assert.deepEqual(current, { state: "fullReview", ...data });
    assert.equal(start.mock.callCount(), 0);
    assert.equal(status.mock.callCount(), 0);
    assert.equal(finalize.mock.callCount(), 0);
  } finally { await close(); }
});

test("large saved results keep every finding and icon through lossless bounded UI delivery", async context => {
  const data = { reviewId, model: { evidence: "Complete saved evidence. ".repeat(5_000),
    findings: [{ id: "DUP-01", fact: "First saved evidence." }, { id: "DUP-01", fact: "Second saved evidence." }],
    iconBase64: "A".repeat(16_384) } };
  context.mock.method(AgentReviewService.prototype, "getResult", async () => data);
  const { client, call, close } = await connected();
  try {
    const reply = await call({ name: "get_agent_review_result", arguments: { reviewId } });
    assert.ok(Buffer.byteLength(JSON.stringify(reply), "utf8") <= 65_536);
    const complete = await readCompleteToolResult(reply, call);
    assert.deepEqual(complete.structuredContent, { state: "summary", ...data });
    const { tools } = await client.listTools();
    assert.deepEqual(complete._meta?.ui, tools.find(tool => tool.name === "open_agent_review")?._meta?.ui);
  } finally { await close(); }
});

test("an unavailable saved result stays an explicit read error without replacement creation", async context => {
  const read = context.mock.method(AgentReviewService.prototype, "getResult", async () => {
    throw new ReviewError("REVIEW_NOT_FOUND", "The saved Review is unavailable.");
  });
  const start = context.mock.method(AgentReviewService.prototype, "start", async () => { throw new Error("No start is permitted."); });
  const finalize = context.mock.method(AgentReviewService.prototype, "finalize", async () => { throw new Error("No finalize is permitted."); });
  const { call, close } = await connected();
  try {
    const result = await call({ name: "get_agent_review_result", arguments: { reviewId } });
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent?.error as { code: string }).code, "REVIEW_NOT_FOUND");
    assert.equal(read.mock.callCount(), 1);
    assert.equal(start.mock.callCount(), 0);
    assert.equal(finalize.mock.callCount(), 0);
  } finally { await close(); }
});

test("anonymous saved-result reads remain denied before the saved store is accessed", async context => {
  const read = context.mock.method(AgentReviewService.prototype, "getResult", async () => { throw new Error("No anonymous store read."); });
  const { call, close } = await connected("");
  try {
    const result = await call({ name: "get_agent_review_result", arguments: { reviewId } });
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent?.error as { code: string }).code, "AUTH_REQUIRED");
    assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") <= 65_536);
    assert.equal(read.mock.callCount(), 0);
  } finally { await close(); }
});
