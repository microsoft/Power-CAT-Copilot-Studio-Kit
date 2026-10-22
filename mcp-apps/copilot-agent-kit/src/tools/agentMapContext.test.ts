import assert from "node:assert/strict";
import test from "node:test";
import { agentMapContextPayload } from "./agentMapContext";

const environments = [
  { id: "env-a", name: "Contoso Dev", region: "unitedstates" },
  { id: "env-b", name: "Contoso Test", region: "europe" },
];
const agents = [
  {
    id: "agent-a",
    name: "Zava Support",
    componentIdUnique: "cid-a",
    iconBase64: "abc",
    harness: "copilot" as const,
  },
];
const graph = { agent: { id: "agent-a", name: "Zava Support" } };

test("a map payload carries everything the fullscreen selectors need", () => {
  const payload = agentMapContextPayload({
    environments,
    environmentId: "env-a",
    agents,
    agentId: "agent-a",
    componentIdUnique: "cid-a",
    graph,
  });

  assert.equal(payload.state, "map");
  assert.deepEqual(payload.environments, environments);
  assert.deepEqual(payload.environment, environments[0]);
  assert.equal(payload.environmentId, "env-a");
  assert.deepEqual(payload.agents, agents);
  assert.equal(payload.agentId, "agent-a");
  assert.equal(payload.componentIdUnique, "cid-a");
  assert.equal(payload.graph, graph);
});

test("an explicit environment wins over the lookup", () => {
  const payload = agentMapContextPayload({
    environments,
    environment: environments[1],
    environmentId: "env-b",
    agents,
    agentId: "agent-a",
    componentIdUnique: "cid-a",
    graph,
  });

  assert.deepEqual(payload.environment, environments[1]);
});

test("the payload omits an unknown environment rather than inventing one", () => {
  const payload = agentMapContextPayload({
    environments,
    environmentId: "env-missing",
    agents,
    agentId: "agent-a",
    componentIdUnique: "cid-a",
    graph,
  });

  assert.equal(payload.environment, undefined);
  assert.equal(payload.environmentId, "env-missing");
});

test("the agent icon survives into the payload so selectors can render it", () => {
  const payload = agentMapContextPayload({
    environments,
    environmentId: "env-a",
    agents,
    agentId: "agent-a",
    componentIdUnique: "cid-a",
    graph,
  });

  assert.equal(payload.agents?.[0]?.iconBase64, "abc");
});

test("a map payload excludes standard Copilot Studio agents", () => {
  const payload = agentMapContextPayload({
    environments,
    environmentId: "env-a",
    agents: [
      ...agents,
      {
        id: "agent-standard",
        name: "Standard Agent",
        componentIdUnique: "cid-standard",
        harness: "standard" as const,
      },
    ],
    agentId: "agent-a",
    componentIdUnique: "cid-a",
    graph,
  });

  assert.deepEqual(payload.agents, agents);
});
