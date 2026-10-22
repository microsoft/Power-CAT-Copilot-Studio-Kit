import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../server.js";
import { boundedToolResult } from "../src/tools/initialWidgetPayload.js";
import { readCompleteToolResult } from "../src/widgets/shared/tool-result.js";

const caller = "offline-initial-widget-protocol-caller";

async function connectedClient(token?: string) {
  const server = createServer(token);
  const client = new Client({ name: "initial-widget-data-protocol-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

function chunkFixture() {
  const full: CallToolResult = { content: [], structuredContent: {
    state: "running", jobId: "44444444-4444-4444-8444-444444444444",
    evidence: randomBytes(120_000).toString("base64"),
  }, _meta: { privateFixtureMetadata: "All fixture fields must be retained." } };
  const compact = boundedToolResult(full, caller);
  const manifest = compact._meta?.completeToolResult;
  assert.ok(manifest && typeof manifest === "object" && "contextId" in manifest
    && typeof manifest.contextId === "string" && "sha256" in manifest && typeof manifest.sha256 === "string");
  return { full, compact, contextId: manifest.contextId, sha256: manifest.sha256 };
}

function failureText(result: CallToolResult) {
  assert.equal(result.isError, true);
  return result.content.flatMap(item => item.type === "text" ? [item.text] : []).join("\n");
}

test("tools/list exposes exact strict complete-context callback fields through SDK 1.27.1", async context => {
  context.mock.method(globalThis, "fetch", async () => { assert.fail("This protocol test forbids remote requests."); });
  const { client, close } = await connectedClient(caller);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 27);
    const tool = tools.find(item => item.name === "get_initial_widget_data");
    assert.ok(tool);
    context.diagnostic(JSON.stringify({
      callback: tool,
      sha256: createHash("sha256").update(JSON.stringify(tool)).digest("hex"),
    }));
    const schema = tool.inputSchema;
    assert.equal(schema.type, "object");
    assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), ["contextId", "index", "sha256"]);
    assert.deepEqual(schema.required, ["contextId"]);
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.properties?.contextId, {
      type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    });
    assert.deepEqual(schema.properties?.index, { type: "integer", minimum: 0, maximum: 255 });
    assert.deepEqual(schema.properties?.sha256, { type: "string", pattern: "^[a-f0-9]{64}$" });
    assert.deepEqual(tool.annotations, { readOnlyHint: true, openWorldHint: false });
    assert.deepEqual(tool._meta?.ui, {
      resourceUri: "ui://open_evaluation_builder/v1.0.18/evaluation-builder.html", visibility: ["app"],
    });
  } finally { await close(); }
});

test("SDK calls recover exact immutable caller-scoped chunks and complete metadata", async context => {
  context.mock.method(globalThis, "fetch", async () => { assert.fail("This protocol test forbids remote requests."); });
  const fixture = chunkFixture();
  const original = structuredClone(fixture.full);
  const { client, close } = await connectedClient(caller);
  try {
    const calls: CallToolResult[] = [];
    const decoded = await readCompleteToolResult(fixture.compact, async request => {
      assert.equal(request.name, "get_initial_widget_data");
      const reply = await client.callTool(request);
      assert.ok(Buffer.byteLength(JSON.stringify(reply)) <= 65_536);
      calls.push(reply);
      return reply;
    });
    assert.deepEqual(decoded, original);
    assert.deepEqual(fixture.full, original);
    assert.ok(calls.length > 1);
    const decodedBytes = gunzipSync(Buffer.from(calls
      .sort((left, right) => Number(left.structuredContent?.index) - Number(right.structuredContent?.index))
      .map(reply => reply.structuredContent?.data).join(""), "base64"));
    assert.deepEqual(decodedBytes, Buffer.from(JSON.stringify(original)));
    const arguments_ = { contextId: fixture.contextId, index: 0, sha256: fixture.sha256 };
    const first = await client.callTool({ name: "get_initial_widget_data", arguments: arguments_ });
    const again = await client.callTool({ name: "get_initial_widget_data", arguments: arguments_ });
    assert.deepEqual(first, again);
    const complete = await client.callTool({
      name: "get_initial_widget_data", arguments: { contextId: fixture.contextId },
    });
    assert.ok(Buffer.byteLength(JSON.stringify(complete)) <= 65_536);
    assert.deepEqual(await readCompleteToolResult(complete, request => client.callTool(request)), original);
    context.diagnostic(JSON.stringify({
      completeBytes: Buffer.byteLength(JSON.stringify(original)),
      completeSha256: createHash("sha256").update(JSON.stringify(original)).digest("hex"),
      decodedSha256: createHash("sha256").update(decodedBytes).digest("hex"),
      chunks: calls.length, largestChunkBytes: Math.max(...calls.map(reply => Buffer.byteLength(JSON.stringify(reply)))),
    }));
  } finally { await close(); }
});

test("SDK calls reject missing, unpaired, out-of-bound and unknown callback arguments", async context => {
  context.mock.method(globalThis, "fetch", async () => { assert.fail("This protocol test forbids remote requests."); });
  const fixture = chunkFixture();
  const base = { contextId: fixture.contextId };
  const { client, close } = await connectedClient(caller);
  try {
    for (const arguments_ of [
      {}, { contextId: "not-a-guid" }, { ...base, index: 0 }, { ...base, sha256: fixture.sha256 },
      { ...base, index: -1, sha256: fixture.sha256 },
      { ...base, index: 256, sha256: fixture.sha256 },
      { ...base, index: 0.5, sha256: fixture.sha256 },
      { ...base, index: 0, sha256: "short" },
      { ...base, index: 0, sha256: "A".repeat(64) },
      { ...base, index: 0, sha256: fixture.sha256, unexpected: true },
    ]) {
      const reply = await client.callTool({ name: "get_initial_widget_data", arguments: arguments_ });
      const message = failureText(reply);
      assert.ok(message.length > 0);
      if (Object.keys(arguments_).length === 2 && "contextId" in arguments_) {
        assert.match(message, /both index and SHA-256/);
      }
      context.diagnostic(JSON.stringify({ rejected: Object.keys(arguments_), message }));
    }
  } finally { await close(); }
});

test("SDK calls reject immutable hash, index and caller mismatches without reading another context", async context => {
  context.mock.method(globalThis, "fetch", async () => { assert.fail("This protocol test forbids remote requests."); });
  const fixture = chunkFixture();
  const { client, close } = await connectedClient(caller);
  const other = await connectedClient("other-offline-caller");
  try {
    for (const arguments_ of [
      { contextId: fixture.contextId, index: 0, sha256: "0".repeat(64) },
      { contextId: fixture.contextId, index: 255, sha256: fixture.sha256 },
    ]) {
      const reply = await client.callTool({ name: "get_initial_widget_data", arguments: arguments_ });
      failureText(reply);
      assert.deepEqual(reply.structuredContent?.error, {
        code: "INITIAL_CONTEXT_CHANGED",
        message: "The requested complete-data chunk does not match its immutable caller-scoped context.",
      });
    }
    const unauthorized = await other.client.callTool({
      name: "get_initial_widget_data",
      arguments: { contextId: fixture.contextId, index: 0, sha256: fixture.sha256 },
    });
    failureText(unauthorized);
    assert.ok(unauthorized.structuredContent?.error && typeof unauthorized.structuredContent.error === "object"
      && "code" in unauthorized.structuredContent.error
      && unauthorized.structuredContent.error.code === "INITIAL_CONTEXT_UNAVAILABLE");
    const valid = await client.callTool({
      name: "get_initial_widget_data",
      arguments: { contextId: fixture.contextId, index: 0, sha256: fixture.sha256 },
    });
    assert.notEqual(valid.isError, true);
    assert.equal(valid.structuredContent?.index, 0);
    assert.equal(valid.structuredContent?.sha256, fixture.sha256);
  } finally { await close(); await other.close(); }
});

const toolContracts = [
  ["open_agent_review", "reviewId jobId environmentId environmentName agentId agentName componentIdUnique startReview requestId resumeOnly", ""],
  ["show_agent_map", "environmentId environmentName agentId agentName componentIdUnique", ""],
  ["browse_agent_reviews", "environmentId presentation", ""],
  ["open_agent_debugger", "environmentId environmentName agentId agentName conversationId", ""],
  ["open_evaluation_builder", "environmentId environmentName agentId agentName mode", ""],
  ["get_evaluation_draft", "draftId", "draftId"],
  ["get_evaluation_native_support", "draftId", "draftId"],
  ["create_agent_evaluation_set", "draftId requestId saveGrant name method selectedCases confirmed", "draftId requestId saveGrant name method selectedCases confirmed"],
  ["get_agent_evaluation_save", "draftId requestId saveGrant", "draftId requestId saveGrant"],
  ["update_agent_evaluation_case", "draftId requestId saveGrant caseId question expectedResponse remove", "draftId requestId saveGrant caseId question expectedResponse"],
  ["get_initial_widget_data", "contextId index sha256", "contextId"],
  ["get_app_view_resource", "view", "view"],
  ["get_app_view_chunk", "view index sha256", "view index sha256"],
  ["list_debugger_agents", "environmentId query", "environmentId"],
  ["list_debugger_conversations", "environmentId agentId query limit startedAfter startedBefore", "environmentId agentId"],
  ["analyze_debugger_conversation", "environmentId agentId conversationId", "environmentId agentId conversationId"],
  ["get_debugger_turn_details", "environmentId agentId conversationId turnId", "environmentId agentId conversationId turnId"],
  ["get_debugger_child_transcript", "environmentId agentId conversationId sessionId", "environmentId agentId conversationId sessionId"],
  ["get_debugger_conversation_transcript", "environmentId agentId conversationId", "environmentId agentId conversationId"],
  ["list_reviewable_agents", "environmentId query", "environmentId"],
  ["get_agent_map", "environmentId agentId componentIdUnique", "environmentId agentId componentIdUnique"],
  ["get_connected_agent_map", "environmentId targetSchemaName", "environmentId targetSchemaName"],
  ["list_agent_reviews", "environmentId presentation", "environmentId"],
  ["start_agent_review", "environmentId agentId componentIdUnique projectName transcriptStart transcriptEnd confirmed", "environmentId agentId componentIdUnique projectName confirmed"],
  ["get_agent_review_status", "jobId", "jobId"],
  ["finalize_agent_review", "jobId", "jobId"],
  ["get_agent_review_result", "reviewId presentation", "reviewId"],
] as const;

test("SDK discovery retains the exact fields, required arguments and strict declarations of all 27 tools", async context => {
  const remote = context.mock.method(globalThis, "fetch", async () => { assert.fail("This protocol test forbids remote requests."); });
  const { client, close } = await connectedClient();
  try {
    const { tools } = await client.listTools();
    const words = (value: string) => value.split(" ").filter(Boolean).sort();
    assert.deepEqual(tools.map(tool => tool.name).sort(), toolContracts.map(([name]) => name).sort());
    for (const [name, fields, required] of toolContracts) {
      const tool = tools.find(item => item.name === name);
      assert.ok(tool, name);
      assert.equal(tool.inputSchema.type, "object", name);
      assert.deepEqual(Object.keys(tool.inputSchema.properties ?? {}).sort(), words(fields), name);
      assert.deepEqual([...(tool.inputSchema.required ?? [])].sort(), words(required), name);
      assert.equal(tool.inputSchema.additionalProperties, false, name);
    }
    context.diagnostic(JSON.stringify({ advertisedStrictSchemas: tools.length,
      completeDefinitionSha256: createHash("sha256").update(JSON.stringify(tools)).digest("hex") }));
    assert.equal(remote.mock.callCount(), 0);
  } finally { await close(); }
});

test("five read-only helpers publish truthful annotations without changing write declarations", async context => {
  context.mock.method(globalThis, "fetch", async () => { assert.fail("This protocol test forbids remote requests."); });
  const { client, close } = await connectedClient();
  try {
    const { tools } = await client.listTools();
    const names = ["list_reviewable_agents", "get_agent_map", "get_connected_agent_map", "list_agent_reviews", "get_agent_review_status"];
    const helpers = tools.filter(tool => names.includes(tool.name));
    context.diagnostic(JSON.stringify({ helpers }));
    assert.equal(helpers.length, 5);
    for (const tool of helpers) {
      assert.deepEqual(tool.annotations, { readOnlyHint: true, openWorldHint: true }, tool.name);
    }
    for (const name of ["open_agent_review", "start_agent_review"]) {
      assert.deepEqual(tools.find(tool => tool.name === name)?.annotations, {
        readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true,
      });
    }
    assert.equal(tools.find(tool => tool.name === "finalize_agent_review")?.annotations, undefined);
    assert.deepEqual(tools.find(tool => tool.name === "create_agent_evaluation_set")?.annotations, {
      readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true,
    });
  } finally { await close(); }
});

test("SDK enforces the Debugger 50-conversation limit before its anonymous handler", async context => {
  const remote = context.mock.method(globalThis, "fetch", async () => { assert.fail("This protocol test forbids remote requests."); });
  const { client, close } = await connectedClient();
  const target = {
    environmentId: "11111111-1111-4111-8111-111111111111",
    agentId: "22222222-2222-4222-8222-222222222222",
  };
  try {
    const { tools } = await client.listTools();
    const tool = tools.find(item => item.name === "list_debugger_conversations");
    assert.ok(tool);
    context.diagnostic(JSON.stringify({ definition: tool }));
    const acceptedInvalidLimits: number[] = [];
    for (const limit of [0, 51, 250, 251, 1.5]) {
      const reply = await client.callTool({ name: tool.name, arguments: { ...target, limit } });
      const message = failureText(reply);
      const validationRejected = /Input validation error/.test(message) && !/AUTH_REQUIRED|Sign in/.test(message);
      if (!validationRejected) acceptedInvalidLimits.push(limit);
      context.diagnostic(JSON.stringify({ limit, validationRejected, message }));
    }
    for (const arguments_ of [target, { ...target, limit: 1 }, { ...target, limit: 50 }]) {
      const reply = await client.callTool({ name: tool.name, arguments: arguments_ });
      assert.doesNotMatch(failureText(reply), /Input validation error/);
      const error = reply.structuredContent?.error;
      assert.ok(error && typeof error === "object" && "code" in error && error.code === "AUTH_REQUIRED");
    }
    assert.equal(remote.mock.callCount(), 0);
    assert.deepEqual(tool.inputSchema.properties?.limit, { type: "integer", minimum: 1, maximum: 50 });
    assert.deepEqual(acceptedInvalidLimits, []);
  } finally { await close(); }
});

test("all 27 SDK handlers reject an unknown key before handling well-typed anonymous arguments", async context => {
  const remote = context.mock.method(globalThis, "fetch", async () => { assert.fail("This protocol test forbids remote requests."); });
  const { client, close } = await connectedClient();
  const environmentId = "11111111-1111-4111-8111-111111111111";
  const agentId = "22222222-2222-4222-8222-222222222222";
  const componentIdUnique = "33333333-3333-4333-8333-333333333333";
  const jobId = "44444444-4444-4444-8444-444444444444";
  const draftId = "55555555-5555-4555-8555-555555555555";
  const requestId = "66666666-6666-4666-8666-666666666666";
  const target = { environmentId, agentId };
  const saveIdentity = { draftId, requestId, saveGrant: "offline-grant-".padEnd(32, "x") };
  const conversation = { ...target, conversationId: "offline-conversation" };
  const argumentsByTool: Record<string, Record<string, unknown>> = {
    open_agent_review: { jobId },
    show_agent_map: { ...target, componentIdUnique },
    browse_agent_reviews: { environmentId },
    open_agent_debugger: target,
    open_evaluation_builder: target,
    get_evaluation_draft: { draftId },
    get_evaluation_native_support: { draftId },
    create_agent_evaluation_set: { ...saveIdentity, name: "Offline fixture", method: "GeneralQualityGrader",
      selectedCases: [{ caseId: "offline-case", expectedResponses: [""] }], confirmed: true },
    get_agent_evaluation_save: saveIdentity,
    update_agent_evaluation_case: { ...saveIdentity, caseId: "offline-case", question: "Offline question", expectedResponse: "Offline answer" },
    get_initial_widget_data: { contextId: draftId },
    get_app_view_resource: { view: "review" },
    get_app_view_chunk: { view: "review", index: 0, sha256: "0".repeat(64) },
    list_debugger_agents: { environmentId },
    list_debugger_conversations: { ...target, limit: 50 },
    analyze_debugger_conversation: conversation,
    get_debugger_turn_details: { ...conversation, turnId: "offline-turn" },
    get_debugger_child_transcript: { ...conversation, sessionId: "offline-session" },
    get_debugger_conversation_transcript: conversation,
    list_reviewable_agents: { environmentId },
    get_agent_map: { ...target, componentIdUnique },
    get_connected_agent_map: { environmentId, targetSchemaName: "offline-schema" },
    list_agent_reviews: { environmentId },
    start_agent_review: { ...target, componentIdUnique, projectName: "Offline fixture", confirmed: true },
    get_agent_review_status: { jobId },
    finalize_agent_review: { jobId },
    get_agent_review_result: { reviewId: jobId },
  };
  const mismatches: string[] = [];
  try {
    assert.deepEqual(Object.keys(argumentsByTool).sort(), toolContracts.map(([name]) => name).sort());
    for (const [name] of toolContracts) {
      const reply = await client.callTool({ name, arguments: { ...argumentsByTool[name], unexpected: true } });
      const message = reply.content.flatMap(item => item.type === "text" ? [item.text] : []).join("\n");
      const validationRejected = reply.isError === true && /Input validation error/.test(message)
        && /unrecognized_keys/.test(message) && /unexpected/.test(message);
      if (!validationRejected) mismatches.push(name);
      context.diagnostic(JSON.stringify({ name, validationRejected, message,
        handlerError: reply.structuredContent?.error }));
    }
    assert.equal(remote.mock.callCount(), 0);
    assert.deepEqual(mismatches, [], "Advertised strict schemas must reject extras, not strip them before AUTH_REQUIRED.");
  } finally { await close(); }
});
