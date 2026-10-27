import { Badge, FluentProvider } from "@fluentui/react-components";
import { InfoFilled } from "@fluentui/react-icons";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeterministicAgentMap } from "../../../agent-map/builder.js";
import { AGENT_MAP_PROVENANCE_LABELS } from "../../../widgets/agent-map/agentMapLabels.js";
import { toAgentMapViewGraph } from "../../../widgets/agent-map/agentMapViewModel.js";
import { parseAgentsExperience, type CopilotReviewDisplayPayload } from "../../core/index.js";
import { validateStandardTopicResult } from "../../core/services/standardTopicEvaluation.js";
import fixture from "../fixtures/persisted-review.json";
import type { CopilotReviewResultsProps, ReviewMapNavigation, ReviewTabId } from "../contracts.js";
import { CopilotReviewResults } from "./CopilotReviewResults.js";
import { FindingsTab } from "./FindingsTab.js";
import { copilotStudioReviewLightTheme } from "./copilotStudioReviewTheme.js";
import { buildReviewViewModel } from "./viewModel.js";
import type { FindingView, ReviewViewModel } from "./viewTypes.js";

afterEach(cleanup);

function savedModel(): ReviewViewModel {
  const payload = fixture.agentsExperience as CopilotReviewDisplayPayload;
  const model = buildReviewViewModel(payload, "You", 42_000, fixture.botName);
  const first = model.findings[0];
  const componentIdUnique = payload.model.tools[0].componentIdUnique;
  return {
    ...model,
    findings: [
      {
        ...first, id: "TOL-02", family: "Tools", sev: "warning",
        title: "Review tool configuration", componentIdUnique,
        fact: "First saved evidence.", why: "First saved reason.", fix: "First saved correction.",
      },
      {
        ...first, id: "TOL-02", family: "Tools", sev: "error",
        title: "Review tool configuration", componentIdUnique,
        fact: "Second saved evidence.", why: "Second saved reason.", fix: "Second saved correction.",
        fixSteps: [
          { order: 1, action: "First precise step" },
          { order: 2, action: "Second precise step" },
        ],
      },
      {
        ...first, id: "ORPHAN-01", title: "Unmapped saved finding",
        componentIdUnique: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        fact: "Unmapped saved evidence.",
      },
    ],
    agentMap: {
      state: "ready", reviewId: fixture.reviewId, reviewedOn: fixture.reviewDate,
      componentIdUnique: "33333333-3333-4333-8333-333333333333",
      graph: buildDeterministicAgentMap({
        agentId: fixture.botId, agentName: fixture.botName,
        environmentId: "", environmentName: "Saved target environment",
        model: payload.model, corpusComponents: [],
      }),
    },
  };
}

type HarnessProps = Pick<CopilotReviewResultsProps,
  'model' | 'onOpenFinding' | 'showSummary' | 'mapNavigation' | 'onMapNavigationChange' | 'onActivateNode'
  | 'fullscreenAvailable' | 'onViewAllFindings' | 'onOpenFullscreen' | 'nodeFilter'>;

function Harness(props: HarnessProps) {
  const [tab, setTab] = useState<ReviewTabId>("map");
  return <CopilotReviewResults {...props} activeTab={tab} onTabChange={setTab} />;
}

function themedWith(props: HarnessProps) {
  return <FluentProvider theme={copilotStudioReviewLightTheme}><Harness {...props} /></FluentProvider>;
}

function themed(model: ReviewViewModel, onOpenFinding?: (id: string) => void, showSummary?: boolean, mapNavigation?: ReviewMapNavigation) {
  return themedWith({ model, onOpenFinding, showSummary, mapNavigation });
}

function canvasNode(name: string): HTMLElement {
  const node = [...document.querySelectorAll<HTMLElement>(".react-flow__node")]
    .find(element => element.getAttribute("aria-label")?.includes(`: ${name}.`));
  if (!node) throw new Error(`The saved map node ${name} was not rendered.`);
  return node;
}

// A click event without mousedown: d3-drag cannot read the jsdom event view on mousedown.
function clickCanvasNode(name: string) {
  fireEvent.click(canvasNode(name));
}

async function openTool(user: ReturnType<typeof userEvent.setup>, name = "Display Photo Library") {
  const mapTab = screen.queryByRole("tab", { name: /Agent map/ });
  if (mapTab?.getAttribute("aria-selected") !== "true" && mapTab) await user.click(mapTab);
  await user.click(screen.getByRole("tab", { name: "List", exact: true }));
  await user.click(screen.getByRole("button", { name: `Inspect Connector tool ${name}`, exact: true }));
  return screen.getByRole("region", { name: "Review findings", exact: true });
}

function mapNodeId(model: ReviewViewModel, label: string): string {
  if (model.agentMap?.state !== "ready") throw new Error("The saved map fixture is not ready.");
  const node = model.agentMap.graph.nodes.find(item => item.label === label);
  if (!node) throw new Error(`The saved map has no node ${label}.`);
  return node.id;
}

// A selection without linked findings never sets a node filter. A host can still restore one.
async function openRestoredNodeFilter(user: ReturnType<typeof userEvent.setup>, model: ReviewViewModel, label: string) {
  render(themedWith({ model, nodeFilter: { reviewId: fixture.reviewId, nodeId: mapNodeId(model, label) } }));
  await user.click(screen.getByRole("tab", { name: /Findings/ }));
  return screen.getByRole("region", { name: "Review findings", exact: true });
}

// A node without linked findings only selects: the map stays and the inspector shows the node.
async function inspectSelectOnlyNode(user: ReturnType<typeof userEvent.setup>, inspectName: string, label: string) {
  await user.click(screen.getByRole("tab", { name: "List", exact: true }));
  await user.click(screen.getByRole("button", { name: inspectName, exact: true }));
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("region", { name: "Review findings", exact: true })).toBeNull();
  return screen.getByRole("region", { name: label, exact: true });
}

it("opens completed results on the saved Architecture map with all findings still available", () => {
  render(themed(savedModel()));
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: /Findings/ })).toBeInTheDocument();
  expect(screen.getByLabelText("Review summary")).toBeInTheDocument();
  expect(screen.queryByText(/saved reviewed snapshot|reviewed version:|review saved:/i)).toBeNull();
});

it("hides the inline summary and inspector and does not reopen saved selection details over the map", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  const mounted = render(themed(model, undefined, false));
  expect(screen.queryByLabelText("Review summary")).toBeNull();
  expect(screen.queryByText("Nothing selected")).toBeNull();
  expect(screen.queryByText(/saved reviewed snapshot|reviewed version:|review saved:/i)).toBeNull();
  const map = model.agentMap;
  if (map?.state !== "ready") throw new Error("The saved map fixture is not ready.");
  mounted.unmount();
  const { container } = render(themed(model, undefined, false, {
    view: "map",
    selection: { type: "edge", id: map.graph.edges[0].id },
    filters: {
      query: "",
      categories: map.graph.nodes.map(node => node.category),
      provenances: map.graph.edges.map(edge => edge.provenance),
      includeUnresolved: true,
    },
    movedPositions: [],
  }));
  // Inline shows nothing below or over the map until the maker selects again.
  expect(screen.queryByRole("group", { name: "Map selection details" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
  expect(screen.queryByText("Nothing selected")).toBeNull();
  expect(screen.queryByLabelText("Review summary")).toBeNull();
  await user.click(screen.getByRole("tab", { name: /Findings/ }));
  expect(screen.queryByLabelText("Review summary")).toBeNull();
  expect(screen.getByRole("button", { name: /Unmapped saved finding/ })).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/saved reviewed snapshot|reviewed version:|review saved:/i);
});

const MAP_CATEGORIES = [
  "agent", "tool", "skill", "topic", "action", "knowledge", "connected-agent", "trigger",
  "evaluation-set", "test-case", "unknown",
] as const;

function withEvaluationSet(model: ReviewViewModel): ReviewViewModel {
  if (model.agentMap?.state !== "ready") throw new Error("The saved map fixture is not ready.");
  model.agentMap.graph.nodes.push({
    id: "evaluation-set:saved", category: "evaluation-set", label: "Saved evaluation set",
    subtitle: "Evaluation set", details: {}, warnings: [],
  });
  return model;
}

function allCategoryNavigation(model: ReviewViewModel, marked: boolean): ReviewMapNavigation {
  if (model.agentMap?.state !== "ready") throw new Error("The saved map fixture is not ready.");
  return {
    view: "list",
    selection: null,
    filters: {
      query: "",
      categories: [...MAP_CATEGORIES],
      provenances: [...new Set(model.agentMap.graph.edges.map(edge => edge.provenance))],
      includeUnresolved: true,
      ...(marked ? { defaultsVersion: 2 as const } : {}),
    },
    movedPositions: [],
  };
}

it("hides evaluation sets and test cases on a new map and marks the saved filters", () => {
  const changes = vi.fn();
  render(themedWith({ model: withEvaluationSet(savedModel()), onMapNavigationChange: changes }));
  const saved: ReviewMapNavigation = changes.mock.lastCall![0];
  expect(saved.filters.defaultsVersion).toBe(2);
  expect(saved.filters.categories).not.toContain("evaluation-set");
  expect(saved.filters.categories).not.toContain("test-case");
});

it("keeps a marked saved filter that shows every category, also when it equals an earlier default", () => {
  const model = withEvaluationSet(savedModel());
  const changes = vi.fn();
  render(themedWith({ model, mapNavigation: allCategoryNavigation(model, true), onMapNavigationChange: changes }));
  expect(screen.getByRole("button", { name: "Inspect Evaluation set Saved evaluation set" })).toBeInTheDocument();
  const saved: ReviewMapNavigation = changes.mock.lastCall![0];
  expect([...saved.filters.categories].sort()).toEqual([...MAP_CATEGORIES].sort());
  expect(saved.filters.defaultsVersion).toBe(2);
});

it("restores an unmarked all-category filter from an earlier release to the new default", () => {
  const model = withEvaluationSet(savedModel());
  const changes = vi.fn();
  render(themedWith({ model, mapNavigation: allCategoryNavigation(model, false), onMapNavigationChange: changes }));
  expect(screen.queryByRole("button", { name: "Inspect Evaluation set Saved evaluation set" })).toBeNull();
  const saved: ReviewMapNavigation = changes.mock.lastCall![0];
  expect([...saved.filters.categories].sort())
    .toEqual(MAP_CATEGORIES.filter(category => category !== "evaluation-set" && category !== "test-case").sort());
  expect(saved.filters.defaultsVersion).toBe(2);
});

it("keeps the inline map in place and hands a node click to fullscreen when the host offers it", () => {
  const model = savedModel();
  const activated = vi.fn();
  render(themedWith({ model, showSummary: false, fullscreenAvailable: true, onActivateNode: activated, onViewAllFindings: vi.fn() }));
  clickCanvasNode("Display Photo Library");
  expect(activated).toHaveBeenCalledTimes(1);
  expect(activated.mock.calls[0][0]).toEqual({ reviewId: fixture.reviewId, nodeId: expect.any(String) });
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("group", { name: "Map selection details" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Review findings" })).toBeNull();
});

it("keeps the inline legend behind a map control and the legend panel with the full-screen summary", async () => {
  const user = userEvent.setup();
  render(themedWith({ model: savedModel(), showSummary: false, fullscreenAvailable: true, onViewAllFindings: vi.fn() }));
  expect(screen.queryByRole("group", { name: "Relationship evidence legend" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Relationship evidence legend" }));
  expect(await screen.findByRole("group", { name: "Relationship evidence legend" })).toHaveTextContent("Relationship evidence");
  cleanup();
  render(themedWith({ model: savedModel(), showSummary: true, fullscreenAvailable: true }));
  const mapTab = screen.getByRole("tab", { name: /Agent map/ });
  if (mapTab.getAttribute("aria-selected") !== "true") await user.click(mapTab);
  expect(await screen.findByRole("group", { name: "Relationship evidence legend" })).toHaveTextContent("Relationship evidence");
  expect(screen.queryByRole("button", { name: "Relationship evidence legend" })).toBeNull();
});

it("opens the node's findings inline with one click when fullscreen is not available", () => {
  const model = savedModel();
  const activated = vi.fn();
  const viewAll = vi.fn();
  render(themedWith({ model, showSummary: false, fullscreenAvailable: false, onActivateNode: activated, onViewAllFindings: viewAll }));
  clickCanvasNode("Display Photo Library");
  expect(screen.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("group", { name: "Selected map node" })).toHaveTextContent("Display Photo Library");
  expect(within(screen.getByRole("list", { name: "Review results" })).getAllByRole("button", { name: /Review tool configuration/ })).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /Unmapped saved finding/ })).toBeNull();
  expect(screen.queryByRole("group", { name: "Map selection details" })).toBeNull();
  expect(viewAll).not.toHaveBeenCalled();
  expect(activated).toHaveBeenCalledTimes(1);
  expect(activated.mock.calls[0][0]).toEqual({ reviewId: fixture.reviewId, nodeId: expect.any(String) });
});

it("shows a finite inline findings preview that opens all findings in fullscreen", async () => {
  const user = userEvent.setup();
  const viewAll = vi.fn();
  render(themedWith({ model: savedModel(), showSummary: false, fullscreenAvailable: true, onViewAllFindings: viewAll }));
  await user.click(screen.getByRole("tab", { name: /Findings/ }));
  expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  expect(screen.getByText(/^Showing 3 of 3 findings/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "View all 3 findings in full screen" }));
  expect(viewAll).toHaveBeenCalledWith(null);
});

it("keeps the inline unavailable-map path free of a summary without hiding findings", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  model.agentMap = { state: "unavailable", reviewId: fixture.reviewId, reason: "The saved review has no agent ID." };
  render(themed(model, undefined, false));
  expect(screen.getByText("The saved review has no agent ID.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Review summary")).toBeNull();
  await user.click(screen.getByRole("tab", { name: /Findings/ }));
  expect(screen.getByRole("button", { name: /Unmapped saved finding/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("Review summary")).toBeNull();
});

it("shows only the node's stamped findings and opens the exact duplicate-rule row with full detail", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  const opened = vi.fn();
  model.findings.push({
    ...model.findings[0], title: 'Display Photo Library has another result',
    componentIdUnique: fixture.agentsExperience.model.tools[1].componentIdUnique,
  });
  render(themed(model, opened));
  const filtered = await openTool(user);
  expect(screen.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
  expect(within(filtered).getAllByRole("button", { name: /Review tool configuration/ })).toHaveLength(2);
  expect(within(filtered).queryByText("Display Photo Library has another result")).toBeNull();
  expect(within(filtered).queryByText("Unmapped saved finding")).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Finding details" })).toBeNull();
  expect(opened).not.toHaveBeenCalled();
  await user.click(within(filtered).getByRole("button", { name: "More details" }));
  expect(screen.getByRole("button", { name: /Review tool configuration.*Error/, hidden: true })).toHaveAttribute("aria-expanded", "true");
  const details = await screen.findByRole("dialog", { name: "Finding details", exact: true });
  expect(within(details).getByRole("button", { name: "Close finding details" })).toHaveFocus();
  expect(within(details).getByText("Second saved evidence.")).toBeInTheDocument();
  expect(within(details).getByText("Second saved reason.")).toBeInTheDocument();
  expect(within(details).getByText("Second saved correction.")).toBeInTheDocument();
  expect(within(details).getByText("First precise step")).toBeInTheDocument();
  expect(within(details).queryByText("First saved evidence.")).toBeNull();
  await user.click(within(details).getByRole("button", { name: "Close finding details" }));
  await user.click(screen.getByRole("button", { name: "Clear node filter", exact: true }));
  expect(screen.queryByRole("dialog", { name: "Finding details" })).toBeNull();
  expect(screen.getByRole("button", { name: /Unmapped saved finding/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Display Photo Library has another result/ })).toBeInTheDocument();
});

it("shows an explicit no-linked-findings state for a component with no matching saved findings", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  render(themed(model));
  const inspector = await inspectSelectOnlyNode(user, "Inspect Connector tool Planogram Archive", "Planogram Archive");
  expect(within(inspector).getByText("No review findings were linked to this component.")).toBeInTheDocument();
  cleanup();
  const filtered = await openRestoredNodeFilter(user, model, "Planogram Archive");
  expect(within(filtered).getByText("No review findings were linked to this node.")).toBeInTheDocument();
  expect(within(filtered).queryByRole("list", { name: "Review results" })).toBeNull();
});

it("shows unavailable attribution instead of a clean result when component links were not recorded", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  model.findings = model.findings.map(finding => ({ ...finding, componentIdUnique: undefined }));
  render(themed(model));
  const inspector = await inspectSelectOnlyNode(user, "Inspect Connector tool Display Photo Library", "Display Photo Library");
  expect(within(inspector).getByText(/Component-level finding links were not recorded/)).toBeInTheDocument();
  cleanup();
  const filtered = await openRestoredNodeFilter(user, model, "Display Photo Library");
  expect(within(filtered).getByText("Saved finding attribution is not available for this node.")).toBeInTheDocument();
  expect(within(filtered).queryByText("No review findings were linked to this node.")).toBeNull();
  expect(within(filtered).queryByRole("list", { name: "Review results" })).toBeNull();
});

it("retains unmapped findings without adding guessed graph nodes", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  expect(model.agentMap?.state).toBe("ready");
  render(themed(model));
  expect(screen.queryByText(/saved finding is not linked to a map component/i)).toBeNull();
  await user.click(screen.getByRole("tab", { name: /Findings/ }));
  expect(screen.getByRole("button", { name: /Unmapped saved finding/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Unmapped saved finding/ }));
  await user.click(screen.getByRole("button", { name: "More details" }));
  expect(screen.getByRole("dialog", { name: "Finding details" })).toHaveTextContent("Unmapped saved evidence.");
});

it("keeps the selected node, map view, and later tab on repeated data renders", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  const mounted = render(themed(model));
  await openTool(user);
  mounted.rerender(themed(structuredClone(model)));
  expect(screen.getByRole("group", { name: "Selected map node" })).toHaveTextContent("Display Photo Library");
  mounted.rerender(themed(structuredClone(model)));
  expect(screen.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
  await user.click(screen.getByRole("tab", { name: /Agent map/ }));
  expect(screen.getByRole("tab", { name: "List", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("region", { name: "Display Photo Library", exact: true })).toBeInTheDocument();
});

it("keeps finding details accessible when the saved map cannot be reconstructed", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  model.agentMap = {
    state: "unavailable", reviewId: fixture.reviewId,
    reason: "The saved review has no agent ID.",
  };
  render(themed(model));
  expect(screen.getByText("The saved review has no agent ID.")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: /Findings/ }));
  expect(screen.getByRole("button", { name: /Unmapped saved finding/ })).toBeInTheDocument();
});

it("matches component GUIDs without regard to letter case, never by a finding title", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  const uniqueId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  if (model.agentMap?.state === "ready") {
    const node = model.agentMap.graph.nodes.find(candidate => candidate.label === "Display Photo Library");
    if (node) node.componentIdUnique = uniqueId.toUpperCase();
  }
  model.findings = [{
    ...model.findings[0], componentIdUnique: uniqueId,
  }, {
    ...model.findings[1], componentIdUnique: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    title: "Display Photo Library name must not select this finding",
  }] satisfies FindingView[];
  render(themed(model));
  const filtered = await openTool(user);
  expect(within(filtered).getAllByRole("button", { name: /Review tool configuration/ })).toHaveLength(1);
  expect(within(filtered).queryByText("Display Photo Library name must not select this finding")).toBeNull();
});

function standardModel(unavailable = false): ReviewViewModel {
  const componentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const componentIdUnique = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const sourceText = JSON.stringify({
    kind: "TaskDialog", modelDescription: "Read the original report.",
    action: { kind: "InvokeConnectorTaskAction", operationId: "ReadReport", connectionReference: "original_reference" },
  });
  const parsed = parseAgentsExperience('{"settings":{"GenerativeActionsEnabled":true}}', [{
    botcomponentid: componentId, componentidunique: componentIdUnique,
    botid: fixture.botId, name: "Original Standard task", schemaname: "original.task",
    componenttype: "9", data: sourceText, content: "",
  }]);
  const topic = parsed.topics![0];
  const review = validateStandardTopicResult(topic, "a".repeat(64), unavailable ? null : {
    evaluationType: "StandardTopic", contractVersion: 1, inputHash: "a".repeat(64),
    componentId, componentIdUnique, componentKind: "TaskDialog", componentSchemaName: "original.task",
    status: "complete", summary: "Original task evaluation.",
    findings: [
      { ruleId: "TOP-01", severity: "warning", evidence: "ReadReport", confidence: "high", actionPath: "/action" },
      { ruleId: "TOP-01", severity: "warning", evidence: "Read the original report.", confidence: "high" },
    ],
  });
  const payload: CopilotReviewDisplayPayload = {
    ...fixture.agentsExperience as CopilotReviewDisplayPayload,
    model: parsed, findings: review.findings, topicReviews: [review], skillBundleReviews: [],
  };
  return {
    ...buildReviewViewModel(payload, "You", 1_000, "Original Standard agent"),
    agentMap: {
      state: "ready", reviewId: fixture.reviewId,
      graph: buildDeterministicAgentMap({
        agentId: fixture.botId, agentName: "Original Standard agent",
        environmentId: "", environmentName: "Reviewed target",
        model: parsed, corpusComponents: [],
      }),
    },
  };
}

it("maps the saved Standard target harness into the review overview", () => {
  expect(standardModel().summary).toHaveProperty("harness", "standard");
});

it("shows Standard as the saved target's Powered by value, not the inline review worker", () => {
  render(themed(standardModel()));
  const summary = screen.getByLabelText("Review summary");
  expect(within(summary).getByText("Powered by", { exact: true })).toBeInTheDocument();
  expect(within(summary).getByText("Standard", { exact: true })).toBeInTheDocument();
  expect(within(summary).queryByText("GitHub Copilot", { exact: true })).toBeNull();
});

for (const harness of [undefined, "copilot"] as const) {
  it(`keeps the original Powered by value for ${harness ?? "older no-harness"} saved reviews`, () => {
    const payload: CopilotReviewDisplayPayload = structuredClone(fixture.agentsExperience as CopilotReviewDisplayPayload);
    if (harness) payload.model.harness = harness;
    else delete payload.model.harness;
    const model = buildReviewViewModel(payload, "You", 42_000, fixture.botName);
    render(themed(model));
    expect(within(screen.getByLabelText("Review summary")).getByText("GitHub Copilot", { exact: true })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Review summary")).queryByText("Standard", { exact: true })).toBeNull();
  });
}

it("shows Standard topics and original actions without putting them in the Skills view", async () => {
  const user = userEvent.setup();
  const model = standardModel();
  expect(model.skills).toHaveLength(0);
  render(themed(model));
  await user.click(screen.getByRole("tab", { name: "List", exact: true }));
  await user.click(screen.getByRole("button", { name: "Inspect Topic Original Standard task", exact: true }));
  const topic = screen.getByRole("region", { name: "Review findings", exact: true });
  expect(within(topic).getAllByRole("button", { name: /Make the dialog behavior/ })).toHaveLength(2);
  await user.click(screen.getByRole("tab", { name: /Agent map/ }));
  await user.click(screen.getByRole("button", { name: "Inspect Action InvokeConnectorTaskAction", exact: true }));
  const action = screen.getByRole("region", { name: "Review findings", exact: true });
  expect(within(action).getAllByRole("button", { name: /Make the dialog behavior/ })).toHaveLength(1);
  expect(screen.queryByRole("dialog", { name: "Finding details" })).toBeNull();
  expect(within(action).getByRole("group", { name: "Selected map node" })).toHaveTextContent("InvokeConnectorTaskAction");
  await user.click(within(action).getByRole("button", { name: "More details" }));
  const details = await screen.findByRole("dialog", { name: "Finding details", exact: true });
  expect(within(details).getByRole("region", { name: "What we found" }).querySelector("pre")?.textContent).toBe("ReadReport");
  expect(within(details).getByText("Open the original component in Copilot Studio.")).toBeInTheDocument();
  expect(within(details).getByRole("region", { name: "What we found" })).toHaveTextContent("ReadReport");
  expect(within(details).getByRole("region", { name: "Why it matters" })).not.toBeEmptyDOMElement();
  expect(within(details).getByRole("region", { name: "Recommendation" })).not.toBeEmptyDOMElement();
  expect(within(details).getByRole("region", { name: "Saved attribution" })).toHaveTextContent("/action");
  expect(within(details).getByText("Fail", { exact: true })).toBeInTheDocument();
});

it("replaces an exact node filter without mixing same-family tools", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  model.findings.push({
    ...model.findings[0], title: "Other tool result",
    componentIdUnique: fixture.agentsExperience.model.tools[1].componentIdUnique,
  });
  render(themed(model));
  await openTool(user);
  expect(screen.queryByRole("button", { name: /Other tool result/ })).toBeNull();
  await openTool(user, "Planogram Archive");
  expect(screen.getByRole("button", { name: /Other tool result/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Review tool configuration/ })).toBeNull();
  expect(screen.getByRole("group", { name: "Selected map node" })).toHaveTextContent("Planogram Archive");
});

it("keeps all saved results at the root and does not guess attribution for check-only rows", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  render(themed(model));
  await user.click(screen.getByRole("tab", { name: "List", exact: true }));
  await user.click(screen.getByRole("button", { name: `Inspect Agent ${fixture.botName}`, exact: true }));
  expect(screen.getByRole("button", { name: /Unmapped saved finding/ })).toBeInTheDocument();
  await user.click(screen.getByText(/Show \d+ other check results/));
  expect(within(screen.getByRole("list", { name: "Other check results" })).getAllByRole("button").length).toBeGreaterThan(0);
  await openTool(user);
  expect(screen.getByText("Saved check results without component IDs are available when you clear the node filter.")).toBeInTheDocument();
  expect(within(screen.getByRole("list", { name: "Review results" })).getAllByRole("button").filter(button => button.hasAttribute("aria-expanded"))).toHaveLength(2);
});

it("shows missing node identity as unavailable without unrelated findings", async () => {
  const user = userEvent.setup();
  const model = savedModel();
  if (model.agentMap?.state === "ready") {
    const node = model.agentMap.graph.nodes.find(item => item.label === "Display Photo Library")!;
    delete node.componentIdUnique;
  }
  render(themed(model));
  const inspector = await inspectSelectOnlyNode(user, "Inspect Connector tool Display Photo Library", "Display Photo Library");
  expect(within(inspector).getByText(/Component-level finding links were not recorded/)).toBeInTheDocument();
  expect(within(inspector).queryByRole("button", { name: /Review tool configuration/ })).toBeNull();
  cleanup();
  await openRestoredNodeFilter(user, model, "Display Photo Library");
  expect(screen.getByText("Saved finding attribution is not available for this node.")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Review results" })).toBeNull();
});

it("shows a saved action without its action path as unavailable", async () => {
  const user = userEvent.setup();
  const model = standardModel();
  if (model.agentMap?.state === "ready") {
    const node = model.agentMap.graph.nodes.find(item => item.category === "action")!;
    delete node.actionPath;
  }
  render(themed(model));
  const inspector = await inspectSelectOnlyNode(user, "Inspect Action InvokeConnectorTaskAction", "InvokeConnectorTaskAction");
  expect(within(inspector).getByText(/Component-level finding links were not recorded/)).toBeInTheDocument();
  cleanup();
  await openRestoredNodeFilter(user, model, "InvokeConnectorTaskAction");
  expect(screen.getByText("Saved finding attribution is not available for this node.")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Review results" })).toBeNull();
});

it("shows an explicit incomplete Standard evaluation on saved reopen", () => {
  render(themed(standardModel(true)));
  expect(screen.getByText(/Standard topic evaluation is incomplete/)).toBeInTheDocument();
  expect(screen.getByText(/Standard evaluator result is missing or malformed/)).toBeInTheDocument();
});

it("matches saved Standard evaluation by a balanced GUID despite braces and case", () => {
  const componentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const componentIdUnique = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const parsed = parseAgentsExperience('{"settings":{"GenerativeActionsEnabled":true}}', [{
    botcomponentid: componentId, componentidunique: `{${componentIdUnique.toUpperCase()}}`,
    botid: fixture.botId, name: "Original Standard task", schemaname: "original.task",
    componenttype: "9", data: JSON.stringify({
      kind: "TaskDialog", action: { kind: "InvokeConnectorTaskAction", operationId: "ReadReport" },
    }), content: "",
  }]);
  const review = validateStandardTopicResult(parsed.topics![0], "a".repeat(64), {
    evaluationType: "StandardTopic", contractVersion: 1, inputHash: "a".repeat(64),
    componentId, componentIdUnique, componentKind: "TaskDialog", componentSchemaName: "original.task",
    status: "complete", summary: "Exact saved Standard evaluation.", findings: [],
  });
  review.componentIdUnique = componentIdUnique;
  const payload: CopilotReviewDisplayPayload = {
    ...fixture.agentsExperience as CopilotReviewDisplayPayload,
    model: parsed, findings: review.findings, topicReviews: [review], skillBundleReviews: [],
  };
  const model = buildReviewViewModel(payload, "You", 1_000, "Original Standard agent");
  expect(model.topicReviews[0].status).toBe("complete");
  expect(model.topicReviews[0].summary).toBe("Exact saved Standard evaluation.");
});

// The demo mount check finds map nodes with this pattern. The finding count goes after it.
const NODE_NAME = /^(Agent|Connector tool|Skill|Knowledge|Connected agent): (.*?)\. (resolved|unresolved)\b/;

function findingBadge(name: string): HTMLElement | null {
  return canvasNode(name).querySelector<HTMLElement>("[data-finding-severity]");
}

function filledBadgeClass(color: "danger" | "warning" | "informative"): string {
  const { container, unmount } = render(
    <FluentProvider theme={copilotStudioReviewLightTheme}>
      <Badge appearance="filled" color={color} size="small" shape="rounded" icon={<InfoFilled />}>1</Badge>
    </FluentProvider>,
  );
  const className = container.querySelector(".fui-Badge")?.className ?? "";
  unmount();
  return className;
}

// A recorded fact is a finding that a recorded check row also holds: the Findings tab lists it with the other check results.
function withRecordedFact(model: ReviewViewModel, toolIndex: number, title: string): ReviewViewModel {
  const fact: FindingView = {
    ...model.findings[0], id: "REC-01", family: "Tools", sev: "info", title,
    componentIdUnique: fixture.agentsExperience.model.tools[toolIndex].componentIdUnique,
    fact: `${title} evidence.`,
  };
  model.findings.push(fact);
  const counts = { passed: 0, info: 0, warning: 0, error: 0, notApplicable: 0, failed: 0, recorded: 1 };
  const group = {
    family: fact.family, counts,
    rows: [{ key: `recorded:${title}`, ruleId: fact.id, family: fact.family, status: "info" as const, record: true, findings: [fact] }],
  };
  model.checks = model.checks?.recorded
    ? { ...model.checks, groups: [...model.checks.groups, group] }
    : { recorded: true, groups: [group], totals: { ...counts, evaluated: 0 } };
  return model;
}

it("shows the count of linked findings on a node in the color of the highest severity", () => {
  render(themed(savedModel(), undefined, false));
  const badge = findingBadge("Display Photo Library");
  expect(badge?.textContent).toBe("2");
  expect(badge).toHaveAttribute("data-finding-severity", "error");
  expect(badge).toHaveAttribute("title", "2 findings: 1 error, 1 warning");
  expect(badge?.querySelector("svg")).not.toBeNull();
  const label = canvasNode("Display Photo Library").getAttribute("aria-label") ?? "";
  expect(label).toMatch(NODE_NAME);
  expect(label).toBe("Connector tool: Display Photo Library. resolved. 2 findings: 1 error, 1 warning. Press Enter to open findings.");
  expect(badge?.className).toBe(filledBadgeClass("danger"));
  expect(badge?.className).not.toBe(filledBadgeClass("warning"));
});

it("shows a warning badge when the node's highest severity is a warning", () => {
  const model = savedModel();
  model.findings = model.findings.filter(finding => finding.sev !== "error");
  render(themed(model, undefined, false));
  const badge = findingBadge("Display Photo Library");
  expect(badge?.textContent).toBe("1");
  expect(badge).toHaveAttribute("data-finding-severity", "warning");
  expect(badge).toHaveAttribute("title", "1 finding: 1 warning");
  expect(canvasNode("Display Photo Library").getAttribute("aria-label"))
    .toBe("Connector tool: Display Photo Library. resolved. 1 finding: 1 warning. Press Enter to open findings.");
  expect(badge?.className).toBe(filledBadgeClass("warning"));
});

it("shows no count on the root agent node or on a node without linked findings", () => {
  render(themed(savedModel(), undefined, false));
  expect(findingBadge(fixture.botName)).toBeNull();
  expect(canvasNode(fixture.botName).getAttribute("aria-label"))
    .toBe(`Agent: ${fixture.botName}. resolved. Press Enter to open all findings.`);
  expect(findingBadge("Planogram Archive")).toBeNull();
  expect(canvasNode("Planogram Archive").getAttribute("aria-label"))
    .toBe("Connector tool: Planogram Archive. resolved. Press Enter for details.");
  for (const node of document.querySelectorAll(".react-flow__node")) {
    expect(node.getAttribute("aria-label")).toMatch(NODE_NAME);
  }
});

it("shows no count when component-level finding links were not recorded", () => {
  const model = savedModel();
  model.findings = model.findings.map(finding => ({ ...finding, componentIdUnique: undefined }));
  render(themed(model, undefined, false));
  expect(document.querySelector("[data-finding-severity]")).toBeNull();
  expect(canvasNode("Display Photo Library").getAttribute("aria-label")).toMatch(/\. Press Enter for details\.$/);
});

it.each([true, false])("only selects an inline node without linked findings (fullscreen offered: %s)", (fullscreenAvailable) => {
  const activated = vi.fn();
  render(themedWith({ model: savedModel(), showSummary: false, fullscreenAvailable, onActivateNode: activated, onViewAllFindings: vi.fn() }));
  clickCanvasNode("Planogram Archive");
  expect(canvasNode("Planogram Archive")).toHaveClass("selected");
  expect(activated).not.toHaveBeenCalled();
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("group", { name: "Map selection details" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Review findings" })).toBeNull();
  expect(screen.queryByRole("button", { name: /View \d+ findings?/ })).toBeNull();
});

it("opens all findings inline with one click on the root agent node when fullscreen is not available", () => {
  const activated = vi.fn();
  render(themedWith({ model: savedModel(), showSummary: false, fullscreenAvailable: false, onActivateNode: activated, onViewAllFindings: vi.fn() }));
  clickCanvasNode(fixture.botName);
  expect(screen.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("group", { name: "Selected map node" })).toHaveTextContent(`Node: ${fixture.botName}`);
  expect(screen.getByRole("button", { name: /Unmapped saved finding/ })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Review tool configuration/ })).toHaveLength(2);
  expect(activated).toHaveBeenCalledTimes(1);
  expect(activated.mock.calls[0][0]).toEqual({ reviewId: fixture.reviewId, nodeId: mapNodeId(savedModel(), fixture.botName) });
});

it.each(["Enter", " "])("opens the node's findings inline with the %j key when fullscreen is not available", (key) => {
  render(themedWith({ model: savedModel(), showSummary: false, fullscreenAvailable: false, onActivateNode: vi.fn(), onViewAllFindings: vi.fn() }));
  fireEvent.keyDown(canvasNode("Display Photo Library"), { key });
  expect(screen.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("group", { name: "Selected map node" })).toHaveTextContent("Node: Display Photo Library");
  expect(screen.getByRole("button", { name: "Clear node filter" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Unmapped saved finding/ })).toBeNull();
});

it("shows a node's only recorded finding in the open other check results after one click in fullscreen", () => {
  const model = withRecordedFact(savedModel(), 1, "Recorded archive fact");
  render(themed(model, undefined, true));
  const badge = findingBadge("Planogram Archive");
  expect(badge?.textContent).toBe("1");
  expect(badge).toHaveAttribute("data-finding-severity", "info");
  expect(badge).toHaveAttribute("title", "1 finding: 1 info");
  expect(badge?.className).toBe(filledBadgeClass("informative"));
  clickCanvasNode("Planogram Archive");
  expect(screen.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("group", { name: "Selected map node" })).toHaveTextContent("Node: Planogram Archive");
  const other = screen.getByRole("list", { name: "Other check results" });
  expect(within(other).getByRole("button", { name: /Recorded archive fact/ })).toBeInTheDocument();
  expect(within(other).getAllByRole("listitem")).toHaveLength(1);
  expect(screen.queryByRole("list", { name: "Review results" })).toBeNull();
});

it("keeps the other check results closed in fullscreen when the clicked node also has findings", async () => {
  const user = userEvent.setup();
  const model = withRecordedFact(savedModel(), 0, "Recorded library fact");
  render(themed(model, undefined, true));
  clickCanvasNode("Display Photo Library");
  expect(within(screen.getByRole("list", { name: "Review results" })).getAllByRole("button", { name: /Review tool configuration/ })).toHaveLength(2);
  expect(screen.queryByRole("list", { name: "Other check results" })).toBeNull();
  await user.click(screen.getByText("Show 1 other check results"));
  expect(within(screen.getByRole("list", { name: "Other check results" })).getByRole("button", { name: /Recorded library fact/ })).toBeInTheDocument();
});

it("opens the other check results when the node filter changes to a node with only recorded findings", () => {
  const model = withRecordedFact(withRecordedFact(savedModel(), 0, "Recorded library fact"), 1, "Recorded archive fact");
  if (model.agentMap?.state !== "ready") throw new Error("The saved map fixture is not ready.");
  const nodes = model.agentMap.graph.nodes;
  const tab = (label?: string) => {
    const node = label ? nodes.find(item => item.label === label) : undefined;
    return (
      <FluentProvider theme={copilotStudioReviewLightTheme}>
        <FindingsTab
          findings={model.findings} checks={model.checks} capabilityChips={[]}
          nodeFilter={node ? { nodeId: node.id, node } : undefined}
        />
      </FluentProvider>
    );
  };
  const mounted = render(tab("Display Photo Library"));
  expect(screen.getByText("Show 1 other check results")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Other check results" })).toBeNull();
  mounted.rerender(tab("Planogram Archive"));
  expect(within(screen.getByRole("list", { name: "Other check results" })).getByRole("button", { name: /Recorded archive fact/ })).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Review results" })).toBeNull();
  mounted.rerender(tab("Display Photo Library"));
  expect(screen.queryByRole("list", { name: "Other check results" })).toBeNull();
  mounted.rerender(tab("Planogram Archive"));
  expect(screen.getByRole("list", { name: "Other check results" })).toBeInTheDocument();
  mounted.rerender(tab());
  expect(screen.getByText(/^Show \d+ other check results$/)).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Other check results" })).toBeNull();
});

describe("relationship details over the inline map", () => {
  // React Flow draws an edge only after it measures both end nodes, and jsdom has no layout.
  const restore: Array<() => void> = [];

  beforeEach(() => {
    const resizeObserver = globalThis.ResizeObserver;
    const hadMatrix = Object.prototype.hasOwnProperty.call(globalThis, "DOMMatrixReadOnly");
    const matrix = (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly;
    // Each map node reports its size when React Flow starts to observe it.
    class MeasuringResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        if (!target.classList.contains("react-flow__node")) return;
        this.callback([{ target } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", MeasuringResizeObserver);
    vi.stubGlobal("DOMMatrixReadOnly", class { readonly m22 = 1; });
    const size = (node: number, pane: number) => function (this: HTMLElement) {
      if (this.classList.contains("react-flow__node")) return node;
      return this.classList.contains("react-flow__renderer") ? pane : 0;
    };
    const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(size(160, 840));
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(size(64, 600));
    restore.push(() => {
      width.mockRestore();
      height.mockRestore();
      vi.stubGlobal("ResizeObserver", resizeObserver);
      if (hadMatrix) vi.stubGlobal("DOMMatrixReadOnly", matrix);
      else delete (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly;
    });
  });

  afterEach(() => {
    cleanup();
    restore.splice(0).reverse().forEach(undo => undo());
  });

  function canvasEdge(source: string, target: string): SVGElement {
    const edge = [...document.querySelectorAll<SVGElement>(".react-flow__edge")]
      .find(element => element.getAttribute("aria-label")?.startsWith(`Relationship from ${source} to ${target}: `));
    if (!edge) throw new Error(`The saved map edge from ${source} to ${target} was not rendered.`);
    return edge;
  }

  it.each([true, false])("shows the relationship details over the inline map after one click on an edge (fullscreen available: %s)", async (fullscreenAvailable) => {
    const model = savedModel();
    if (model.agentMap?.state !== "ready") throw new Error("The saved map fixture is not ready.");
    const source = mapNodeId(model, "display-audit");
    const target = mapNodeId(model, "Display Photo Library");
    const edge = toAgentMapViewGraph(model.agentMap.graph).edges
      .find(item => item.source === source && item.target === target);
    if (!edge?.evidence) throw new Error("The saved map has no evidence edge from display-audit to Display Photo Library.");
    const activated = vi.fn();
    const openFullscreen = vi.fn();
    render(themedWith({
      model, showSummary: false, fullscreenAvailable,
      onActivateNode: activated, onViewAllFindings: vi.fn(), onOpenFullscreen: openFullscreen,
    }));
    // The edge shows after React Flow measures both of its end nodes.
    const line = await waitFor(() => {
      canvasNode("Planogram Archive");
      return canvasEdge("display-audit", "Display Photo Library");
    });

    fireEvent.click(line, { detail: 1 });
    const details = screen.getByRole("group", { name: "Map selection details" });
    expect(within(details).getByText("display-audit → Display Photo Library")).toHaveAttribute("title", "display-audit → Display Photo Library");
    expect(within(details).getByText(edge.relationship)).toBeInTheDocument();
    expect(within(details).getByText(AGENT_MAP_PROVENANCE_LABELS[edge.provenance])).toBeInTheDocument();
    expect(within(details).getByText(edge.evidence)).toBeInTheDocument();
    expect(line).toHaveClass("selected");
    const openFull = within(details).queryByRole("button", { name: "Open full screen" });
    if (fullscreenAvailable) {
      expect(openFull).not.toBeNull();
      fireEvent.click(openFull!);
      expect(openFullscreen).toHaveBeenCalledTimes(1);
    } else {
      expect(openFull).toBeNull();
    }
    expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Review findings" })).toBeNull();

    fireEvent.click(within(details).getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("group", { name: "Map selection details" })).toBeNull();
    expect(line).toHaveFocus();

    // Enter on the focused edge opens the details again and moves focus into them.
    fireEvent.keyDown(line, { key: "Enter" });
    expect(screen.getByRole("group", { name: "Map selection details" })).toHaveFocus();

    fireEvent.click(canvasNode("Planogram Archive"), { detail: 1 });
    expect(screen.queryByRole("group", { name: "Map selection details" })).toBeNull();
    expect(canvasNode("Planogram Archive")).toHaveClass("selected");
    expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Review findings" })).toBeNull();
    expect(activated).not.toHaveBeenCalled();
    expect(openFullscreen).toHaveBeenCalledTimes(fullscreenAvailable ? 1 : 0);
  });
});
