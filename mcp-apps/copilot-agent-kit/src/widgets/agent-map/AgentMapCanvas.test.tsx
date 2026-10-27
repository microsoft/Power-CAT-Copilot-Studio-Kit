import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getViewportForBounds } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentMapCanvas } from "./AgentMapCanvas";
import {
  AGENT_MAP_INLINE_MIN_ZOOM,
  AGENT_MAP_MIN_ZOOM,
  agentMapInlineFitPadding,
} from "./agentMapInlineFit";
import type {
  AgentMapNodeCategory,
  AgentMapViewEdge,
  AgentMapViewNode,
  FilteredAgentMapGraph,
} from "./agentMapViewModel";
import { createRadialAgentMapLayout } from "./radialAgentMapLayout";

interface Size {
  width: number;
  height: number;
}

/** The size of the React Flow pane. A test changes it as a host resizes the frame. */
let pane: Size = { width: 0, height: 0 };

function sizeOf(element: Element): Size {
  const html = element as HTMLElement;
  // A node is as large as its style: React Flow nodes use border-box sizing.
  if (html.classList.contains("react-flow__node")) {
    return { width: parseFloat(html.style.width) || 0, height: parseFloat(html.style.height) || 0 };
  }
  if (html.classList.contains("react-flow__renderer") || html.querySelector(".react-flow__renderer")) return pane;
  return { width: 0, height: 0 };
}

/**
 * Reports a size only in a rendering update of the test, as a browser does:
 * the first size of each target and each change, observer by observer in creation order.
 */
class ManualResizeObserver {
  static created: ManualResizeObserver[] = [];
  private readonly targets = new Set<Element>();
  private readonly reported = new Map<Element, string>();

  constructor(private readonly callback: ResizeObserverCallback) {
    ManualResizeObserver.created.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
    this.reported.delete(target);
  }

  disconnect() {
    this.targets.clear();
    this.reported.clear();
  }

  deliver() {
    const entries: ResizeObserverEntry[] = [];
    for (const target of this.targets) {
      const size = sizeOf(target);
      const key = `${size.width}x${size.height}`;
      if (this.reported.get(target) === key) continue;
      this.reported.set(target, key);
      entries.push({ target, contentRect: { ...size, x: 0, y: 0 } } as unknown as ResizeObserverEntry);
    }
    if (entries.length > 0) this.callback(entries, this as unknown as ResizeObserver);
  }
}

function renderingUpdate() {
  act(() => {
    for (const observer of [...ManualResizeObserver.created]) observer.deliver();
  });
}

function node(id: string, category: AgentMapNodeCategory, depth = 1): AgentMapViewNode {
  return {
    id, category, depth, label: id, subtitle: id,
    details: {}, warnings: [], resolution: "resolved", searchText: id,
  };
}

function edge(target: string): AgentMapViewEdge {
  return {
    id: `agent-${target}`, source: "agent", target, relationship: "uses",
    provenance: "structural", evidence: "Configured.", confidence: 1,
    resolution: "resolved", directed: true, searchText: target,
  };
}

/** ZAVA Visual Merchandiser: 2 tools, 4 skills, 1 knowledge source and 1 connected agent. */
function zava(): FilteredAgentMapGraph {
  const nodes = [
    node("agent", "agent", 0),
    node("planogram", "tool"), node("photos", "tool"),
    node("planner", "skill"), node("audit", "skill"),
    node("refresh", "skill"), node("handover", "skill"),
    node("standards", "knowledge"),
    node("storeops", "connected-agent"),
  ];
  const edges = nodes.slice(1).map((item) => edge(item.id));
  return {
    nodes,
    edges,
    matchedNodeIds: new Set(nodes.map((item) => item.id)),
    matchedEdgeIds: new Set(edges.map((item) => item.id)),
  };
}

function layoutBounds(graph: FilteredAgentMapGraph) {
  const placed = createRadialAgentMapLayout(graph.nodes).nodes;
  const left = Math.min(...placed.map((item) => item.x));
  const top = Math.min(...placed.map((item) => item.y));
  const right = Math.max(...placed.map((item) => item.x + item.width));
  const bottom = Math.max(...placed.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function shownViewport() {
  const transform = document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform ?? "";
  const match = /translate\(([^,]+)px,\s*([^)]+)px\)\s*scale\(([^)]+)\)/.exec(transform);
  if (!match) throw new Error(`The map viewport has no transform: "${transform}".`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

function expectViewport(actual: ReturnType<typeof shownViewport>, expected: ReturnType<typeof shownViewport>) {
  expect(actual.zoom).toBeCloseTo(expected.zoom, 4);
  expect(actual.x).toBeCloseTo(expected.x, 2);
  expect(actual.y).toBeCloseTo(expected.y, 2);
}

function renderCanvas(graph: FilteredAgentMapGraph, inline: boolean) {
  const noop = () => undefined;
  return render(
    <FluentProvider theme={webLightTheme}>
      <AgentMapCanvas
        graph={graph}
        inline={inline}
        expanded={!inline}
        legend={inline ? "toggle" : "panel"}
        movedPositions={new Map()}
        onNodePositionChange={noop}
        onSelectNode={noop}
        onSelectEdge={noop}
        onClearSelection={noop}
      />
    </FluentProvider>,
  );
}

describe("AgentMapCanvas fit", () => {
  const restore: Array<() => void> = [];

  beforeEach(() => {
    ManualResizeObserver.created = [];
    pane = { width: 0, height: 0 };
    const resizeObserver = globalThis.ResizeObserver;
    const hadMatrix = Object.prototype.hasOwnProperty.call(globalThis, "DOMMatrixReadOnly");
    const matrix = (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly;
    vi.stubGlobal("ResizeObserver", ManualResizeObserver);
    vi.stubGlobal("DOMMatrixReadOnly", class { readonly m22 = 1; });
    const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockImplementation(function (this: HTMLElement) { return sizeOf(this).width; });
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function (this: HTMLElement) { return sizeOf(this).height; });
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
    restore.splice(0).reverse().forEach((undo) => undo());
  });

  it("fits the inline map to the pane that the host gives after the mount", () => {
    const graph = zava();
    // The inline view mounts while the frame still has its full-screen size.
    pane = { width: 1280, height: 900 };
    renderCanvas(graph, true);
    // The host makes the frame inline before the first rendering update of the view.
    pane = { width: 760, height: 460 };
    renderingUpdate();

    expectViewport(shownViewport(), getViewportForBounds(
      layoutBounds(graph), 760, 460, AGENT_MAP_INLINE_MIN_ZOOM, 2, agentMapInlineFitPadding(0),
    ));
  });

  it("refits the full-screen map when the pane resizes", () => {
    const graph = zava();
    pane = { width: 1280, height: 900 };
    renderCanvas(graph, false);
    renderingUpdate();
    pane = { width: 1000, height: 520 };
    renderingUpdate();

    expectViewport(shownViewport(), getViewportForBounds(
      layoutBounds(graph), 1000, 520, AGENT_MAP_MIN_ZOOM, 2, 0.18,
    ));
  });

  it("waits for a pane size before it fits the map", () => {
    const graph = zava();
    renderCanvas(graph, true);
    renderingUpdate();
    expect(shownViewport()).toEqual({ x: 0, y: 0, zoom: 1 });

    pane = { width: 760, height: 460 };
    renderingUpdate();

    expectViewport(shownViewport(), getViewportForBounds(
      layoutBounds(graph), 760, 460, AGENT_MAP_INLINE_MIN_ZOOM, 2, agentMapInlineFitPadding(0),
    ));
  });

  it("keeps the maker's zoom when the pane resizes", () => {
    pane = { width: 760, height: 460 };
    renderCanvas(zava(), true);
    renderingUpdate();
    const fitted = shownViewport();

    fireEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    const zoomed = shownViewport();
    expect(zoomed.zoom).toBeGreaterThan(fitted.zoom);

    pane = { width: 1000, height: 600 };
    renderingUpdate();
    expect(shownViewport()).toEqual(zoomed);
  });
});
