import assert from "node:assert/strict";
import test from "node:test";
import type { AgentsExperienceModel } from "../agent-review/core/index.js";
import * as builder from "./builder";

const { buildDeterministicAgentMap } = builder;

const model: AgentsExperienceModel = {
  agentSettings: {
    instructions: "Help the maker.",
    raw: {},
  },
  tools: [],
  skills: [],
  connectedAgents: [{
    name: "inventoryAgent",
    displayName: "Inventory agent",
    botSchemaName: "cat_InventoryAgent",
    schemaname: "cat_inventoryConnection",
  }],
  knowledge: [],
  evaluationSets: [],
  testCases: [],
  multiTurnCases: [],
  triggers: [],
  unknownKinds: [],
};

test("uses the maker icon that matches a connected agent bot schema name", () => {
  const input = {
    agentId: "11111111-1111-1111-1111-111111111111",
    agentName: "Root agent",
    agentIconBase64: "root-icon",
    environmentId: "22222222-2222-2222-2222-222222222222",
    environmentName: "Development",
    model,
    corpusComponents: [],
    agentIcons: {
      cat_inventoryagent: "connected-icon",
    },
  } as Parameters<typeof buildDeterministicAgentMap>[0] & {
    agentIcons: Record<string, string>;
  };

  const graph = buildDeterministicAgentMap(input);

  assert.equal(
    graph.nodes.find((node) => node.category === "agent")?.iconBase64,
    "root-icon",
  );
  assert.equal(
    graph.nodes.find((node) => node.category === "connected-agent")?.iconBase64,
    "connected-icon",
  );
});

test("expands a connected agent with its live skills as second-level nodes", () => {
  assert.equal(
    typeof (builder as { expandConnectedAgentMap?: unknown }).expandConnectedAgentMap,
    "function",
  );
  const base = buildDeterministicAgentMap({
    agentId: "11111111-1111-1111-1111-111111111111",
    agentName: "Root agent",
    environmentId: "22222222-2222-2222-2222-222222222222",
    environmentName: "Development",
    model,
    corpusComponents: [],
  });
  const childModel: AgentsExperienceModel = {
    ...model,
    connectedAgents: [],
    skills: [{
      name: "inventory-planner",
      frontmatterName: "Inventory planner",
      frontmatterDescription: "Plans inventory.",
      schemaname: "cat_inventoryPlanner",
      source: "inline",
      markdown: "",
      resourceCount: 0,
    }],
  };
  const child = buildDeterministicAgentMap({
    agentId: "44444444-4444-4444-4444-444444444444",
    agentName: "Inventory agent",
    environmentId: base.agent.environmentId,
    environmentName: base.agent.environmentName,
    model: childModel,
    corpusComponents: [],
  });
  const connected = base.nodes.find((node) => node.category === "connected-agent");
  assert.ok(connected);

  const expanded = (builder as unknown as {
    expandConnectedAgentMap: typeof import("./builder")["expandConnectedAgentMap"];
  }).expandConnectedAgentMap(base, connected.id, child);
  const skill = expanded.nodes.find((node) => node.label === "Inventory planner");

  assert.ok(skill);
  assert.equal(skill.parentId, connected.id);
  assert.equal(skill.depth, 2);
  assert.ok(expanded.edges.some((edge) =>
    edge.source === connected.id && edge.target === skill.id));
  assert.equal(expanded.nodes.some((node) => node.id === child.nodes[0]?.id), false);
  assert.equal(base.nodes.some((node) => node.label === "Inventory planner"), false);
});
