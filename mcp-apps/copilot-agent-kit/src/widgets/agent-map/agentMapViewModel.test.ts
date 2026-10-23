import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMapGraph } from "../../agent-map/types";
import {
  toAgentMapViewGraph,
  agentMapNodeSearchText,
} from "./agentMapViewModel";

function graph(): AgentMapGraph {
  return {
    agent: {
      id: "9c",
      name: "ZAVA Visual Merchandiser",
      environmentId: "env-1",
      environmentName: "Contoso (default)",
    },
    nodes: [
      {
        id: "agent:9c",
        category: "agent",
        label: "ZAVA Visual Merchandiser",
        subtitle: "gpt-4o",
        componentId: "9c",
        details: { Tools: 2 },
        warnings: [],
      },
      {
        id: "tool:planogram",
        category: "tool",
        label: "Planogram lookup",
        subtitle: "MCP tool",
        schemaName: "cat_planogram",
        details: { Kind: "McpTool" },
        warnings: [],
      },
      {
        id: "tool:photos",
        category: "tool",
        label: "Store photos",
        subtitle: "Connector tool",
        details: { Kind: "ConnectorTool" },
        warnings: ["Connection reference is missing."],
      },
      {
        id: "unknown:mystery",
        category: "unknown",
        label: "cat_mystery",
        subtitle: "Unresolved component",
        details: {},
        warnings: ["Component kind is unavailable."],
      },
    ],
    edges: [
      {
        id: "agent:9c|tool:planogram|structural",
        source: "agent:9c",
        target: "tool:planogram",
        relationship: "contains",
        provenance: "structural",
        evidence: "Configured directly on the selected agent.",
        confidence: 1,
      },
      {
        id: "skill:audit|tool:planogram|textual-exact",
        source: "agent:9c",
        target: "tool:photos",
        relationship: "possibly references tool",
        provenance: "textual-exact",
        evidence: "SKILL.md line 12: use Planogram lookup",
        confidence: 1,
      },
    ],
    diagnostics: [],
    summary: {
      nodeCount: 4,
      componentCount: 3,
      edgeCount: 2,
      unresolvedCount: 1,
      skillReferenceCount: 1,
      linkedSkillCount: 0,
      unlinkedSkillCount: 0,
    },
  };
}

test("places the agent at depth zero and every component on the first ring", () => {
  const view = toAgentMapViewGraph(graph());

  assert.equal(view.nodes.find((node) => node.category === "agent")?.depth, 0);
  assert.deepEqual(
    view.nodes.filter((node) => node.category !== "agent").map((node) => node.depth),
    [1, 1, 1],
  );
});

test("marks only unknown components unresolved", () => {
  const view = toAgentMapViewGraph(graph());

  assert.equal(view.nodes.find((node) => node.id === "unknown:mystery")?.resolution, "unresolved");
  assert.equal(view.nodes.find((node) => node.id === "tool:photos")?.resolution, "resolved");
});

test("derives the tool subtype so MCP tools keep their own mark", () => {
  const view = toAgentMapViewGraph(graph());

  assert.equal(view.nodes.find((node) => node.id === "tool:planogram")?.toolKind, "McpTool");
  assert.equal(view.nodes.find((node) => node.id === "tool:photos")?.toolKind, "ConnectorTool");
  assert.equal(view.nodes.find((node) => node.id === "unknown:mystery")?.toolKind, undefined);
});

test("indexes label, subtitle, schema name, details, and warnings for search", () => {
  const view = toAgentMapViewGraph(graph());
  const node = view.nodes.find((candidate) => candidate.id === "tool:planogram")!;

  assert.equal(node.searchText.includes("planogram lookup"), true);
  assert.equal(node.searchText.includes("cat_planogram"), true);
  assert.equal(node.searchText.includes("mcptool"), true);
  assert.equal(node.searchText, agentMapNodeSearchText(node));
});

test("keeps every relationship directed and indexed by evidence", () => {
  const view = toAgentMapViewGraph(graph());

  assert.deepEqual(view.edges.map((edge) => edge.directed), [true, true]);
  assert.equal(view.edges[1].searchText.includes("possibly references tool"), true);
  assert.equal(view.edges[1].searchText.includes("skill.md line 12"), true);
  assert.deepEqual(view.edges.map((edge) => edge.resolution), ["resolved", "resolved"]);
});

test("preserves the deterministic MCP summary and diagnostics untouched", () => {
  const source = graph();
  const view = toAgentMapViewGraph(source);

  assert.deepEqual(view.summary, source.summary);
  assert.deepEqual(view.diagnostics, source.diagnostics);
  assert.deepEqual(view.agent, source.agent);
  assert.equal(source.nodes[0].label, "ZAVA Visual Merchandiser");
});

test("normalizes a maker icon to a data URL the node card can render", () => {
  const source = graph();
  source.nodes[0].iconBase64 = "iVBORw0KGgo=";
  source.nodes[1].iconBase64 = "data:image/svg+xml;base64,PHN2Zy8+";

  const view = toAgentMapViewGraph(source);

  assert.equal(view.nodes[0].iconBase64, "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(view.nodes[1].iconBase64, "data:image/svg+xml;base64,PHN2Zy8+");
});
