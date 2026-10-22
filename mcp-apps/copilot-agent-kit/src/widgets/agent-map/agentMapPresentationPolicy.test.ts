import assert from "node:assert/strict";
import test from "node:test";
import {
  agentMapFullscreenControlsLayout,
  agentMapFullscreenLayout,
  agentMapSurface,
  shouldShowAgentMapLoadingPlaceholder,
} from "./agentMapPresentationPolicy";

test("shows only the React Flow canvas and an expand affordance inline after loading a graph", () => {
  // Inline keeps the legend content behind a toggle in the map controls, so it covers no node.
  assert.deepEqual(agentMapSurface({ fullscreen: false, hasGraph: true, view: "list" }), {
    selectors: false,
    toolbar: false,
    status: false,
    legend: "toggle",
    view: "map",
    inspector: false,
    expandControl: true,
    exitControl: false,
  });
});

test("exposes the complete Code App experience with host-owned fullscreen close", () => {
  assert.deepEqual(agentMapSurface({ fullscreen: true, hasGraph: true, view: "map" }), {
    selectors: true,
    toolbar: true,
    status: true,
    legend: "panel",
    view: "map",
    inspector: true,
    expandControl: false,
    exitControl: false,
  });
});

test("keeps the fullscreen list view when the maker switches tabs", () => {
  assert.equal(agentMapSurface({ fullscreen: true, hasGraph: true, view: "list" }).view, "list");
});

test("shows environment and agent selectors inline before a deterministic graph exists", () => {
  const surface = agentMapSurface({ fullscreen: false, hasGraph: false, view: "map" });

  assert.equal(surface.view, "none");
  assert.equal(surface.selectors, true);
  assert.equal(surface.toolbar, false);
});

test("covers the host height without drawing an outer card", () => {
  assert.deepEqual(agentMapFullscreenLayout(), {
    root: {
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      padding: "20px",
      boxSizing: "border-box",
      backgroundColor: "transparent",
      border: "none",
      borderRadius: 0,
      boxShadow: "none",
    },
    content: { flexGrow: 1, minHeight: 0, overflow: "hidden" },
  });
});

test("keeps fullscreen selectors at normal control widths", () => {
  assert.deepEqual(agentMapFullscreenControlsLayout(), {
    columns: "280px 320px",
    narrowColumns: "repeat(2, minmax(0, 1fr))",
  });
});

test("keeps the current map mounted while another agent is loading", () => {
  assert.equal(
    shouldShowAgentMapLoadingPlaceholder({ loading: true, hasGraph: true }),
    false,
  );
  assert.equal(
    shouldShowAgentMapLoadingPlaceholder({ loading: true, hasGraph: false }),
    true,
  );
});
