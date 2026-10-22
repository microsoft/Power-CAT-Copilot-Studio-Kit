import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import test from "node:test";
import { createServer } from "../server.js";
import { AgentReviewService } from "../src/agent-review/server/service.js";
import { ReviewError } from "../src/agent-review/server/types.js";
import { AgentDebuggerService } from "../src/agent-debugger/server/service.js";
import { compactInitialWidgetResult } from "../src/tools/initialWidgetPayload.js";
import { readCompleteToolResult } from "../src/widgets/shared/tool-result.js";

const environment = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Copilot Studio Kit - Dev", region: "unitedstates",
  url: "https://example.crm.dynamics.com",
};
const agent = {
  id: "22222222-2222-2222-2222-222222222222", name: "Zava Visual Merchandizer",
  componentIdUnique: "33333333-3333-3333-3333-333333333333", experience: "generative",
};
const initialResultLimit = 65_536;
const resourceVersion = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "server.ts"), "utf8")
  .match(/const widgetResourceVersion = "([^"]+)"/)?.[1];
assert.ok(resourceVersion);

test("a partial Review failure retains its job and diagnostics below the initial result bound", () => {
  const jobId = "44444444-4444-4444-8444-444444444444";
  const error = { code: "NOT_FOUND", message: "The job was created, but the input upload failed.",
    retryable: false, diagnostics: { start: { stage: "upload_input", jobCreation: "created", jobId } } };
  const agents = Array.from({ length: 250 }, () => ({ ...agent, iconBase64: "A".repeat(16_384) }));
  const initial = compactInitialWidgetResult({
    isError: true, content: [{ type: "text", text: error.message }],
    structuredContent: { state: "failed", environmentId: environment.id, agents, jobId, error },
  }, "open_agent_review");
  assert.ok(Buffer.byteLength(JSON.stringify(initial), "utf8") <= initialResultLimit);
  assert.equal(initial.structuredContent?.state, "failed");
  assert.equal(initial.structuredContent?.jobId, jobId);
  assert.deepEqual(initial.structuredContent?.error, error);
  assert.deepEqual(initial.structuredContent?.deferred, ["agents"]);
  assert.equal(agents.length, 250);
  assert.equal(agents[249].iconBase64.length, 16_384);
});

async function connectedClient() {
  const server = createServer("local-test-token-not-a-credential");
  const client = new Client({ name: "initial-widget-delivery-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

test("a large Review picker stays below the serialized inline bound and retains every icon on demand", async (context) => {
  const environments = Array.from({ length: 25 }, (_, index) => ({
    ...environment, id: index ? `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111` : environment.id,
    name: index ? `Local environment ${index}` : environment.name,
  }));
  const agents = Array.from({ length: 250 }, (_, index) => ({
    ...agent, id: index ? `${String(index).padStart(8, "0")}-2222-4222-8222-222222222222` : agent.id,
    name: index ? `Local agent ${index}` : agent.name, harness: "copilot", iconBase64: "A".repeat(16_384),
  }));
  const original = structuredClone(agents);
  context.mock.method(AgentReviewService.prototype, "listEnvironments", async () => environments);
  context.mock.method(AgentReviewService.prototype, "listAgents", async () => agents);
  context.mock.method(AgentReviewService.prototype, "resolveAgent", async () => agents[0]);
  const { client, close } = await connectedClient();
  try {
    const initial = await client.callTool({ name: "open_agent_review", arguments: {
      environmentName: environment.name, agentName: agent.name, startReview: false,
    } });
    const bytes = Buffer.byteLength(JSON.stringify(initial), "utf8");
    assert.ok(bytes <= initialResultLimit, `${bytes} bytes exceed Cowork's documented inline CallToolResult bound`);
    assert.equal(initial.structuredContent?.agentId, agent.id);
    assert.equal(initial.structuredContent?.componentIdUnique, agent.componentIdUnique);
    assert.deepEqual(initial.structuredContent?.environments, environments);
    assert.equal(initial.structuredContent?.agents, undefined);
    assert.deepEqual(initial.structuredContent?.deferred, ["agents"]);
    assert.deepEqual(initial._meta, { ui: { resourceUri: `ui://open_agent_review/${resourceVersion}/agent-review.html` } });
    const pulled = await client.callTool({ name: "list_reviewable_agents", arguments: { environmentId: environment.id } });
    assert.ok(Buffer.byteLength(JSON.stringify(pulled), "utf8") <= initialResultLimit);
    const decoded = await readCompleteToolResult(pulled, request => client.callTool(request));
    assert.deepEqual(decoded.structuredContent?.agents, original);
    assert.deepEqual(agents, original);
  } finally { await close(); }
});

test("a large completed Review is pulled by its existing read-only result tool", async (context) => {
  const reviewId = "44444444-4444-4444-4444-444444444444";
  const model = { agentName: agent.name, evidence: "Complete saved review evidence. ".repeat(5_000) };
  context.mock.method(AgentReviewService.prototype, "getResult", async () => ({ reviewId, model }));
  const { client, close } = await connectedClient();
  try {
    const initial = await client.callTool({ name: "open_agent_review", arguments: { reviewId } });
    assert.ok(Buffer.byteLength(JSON.stringify(initial), "utf8") <= initialResultLimit);
    assert.equal(initial.structuredContent?.reviewId, reviewId);
    assert.equal(initial.structuredContent?.model, undefined);
    assert.deepEqual(initial.structuredContent?.deferred, ["model"]);
    const pulled = await client.callTool({ name: "get_agent_review_result", arguments: { reviewId, presentation: "summary" } });
    assert.ok(Buffer.byteLength(JSON.stringify(pulled), "utf8") <= initialResultLimit);
    const decoded = await readCompleteToolResult(pulled, request => client.callTool(request));
    assert.deepEqual(decoded.structuredContent?.model, model);
  } finally { await close(); }
});

test("the complete saved Review result stays below the tool limit before app decoding", async (context) => {
  const reviewId = "77777777-7777-4777-8777-777777777777";
  const model = { agentName: agent.name, evidence: "Full saved evidence, reason, correction and steps. ".repeat(2_000) };
  context.mock.method(AgentReviewService.prototype, "getResult", async () => ({ reviewId, model }));
  const { client, close } = await connectedClient();
  try {
    const reply = await client.callTool({ name: "get_agent_review_result", arguments: { reviewId, presentation: "summary" } });
    const bytes = Buffer.byteLength(JSON.stringify(reply), "utf8");
    assert.ok(bytes <= initialResultLimit, `The saved Review reply is ${bytes} bytes.`);
  } finally { await close(); }
});

test("large Debugger analysis is compact initially and complete through existing app-only reads", async (context) => {
  const conversation = { id: "saved-conversation", name: "saved-conversation" };
  const analysis = {
    environment, agent, conversation,
    processedTranscript: { raw: { activities: [] }, generalInfo: { durationMs: 1_000, turnCount: 1 },
      turns: [{ id: "turn", role: "assistant", content: "Saved long answer. ".repeat(5_000), activities: [] }] },
    recommendations: [], connectedAgents: [], sessions: [], usageBySession: {},
  };
  context.mock.method(AgentDebuggerService.prototype, "listEnvironments", async () => [environment]);
  context.mock.method(AgentDebuggerService.prototype, "listAgents", async () => [agent]);
  context.mock.method(AgentDebuggerService.prototype, "resolveAgent", async () => agent);
  context.mock.method(AgentDebuggerService.prototype, "listConversations", async () => [conversation]);
  context.mock.method(AgentDebuggerService.prototype, "analyze", async () => analysis);
  const { client, close } = await connectedClient();
  try {
    const initial = await client.callTool({ name: "open_agent_debugger", arguments: {
      environmentId: environment.id, agentId: agent.id, conversationId: conversation.id,
    } });
    assert.ok(Buffer.byteLength(JSON.stringify(initial), "utf8") <= initialResultLimit);
    assert.equal(initial.structuredContent?.state, "analysis");
    assert.deepEqual(initial.structuredContent?.environment, environment);
    assert.deepEqual(initial.structuredContent?.agent, agent);
    assert.deepEqual(initial.structuredContent?.conversation, conversation);
    assert.deepEqual(initial.structuredContent?.deferred, ["agents", "analysis"]);
    assert.equal(initial.structuredContent?.processedTranscript, undefined);
    const pulled = await client.callTool({ name: "analyze_debugger_conversation", arguments: {
      environmentId: environment.id, agentId: agent.id, conversationId: conversation.id,
    } });
    assert.ok(Buffer.byteLength(JSON.stringify(pulled), "utf8") <= initialResultLimit);
    const decoded = await readCompleteToolResult(pulled, request => client.callTool(request));
    assert.deepEqual(decoded.structuredContent?.processedTranscript, analysis.processedTranscript);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 27);
    assert.deepEqual(tools.tools.find((tool) => tool.name === "analyze_debugger_conversation")?._meta?.ui, {
      resourceUri: `ui://open_agent_debugger/${resourceVersion}/agent-debugger.html`, visibility: ["app"],
    });
  } finally { await close(); }
});

test("small opening results retain their existing complete inline data", async (context) => {
  context.mock.method(AgentReviewService.prototype, "listEnvironments", async () => [environment]);
  context.mock.method(AgentReviewService.prototype, "listAgents", async () => [{ ...agent, iconBase64: "small" }]);
  const { client, close } = await connectedClient();
  try {
    const initial = await client.callTool({ name: "open_agent_review", arguments: { environmentId: environment.id } });
    assert.ok(Buffer.byteLength(JSON.stringify(initial), "utf8") <= initialResultLimit);
    assert.ok(Array.isArray(initial.structuredContent?.agents));
    assert.equal(initial.structuredContent?.deferred, undefined);
  } finally { await close(); }
});

test("a named selection error preserves its reason and complete large picker without a start", async (context) => {
  const agents = Array.from({ length: 250 }, (_, index) => ({
    ...agent, id: index ? `${String(index).padStart(8, "0")}-2222-4222-8222-222222222222` : agent.id,
    name: index ? `Local agent ${index}` : agent.name, harness: "copilot", iconBase64: "A".repeat(16_384),
  }));
  context.mock.method(AgentReviewService.prototype, "listEnvironments", async () => [environment]);
  context.mock.method(AgentReviewService.prototype, "listAgents", async () => agents);
  context.mock.method(AgentReviewService.prototype, "resolveAgent", async () => agents[0]);
  const start = context.mock.method(AgentReviewService.prototype, "start", async () => {
    throw new ReviewError("DATAVERSE_ERROR", "The review could not start. Use its job ID if one was created.");
  });
  const { client, close } = await connectedClient();
  try {
    const initial = await client.callTool({ name: "open_agent_review", arguments: {
      agentName: agent.name, startReview: true, requestId: "66666666-6666-4666-8666-666666666666",
      componentIdUnique: "88888888-8888-4888-8888-888888888888",
    } });
    assert.equal(initial.isError, undefined);
    assert.equal(initial.structuredContent?.state, "selecting");
    assert.equal((initial.structuredContent?.error as { code: string }).code, "AGENT_CHANGED");
    assert.ok(Buffer.byteLength(JSON.stringify(initial), "utf8") <= initialResultLimit);
    assert.deepEqual(initial.structuredContent?.deferred, ["agents"]);
    const pulled = await client.callTool({ name: "list_reviewable_agents", arguments: { environmentId: environment.id } });
    const decoded = await readCompleteToolResult(pulled, request => client.callTool(request));
    assert.ok(Buffer.byteLength(JSON.stringify(pulled), "utf8") <= initialResultLimit);
    assert.deepEqual(decoded.structuredContent?.agents, agents);
    assert.equal(start.mock.callCount(), 0);
  } finally { await close(); }
});

test("a named Debugger list preserves full records and icons through bounded read-only recovery", async (context) => {
  const agents = Array.from({ length: 250 }, (_, index) => ({
    ...agent, id: index ? `${String(index).padStart(8, "0")}-2222-4222-8222-222222222222` : agent.id,
    name: index ? `Local agent ${index}` : agent.name, iconBase64: "A".repeat(16_384),
  }));
  const conversations = [{ id: "saved", name: "saved" }];
  context.mock.method(AgentDebuggerService.prototype, "listEnvironments", async () => [environment]);
  context.mock.method(AgentDebuggerService.prototype, "listAgents", async () => agents);
  context.mock.method(AgentDebuggerService.prototype, "resolveAgent", async () => agent);
  context.mock.method(AgentDebuggerService.prototype, "listConversations", async () => conversations);
  const start = context.mock.method(AgentReviewService.prototype, "start", async () => { throw new Error("No Debugger writes."); });
  const finalize = context.mock.method(AgentReviewService.prototype, "finalize", async () => { throw new Error("No Debugger writes."); });
  const analyze = context.mock.method(AgentDebuggerService.prototype, "analyze", async () => { throw new Error("Analysis must be deferred until the app reads it."); });
  const { client, close } = await connectedClient();
  try {
    const initial = await client.callTool({ name: "open_agent_debugger", arguments: { agentName: agent.name } });
    assert.equal(initial.isError, undefined);
    assert.equal(initial.structuredContent?.state, "analysis");
    assert.equal(initial.structuredContent?.targetResolved, true);
    assert.ok(Buffer.byteLength(JSON.stringify(initial), "utf8") <= initialResultLimit);
    assert.deepEqual(initial.structuredContent?.agent, agent);
    assert.equal(initial.structuredContent?.conversationId, conversations[0].id);
    assert.deepEqual(initial.structuredContent?.deferred, ["agents", "analysis"]);
    const pulled = await client.callTool({ name: "list_debugger_agents", arguments: { environmentId: environment.id } });
    const decoded = await readCompleteToolResult(pulled, request => client.callTool(request));
    assert.ok(Buffer.byteLength(JSON.stringify(pulled), "utf8") <= initialResultLimit);
    assert.deepEqual(decoded.structuredContent?.agents, agents);
    assert.equal(start.mock.callCount(), 0);
    assert.equal(finalize.mock.callCount(), 0);
    assert.equal(analyze.mock.callCount(), 0);
  } finally { await close(); }
});

test("a large Debugger conversation error remains bounded with a visible target and error", async (context) => {
  const agents = Array.from({ length: 250 }, (_, index) => ({
    ...agent, id: index ? `${String(index).padStart(8, "0")}-2222-4222-8222-222222222222` : agent.id,
    name: index ? `Local agent ${index}` : agent.name, iconBase64: "A".repeat(16_384),
  }));
  context.mock.method(AgentDebuggerService.prototype, "listEnvironments", async () => [environment]);
  context.mock.method(AgentDebuggerService.prototype, "listAgents", async () => agents);
  context.mock.method(AgentDebuggerService.prototype, "resolveAgent", async () => agent);
  context.mock.method(AgentDebuggerService.prototype, "listConversations", async () => {
    throw new ReviewError("DATAVERSE_ERROR", "Conversation access failed.");
  });
  const { client, close } = await connectedClient();
  try {
    const initial = await client.callTool({ name: "open_agent_debugger", arguments: { agentName: agent.name } });
    assert.equal(initial.isError, true);
    assert.equal(initial.structuredContent?.state, "conversations");
    assert.equal(initial.structuredContent?.targetResolved, true);
    assert.ok(Buffer.byteLength(JSON.stringify(initial), "utf8") <= initialResultLimit);
    assert.equal((initial.structuredContent?.error as { code: string }).code, "DATAVERSE_ERROR");
    assert.deepEqual(initial.structuredContent?.deferred, ["agents"]);
  } finally { await close(); }
});
