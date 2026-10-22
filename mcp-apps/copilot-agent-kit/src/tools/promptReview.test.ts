import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { AgentReviewService } from "../agent-review/server/service.js";
import { ReviewError, type ReviewAgent } from "../agent-review/server/types.js";
import { openAgentReview } from "./review-tools.js";
import { exactSelection } from "./target-selection.js";

const environment = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Copilot Studio Kit - Dev",
  region: "unitedstates",
};
const explicitEnvironment = {
  ...environment,
  id: "99999999-9999-4999-8999-999999999999",
  name: "Explicit environment",
};
const agent: ReviewAgent = {
  id: "22222222-2222-4222-8222-abcdefabcdef",
  name: "Zava Visual Merchandizer",
  componentIdUnique: "33333333-3333-4333-8333-333333333333",
  iconBase64: "complete-picker-icon",
  harness: "copilot",
};
const jobId = "44444444-4444-4444-8444-444444444444";
const reviewId = "55555555-5555-4555-8555-555555555555";
const prompt = { agentName: agent.name, startReview: true };

function fixture(context: TestContext) {
  const token = `fixture-only-${randomUUID()}`;
  const environments = context.mock.method(AgentReviewService.prototype, "listEnvironments", async () =>
    [environment, explicitEnvironment]);
  const defaults = context.mock.method(AgentReviewService.prototype, "defaultEnvironment", async () => {
    throw new Error("The review store must not choose the prompt target environment.");
  });
  const agents = context.mock.method(AgentReviewService.prototype, "listAgents", async () => [agent]);
  const resolve = context.mock.method(AgentReviewService.prototype, "resolveAgent", async (_id, input) =>
    exactSelection([agent], "AGENT", input.agentId, input.agentName));
  const start = context.mock.method(AgentReviewService.prototype, "start", async () => ({
    jobId, agentName: agent.name,
  }));
  const status = context.mock.method(AgentReviewService.prototype, "status", async (id: string) => ({
    jobId: id,
    agentName: agent.name,
    startedAt: "2026-10-09T07:00:00.000Z",
    status: "running" as const,
    completedComponents: 1,
    totalComponents: 2,
    lastCompletedStatus: null,
    nextPollMs: 5_000,
    canFinalize: false,
    error: null,
  }));
  const saved = context.mock.method(AgentReviewService.prototype, "getResult", async () => ({
    reviewId, model: {} as Awaited<ReturnType<AgentReviewService["getResult"]>>["model"],
  }));
  return { token, environments, defaults, agents, resolve, start, status, saved };
}

function selection(result: Awaited<ReturnType<typeof openAgentReview>>, code: string) {
  assert.equal(result.structuredContent?.state, "selecting", "An unresolved target must open the existing form.");
  assert.equal((result.structuredContent?.error as { code?: string })?.code, code);
}

test("an explicit exact agent name starts once in the named default environment without a form", async context => {
  const state = fixture(context);
  const result = await openAgentReview(state.token, prompt);
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent?.state, "running");
  assert.equal(result.structuredContent?.jobId, jobId);
  assert.equal(result.structuredContent?.environmentId, environment.id);
  assert.equal(result.structuredContent?.agentId, agent.id);
  assert.equal(state.defaults.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 1);
  assert.equal(result.structuredContent?.componentIdUnique, agent.componentIdUnique);
  const [environmentId, agentId, componentIdUnique, options] = state.start.mock.calls[0].arguments;
  assert.equal(environmentId, environment.id);
  assert.equal(agentId, agent.id);
  assert.equal(componentIdUnique, agent.componentIdUnique);
  assert.match(options.projectName, /^Agent Review /);
  assert.ok(options.projectName.length <= 100);
  assert.deepEqual(Object.keys(options), ["projectName"]);
  const text = result.content.flatMap(item => item.type === "text" ? [item.text] : []).join(" ");
  assert(text.includes(jobId));
  assert.doesNotMatch(text, /opened.*progress|progress.*visible/i);
  assert.equal(result.structuredContent?.agents, undefined);
  assert.deepEqual(result.structuredContent?.deferred, ["agents"]);
  assert.equal(state.agents.mock.callCount(), 0);
});

test("a prompt with no agent name opens the form and does not start", async context => {
  const state = fixture(context);
  const result = await openAgentReview(state.token, { startReview: true });
  selection(result, "AGENT_NAME_REQUIRED");
  assert.equal(state.start.mock.callCount(), 0);
});

test("named Review startup does not wait for the full agent and icon catalog", async context => {
  const state = fixture(context);
  state.agents.mock.mockImplementation(async () => {
    throw new Error("Named startup must not read the full catalog.");
  });
  const result = await openAgentReview(state.token, { agentName: agent.name });
  assert.equal(result.structuredContent?.state, "running");
  assert.equal(result.structuredContent?.agentId, agent.id);
  assert.equal(state.agents.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 1);
});

test("opening without an agent defaults the optional form to exact-name Dev", async context => {
  const state = fixture(context);
  const result = await openAgentReview(state.token, {});
  assert.equal(result.structuredContent?.state, "selecting");
  assert.equal(result.structuredContent?.environmentId, environment.id);
  assert.equal((result.structuredContent?.environment as { id?: string })?.id, environment.id);
  assert.deepEqual(state.agents.mock.calls[0]?.arguments, [environment.id]);
  assert.equal(state.defaults.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("an agent ID alone does not replace the missing prompt name", async context => {
  const state = fixture(context);
  selection(await openAgentReview(state.token, { agentId: agent.id, startReview: true }), "AGENT_NAME_REQUIRED");
  assert.equal(state.start.mock.callCount(), 0);
});

test("an unknown agent opens the selected default environment form", async context => {
  const state = fixture(context);
  const result = await openAgentReview(state.token, { ...prompt, agentName: "Unknown agent" });
  selection(result, "AGENT_NOT_FOUND");
  assert.equal(result.structuredContent?.environmentId, environment.id);
  assert.equal(result.structuredContent?.agentId, undefined);
  assert.equal(state.start.mock.callCount(), 0);
  assert.equal(state.agents.mock.callCount(), 0);
  assert.equal(state.resolve.mock.callCount(), 1);
});

test("duplicate exact agent names open the form instead of selecting the first record", async context => {
  const state = fixture(context);
  state.resolve.mock.mockImplementation(async (_id, input) => exactSelection([
    agent, { ...agent, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  ], "AGENT", input.agentId, input.agentName));
  const result = await openAgentReview(state.token, prompt);
  selection(result, "AGENT_AMBIGUOUS");
  assert.equal(result.structuredContent?.agentId, undefined);
  assert.equal(state.start.mock.callCount(), 0);
});

test("a request ID with different GUID case resumes the same start", async context => {
  const state = fixture(context);
  const requestId = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
  const first = await openAgentReview(state.token, { ...prompt, requestId });
  const repeated = await openAgentReview(state.token, { ...prompt, requestId: requestId.toUpperCase() });
  assert.equal(first.structuredContent?.state, "running");
  assert.equal(repeated.structuredContent?.state, "running");
  assert.equal(repeated.structuredContent?.jobId, jobId);
  assert.equal(repeated.structuredContent?.agentId, first.structuredContent?.agentId);
  assert.equal(repeated.structuredContent?.selectionId, first.structuredContent?.selectionId);
  assert.equal(state.start.mock.callCount(), 1);
});

for (const name of ["Zava", "ZavaVisualMerchandizer", "Zava  Visual Merchandizer"]) {
  test(`a non-exact prompt name "${name}" cannot start a different target`, async context => {
    const state = fixture(context);
    const result = await openAgentReview(state.token, { ...prompt, agentName: name });
    selection(result, "AGENT_NOT_FOUND");
    assert.equal(state.start.mock.callCount(), 0);
  });
}

test("exact name matching permits case differences and outer whitespace only", async context => {
  const state = fixture(context);
  const result = await openAgentReview(state.token, {
    ...prompt, agentName: ` ${agent.name.toUpperCase()} `,
    environmentName: ` ${environment.name.toUpperCase()} `,
  });
  assert.equal(result.structuredContent?.state, "running");
  assert.equal(result.structuredContent?.agentId, agent.id);
  assert.equal(state.start.mock.callCount(), 1);
});

for (const explicit of [{ environmentId: explicitEnvironment.id }, { environmentName: explicitEnvironment.name }]) {
  test(`a supplied ${Object.keys(explicit)[0]} is preserved and never replaced with the default`, async context => {
    const state = fixture(context);
    const result = await openAgentReview(state.token, { ...prompt, ...explicit });
    assert.equal(result.structuredContent?.state, "running");
    assert.equal(result.structuredContent?.environmentId, explicitEnvironment.id);
    assert.equal(state.agents.mock.callCount(), 0);
    assert.equal(state.resolve.mock.calls[0].arguments[0], explicitEnvironment.id);
    assert.equal(state.start.mock.callCount(), 1);
    assert.equal(state.start.mock.calls[0].arguments[0], explicitEnvironment.id);
    assert.equal(state.defaults.mock.callCount(), 0);
  });
}

test("an agent absent from an explicit environment never triggers a search in another environment", async context => {
  const state = fixture(context);
  state.resolve.mock.mockImplementation(async (_id, input) => exactSelection([], "AGENT", input.agentId, input.agentName));
  const result = await openAgentReview(state.token, { ...prompt, environmentId: explicitEnvironment.id });
  selection(result, "AGENT_NOT_FOUND");
  assert.equal(state.resolve.mock.callCount(), 1);
  assert.equal(state.agents.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("a missing named default environment opens the form with a clear reason", async context => {
  const state = fixture(context);
  state.environments.mock.mockImplementation(async () => [explicitEnvironment]);
  const result = await openAgentReview(state.token, prompt);
  selection(result, "ENVIRONMENT_NOT_FOUND");
  assert.match((result.structuredContent?.error as { message: string }).message, /Copilot Studio Kit - Dev/);
  assert.equal(state.agents.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("duplicate default environment names cannot authorize a start", async context => {
  const state = fixture(context);
  state.environments.mock.mockImplementation(async () => [
    environment, { ...explicitEnvironment, name: environment.name },
  ]);
  selection(await openAgentReview(state.token, prompt), "ENVIRONMENT_AMBIGUOUS");
  assert.equal(state.agents.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("an unknown explicit environment cannot fall back to the default", async context => {
  const state = fixture(context);
  selection(await openAgentReview(state.token, { ...prompt, environmentName: "Missing environment" }), "ENVIRONMENT_NOT_FOUND");
  assert.equal(state.defaults.mock.callCount(), 0);
  assert.equal(state.agents.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("conflicting explicit environment identifiers open the form without a start", async context => {
  const state = fixture(context);
  selection(await openAgentReview(state.token, {
    ...prompt, environmentId: explicitEnvironment.id, environmentName: environment.name,
  }), "ENVIRONMENT_NOT_FOUND");
  assert.equal(state.agents.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("a conflicting agent ID cannot replace the supplied exact name", async context => {
  const state = fixture(context);
  selection(await openAgentReview(state.token, {
    ...prompt, agentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }), "AGENT_NOT_FOUND");
  assert.equal(state.start.mock.callCount(), 0);
});

test("a supplied stale component version opens the form without a start", async context => {
  const state = fixture(context);
  selection(await openAgentReview(state.token, {
    ...prompt, componentIdUnique: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  }), "AGENT_CHANGED");
  assert.equal(state.start.mock.callCount(), 0);
});

test("an agent without a valid component version cannot start from a prompt", async context => {
  const state = fixture(context);
  state.resolve.mock.mockImplementation(async () => ({ ...agent, componentIdUnique: "" }));
  selection(await openAgentReview(state.token, prompt), "INVALID_ID");
  assert.equal(state.start.mock.callCount(), 0);
});

for (const operation of ["listEnvironments", "resolveAgent"] as const) {
  test(`${operation} API failure remains visible on the form and starts no job`, async context => {
    const state = fixture(context);
    const mock = operation === "listEnvironments" ? state.environments : state.resolve;
    mock.mock.mockImplementation(async () => {
      throw new ReviewError("DATAVERSE_ERROR", "You do not have access to this environment.");
    });
    const result = await openAgentReview(state.token, prompt);
    selection(result, "DATAVERSE_ERROR");
    assert.equal(result.isError, true);
    assert.match((result.structuredContent?.error as { message: string }).message, /do not have access/);
    assert.equal(state.start.mock.callCount(), 0);
    assert.equal(result.structuredContent?.agents, undefined, "An API error is not an empty successful agent list.");
    assert.equal(result.structuredContent?.deferred, undefined, "A failed target lookup must not schedule another catalog read.");
  });
}

test("authentication failure is explicit and cannot start a job", async context => {
  const state = fixture(context);
  const result = await openAgentReview(undefined, prompt);
  selection(result, "AUTH_REQUIRED");
  assert.equal(result.isError, true);
  assert.equal(state.environments.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("repeated prompt calls and recovery retain one acknowledged job and selection identity", async context => {
  const state = fixture(context);
  const input = { ...prompt, requestId: randomUUID() };
  const first = await openAgentReview(state.token, input);
  const repeated = await openAgentReview(state.token, input);
  const recovery = await openAgentReview(state.token, { ...input, resumeOnly: true });
  for (const output of [first, repeated, recovery]) {
    assert.equal(output.structuredContent?.state, "running");
    assert.equal(output.structuredContent?.agentId, agent.id);
    assert.equal(output.structuredContent?.jobId, jobId);
  }
  assert.equal(new Set([first, repeated, recovery].map(output => output.structuredContent?.selectionId)).size, 1);
  assert.equal(state.start.mock.callCount(), 1);
});

test("repeated calls without an optional request ID cannot duplicate a pending or returned start", async context => {
  const state = fixture(context);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  state.start.mock.mockImplementation(async () => {
    await pending;
    return { jobId, agentName: agent.name };
  });
  const first = openAgentReview(state.token, prompt);
  const second = openAgentReview(state.token, { ...prompt, agentName: agent.name.toUpperCase() });
  await new Promise(resolve => setImmediate(resolve));
  const calls = state.start.mock.callCount();
  finish();
  const results = await Promise.all([first, second]);
  const repeated = await openAgentReview(state.token, prompt);
  assert.equal(calls, 1);
  assert.ok(results.every(item => item.structuredContent?.jobId === jobId));
  assert.equal(repeated.structuredContent?.jobId, jobId);
  assert.equal(state.start.mock.callCount(), 1);
});

test("two request IDs cannot duplicate the same target while its start is pending", async context => {
  const state = fixture(context);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  state.start.mock.mockImplementation(async () => {
    await pending;
    return { jobId, agentName: agent.name };
  });
  const first = openAgentReview(state.token, { ...prompt, requestId: randomUUID() });
  const second = openAgentReview(state.token, { ...prompt, requestId: randomUUID() });
  await new Promise(resolve => setImmediate(resolve));
  const calls = state.start.mock.callCount();
  finish();
  const outputs = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert(outputs.every(output => output.structuredContent?.jobId === jobId));
  assert.equal(state.start.mock.callCount(), 1);
});

test("read-only initial recovery never starts a missing prompt request", async context => {
  const state = fixture(context);
  const result = await openAgentReview(state.token, { ...prompt, resumeOnly: true });
  selection(result, "REVIEW_REQUEST_NOT_FOUND");
  assert.equal(result.structuredContent?.agentId, agent.id);
  assert.equal(result.structuredContent?.jobId, undefined);
  assert.equal(state.start.mock.callCount(), 0);
});

test("a stable request ID cannot authorize another target", async context => {
  const state = fixture(context);
  const requestId = randomUUID();
  await openAgentReview(state.token, { ...prompt, requestId });
  const result = await openAgentReview(state.token, {
    ...prompt, requestId, environmentId: explicitEnvironment.id,
  });
  selection(result, "REVIEW_REQUEST_CHANGED");
  assert.equal(result.structuredContent?.environmentId, explicitEnvironment.id);
  assert.equal(state.start.mock.callCount(), 1);
});

test("a new explicit request ID can authorize a later review after the first start returns", async context => {
  const state = fixture(context);
  await openAgentReview(state.token, { ...prompt, requestId: randomUUID() });
  await openAgentReview(state.token, { ...prompt, requestId: randomUUID() });
  assert.equal(state.start.mock.callCount(), 2);
});

test("a failed start is explicit and repeated calls do not retry the write", async context => {
  const state = fixture(context);
  state.start.mock.mockImplementation(async () => {
    throw new ReviewError("DATAVERSE_ERROR", "The review start could not be confirmed.");
  });
  const input = { ...prompt, requestId: randomUUID() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await openAgentReview(state.token, input);
    selection(result, "DATAVERSE_ERROR");
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent?.jobId, undefined);
  }
  assert.equal(state.start.mock.callCount(), 1);
});

test("a start without a job ID cannot return successful running progress", async context => {
  const state = fixture(context);
  state.start.mock.mockImplementation(async () => ({ jobId: "", agentName: agent.name }));
  const result = await openAgentReview(state.token, prompt);
  selection(result, "INVALID_ID");
  assert.equal(result.structuredContent?.jobId, undefined);
  assert.equal(result.isError, true);
  assert.equal(state.start.mock.callCount(), 1);
});

test("an existing job resumes without starting even when a prompt-start flag is present", async context => {
  const state = fixture(context);
  const result = await openAgentReview(state.token, { ...prompt, jobId });
  assert.equal(result.structuredContent?.state, "running");
  assert.equal((result.structuredContent?.status as { jobId?: string })?.jobId, jobId);
  assert.equal(state.status.mock.callCount(), 1);
  assert.equal(state.start.mock.callCount(), 0);
  assert.equal(state.environments.mock.callCount(), 0);
});

test("a completed review opens without starting even when a prompt-start flag is present", async context => {
  const state = fixture(context);
  const result = await openAgentReview(state.token, { ...prompt, reviewId });
  assert.equal(result.structuredContent?.state, "review");
  assert.equal(state.saved.mock.callCount(), 1);
  assert.equal(state.start.mock.callCount(), 0);
});

for (const error of [
  new Error("Saved-result fixture failure."),
  new ReviewError("DATAVERSE_ERROR", "The saved-result read was denied."),
  new ReviewError("ENVIRONMENT_NOT_FOUND", "The saved-result storage environment was not found."),
]) {
  test(`a saved-ID opener failure retains its exact ID through the SDK (${error instanceof ReviewError ? error.code : error.name})`, async context => {
    const state = fixture(context);
    state.saved.mock.mockImplementation(async () => { throw error; });
    const server = createServer(state.token);
    const client = new Client({ name: "saved-id-failure-fixture", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
      const output = await client.callTool({
        name: "open_agent_review",
        arguments: { reviewId, startReview: false, resumeOnly: true },
      });
      assert.equal(output.isError, true);
      assert.equal(output.structuredContent?.state, "error");
      assert.equal(output.structuredContent?.reviewId, reviewId);
      assert.equal(output.structuredContent?.jobId, undefined);
      assert.equal(output.structuredContent?.deferred, undefined);
      assert.equal((output.structuredContent?.error as { code?: string })?.code,
        error instanceof ReviewError ? error.code : "INTERNAL_ERROR");
      assert.deepEqual(state.saved.mock.calls[0].arguments, [reviewId]);
      assert.equal(state.saved.mock.callCount(), 1);
      assert.equal(state.environments.mock.callCount(), 0);
      assert.equal(state.agents.mock.callCount(), 0);
      assert.equal(state.resolve.mock.callCount(), 0);
      assert.equal(state.status.mock.callCount(), 0);
      assert.equal(state.start.mock.callCount(), 0);
    } finally {
      await client.close();
      await server.close();
    }
  });
}

test("a saved-ID authentication failure retains the requested ID without target discovery", async context => {
  const state = fixture(context);
  const output = await openAgentReview(undefined, { reviewId, startReview: false, resumeOnly: true });
  assert.equal(output.isError, true);
  assert.equal(output.structuredContent?.state, "error");
  assert.equal(output.structuredContent?.reviewId, reviewId);
  assert.equal((output.structuredContent?.error as { code?: string })?.code, "AUTH_REQUIRED");
  assert.equal(state.saved.mock.callCount(), 0);
  assert.equal(state.environments.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("a job-ID status failure retains its exact job without a replacement start", async context => {
  const state = fixture(context);
  state.status.mock.mockImplementation(async () => { throw new Error("Status fixture failure."); });
  const output = await openAgentReview(state.token, { jobId, startReview: false, resumeOnly: true });
  assert.equal(output.isError, true);
  assert.equal(output.structuredContent?.state, "load-error");
  assert.equal(output.structuredContent?.jobId, jobId);
  assert.equal(output.structuredContent?.reviewId, undefined);
  assert.equal(output.structuredContent?.deferred, undefined);
  assert.deepEqual(state.status.mock.calls[0].arguments, [jobId]);
  assert.equal(state.status.mock.callCount(), 1);
  assert.equal(state.environments.mock.callCount(), 0);
  assert.equal(state.saved.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("manual named Review retains its usable selected target without waiting for the full picker", async context => {
  const state = fixture(context);
  const result = await openAgentReview(state.token, {
    environmentName: environment.name, agentName: agent.name, startReview: false,
  });
  assert.equal(result.structuredContent?.state, "selecting");
  assert.equal(result.structuredContent?.agentId, agent.id);
  assert.equal(result.structuredContent?.agents, undefined);
  assert.deepEqual(result.structuredContent?.deferred, ["agents"]);
  assert.equal(state.agents.mock.callCount(), 0);
  assert.equal(state.start.mock.callCount(), 0);
});

test("the actual opener contract declares its write and rejects undeclared start inputs", async context => {
  const state = fixture(context);
  const server = createServer(state.token);
  const client = new Client({ name: "prompt-contract-fixture", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const tools = await client.listTools();
    const opener = tools.tools.find(tool => tool.name === "open_agent_review");
    assert.ok(opener);
    assert.equal(opener.annotations?.readOnlyHint, false);
    assert.equal(opener.annotations?.idempotentHint, false);
    assert.equal(opener.inputSchema.additionalProperties, false);
    assert.ok(opener.inputSchema.properties?.startReview);
    assert.ok(opener.inputSchema.properties?.resumeOnly);
    const invalid = await client.callTool({
      name: "open_agent_review",
      arguments: { ...prompt, transcriptLimit: 100 },
    });
    assert.equal(invalid.isError, true);
    assert.equal(state.start.mock.callCount(), 0);
    const valid = await client.callTool({ name: "open_agent_review", arguments: prompt });
    assert.equal(valid.structuredContent?.state, "running");
    assert.equal(state.start.mock.callCount(), 1);
  } finally {
    await client.close();
    await server.close();
  }
});
