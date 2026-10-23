import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import type { App } from "@modelcontextprotocol/ext-apps";
import { createInitialToolDataRecovery } from "../src/widgets/shared/initial-tool-data.js";
import { boundedToolResult, compactInitialWidgetResult, getInitialWidgetData } from "../src/tools/initialWidgetPayload.js";

type ToolResult = Awaited<ReturnType<App["callServerTool"]>>;
const args = { environmentName: "Copilot Studio Kit - Dev", agentName: "Zava Visual Merchandizer" };

test("a complete context preserves its existing deferred analysis and accepts it only for the selected conversation", async () => {
  const environment = { id: "env", name: args.environmentName };
  const agent = { id: "agent", name: args.agentName };
  const data = {
    state: "analysis", selectionId: "owned-first-conversation", targetResolved: true,
    environmentId: environment.id, environment, agentId: agent.id, agent,
    conversationId: "saved-first", conversation: { id: "saved-first", name: "saved-first" },
    conversations: [{ id: "saved-first", name: "saved-first" }],
    environments: Array.from({ length: 100 }, (_, index) => ({ id: `${index}`, name: "x".repeat(1000) })),
    deferred: ["agents", "analysis"],
  };
  const compact = compactInitialWidgetResult({ content: [], structuredContent: data }, "open_agent_debugger", "context-and-analysis");
  assert.deepEqual(compact.structuredContent?.deferred, ["context"]);
  assert.equal(compact.structuredContent?.conversationId, "saved-first");
  for (const replyId of ["saved-first", "obsolete-conversation"]) {
    const state = mount({ content: [] }, null, async request => {
      if (request.name === "get_initial_widget_data") {
        return getInitialWidgetData("context-and-analysis", request.arguments as { contextId: string });
      }
      if (request.name === "list_debugger_agents") return { content: [], structuredContent: { state: "agents", agents: [agent] } };
      assert.equal(request.name, "analyze_debugger_conversation");
      assert.equal(request.arguments?.conversationId, "saved-first");
      return { content: [], structuredContent: { state: "analysis", environment, agent,
        conversation: { id: replyId, name: replyId }, processedTranscript: { turns: [] } } };
    }, "open_agent_debugger");
    await state.recovery.ready();
    await state.recovery.receiveResult(compact);
    const restored = state.data() as Record<string, unknown>;
    assert.equal(restored.conversationId, "saved-first");
    if (replyId === "saved-first") {
      assert.equal(restored.state, "analysis");
      assert.equal(restored.deferred, undefined);
    } else {
      assert.equal(restored.state, "error");
      assert.match(JSON.stringify(restored.error), /does not match/);
    }
  }
});

test("Review publishes its resolved manual target before a delayed supplemental agents read", async () => {
  const environment = { id: "11111111-1111-4111-8111-111111111111", name: args.environmentName, region: "unitedstates" };
  const agent = { id: "22222222-2222-4222-8222-222222222222", name: args.agentName,
    componentIdUnique: "33333333-3333-4333-8333-333333333333" };
  const agents = [{ ...agent, iconBase64: "x".repeat(70_000) }];
  const full: ToolResult = { content: [], structuredContent: {
    state: "selecting", selectionId: "delayed-manual-selection",
    environmentId: environment.id, environment, environments: [environment],
    agentId: agent.id, agent, componentIdUnique: agent.componentIdUnique, agents,
  } };
  const compact = compactInitialWidgetResult(full, "open_agent_review", "offline-delayed-review");
  let release!: () => void;
  let began!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const beganReading = new Promise<void>(resolve => { began = resolve; });
  const state = mount({ content: [] }, null, async request => {
    assert.equal(request.name, "list_reviewable_agents");
    began();
    await gate;
    return { content: [], structuredContent: { state: "agents", agents } };
  });
  await state.recovery.ready();
  const delivery = state.recovery.receiveResult(compact);
  await beganReading;
  const repeated = state.recovery.receiveResult(structuredClone(compact));
  try {
    assert.ok(state.data(), "The selected Review target must be published before its supplemental agents arrive.");
    assert.deepEqual((state.data() as Record<string, unknown>).agent, agent);
    assert.equal((state.data() as Record<string, unknown>).restoring, true);
    assert.equal(state.calls.length, 1);
  } finally {
    release();
    await Promise.all([delivery, repeated]);
  }
  assert.deepEqual((state.data() as Record<string, unknown>).agents, agents);
  assert.equal(state.calls.length, 1);
});

test("Review context manifests retain authenticated target labels and the exact start component", () => {
  const environment = { id: "11111111-1111-4111-8111-111111111111", name: args.environmentName, region: "unitedstates" };
  const agent = { id: "22222222-2222-4222-8222-222222222222", name: args.agentName,
    componentIdUnique: "33333333-3333-4333-8333-333333333333" };
  const full: ToolResult = { content: [], structuredContent: {
    state: "selecting", selectionId: "context-selection",
    environmentId: environment.id, environment, agentId: agent.id, agent,
    environments: Array.from({ length: 100 }, (_, index) => ({ ...environment, name: `${index}:${"x".repeat(1000)}` })),
  } };
  const compact = compactInitialWidgetResult(full, "open_agent_review", "offline-context-review");
  assert.deepEqual(compact.structuredContent?.deferred, ["context"]);
  assert.deepEqual(compact.structuredContent?.environment, environment);
  assert.deepEqual(compact.structuredContent?.agent, agent);
  assert.ok(Buffer.byteLength(JSON.stringify(compact), "utf8") <= 65_536);
});

test("Debugger publishes the named target and saved conversations before its delayed supplemental picker", async () => {
  const environment = { id: "11111111-1111-4111-8111-111111111111", name: args.environmentName, url: "https://example.crm.dynamics.com" };
  const agent = { id: "22222222-2222-4222-8222-222222222222", name: args.agentName, experience: "generative" };
  const agents = [{ ...agent, iconBase64: "x".repeat(70_000) }];
  const conversations = [{ id: "saved-first", name: "Saved first" }, { id: "saved-second", name: "Saved second" }];
  const compact = compactInitialWidgetResult({ content: [], structuredContent: {
    state: "conversations", selectionId: "delayed-debugger-selection", targetResolved: true,
    environmentId: environment.id, environment, agentId: agent.id, agent, agents, conversations,
  } }, "open_agent_debugger", "offline-delayed-debugger");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const state = mount({ content: [] }, null, async request => {
    if (request.name === "list_debugger_agents") {
      await gate;
      return { content: [], structuredContent: { state: "agents", agents } };
    }
    assert.equal(request.name, "list_debugger_conversations");
    return { content: [], structuredContent: { state: "conversations", conversations } };
  }, "open_agent_debugger");
  await state.recovery.ready();
  const delivery = state.recovery.receiveResult(compact);
  await new Promise<void>(resolve => setImmediate(resolve));
  try {
    assert.deepEqual((state.data() as Record<string, unknown> | null)?.agent, agent);
    assert.deepEqual((state.data() as Record<string, unknown>).conversations, conversations);
    assert.deepEqual((state.data() as Record<string, unknown>).deferred, ["agents"]);
    assert.equal((state.data() as Record<string, unknown>).conversationId, undefined);
    await state.recovery.receiveResult(structuredClone(compact));
    assert.deepEqual((state.data() as Record<string, unknown>).conversations, conversations);
    assert.deepEqual((state.data() as Record<string, unknown>).deferred, ["agents"]);
  } finally {
    release();
    await delivery;
  }
  assert.deepEqual((state.data() as Record<string, unknown>).agents, agents);
  assert.deepEqual(state.calls.map(request => request.name), ["list_debugger_agents", "list_debugger_conversations"]);
});

test("progressive Debugger delivery retains the analysis operation token for read-only restoration", async () => {
  const data = { state: "analysis", environmentId: "environment", agentId: "agent",
    conversationId: "selected-conversation", deferred: ["agents", "analysis"] };
  const processedTranscript = { turns: [{ id: "saved-turn", content: "Complete saved evidence" }] };
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const state = mount({ content: [] }, null, async request => {
    if (request.name === "list_debugger_agents") return { content: [], structuredContent: { agents: [] } };
    assert.equal(request.name, "analyze_debugger_conversation");
    assert.equal(request.arguments?.conversationId, data.conversationId);
    await gate;
    return { content: [], structuredContent: { processedTranscript } };
  }, "open_agent_debugger");
  await state.recovery.ready();
  const delivery = state.recovery.receiveResult({ content: [], structuredContent: data });
  await new Promise<void>(resolve => setImmediate(resolve));
  try {
    const partial = state.data() as Record<string, unknown>;
    assert.deepEqual(partial.deferred, ["analysis"]);
    const restored = mount({ content: [], structuredContent: { processedTranscript } }, partial,
      undefined, "open_agent_debugger");
    await restored.recovery.ready();
    assert.deepEqual((restored.data() as Record<string, unknown>).processedTranscript, processedTranscript);
    assert.deepEqual(restored.calls, [{ name: "analyze_debugger_conversation",
      arguments: { environmentId: data.environmentId, agentId: data.agentId, conversationId: data.conversationId } }]);
  } finally {
    release();
    await delivery;
  }
  assert.deepEqual((state.data() as Record<string, unknown>).processedTranscript, processedTranscript);
});

test("a newer compact target replaces an older pending selection without accepting its late picker", async () => {
  const first = { state: "selecting", selectionId: "first-selection",
    environmentId: "first-environment", agentId: "first-agent", deferred: ["agents"] };
  const next = { ...first, selectionId: "next-selection", environmentId: "next-environment", agentId: "next-agent" };
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const state = mount({ content: [] }, null, async request => {
    assert.equal(request.name, "list_reviewable_agents");
    if (request.arguments?.environmentId === first.environmentId) await gate;
    return { content: [], structuredContent: { agents: [{ id: request.arguments?.environmentId }] } };
  });
  await state.recovery.ready();
  const oldDelivery = state.recovery.receiveResult({ content: [], structuredContent: first });
  await new Promise<void>(resolve => setImmediate(resolve));
  try {
    await state.recovery.receiveResult({ content: [], structuredContent: next });
    assert.equal(state.calls.length, 2);
    assert.equal((state.data() as Record<string, unknown>).selectionId, next.selectionId);
    assert.deepEqual((state.data() as Record<string, unknown>).agents, [{ id: next.environmentId }]);
  } finally {
    release();
    await oldDelivery;
  }
  assert.equal((state.data() as Record<string, unknown>).selectionId, next.selectionId);
  assert.deepEqual((state.data() as Record<string, unknown>).agents, [{ id: next.environmentId }]);
});

test("the exact rejected Review supplemental callback retains its authorized target without a retry or start", async () => {
  const environment = { id: "11111111-1111-4111-8111-111111111111", name: args.environmentName };
  const agent = { id: "22222222-2222-4222-8222-222222222222", name: args.agentName,
    componentIdUnique: "33333333-3333-4333-8333-333333333333" };
  const callbackError = "MCP error -32000: MCP integration is unavailable for this agent.";
  const state = mount({ content: [] }, null, async request => {
    assert.equal(request.name, "list_reviewable_agents");
    throw new Error(callbackError);
  });
  await state.recovery.ready();
  const initial: ToolResult = { content: [], structuredContent: {
    state: "selecting", selectionId: "failed-supplemental-selection", environmentId: environment.id,
    environment, agentId: agent.id, agent, deferred: ["agents"],
  } };
  await state.recovery.receiveResult(initial);
  const data = state.data() as Record<string, unknown>;
  assert.deepEqual(data.agent, agent);
  assert.deepEqual(data.environment, environment);
  assert.match(JSON.stringify(data.error), /Initial widget data deferred agents failed \(list_reviewable_agents\): MCP error -32000: MCP integration is unavailable for this agent\./);
  assert.equal(data.jobId, undefined);
  assert.equal(state.calls.length, 1);
  await state.recovery.ready();
  assert.equal(state.calls.length, 1);
  await state.recovery.receiveResult(structuredClone(initial));
  assert.equal((state.data() as Record<string, unknown>).state, "error");
  assert.deepEqual((state.data() as Record<string, unknown>).error, data.error);
  assert.equal(state.calls.length, 1);
});

test("a supplemental reply for another target or selection cannot replace the acknowledged target", async () => {
  const original = { state: "selecting", selectionId: "current-selection",
    environmentId: "11111111-1111-4111-8111-111111111111",
    agentId: "22222222-2222-4222-8222-222222222222", deferred: ["agents"] };
  const state = mount({ content: [], structuredContent: { state: "agents",
    environmentId: "99999999-9999-4999-8999-999999999999", selectionId: "old-selection", agents: [] } });
  await state.recovery.ready();
  await state.recovery.receiveResult({ content: [], structuredContent: original });
  const loaded = state.data() as Record<string, unknown>;
  assert.equal(loaded.environmentId, original.environmentId);
  assert.equal(loaded.selectionId, original.selectionId);
  assert.match(JSON.stringify(loaded.error), /does not match the selected target or selection/);
  assert.equal(loaded.agents, undefined);
  assert.equal(state.calls.length, 1);
});

test("Eval delivery displays the acknowledged named target while complete data is pending and after read failure", async () => {
  const environment = { id: "11111111-1111-4111-8111-111111111111", name: "Copilot Studio Kit - Dev" };
  const agent = { id: "22222222-2222-4222-8222-222222222222", name: "ZAVA Visual Merchandizer" };
  const full: ToolResult = { content: [], structuredContent: {
    view: "evaluation", state: "conversations", targetResolved: true,
    environmentId: environment.id, environment, agentId: agent.id, agent,
    environments: [environment], agents: [{ ...agent, iconBase64: "x".repeat(70_000) }],
    conversations: [{ id: "saved-one", name: "Saved evidence" }],
  } };
  const compact = compactInitialWidgetResult(full, "open_evaluation_builder", "offline-eval");
  let data: unknown = null;
  let reject!: (error: Error) => void;
  let begin!: () => void;
  const started = new Promise<void>(resolve => { begin = resolve; });
  const calls: Parameters<App["callServerTool"]>[0][] = [];
  const recovery = createInitialToolDataRecovery({
    name: "open_evaluation_builder", getData: () => data, replaceData: next => { data = next; },
    reportError: () => {},
    callTool: async request => { calls.push(request); return new Promise<ToolResult>((_resolve, fail) => { reject = fail; begin(); }); },
  });
  await recovery.ready();
  const delivery = recovery.receiveResult(compact);
  await Promise.resolve();
  assert.ok(data && typeof data === "object");
  assert.equal((data as Record<string, unknown>).agentId, agent.id);
  assert.deepEqual((data as Record<string, unknown>).agent, agent);
  await started;
  reject(new Error("Fixture complete-data read failed."));
  await delivery;
  assert.equal((data as Record<string, unknown>).agentId, agent.id);
  assert.match(JSON.stringify(data), /Fixture complete-data read failed/);
  assert.equal(calls.length, 1);
});

function mount(result: ToolResult, data: unknown = null, callTool?: App["callServerTool"], name = "open_agent_review") {
  const calls: Parameters<App["callServerTool"]>[0][] = [];
  const failures: unknown[] = [];
  let current = data;
  const recovery = createInitialToolDataRecovery({
    name,
    callTool: async (request) => { calls.push(request); return callTool ? callTool(request) : result; },
    getData: () => current,
    replaceData: (next) => { current = next; },
    reportError: (error) => { failures.push(error); },
  });
  return { recovery, calls, failures, data: () => current, replaceData: (next: unknown) => { current = next; } };
}

test("restores every picker icon through one app call after omitted initial data", async () => {
  const agents = Array.from({ length: 250 }, (_, index) => ({
    id: `agent-${index}`, name: `Agent ${index}`, componentIdUnique: `component-${index}`,
    iconBase64: "a".repeat(16 * 1024),
  }));
  const result = { content: [{ type: "text" as const, text: "Opened Agent Review." }], structuredContent: {
    state: "selecting", agents, environmentId: "environment", agentId: "agent-0",
  }, _meta: { ui: { resourceUri: "ui://open_agent_review/v1.0.15/agent-review.html" } } };
  assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") > 65_536);
  const { recovery, calls, data } = mount(result);
  await recovery.receiveInput({ arguments: args });
  assert.equal(calls.length, 0);
  await recovery.ready();
  assert.deepEqual(calls, [{ name: "open_agent_review", arguments: { ...args, resumeOnly: true } }]);
  assert.equal(data(), result.structuredContent);
  assert.deepEqual(result.structuredContent.agents, agents);
  assert.equal(result.structuredContent.agents.length, 250);
  assert.equal(result.structuredContent.agents.at(-1)?.iconBase64.length, 16 * 1024);
});

test("distinguishes the documented 65536/65537-byte inline boundary from the resource budget", async () => {
  for (const bytes of [65_536, 65_537]) {
    const result: ToolResult = {
      content: [{ type: "text", text: "" }],
      structuredContent: { state: "selecting", agentId: "agent" },
      _meta: { ui: { resourceUri: "ui://open_agent_review/v1.0.15/agent-review.html" } },
    };
    const content = result.content[0];
    assert.equal(content.type, "text");
    if (content.type !== "text") throw new Error("Unexpected test content.");
    content.text = "x".repeat(bytes - Buffer.byteLength(JSON.stringify(result), "utf8"));
    assert.equal(Buffer.byteLength(JSON.stringify(result), "utf8"), bytes);
    const state = mount(result, bytes <= 65_536 ? result.structuredContent : null);
    await state.recovery.receiveInput({ arguments: args });
    await state.recovery.ready();
    assert.equal(state.calls.length, bytes <= 65_536 ? 0 : 1);
    assert.deepEqual(state.data(), result.structuredContent);
  }
});

test("recovers Debugger analysis with late input and no inline result", async () => {
  const result = { content: [], structuredContent: {
    state: "analysis", processedTranscript: { turns: [{ id: "turn", content: "x".repeat(70_000) }] },
  } };
  let data: unknown = null;
  const calls: Parameters<App["callServerTool"]>[0][] = [];
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_debugger",
    callTool: async (request) => { calls.push(request); return result; },
    getData: () => data, replaceData: (next) => { data = next; }, reportError: assert.fail,
  });
  await recovery.ready();
  const input = { environmentId: "environment", agentId: "agent", conversationId: "conversation" };
  await recovery.receiveInput({ arguments: input });
  assert.deepEqual(calls, [{ name: "open_agent_debugger", arguments: input }]);
  assert.equal(data, result.structuredContent);
});

test("does not repeat a completed pull or replace a valid inlined result", async () => {
  const result = { content: [], structuredContent: { state: "selecting" } };
  const state = mount(result);
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  assert.equal(state.calls.length, 1);
  const inlined = mount(result, result.structuredContent);
  await inlined.recovery.receiveInput({ arguments: args });
  await inlined.recovery.ready();
  assert.equal(inlined.calls.length, 0);
});

test("an empty inline placeholder does not prevent full data recovery", async () => {
  const result = { content: [], structuredContent: { state: "selecting", agentId: "selected" } };
  const state = mount(result, {});
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  assert.equal(state.calls.length, 1);
  assert.equal(state.data(), result.structuredContent);
});

test("compact Review context pulls all picker data once through the existing read-only tool", async () => {
  const agents = Array.from({ length: 250 }, (_, index) => ({
    id: `agent-${index}`, name: `Agent ${index}`, componentIdUnique: `component-${index}`,
    iconBase64: "a".repeat(16 * 1024),
  }));
  const compact = { state: "selecting", environmentId: "environment", agentId: "agent-0",
    selectionId: "initial-selection", deferred: ["agents"] };
  const result = { content: [], structuredContent: { state: "agents", environmentId: "environment", agents } };
  const state = mount(result, compact);
  await state.recovery.ready();
  await state.recovery.ready();
  assert.deepEqual(state.calls, [{ name: "list_reviewable_agents", arguments: { environmentId: "environment" } }]);
  assert.deepEqual(state.data(), {
    state: "selecting", environmentId: "environment", agentId: "agent-0", selectionId: "initial-selection", agents,
  });
});

test("compact Debugger analysis uses only its three existing app-callable reads", async () => {
  const compact = { state: "analysis", environment: { id: "environment" }, agent: { id: "agent" },
    conversation: { id: "conversation" }, selectionId: "debugger-selection",
    deferred: ["agents", "conversations", "analysis"] };
  const calls: Parameters<App["callServerTool"]>[0][] = [];
  let data: unknown = compact;
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_debugger",
    callTool: async (request) => {
      calls.push(request);
      const structuredContent = request.name === "list_debugger_agents" ? { agents: [{ id: "agent" }] }
        : request.name === "list_debugger_conversations" ? { conversations: [{ id: "conversation" }] }
          : { processedTranscript: { turns: [{ content: "x".repeat(70_000) }] } };
      return { content: [], structuredContent };
    },
    getData: () => data, replaceData: (next) => { data = next; }, reportError: assert.fail,
  });
  await recovery.ready();
  assert.deepEqual(calls, [
    { name: "list_debugger_agents", arguments: { environmentId: "environment" } },
    { name: "list_debugger_conversations", arguments: { environmentId: "environment", agentId: "agent" } },
    { name: "analyze_debugger_conversation", arguments: { environmentId: "environment", agentId: "agent", conversationId: "conversation" } },
  ]);
  assert.ok(typeof data === "object" && data !== null && "processedTranscript" in data);
  assert.ok(!("deferred" in data));
});

test("unknown deferred operations fail explicitly without a write or tool call", async () => {
  const state = mount({ content: [], structuredContent: {} }, {
    state: "selecting", deferred: ["start_agent_review"],
  });
  await state.recovery.ready();
  assert.equal(state.calls.length, 0);
  assert.equal(state.failures.length, 1);
  assert.deepEqual(state.data(), {
    state: "error", dataLoadError: { source: "initial-data" },
    error: { message: "The initial widget data has an unsupported deferred operation." },
  });
});

test("a large completed review is pulled without exposing incomplete initial context", async () => {
  const model = { agentName: "Agent", evidence: "x".repeat(70_000) };
  const compact = { state: "review", reviewId: "saved-review", selectionId: "selection", deferred: ["model"] };
  const state = mount({ content: [], structuredContent: { state: "summary", reviewId: "saved-review", model } });
  await state.recovery.receiveResult({ content: [], structuredContent: compact });
  assert.equal(state.data(), null);
  await state.recovery.ready();
  assert.deepEqual(state.calls, [{ name: "get_agent_review_result", arguments: { reviewId: "saved-review", presentation: "summary" } }]);
  assert.deepEqual(state.data(), { state: "review", reviewId: "saved-review", selectionId: "selection", model });
});

test("a delayed compact result cannot replace a completed bulk pull", async () => {
  const compact = { state: "selecting", environmentId: "environment", deferred: ["agents"] };
  const agents = [{ id: "agent", iconBase64: "complete-icon" }];
  const state = mount({ content: [], structuredContent: { state: "agents", agents } });
  await state.recovery.receiveResult({ content: [], structuredContent: compact });
  await state.recovery.ready();
  const completed = state.data();
  await state.recovery.receiveResult({ content: [], structuredContent: compact });
  assert.equal(state.data(), completed);
  assert.equal(state.calls.length, 1);
});

test("bulk data cannot replace a newer context while the read is pending", async () => {
  let finish!: (result: ToolResult) => void;
  let data: unknown = { state: "selecting", environmentId: "environment", deferred: ["agents"] };
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_review",
    callTool: () => new Promise((resolve) => { finish = resolve; }),
    getData: () => data, replaceData: (next) => { data = next; }, reportError: assert.fail,
  });
  const pending = recovery.ready();
  const newer = { state: "selecting", environmentId: "new-environment" };
  data = newer;
  finish({ content: [], structuredContent: { state: "agents", agents: [{ id: "old-agent" }] } });
  await pending;
  assert.equal(data, newer);
});

test("a new host input cancels an older pending recovery", async () => {
  const callbacks: ((value: ToolResult) => void)[] = [];
  let data: unknown = null;
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_debugger",
    callTool: () => new Promise((resolve) => { callbacks.push(resolve); }),
    getData: () => data, replaceData: (next) => { data = next; }, reportError: assert.fail,
  });
  await recovery.receiveInput({ arguments: { conversationId: "first" } });
  const first = recovery.ready();
  const second = recovery.receiveInput({ arguments: { conversationId: "second" } });
  callbacks[1]({ content: [], structuredContent: { state: "analysis", conversationId: "second" } });
  await second;
  callbacks[0]({ content: [], structuredContent: { state: "analysis", conversationId: "first" } });
  await first;
  assert.deepEqual(data, { state: "analysis", conversationId: "second" });
});

test("authentication errors from the deferred read remain explicit", async () => {
  const error = { state: "error", error: { code: "AUTH_REQUIRED", message: "Sign in to load the agents." } };
  const state = mount({ content: [], isError: true, structuredContent: error }, {
    state: "selecting", environmentId: "environment", deferred: ["agents"],
  });
  await state.recovery.ready();
  assert.deepEqual(state.data(), {
    state: "error", environmentId: "environment",
    dataLoadError: { source: "initial-data", toolName: "list_reviewable_agents", stage: "deferred agents" },
    error: { code: error.error.code, message: `Initial widget data deferred agents failed (list_reviewable_agents): ${error.error.message}` },
  });
  assert.equal(state.calls.length, 1);
});

test("a delayed initial result cannot replace completed recovery or a newer local context", async () => {
  const result = { content: [], structuredContent: { state: "selecting", selectionId: "recovered" } };
  const state = mount(result);
  assert.equal(typeof state.recovery.receiveResult, "function");
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  await state.recovery.receiveResult({ content: [], structuredContent: { state: "selecting", selectionId: "late" } });
  assert.equal(state.data(), result.structuredContent);
  const newer = { state: "selecting", environmentId: "different-environment" };
  state.replaceData(newer);
  await state.recovery.receiveResult({ content: [], structuredContent: { state: "selecting", selectionId: "late-again" } });
  assert.equal(state.data(), newer);
});

test("a valid late inline result wins over a delayed recovery response", async () => {
  let finish!: (result: ToolResult) => void;
  let data: unknown = null;
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_review",
    callTool: () => new Promise((resolve) => { finish = resolve; }),
    getData: () => data, replaceData: (next) => { data = next; }, reportError: assert.fail,
  });
  await recovery.receiveInput({ arguments: args });
  const pending = recovery.ready();
  const inlined = { state: "selecting", selectionId: "newer" };
  data = inlined;
  finish({ content: [], structuredContent: { state: "selecting", selectionId: "older" } });
  await pending;
  assert.equal(data, inlined);
});

test("preserves auth-required errors returned by the existing opening tool", async () => {
  const result = { content: [], isError: true, structuredContent: {
    state: "error", error: { code: "AUTH_REQUIRED", message: "Sign in to review Copilot Studio agents." },
  } };
  const state = mount(result);
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  assert.deepEqual(state.data(), { state: "error",
    dataLoadError: { source: "initial-data", toolName: "open_agent_review", stage: "recovery" }, error: {
    code: "AUTH_REQUIRED",
    message: "Initial widget data recovery failed (open_agent_review): Sign in to review Copilot Studio agents.",
  } });
});

test("reports a failed or incomplete pull instead of waiting forever", async () => {
  const state = mount({ content: [{ type: "text", text: "No structured data." }] });
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  assert.equal(state.failures.length, 1);
  assert.deepEqual(state.data(), { state: "error", dataLoadError: { source: "initial-data" },
    error: { message: "The initial widget data is unavailable." } });
});

test("reports a rejected callback and does not retry without a new widget", async () => {
  let data: unknown = null;
  let calls = 0;
  const failures: unknown[] = [];
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_review",
    callTool: async () => { calls += 1; throw new Error("The host denied the callback."); },
    getData: () => data, replaceData: (next) => { data = next; },
    reportError: (error) => { failures.push(error); },
  });
  await recovery.receiveInput({ arguments: args });
  await recovery.ready();
  await recovery.ready();
  assert.equal(calls, 1);
  assert.equal(failures.length, 1);
  assert.deepEqual(data, { state: "error",
    dataLoadError: { source: "initial-data", toolName: "open_agent_review", stage: "recovery" }, error: {
    message: "Initial widget data recovery failed (open_agent_review): The host denied the callback.",
  } });
});

test("omitted prompt-start output is recovered read-only and never replays the start permission", async () => {
  const result = { content: [], structuredContent: { state: "running", jobId: "saved-job" } };
  const state = mount(result);
  const input = { ...args, startReview: true, requestId: "66666666-6666-4666-8666-666666666666" };
  await state.recovery.receiveInput({ arguments: input });
  await state.recovery.ready();
  await state.recovery.ready();
  assert.deepEqual(state.calls, [{
    name: "open_agent_review", arguments: { ...input, resumeOnly: true },
  }]);
  assert.equal(state.data(), result.structuredContent);
});

test("omitted implicit named Review output is also recovered without a new start", async () => {
  const result = { content: [], structuredContent: { state: "running", jobId: "saved-job" } };
  const state = mount(result);
  const input = { ...args, requestId: "66666666-6666-4666-8666-666666666666" };
  await state.recovery.receiveInput({ arguments: input });
  await state.recovery.ready();
  await state.recovery.ready();
  assert.deepEqual(state.calls, [{
    name: "open_agent_review", arguments: { ...input, resumeOnly: true },
  }]);
  assert.equal(state.data(), result.structuredContent);
});

test("omitted saved-result output uses only its saved review ID and presentation", async () => {
  const input = { reviewId: "55555555-5555-4555-8555-555555555555", presentation: "fullReview" };
  const result = { content: [], structuredContent: { state: "fullReview", reviewId: input.reviewId, model: {} } };
  const state = mount(result);
  await state.recovery.receiveInput({ arguments: input });
  await state.recovery.ready();
  await state.recovery.ready();
  assert.deepEqual(state.calls, [{ name: "get_agent_review_result", arguments: input }]);
  assert.equal(state.data(), result.structuredContent);
});

test("a saved review ID takes recovery precedence over target or start inputs", async () => {
  const reviewId = "55555555-5555-4555-8555-555555555555";
  const result = { content: [], structuredContent: { state: "summary", reviewId, model: {} } };
  const state = mount(result);
  await state.recovery.receiveInput({ arguments: { reviewId, ...args, startReview: true } });
  await state.recovery.ready();
  assert.deepEqual(state.calls, [{ name: "get_agent_review_result", arguments: { reviewId } }]);
  assert.equal(state.data(), result.structuredContent);
});

test("invalid complete host-result delivery reports a visible error without a callback or write", async () => {
  const state = mount({ content: [] });
  await assert.doesNotReject(state.recovery.receiveResult({
    content: [], structuredContent: { state: "loading" },
    _meta: { completeToolResult: { encoding: "gzip-base64", bytes: 0, sha256: "0".repeat(64), data: "" } },
  }));
  assert.equal(state.calls.length, 0);
  assert.equal(state.failures.length, 1);
  assert.deepEqual(state.data(), { state: "error", dataLoadError: { source: "initial-data" },
    error: { message: "The complete tool result manifest is invalid or too large." } });
});

test("a newer host result wins while an older complete result is being decoded", async () => {
  let finish!: (result: ToolResult) => void;
  let data: unknown = null;
  const older = { content: [], structuredContent: { state: "analysis", conversationId: "older", evidence: "x".repeat(100_000) } };
  const compact: ToolResult = boundedToolResult(older, "offline-caller");
  const delivery = compact._meta?.completeToolResult;
  assert.ok(delivery && typeof delivery === "object" && "data" in delivery && typeof delivery.data === "string");
  const { data: encoded, ...manifest } = delivery;
  const pendingResult: ToolResult = { ...compact, _meta: { completeToolResult: {
    ...manifest, contextId: "88888888-8888-4888-8888-888888888888", chunkCount: 1,
  } } };
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_debugger",
    callTool: () => new Promise(resolve => { finish = resolve; }),
    getData: () => data, replaceData: next => { data = next; }, reportError: assert.fail,
  });
  const decoding = recovery.receiveResult(pendingResult);
  const newer = { state: "analysis", conversationId: "newer" };
  await recovery.receiveResult({ content: [], structuredContent: newer });
  finish({ content: [], structuredContent: { index: 0, sha256: manifest.sha256, data: encoded } });
  await decoding;
  assert.equal(data, newer);
});

test("a valid original running result replaces a rejected recovery without another callback", async () => {
  const state = mount({ content: [] }, null, async () => {
    throw new Error("MCP error -32603: forward-proxy-failed:tools/call");
  });
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  assert.equal(state.failures.length, 1);
  const acknowledged = {
    state: "running", selectionId: "acknowledged-selection", jobId: "existing-job",
    environmentId: "selected-environment", agentId: "selected-agent",
  };
  await state.recovery.receiveResult({ content: [], structuredContent: acknowledged });
  await state.recovery.ready();
  assert.equal(state.data(), acknowledged);
  assert.deepEqual(state.calls, [{ name: "open_agent_review", arguments: { ...args, resumeOnly: true } }]);
});

test("a valid original running result replaces a recovery auth error without changing authorization", async () => {
  const state = mount({ content: [], isError: true, structuredContent: {
    state: "error", error: { code: "AUTH_REQUIRED", message: "The recovery callback is not authorized." },
  } });
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  const failed = state.data() as { error: { code: string } };
  assert.equal(failed.error.code, "AUTH_REQUIRED");
  const acknowledged = { state: "running", selectionId: "acknowledged-selection", jobId: "existing-job" };
  await state.recovery.receiveResult({ content: [], structuredContent: acknowledged });
  assert.equal(state.data(), acknowledged);
  assert.equal(state.calls.length, 1);
});

test("a failed deferred agents callback retains the acknowledged job and exact selection", async () => {
  const acknowledged = {
    state: "running", selectionId: "acknowledged-selection", jobId: "existing-job",
    environmentId: "selected-environment", agentId: "selected-agent",
    projectName: "Original review name", deferred: ["agents"],
  };
  const state = mount({ content: [] }, acknowledged, async () => {
    throw new Error("forward-proxy-failed:tools/call");
  });
  await state.recovery.ready();
  await state.recovery.ready();
  assert.deepEqual(state.data(), {
    state: "load-error", selectionId: acknowledged.selectionId, jobId: acknowledged.jobId,
    environmentId: acknowledged.environmentId, agentId: acknowledged.agentId,
    projectName: acknowledged.projectName,
    dataLoadError: { source: "initial-data", toolName: "list_reviewable_agents", stage: "deferred agents" },
    error: { message: "Initial widget data deferred agents failed (list_reviewable_agents): forward-proxy-failed:tools/call" },
  });
  assert.deepEqual(state.calls, [{ name: "list_reviewable_agents", arguments: { environmentId: acknowledged.environmentId } }]);
});

test("a failed deferred read does not retry the opener when the full tool input is present", async () => {
  const acknowledged = {
    state: "running", selectionId: "acknowledged-selection", jobId: "existing-job",
    environmentId: "selected-environment", agentId: "selected-agent", deferred: ["agents"],
  };
  const state = mount({ content: [] }, acknowledged, async () => {
    throw new Error("forward-proxy-failed:tools/call");
  });
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  await state.recovery.ready();
  await state.recovery.receiveInput({ arguments: args });
  assert.deepEqual(state.calls, [{ name: "list_reviewable_agents", arguments: { environmentId: acknowledged.environmentId } }]);
  const complete = { ...acknowledged, deferred: undefined, agents: [] };
  await state.recovery.receiveResult({ content: [], structuredContent: complete });
  assert.equal(state.data(), complete);
});

test("a failed complete-result chunk retains the acknowledged job without declaring a job failure", async () => {
  const full: ToolResult = { content: [], structuredContent: {
    state: "running", selectionId: "acknowledged-selection", jobId: "existing-job",
    environmentId: "selected-environment", agentId: "selected-agent",
    evidence: randomBytes(100_000).toString("base64"),
  } };
  const compact = boundedToolResult(full, "offline-caller");
  const delivery = compact._meta?.completeToolResult;
  assert.ok(delivery && typeof delivery === "object" && "contextId" in delivery);
  const state = mount({ content: [] }, null, async () => {
    throw new Error("forward-proxy-failed:tools/call");
  });
  await state.recovery.receiveResult(compact);
  const failed = state.data() as {
    state: string; selectionId: string; jobId: string; environmentId: string; agentId: string;
    status?: unknown; dataLoadError?: unknown; error: { message: string };
  };
  assert.equal(failed.state, "load-error");
  assert.equal(failed.selectionId, "acknowledged-selection");
  assert.equal(failed.jobId, "existing-job");
  assert.equal(failed.environmentId, "selected-environment");
  assert.equal(failed.agentId, "selected-agent");
  assert.equal(failed.status, undefined);
  assert.deepEqual(failed.dataLoadError, {
    source: "initial-data", toolName: "get_initial_widget_data", stage: "complete-result chunk",
  });
  assert.match(failed.error.message, /complete-result chunk failed \(get_initial_widget_data\)/);
  await state.recovery.receiveResult(full);
  assert.equal(state.data(), full.structuredContent);
  assert(state.calls.every(request => request.name === "get_initial_widget_data"));
});

test("a failed data read preserves an acknowledged server-confirmed job failure", async () => {
  const status = { jobId: "existing-job", status: "failed", error: "The backend review failed." };
  const acknowledged = {
    state: "running", selectionId: "acknowledged-selection", status,
    environmentId: "selected-environment", deferred: ["agents"],
    error: { message: status.error },
  };
  const state = mount({ content: [] }, acknowledged, async () => {
    throw new Error("forward-proxy-failed:tools/call");
  });
  await state.recovery.ready();
  const failed = state.data() as { state: string; jobId: string; status: unknown; error: { message: string } };
  assert.equal(failed.state, "failed");
  assert.equal(failed.jobId, status.jobId);
  assert.equal(failed.status, status);
  assert.match(failed.error.message, /The backend review failed/);
  assert.match(failed.error.message, /deferred agents failed \(list_reviewable_agents\)/);
  assert.equal(state.calls.length, 1);
});

test("a genuine original job failure does not acquire data-read error provenance", async () => {
  const original: ToolResult = { content: [], isError: true, structuredContent: {
    state: "failed", jobId: "existing-job", error: { message: "The job was created, but the input upload failed." },
  } };
  const state = mount({ content: [] });
  await state.recovery.receiveResult(original);
  await state.recovery.ready();
  assert.equal(state.data(), original.structuredContent);
  assert.equal(state.calls.length, 0);
});

test("an acknowledged complete-result decode blocks recovery while readiness changes", async () => {
  const full: ToolResult = { content: [], structuredContent: {
    state: "running", selectionId: "acknowledged-selection", jobId: "existing-job",
    evidence: "x".repeat(100_000),
  } };
  const compact = boundedToolResult(full, "offline-caller");
  const delivery = compact._meta?.completeToolResult;
  assert.ok(delivery && typeof delivery === "object" && "data" in delivery && typeof delivery.data === "string");
  const { data: encoded, ...manifest } = delivery;
  const pendingResult: ToolResult = { ...compact, _meta: { completeToolResult: {
    ...manifest, contextId: "88888888-8888-4888-8888-888888888888", chunkCount: 1,
  } } };
  let finish!: (result: ToolResult) => void;
  const state = mount({ content: [] }, null, async request => {
    if (request.name !== "get_initial_widget_data") throw new Error("Unexpected recovery opener.");
    return new Promise(resolve => { finish = resolve; });
  });
  await state.recovery.receiveInput({ arguments: args });
  const decoding = state.recovery.receiveResult(pendingResult);
  await state.recovery.ready();
  finish({ content: [], structuredContent: { index: 0, sha256: manifest.sha256, data: encoded } });
  await decoding;
  await state.recovery.ready();
  assert.deepEqual(state.data(), full.structuredContent);
  assert.deepEqual(state.calls.map(request => request.name), ["get_initial_widget_data"]);
});

async function readFixtureChunk(token: string, request: Parameters<App["callServerTool"]>[0]) {
  const values = request.arguments;
  assert.equal(request.name, "get_initial_widget_data");
  assert.ok(typeof values?.contextId === "string" && typeof values.index === "number" && typeof values.sha256 === "string");
  return getInitialWidgetData(token, { contextId: values.contextId, index: values.index, sha256: values.sha256 });
}

test("overlapping identical original deliveries share their in-flight immutable chunk reads", async () => {
  const token = "offline-overlapping-originals";
  const full: ToolResult = { content: [], structuredContent: {
    state: "running", jobId: "existing-job", selectionId: "same-selection",
    evidence: randomBytes(100_000).toString("base64"),
  } };
  const compact = boundedToolResult(full, token);
  const manifest = compact._meta?.completeToolResult;
  assert.ok(manifest && typeof manifest === "object" && "chunkCount" in manifest && typeof manifest.chunkCount === "number");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const state = mount({ content: [] }, null, async request => {
    await gate;
    return readFixtureChunk(token, request);
  });
  const first = state.recovery.receiveResult(compact);
  const second = state.recovery.receiveResult(structuredClone(compact));
  release();
  await Promise.all([first, second]);
  assert.deepEqual(state.data(), full.structuredContent);
  assert.equal(state.calls.length, manifest.chunkCount);
  await state.recovery.receiveResult(compact);
  assert.equal(state.calls.length, manifest.chunkCount);
  assert.deepEqual(state.failures, []);
});

test("an explicit redelivery after one failed chunk reuses the other pending and completed immutable chunks", async () => {
  const token = "offline-partial-chunk-redelivery";
  const full: ToolResult = { content: [], structuredContent: {
    state: "running", jobId: "existing-job", selectionId: "same-selection",
    evidence: randomBytes(100_000).toString("base64"),
  } };
  const compact = boundedToolResult(full, token);
  const manifest = compact._meta?.completeToolResult;
  assert.ok(manifest && typeof manifest === "object" && "chunkCount" in manifest && typeof manifest.chunkCount === "number");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let failed = false;
  const state = mount({ content: [] }, null, async request => {
    if (request.arguments?.index === 0 && !failed) {
      failed = true;
      throw new Error("The first immutable chunk read was denied.");
    }
    await gate;
    return readFixtureChunk(token, request);
  });
  await state.recovery.receiveResult(compact);
  assert.equal((state.data() as { state: string }).state, "load-error");
  assert.equal(state.calls.length, manifest.chunkCount);
  const redelivery = state.recovery.receiveResult(compact);
  release();
  await redelivery;
  assert.deepEqual(state.data(), full.structuredContent);
  assert.equal(state.failures.length, 1);
  assert.equal(state.calls.length, manifest.chunkCount + 1);
  assert.equal(state.calls.filter(request => request.arguments?.index === 0).length, 2);
});

test("a failed saved-result recovery accepts its late original result using only the saved ID", async () => {
  const input = { reviewId: "55555555-5555-4555-8555-555555555555", presentation: "summary" };
  const state = mount({ content: [] }, null, async () => {
    throw new Error("forward-proxy-failed:tools/call");
  });
  await state.recovery.receiveInput({ arguments: input });
  await state.recovery.ready();
  const saved = { state: "summary", reviewId: input.reviewId, model: { evidence: "Complete saved findings" } };
  await state.recovery.receiveResult({ content: [], structuredContent: saved });
  assert.equal(state.data(), saved);
  assert.deepEqual(state.calls, [{ name: "get_agent_review_result", arguments: input }]);
});

test("a late original result after recovery failure cannot replace a newer completed input", async () => {
  let calls = 0;
  const newer = { state: "summary", reviewId: "new-saved-review", model: { evidence: "New saved findings" } };
  const state = mount({ content: [] }, null, async () => {
    calls += 1;
    if (calls === 1) throw new Error("forward-proxy-failed:tools/call");
    return { content: [], structuredContent: newer };
  });
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  await state.recovery.receiveInput({ arguments: { reviewId: newer.reviewId } });
  await state.recovery.receiveResult({ content: [], structuredContent: {
    state: "running", selectionId: "old-selection", jobId: "old-job",
  } });
  assert.equal(state.data(), newer);
  assert.deepEqual(state.calls, [
    { name: "open_agent_review", arguments: { ...args, resumeOnly: true } },
    { name: "get_agent_review_result", arguments: { reviewId: newer.reviewId } },
  ]);
});

test("a late older Review result cannot replace a newer saved-ID read while it is pending", async () => {
  let finish!: (result: ToolResult) => void;
  let calls = 0;
  const newer = { state: "summary", reviewId: "new-saved-review", model: { evidence: "New saved findings" } };
  const state = mount({ content: [] }, null, async () => {
    calls += 1;
    if (calls === 1) throw new Error("forward-proxy-failed:tools/call");
    return new Promise(resolve => { finish = resolve; });
  });
  await state.recovery.receiveInput({ arguments: args });
  await state.recovery.ready();
  const pending = state.recovery.receiveInput({ arguments: { reviewId: newer.reviewId } });
  await state.recovery.receiveResult({ content: [], structuredContent: {
    state: "running", selectionId: "old-selection", jobId: "old-job",
  } });
  finish({ content: [], structuredContent: newer });
  await pending;
  assert.equal(state.data(), newer);
  assert.equal(state.calls.length, 2);
});
