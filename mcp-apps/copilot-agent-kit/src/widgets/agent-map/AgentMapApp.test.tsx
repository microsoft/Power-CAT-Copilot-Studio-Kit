import "@testing-library/jest-dom/vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentMapGraph, AgentMapNode } from "../../agent-map/types";
import { McpAppProvider } from "../shared/McpAppProvider";
import type { McpBootstrapSnapshot } from "../shared/bootstrap-contract";
import { AgentMapApp } from "./AgentMapApp";

afterEach(() => {
  cleanup();
  delete window.__agentReviewMcpBootstrap;
  sessionStorage.clear();
  document.getElementById("root")?.remove();
  vi.restoreAllMocks();
});

const environment = { id: "env-1", name: "Contoso Dev", region: "unitedstates" };
const node = (
  id: string,
  category: AgentMapNode["category"],
  label: string,
  subtitle: string,
  extra: Partial<AgentMapNode> = {},
): AgentMapNode => ({ id, category, label, subtitle, details: {}, warnings: [], ...extra });
const edge = (id: string, source: string, target: string, relationship: string) => ({
  id, source, target, relationship, provenance: "structural" as const, evidence: "Configured.", confidence: 1,
});
const graph: AgentMapGraph = {
  agent: { id: "agent-1", name: "Contoso Helper", environmentId: "env-1", environmentName: "Contoso Dev" },
  nodes: [
    node("agent-1", "agent", "Contoso Helper", "Standard Copilot Studio agent", { depth: 0 }),
    node("tool-1", "tool", "Weather tool", "Tool", { parentId: "agent-1", depth: 1 }),
    node("topic-1", "topic", "Greeting topic", "Topic", { parentId: "agent-1", depth: 1 }),
    node("eval-1", "evaluation-set", "Release checks", "Evaluation set", { parentId: "agent-1", depth: 1 }),
    node("case-1", "test-case", "Greets politely", "Test case", { parentId: "eval-1", depth: 2 }),
  ],
  edges: [
    edge("e1", "agent-1", "tool-1", "uses"),
    edge("e2", "agent-1", "topic-1", "contains"),
    edge("e3", "agent-1", "eval-1", "evaluated by"),
    edge("e4", "eval-1", "case-1", "contains"),
  ],
  diagnostics: [],
  summary: {
    nodeCount: 5, componentCount: 4, edgeCount: 4, unresolvedCount: 0,
    skillReferenceCount: 0, linkedSkillCount: 0, unlinkedSkillCount: 0,
  },
};
const mapData = {
  state: "map",
  selectionId: "selection-1",
  environments: [environment],
  environment,
  environmentId: "env-1",
  agents: [{ id: "agent-1", name: "Contoso Helper", componentIdUnique: "unique-1", harness: "standard" }],
  agentId: "agent-1",
  componentIdUnique: "unique-1",
  graph,
};
const selectingData = {
  state: "mapSelecting",
  selectionId: "selection-1",
  environments: [environment],
};

function frame(padding: number) {
  const root = document.createElement("div");
  root.id = "root";
  root.style.padding = `${padding}px`;
  document.body.appendChild(root);
}

const appRoot = () =>
  document.querySelector("[data-mcp-portal-root]")?.nextElementSibling as HTMLElement;

function mount(data: unknown, hostPatch: Partial<McpUiHostContext> = {}) {
  const app = new App({ name: "Agent Map UI test", version: "1.0.0" });
  const listeners = new Set<() => void>();
  let snapshot: McpBootstrapSnapshot = {
    app,
    data,
    host: {
      theme: "light",
      displayMode: "inline",
      availableDisplayModes: ["inline", "fullscreen"],
      containerDimensions: { width: 760, maxHeight: 500 },
      ...hostPatch,
    },
  };
  window.__agentReviewMcpBootstrap = {
    getSnapshot: () => snapshot,
    replaceData: (next: unknown) => {
      snapshot = { ...snapshot, data: next };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  const call = vi.spyOn(app, "callServerTool").mockResolvedValue({ content: [], structuredContent: {} });
  render(
    <FluentProvider theme={webLightTheme}>
      <McpAppProvider><AgentMapApp /></McpAppProvider>
    </FluentProvider>,
  );
  return { app, call };
}

function mockRootRect(width: number, height: number) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const [w, h] = this === appRoot() ? [width, height] : [0, 0];
    return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h, toJSON: () => ({}) } as DOMRect;
  });
}

const canvasNode = (name: string) =>
  [...document.querySelectorAll(".react-flow__node")]
    .find((element) => element.getAttribute("aria-label")?.includes(`: ${name}.`));
const notAvailable = "Fullscreen is not available in this host.";

it("hides evaluation sets and test cases by default and fits the inline map to the budget", () => {
  frame(24);
  mount(mapData);
  expect(appRoot().style.height).toBe("452px");
  expect(canvasNode("Contoso Helper")).toBeDefined();
  expect(canvasNode("Weather tool")).toBeDefined();
  expect(canvasNode("Release checks")).toBeUndefined();
  expect(canvasNode("Greets politely")).toBeUndefined();
  expect(screen.queryByRole("button", { name: /Filters/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Expand to full screen" })).toBeInTheDocument();
});

it("never reports an inline size above the host budget", () => {
  frame(24);
  const sizes = vi.spyOn(App.prototype, "sendSizeChanged").mockResolvedValue(undefined);
  mockRootRect(760, 2000);
  mount(mapData);
  expect(sizes).toHaveBeenCalled();
  for (const [size] of sizes.mock.calls) expect(size.height).toBeLessThanOrEqual(500);
  expect(sizes).toHaveBeenLastCalledWith({ width: 760, height: 500 });
});

it("reports a short inline map with its frame inset", () => {
  frame(24);
  const sizes = vi.spyOn(App.prototype, "sendSizeChanged").mockResolvedValue(undefined);
  mockRootRect(760, 300);
  mount(mapData);
  expect(sizes).toHaveBeenLastCalledWith({ width: 760, height: 348 });
});

it("caps the inline selection view at the budget", () => {
  frame(24);
  const sizes = vi.spyOn(App.prototype, "sendSizeChanged").mockResolvedValue(undefined);
  mockRootRect(760, 2000);
  mount(selectingData);
  expect(appRoot().style.maxHeight).toBe("452px");
  expect(appRoot().style.getPropertyValue("--agent-map-inline-height")).toBe("452px");
  expect(screen.getByText("Your agent map will appear here")).toBeInTheDocument();
  for (const [size] of sizes.mock.calls) expect(size.height).toBeLessThanOrEqual(500);
});

it("uses the default budget when the host reports no height", () => {
  frame(24);
  mount(mapData, { containerDimensions: { width: 760 } });
  expect(appRoot().style.height).toBe("552px");
});

it("shows a neutral caption when expanding is refused", async () => {
  const user = userEvent.setup();
  frame(24);
  const { app } = mount(mapData);
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "inline" });
  await user.click(screen.getByRole("button", { name: "Expand to full screen" }));
  expect(display).toHaveBeenCalledWith({ mode: "fullscreen" });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(notAvailable));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Expand to full screen" })).toBeInTheDocument();
  expect(sessionStorage.getItem("agent-review:agent-map:presentation")).toBe("inline");
});

it("shows a neutral caption when expanding throws or is not offered", async () => {
  const user = userEvent.setup();
  frame(24);
  const { app } = mount(mapData);
  vi.spyOn(app, "requestDisplayMode").mockRejectedValue(new Error("not supported"));
  await user.click(screen.getByRole("button", { name: "Expand to full screen" }));
  await waitFor(() => expect(screen.getByText(notAvailable)).toBeInTheDocument());
  expect(screen.queryByRole("alert")).toBeNull();
  cleanup();
  mount(mapData, { availableDisplayModes: ["inline"] });
  expect(screen.getByText(notAvailable)).toBeInTheDocument();
});

it("keeps the inline legend behind a map control and the full legend panel in full screen", async () => {
  const user = userEvent.setup();
  frame(24);
  mount(mapData);
  expect(screen.queryByRole("group", { name: "Relationship evidence legend" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Relationship evidence legend" }));
  const legend = await screen.findByRole("group", { name: "Relationship evidence legend" });
  expect(legend).toHaveTextContent("Relationship evidence");
  expect(legend).toHaveTextContent("Configured on the agent");
  cleanup();
  mount(mapData, { displayMode: "fullscreen", containerDimensions: { width: 1200, height: 900 } });
  expect(screen.getByRole("group", { name: "Relationship evidence legend" })).toHaveTextContent("Configured on the agent");
  expect(screen.queryByRole("button", { name: "Relationship evidence legend" })).toBeNull();
});

it("reveals a hidden evaluation set when a reference targets it", async () => {
  const user = userEvent.setup();
  mount(mapData, { displayMode: "fullscreen", containerDimensions: { width: 1200, height: 900 } });
  expect(canvasNode("Release checks")).toBeUndefined();
  fireEvent.click(canvasNode("Contoso Helper")!);
  await user.click(await screen.findByRole("button", { name: "Contoso Helper evaluated by Release checks" }));
  await waitFor(() => expect(canvasNode("Release checks")).toBeDefined());
  expect(canvasNode("Greets politely")).toBeUndefined();
});

it("keeps the full screen map with its filters and reveals hidden categories on request", async () => {
  const user = userEvent.setup();
  const sizes = vi.spyOn(App.prototype, "sendSizeChanged").mockResolvedValue(undefined);
  mount(mapData, { displayMode: "fullscreen", containerDimensions: { width: 1200, height: 900 } });
  expect(appRoot().style.height).toBe("900px");
  expect(sizes).not.toHaveBeenCalled();
  expect(screen.getByText(/Showing 3 of 5 components and 2 of 4 relationships\./)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Filters/ }));
  await user.click(await screen.findByRole("switch", { name: "Evaluation sets" }));
  await waitFor(() =>
    expect(screen.getByText(/Showing 4 of 5 components and 3 of 4 relationships\./)).toBeInTheDocument());
});
