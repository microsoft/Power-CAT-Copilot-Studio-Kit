import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMapViewGraph } from "./agentMapViewModel";
import { toAgentMapViewGraph } from "./agentMapViewModel";
import {
  createDefaultFilters,
  filterAgentMapGraph,
  HIDDEN_BY_DEFAULT_CATEGORIES,
  restoreSavedCategories,
  revealCategory,
} from "./filterAgentMapGraph";

function view(): AgentMapViewGraph {
  return toAgentMapViewGraph({
    agent: { id: "9c", name: "ZAVA", environmentId: "env", environmentName: "Contoso" },
    nodes: [
      {
        id: "agent:9c",
        category: "agent",
        label: "ZAVA",
        subtitle: "gpt-4o",
        details: {},
        warnings: [],
      },
      {
        id: "tool:planogram",
        category: "tool",
        label: "Planogram lookup",
        subtitle: "MCP tool",
        details: {},
        warnings: [],
      },
      {
        id: "skill:audit",
        category: "skill",
        label: "Display audit",
        subtitle: "Skill bundle",
        details: {},
        warnings: [],
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
        id: "e-root-tool",
        source: "agent:9c",
        target: "tool:planogram",
        relationship: "contains",
        provenance: "structural",
        evidence: "Configured directly on the selected agent.",
        confidence: 1,
      },
      {
        id: "e-root-skill",
        source: "agent:9c",
        target: "skill:audit",
        relationship: "contains",
        provenance: "structural",
        evidence: "Configured directly on the selected agent.",
        confidence: 1,
      },
      {
        id: "e-skill-tool",
        source: "skill:audit",
        target: "tool:planogram",
        relationship: "possibly references tool",
        provenance: "textual-exact",
        evidence: "SKILL.md line 12: Planogram lookup",
        confidence: 1,
      },
    ],
    diagnostics: [],
    summary: {
      nodeCount: 4,
      componentCount: 3,
      edgeCount: 3,
      unresolvedCount: 1,
      skillReferenceCount: 1,
      linkedSkillCount: 1,
      unlinkedSkillCount: 0,
    },
  });
}

test("defaults to every runtime category and provenance, without evaluation sets or test cases", () => {
  const filters = createDefaultFilters();

  assert.deepEqual([...filters.categories].sort(), [
    "action",
    "agent",
    "connected-agent",
    "knowledge",
    "skill",
    "tool",
    "topic",
    "trigger",
    "unknown",
  ]);
  assert.equal(filters.categories.has("evaluation-set"), false);
  assert.equal(filters.categories.has("test-case"), false);
  assert.deepEqual([...filters.provenances].sort(), [
    "structural",
    "textual-exact",
    "textual-strong",
  ]);
  assert.equal(filters.includeUnresolved, true);
  assert.equal(filters.query, "");
});

test("drops a category and every relationship that touched it", () => {
  const filters = createDefaultFilters();
  const categories = new Set(filters.categories);
  categories.delete("skill");

  const filtered = filterAgentMapGraph(view(), { ...filters, categories });

  assert.deepEqual(filtered.nodes.map((node) => node.id), [
    "agent:9c",
    "tool:planogram",
    "unknown:mystery",
  ]);
  assert.deepEqual(filtered.edges.map((edge) => edge.id), ["e-root-tool"]);
});

test("hides unresolved components when the maker turns them off", () => {
  const filters = createDefaultFilters();

  const filtered = filterAgentMapGraph(view(), { ...filters, includeUnresolved: false });

  assert.equal(filtered.nodes.some((node) => node.id === "unknown:mystery"), false);
});

test("keeps textual relationships filterable on their own", () => {
  const filters = createDefaultFilters();

  const filtered = filterAgentMapGraph(view(), {
    ...filters,
    provenances: new Set(["structural"]),
  });

  assert.deepEqual(filtered.edges.map((edge) => edge.id), ["e-root-tool", "e-root-skill"]);
});

test("emphasizes matches without removing surrounding context", () => {
  const filtered = filterAgentMapGraph(view(), {
    ...createDefaultFilters(),
    query: "planogram",
  });

  assert.equal(filtered.nodes.length, 4);
  assert.equal(filtered.edges.length, 3);
  assert.equal(filtered.matchedNodeIds.has("tool:planogram"), true);
  assert.equal(filtered.matchedNodeIds.has("skill:audit"), true);
  assert.equal(filtered.matchedNodeIds.has("agent:9c"), true);
  assert.equal(filtered.matchedNodeIds.has("unknown:mystery"), false);
  assert.equal(filtered.matchedEdgeIds.has("e-skill-tool"), true);
});

test("matches nothing when the query is absent from the graph", () => {
  const filtered = filterAgentMapGraph(view(), {
    ...createDefaultFilters(),
    query: "nonexistent-component",
  });

  assert.equal(filtered.matchedNodeIds.size, 0);
  assert.equal(filtered.matchedEdgeIds.size, 0);
});

test("hides evaluation sets and test cases by default, and the toolbar choice can show them", () => {
  const graph = view();
  const withEval = toAgentMapViewGraph({
    agent: { id: "9c", name: "ZAVA", environmentId: "env", environmentName: "Contoso" },
    nodes: [
      { id: "agent:9c", category: "agent", label: "ZAVA", subtitle: "", details: {}, warnings: [] },
      { id: "evaluation-set:smoke", category: "evaluation-set", label: "Smoke set", subtitle: "", details: {}, warnings: [] },
      { id: "test-case:one", category: "test-case", label: "Case one", subtitle: "", details: {}, warnings: [] },
    ],
    edges: [
      { id: "e-eval", source: "agent:9c", target: "evaluation-set:smoke", relationship: "contains", provenance: "structural", evidence: "", confidence: 1 },
      { id: "e-case", source: "evaluation-set:smoke", target: "test-case:one", relationship: "contains", provenance: "structural", evidence: "", confidence: 1 },
    ],
    diagnostics: [],
    summary: graph.summary,
  });

  const hidden = filterAgentMapGraph(withEval, createDefaultFilters());
  assert.deepEqual(hidden.nodes.map((node) => node.id), ["agent:9c"]);
  assert.deepEqual(hidden.edges, []);

  const shown = filterAgentMapGraph(withEval, {
    ...createDefaultFilters(),
    categories: new Set([...createDefaultFilters().categories, ...HIDDEN_BY_DEFAULT_CATEGORIES]),
  });
  assert.deepEqual(shown.nodes.map((node) => node.id), ["agent:9c", "evaluation-set:smoke", "test-case:one"]);
  assert.deepEqual(shown.edges.map((edge) => edge.id), ["e-eval", "e-case"]);
});

test("saved earlier default category sets restore as the current default", () => {
  const current = [...createDefaultFilters().categories].sort();
  const eleven = [
    "agent", "tool", "skill", "topic", "action", "knowledge", "connected-agent",
    "trigger", "evaluation-set", "test-case", "unknown",
  ] as const;
  const nine = eleven.filter((category) => category !== "topic" && category !== "action");

  assert.deepEqual([...restoreSavedCategories(eleven)].sort(), current);
  assert.deepEqual([...restoreSavedCategories(nine)].sort(), current);
});

test("saved maker category choices stay unchanged", () => {
  const choice = ["agent", "evaluation-set", "test-case"] as const;
  assert.deepEqual([...restoreSavedCategories(choice)].sort(), [...choice].sort());
  assert.deepEqual([...restoreSavedCategories(["agent", "tool"])].sort(), ["agent", "tool"]);
});

test("revealCategory shows only the category that a navigation needs", () => {
  const filters = createDefaultFilters();
  const revealed = revealCategory(filters, "test-case");

  assert.equal(revealed.categories.has("test-case"), true);
  assert.equal(revealed.categories.has("evaluation-set"), false);
  assert.equal(filters.categories.has("test-case"), false);
  assert.equal(revealCategory(filters, "tool"), filters);
  assert.equal(revealCategory(filters, undefined), filters);
});