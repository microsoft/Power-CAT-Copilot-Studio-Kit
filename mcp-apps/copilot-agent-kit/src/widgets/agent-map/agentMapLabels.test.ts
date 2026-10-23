import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_MAP_CATEGORY_LABELS,
  AGENT_MAP_PROVENANCE_LABELS,
  AGENT_MAP_RESOLUTION_LABELS,
  agentMapNodeIconIsBranded,
  agentMapProvenanceDash,
  getAgentMapNodeTypeLabel,
} from "./agentMapLabels";

test("names every MCP component category in maker language", () => {
  assert.deepEqual(AGENT_MAP_CATEGORY_LABELS, {
    agent: "Agent",
    tool: "Tool",
    skill: "Skill",
    topic: "Topic",
    action: "Action",
    knowledge: "Knowledge",
    "connected-agent": "Connected agent",
    trigger: "Trigger",
    "evaluation-set": "Evaluation set",
    "test-case": "Test case",
    unknown: "Unknown component",
  });
});

test("explains relationship evidence without naming the mechanism", () => {
  assert.deepEqual(AGENT_MAP_PROVENANCE_LABELS, {
    structural: "Configured on the agent",
    "textual-exact": "Name matched in skill text",
    "textual-strong": "Likely match in skill text",
  });
  assert.deepEqual(AGENT_MAP_RESOLUTION_LABELS, {
    resolved: "Resolved",
    unresolved: "Unresolved",
  });
});

test("distinguishes MCP tools from connector tools in the node caption", () => {
  assert.equal(getAgentMapNodeTypeLabel({ category: "tool", toolKind: "McpTool" }), "MCP tool");
  assert.equal(
    getAgentMapNodeTypeLabel({ category: "tool", toolKind: "ConnectorTool" }),
    "Connector tool",
  );
  assert.equal(getAgentMapNodeTypeLabel({ category: "knowledge" }), "Knowledge");
});

test("places only product glyphs on a light icon tile", () => {
  assert.equal(agentMapNodeIconIsBranded({ category: "tool", toolKind: "McpTool" }), true);
  assert.equal(agentMapNodeIconIsBranded({ category: "tool", toolKind: "ConnectorTool" }), false);
  assert.equal(agentMapNodeIconIsBranded({ category: "skill" }), true);
  assert.equal(agentMapNodeIconIsBranded({ category: "agent" }), true);
  assert.equal(agentMapNodeIconIsBranded({ category: "connected-agent" }), true);
});

test("reinforces provenance with a line pattern as well as colour", () => {
  assert.equal(agentMapProvenanceDash("structural"), undefined);
  assert.equal(agentMapProvenanceDash("textual-exact"), "2 4");
  assert.equal(agentMapProvenanceDash("textual-strong"), "7 4");
});
