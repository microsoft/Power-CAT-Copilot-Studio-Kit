import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { AgentReviewService } from "../agent-review/server/service.js";
import { openAgentReview, startAgentReview } from "./review-tools.js";

const environment = {
  id: "11111111-1111-4111-8111-111111111111", name: "Copilot Studio Kit - Dev", region: "offline",
};
const explicit = { ...environment, id: "99999999-9999-4999-8999-999999999999", name: "Selected source" };
const agent = {
  id: "22222222-2222-4222-8222-222222222222", name: "Zava Visual Merchandizer",
  componentIdUnique: "33333333-3333-4333-8333-333333333333", harness: "copilot" as const,
};
const jobId = "44444444-4444-4444-8444-444444444444";
const confirmedInput = {
  environmentId: environment.id, agentId: agent.id, componentIdUnique: agent.componentIdUnique,
  projectName: "Confirmed offline review", confirmed: true,
};

function fixture(context: TestContext) {
  const token = `offline-confirmation-${randomUUID()}`;
  context.mock.method(AgentReviewService.prototype, "listEnvironments", async () => [environment, explicit]);
  const home = context.mock.method(AgentReviewService.prototype, "defaultEnvironment", async () => {
    throw new Error("The saved-result home must not select a named Review target.");
  });
  const agents = context.mock.method(AgentReviewService.prototype, "listAgents", async () => [agent]);
  const resolve = context.mock.method(AgentReviewService.prototype, "resolveAgent", async () => agent);
  const start = context.mock.method(AgentReviewService.prototype, "start", async () => ({ jobId, agentName: agent.name }));
  return { token, home, agents, resolve, start };
}

for (const startReview of [false]) {
  test(`a named Review opens confirmation without a write when startReview is ${String(startReview)}`, async context => {
    const state = fixture(context);
    const output = await openAgentReview(state.token, { agentName: agent.name, startReview });
    assert.equal(output.isError, undefined);
    assert.equal(output.structuredContent?.state, "selecting");
    assert.equal(output.structuredContent?.environmentId, environment.id);
    assert.equal(output.structuredContent?.agentId, agent.id);
    assert.equal(output.structuredContent?.jobId, undefined);
    assert.equal(state.home.mock.callCount(), 0);
    assert.equal(state.start.mock.callCount(), 0);
    assert.match(output.content.flatMap(item => item.type === "text" ? [item.text] : []).join(" "), /No review job was created/);
  });
}

test("a clear Review agent name starts directly when the optional start flag is omitted", async context => {
  const state = fixture(context);
  const output = await openAgentReview(state.token, { agentName: agent.name });
  assert.equal(output.structuredContent?.state, "running");
  assert.equal(output.structuredContent?.jobId, jobId);
  assert.equal(output.structuredContent?.environmentId, environment.id);
  assert.equal(state.home.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 1);
});

test("an explicit exact Review request bypasses the optional form only with an acknowledged job", async context => {
  const state = fixture(context);
  const output = await openAgentReview(state.token, { agentName: agent.name, startReview: true });
  assert.equal(output.structuredContent?.state, "running");
  assert.equal(output.structuredContent?.jobId, jobId);
  assert.equal(output.structuredContent?.environmentId, environment.id);
  assert.equal(state.home.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 1);
  assert(output.content.some(item => item.type === "text" && item.text.includes(jobId)));
});

test("confirmation preserves the explicit source environment", async context => {
  const state = fixture(context);
  const output = await openAgentReview(state.token, { agentName: agent.name, environmentId: explicit.id, startReview: false });
  assert.equal(output.structuredContent?.state, "selecting");
  assert.equal(output.structuredContent?.environmentId, explicit.id);
  assert.equal(state.resolve.mock.calls[0].arguments[0], explicit.id);
  assert.equal(state.agents.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("repeated explicit requests and read-only recovery share one acknowledged Review", async context => {
  const state = fixture(context);
  const input = { agentName: agent.name, startReview: true, requestId: randomUUID() };
  const outputs = await Promise.all([
    openAgentReview(state.token, input),
    openAgentReview(state.token, input),
    openAgentReview(state.token, { ...input, resumeOnly: true }),
  ]);
  assert(outputs.every(output => output.structuredContent?.state === "running"));
  assert(outputs.every(output => output.structuredContent?.jobId === jobId));
  assert.equal(new Set(outputs.map(output => output.structuredContent?.selectionId)).size, 1);
  assert.equal(state.start.mock.callCount(), 1);
});

test("same-job resume text names the acknowledged job without claiming visible progress", async context => {
  const state = fixture(context);
  context.mock.method(AgentReviewService.prototype, "status", async () => ({
    jobId, agentName: agent.name, status: "running" as const, completedComponents: 1, totalComponents: 3,
    nextPollMs: 5_000, canFinalize: false, error: null,
  }));
  const output = await openAgentReview(state.token, { jobId });
  assert.equal(output.structuredContent?.jobId, jobId);
  const text = output.content.flatMap(item => item.type === "text" ? [item.text] : []).join(" ");
  assert(text.includes(jobId));
  assert.doesNotMatch(text, /opened.*progress|progress.*visible/i);
  assert.equal(state.start.mock.callCount(), 0);
});

test("the MCP contract declares the optional direct write and keeps confirmed creation app-only", async context => {
  const state = fixture(context);
  const server = createServer(state.token);
  const client = new Client({ name: "confirmation-contract", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    assert.equal(tools.find(tool => tool.name === "open_agent_review")?.annotations?.readOnlyHint, false);
    assert.deepEqual(tools.find(tool => tool.name === "start_agent_review")?._meta?.ui, {
      resourceUri: tools.find(tool => tool.name === "open_agent_review")?._meta?.ui?.resourceUri,
      visibility: ["app"],
    });
    assert.equal(state.start.mock.callCount(), 0);
  } finally {
    await client.close();
    await server.close();
  }
});

test("direct and confirmed actions cannot duplicate the same pending target and options", async context => {
  const state = fixture(context);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  state.start.mock.mockImplementation(async () => {
    await pending;
    return { jobId, agentName: agent.name };
  });
  const direct = openAgentReview(state.token, { agentName: agent.name, startReview: true });
  await new Promise(resolve => setImmediate(resolve));
  const projectName = state.start.mock.calls[0]?.arguments[3].projectName ?? "No direct start";
  const manual = startAgentReview(state.token, { ...confirmedInput, projectName });
  finish();
  const outputs = await Promise.all([direct, manual]);
  assert(outputs.every(output => output.structuredContent?.jobId === jobId));
  assert.equal(state.start.mock.callCount(), 1);
});

test("repeated confirmed actions share one pending start and its acknowledged job", async context => {
  const state = fixture(context);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  state.start.mock.mockImplementation(async () => {
    await pending;
    return { jobId, agentName: agent.name };
  });
  const first = startAgentReview(state.token, confirmedInput);
  const second = startAgentReview(state.token, confirmedInput);
  const calls = state.start.mock.callCount();
  finish();
  const outputs = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert(outputs.every(output => output.structuredContent?.jobId === jobId));
  assert(outputs.every(output => output.structuredContent?.state === "running"));
  assert(outputs.every(output => output.content.some(item => item.type === "text" && item.text.includes(jobId))));
});

test("changed options cannot replace a pending confirmed start", async context => {
  const state = fixture(context);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  state.start.mock.mockImplementation(async () => {
    await pending;
    return { jobId, agentName: agent.name };
  });
  const first = startAgentReview(state.token, confirmedInput);
  const changed = startAgentReview(state.token, { ...confirmedInput, projectName: "Changed offline review" });
  finish();
  const [, rejected] = await Promise.all([first, changed]);
  assert.equal(rejected.isError, true);
  assert.equal((rejected.structuredContent?.error as { code?: string })?.code, "REVIEW_REQUEST_CHANGED");
  assert.equal(state.start.mock.callCount(), 1);
});

test("confirmed creation cannot report running without an acknowledged job ID", async context => {
  const state = fixture(context);
  state.start.mock.mockImplementation(async () => ({ jobId: "", agentName: agent.name }));
  const output = await startAgentReview(state.token, confirmedInput);
  assert.equal(output.isError, true);
  assert.equal(output.structuredContent?.state, "error");
});

test("an unconfirmed action cannot start a Review", async context => {
  const state = fixture(context);
  const output = await startAgentReview(state.token, { ...confirmedInput, confirmed: false });
  assert.equal(output.isError, true);
  assert.equal((output.structuredContent?.error as { code?: string })?.code, "CONFIRMATION_REQUIRED");
  assert.equal(state.start.mock.callCount(), 0);
});
