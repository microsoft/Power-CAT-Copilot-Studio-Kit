import assert from "node:assert/strict";
import test from "node:test";
import { AgentDebuggerService } from "./service.js";
import { getDebuggerConversationTranscript, openAgentDebugger } from "./tools.js";

const environment = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Copilot Studio Kit - dev",
  region: "unitedstates",
  url: "https://example.crm.dynamics.com",
};
const agent = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Contoso Support",
  componentIdUnique: "33333333-3333-3333-3333-333333333333",
  experience: "generative" as const,
};

test("named Debugger startup selects the first saved conversation without reading the full catalog or analysis", async () => {
  const fake = new AgentDebuggerService("offline-fixture");
  fake.listEnvironments = async () => [environment];
  fake.resolveAgent = async () => agent;
  fake.listAgents = async () => { throw new Error("Named startup must not read the full catalog."); };
  fake.listConversations = async () => [
    { id: "newest-saved", name: "Newest saved" },
    { id: "older-saved", name: "Older saved" },
  ];
  fake.analyze = async () => { throw new Error("The widget must read the selected analysis after target delivery."); };
  const result = await openAgentDebugger("offline-fixture", { agentName: agent.name }, () => fake);
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent?.state, "analysis");
  assert.equal(result.structuredContent?.agentId, agent.id);
  assert.equal(result.structuredContent?.conversationId, "newest-saved");
  assert.deepEqual(result.structuredContent?.deferred, ["agents", "analysis"]);
});

test("direct launch resolves the supplied exact conversation before deferred analysis", async () => {
  let analyzed = false;
  const fake = {
    listEnvironments: async () => [environment],
    defaultEnvironment: async () => environment,
    listAgents: async () => [agent],
    resolveAgent: async () => agent,
    listConversations: async () => [{
      id: "conversation-42",
      name: "conversation-42",
    }],
    analyze: async () => {
      analyzed = true;
      return { environment, agent, conversation: { id: "conversation-42" } };
    },
  } as unknown as AgentDebuggerService;

  const response = await openAgentDebugger(
    "access-token",
    {
      agentName: "Contoso Support",
      conversationId: "conversation-42",
    },
    () => fake,
  );

  assert.equal(analyzed, false);
  assert.equal(response.isError, undefined);
  assert.equal(response.structuredContent?.state, "analysis");
  assert.equal(response.structuredContent?.conversationId, "conversation-42");
  assert.deepEqual(response.structuredContent?.deferred, ["agents", "analysis"]);
});

test("unauthenticated direct launch returns AUTH_REQUIRED", async () => {
  const response = await openAgentDebugger(undefined, {});

  assert.equal(response.isError, true);
  assert.equal(
    (response.structuredContent?.error as { code?: string })?.code,
    "AUTH_REQUIRED",
  );
});

test("full JSON rejects missing authentication before it creates a data service", async () => {
  let created = false;
  const response = await getDebuggerConversationTranscript(undefined, {
    environmentId: environment.id, agentId: agent.id, conversationId: "saved",
  }, () => { created = true; throw new Error("The factory must not run."); });
  assert.equal(created, false);
  assert.equal(response.isError, true);
  assert.equal((response.structuredContent?.error as { code?: string })?.code, "AUTH_REQUIRED");
});
