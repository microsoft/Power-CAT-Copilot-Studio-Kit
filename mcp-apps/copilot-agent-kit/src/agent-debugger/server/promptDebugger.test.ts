import assert from "node:assert/strict";
import test from "node:test";
import { ReviewError } from "../../agent-review/server/types.js";
import { AgentDebuggerService } from "./service.js";
import { openAgentDebugger } from "./tools.js";
import { exactSelection } from "../../tools/target-selection.js";

const environment = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Copilot Studio Kit - Dev",
  region: "unitedstates",
  url: "https://example.crm.dynamics.com",
};
const explicit = { ...environment, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Explicit environment" };
const home = { ...environment, id: "99999999-9999-4999-8999-999999999999", name: "Home environment" };
const agent = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Contoso Support",
  experience: "classic" as const,
  iconBase64: "iVBORw0KGgo=",
};
const conversations = [
  { id: "saved-first", name: "saved-first" },
  { id: "saved-second", name: "saved-second" },
];

function fixture() {
  const calls = { defaults: 0, agents: [] as string[], targets: [] as string[], conversations: [] as { environmentId: string; agentId: string; query: string }[], analyses: [] as string[] };
  const service = new AgentDebuggerService("fixture-not-a-credential");
  service.listEnvironments = async () => [home, environment, explicit];
  service.defaultEnvironment = async () => { calls.defaults += 1; return home; };
  service.listAgents = async id => { calls.agents.push(id); return [agent]; };
  service.resolveAgent = async (id, input) => {
    calls.targets.push(id);
    return exactSelection([agent], "AGENT", input.agentId, input.agentName);
  };
  service.listConversations = async (environmentId, agentId, query = "") => {
    calls.conversations.push({ environmentId, agentId, query });
    return conversations.filter(item => !query || item.id === query);
  };
  service.analyze = async (_environmentId, _agentId, conversationId) => {
    calls.analyses.push(conversationId);
    throw new ReviewError("FIXTURE_ANALYSIS", "The selected saved conversation reached analysis.");
  };
  return { service, calls, factory: () => service };
}

function errorCode(response: Awaited<ReturnType<typeof openAgentDebugger>>) {
  return (response.structuredContent?.error as { code?: string } | undefined)?.code;
}

test("a named Debugger target selects the first authorized saved conversation in the named default, not the home", async () => {
  const { calls, factory } = fixture();
  const response = await openAgentDebugger("fixture", { agentName: agent.name }, factory);
  assert.equal(response.isError, undefined);
  assert.equal(response.structuredContent?.state, "analysis");
  assert.equal(response.structuredContent?.targetResolved, true);
  assert.equal(response.structuredContent?.environmentId, environment.id);
  assert.equal(response.structuredContent?.agentId, agent.id);
  assert.deepEqual(response.structuredContent?.conversations, conversations);
  assert.equal(response.structuredContent?.conversationId, conversations[0].id);
  assert.deepEqual(response.structuredContent?.conversation, conversations[0]);
  assert.deepEqual(calls.agents, []);
  assert.deepEqual(calls.targets, [environment.id]);
  assert.equal(calls.defaults, 0);
  assert.deepEqual(calls.analyses, []);
});

test("Debugger preserves an explicit environment and case plus outer-whitespace matching", async () => {
  const { calls, factory } = fixture();
  const response = await openAgentDebugger("fixture", {
    environmentName: " explicit environment ", agentName: " CONTOSO SUPPORT ",
  }, factory);
  assert.equal(response.structuredContent?.state, "analysis");
  assert.equal(response.structuredContent?.environmentId, explicit.id);
  assert.deepEqual(calls.targets, [explicit.id]);
  assert.deepEqual(calls.agents, []);
  assert.equal(calls.defaults, 0);
});

for (const name of ["Contoso", "Contoso   Support", "Unknown agent"]) {
  test(`Debugger opens the target form without a guessed match for ${JSON.stringify(name)}`, async () => {
    const { calls, factory } = fixture();
    const response = await openAgentDebugger("fixture", { agentName: name }, factory);
    assert.equal(response.structuredContent?.state, "selecting");
    assert.equal(response.structuredContent?.targetResolved, false);
    assert.equal(errorCode(response), "AGENT_NOT_FOUND");
    assert.match(JSON.stringify(response), /unavailable/i);
    assert.deepEqual(calls.conversations, []);
    assert.deepEqual(calls.analyses, []);
  });
}

test("missing Debugger names preserve the manual target form and a visible reason", async () => {
  const { calls, factory } = fixture();
  const response = await openAgentDebugger("fixture", {}, factory);
  assert.equal(response.structuredContent?.state, "selecting");
  assert.equal(response.structuredContent?.targetResolved, false);
  assert.equal(errorCode(response), "AGENT_NAME_REQUIRED");
  assert.equal(response.structuredContent?.environmentId, home.id);
  assert.deepEqual(calls.conversations, []);
});

test("duplicate Debugger names open the target form", async () => {
  const { service, calls, factory } = fixture();
  service.resolveAgent = async (_id, input) => exactSelection([
    agent, { ...agent, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  ], "AGENT", input.agentId, input.agentName);
  const response = await openAgentDebugger("fixture", { agentName: agent.name }, factory);
  assert.equal(response.structuredContent?.state, "selecting");
  assert.equal(errorCode(response), "AGENT_AMBIGUOUS");
  assert.deepEqual(calls.conversations, []);
});

test("a Debugger ID cannot override a different supplied name", async () => {
  const { calls, factory } = fixture();
  const response = await openAgentDebugger("fixture", { agentId: agent.id, agentName: "Another agent" }, factory);
  assert.equal(response.structuredContent?.state, "selecting");
  assert.equal(errorCode(response), "AGENT_NOT_FOUND");
  assert.deepEqual(calls.conversations, []);
});

test("a missing named default cannot fall through to another environment", async () => {
  const { service, calls, factory } = fixture();
  service.listEnvironments = async () => [home, explicit];
  const response = await openAgentDebugger("fixture", { agentName: agent.name }, factory);
  assert.equal(response.structuredContent?.state, "selecting");
  assert.equal(errorCode(response), "ENVIRONMENT_NOT_FOUND");
  assert.deepEqual(calls.agents, []);
  assert.equal(calls.defaults, 0);
});

test("a duplicate named default cannot choose the first environment", async () => {
  const { service, calls, factory } = fixture();
  service.listEnvironments = async () => [environment, { ...environment, id: home.id }];
  const response = await openAgentDebugger("fixture", { agentName: agent.name }, factory);
  assert.equal(errorCode(response), "ENVIRONMENT_AMBIGUOUS");
  assert.deepEqual(calls.agents, []);
});

test("an inaccessible explicit environment is not replaced by the default", async () => {
  const { calls, factory } = fixture();
  const response = await openAgentDebugger("fixture", { environmentName: "Unavailable environment", agentName: agent.name }, factory);
  assert.equal(response.structuredContent?.state, "selecting");
  assert.equal(errorCode(response), "ENVIRONMENT_NOT_FOUND");
  assert.equal(calls.defaults, 0);
  assert.deepEqual(calls.agents, []);
});

test("a supplied conversation overrides the first conversation only after its exact target-qualified lookup", async () => {
  const { calls, factory } = fixture();
  const response = await openAgentDebugger("fixture", { agentName: agent.name, conversationId: "saved-second" }, factory);
  assert.deepEqual(calls.conversations, [{ environmentId: environment.id, agentId: agent.id, query: "saved-second" }]);
  assert.deepEqual(calls.analyses, []);
  assert.equal(response.isError, undefined);
  assert.equal(response.structuredContent?.conversationId, "saved-second");
  assert.deepEqual(response.structuredContent?.deferred, ["agents", "analysis"]);
  assert.equal(response.structuredContent?.state, "analysis");
});

test("a missing or foreign conversation opens the selected agent's list without automatic analysis", async () => {
  const { calls, factory } = fixture();
  const response = await openAgentDebugger("fixture", { agentName: agent.name, conversationId: "foreign-conversation" }, factory);
  assert.equal(response.structuredContent?.state, "conversations");
  assert.equal(response.structuredContent?.targetResolved, true);
  assert.equal(errorCode(response), "TRANSCRIPT_NOT_FOUND");
  assert.deepEqual(response.structuredContent?.conversations, conversations);
  assert.equal(response.structuredContent?.conversationId, undefined);
  assert.deepEqual(calls.analyses, []);
});

test("an agent lookup failure keeps the form and its error instead of an empty successful list", async () => {
  const { service, factory } = fixture();
  service.resolveAgent = async () => { throw new ReviewError("DATAVERSE_ERROR", "Agent access failed."); };
  const response = await openAgentDebugger("fixture", { agentName: agent.name }, factory);
  assert.equal(response.isError, true);
  assert.equal(response.structuredContent?.state, "selecting");
  assert.equal(errorCode(response), "DATAVERSE_ERROR");
  assert.match(JSON.stringify(response), /Agent access failed/);
});

test("conversation lookup failures keep the resolved target and remain visible", async () => {
  const { service, factory } = fixture();
  service.listConversations = async () => { throw new ReviewError("DATAVERSE_ERROR", "Conversation access failed."); };
  const response = await openAgentDebugger("fixture", { agentName: agent.name }, factory);
  assert.equal(response.isError, true);
  assert.equal(response.structuredContent?.state, "conversations");
  assert.equal(response.structuredContent?.targetResolved, true);
  assert.equal(errorCode(response), "DATAVERSE_ERROR");
});

test("an empty authorized Debugger list is not a fabricated conversation or analysis", async () => {
  const { service, calls, factory } = fixture();
  service.listConversations = async () => [];
  const response = await openAgentDebugger("fixture", { agentName: agent.name }, factory);
  assert.equal(response.structuredContent?.state, "conversations");
  assert.deepEqual(response.structuredContent?.conversations, []);
  assert.equal(response.structuredContent?.conversationId, undefined);
  assert.deepEqual(calls.analyses, []);
  assert.match(JSON.stringify(response.content), /No saved conversations/);
});

test("Debugger default and explicit conversation lookup preserve the supplied date bounds", async () => {
  for (const conversationId of [undefined, "saved-second"]) {
    const { service, factory } = fixture();
    const dates = { startedAfter: "2026-10-01T00:00:00Z", startedBefore: "2026-10-12T00:00:00Z" };
    let received: unknown;
    service.listConversations = async (_environment, _agent, query, _limit, bounds) => {
      received = bounds;
      return query ? [conversations[1]] : conversations;
    };
    const response = await openAgentDebugger("fixture", { agentName: agent.name, conversationId, ...dates }, factory);
    assert.deepEqual(received, dates);
    assert.equal(response.structuredContent?.conversationId, conversationId ?? conversations[0].id);
  }
});

test("unauthenticated Debugger prompts open the form with AUTH_REQUIRED and no data-service creation", async () => {
  const response = await openAgentDebugger(undefined, { agentName: agent.name }, () => {
    throw new Error("The factory must not run.");
  });
  assert.equal(response.isError, true);
  assert.equal(response.structuredContent?.state, "selecting");
  assert.equal(errorCode(response), "AUTH_REQUIRED");
});
