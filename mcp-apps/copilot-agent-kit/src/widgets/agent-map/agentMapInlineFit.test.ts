import assert from "node:assert/strict";
import test from "node:test";
import { getViewportForBounds } from "@xyflow/react";
import {
  AGENT_MAP_CONTROL_BUTTON_PX,
  AGENT_MAP_INLINE_CONTROLS_MARGIN_PX,
  AGENT_MAP_INLINE_CONTROLS_RESERVE_PX,
  AGENT_MAP_INLINE_EXPAND_BUTTON_PX,
  AGENT_MAP_INLINE_EXPAND_EDGE_PX,
  AGENT_MAP_INLINE_GAP_PX,
  AGENT_MAP_INLINE_MIN_ZOOM,
  agentMapInlineFitPadding,
} from "./agentMapInlineFit";

// Inline canvas sizes from a 400 px host with a short budget up to a wide host.
const canvases = [
  { width: 352, height: 220 },
  { width: 380, height: 260 },
  { width: 400, height: 300 },
  { width: 740, height: 400 },
  { width: 1000, height: 500 },
];
// Wide, tall, small (the zoom limit applies) and square node bounds.
const graphs = [
  { x: 0, y: 0, width: 1200, height: 300 },
  { x: -200, y: -50, width: 300, height: 900 },
  { x: 40, y: 40, width: 160, height: 60 },
  { x: 0, y: 0, width: 600, height: 600 },
];

test("keeps every fitted node clear of the inline controls column, the canvas edges and a bottom overlay", () => {
  for (const canvas of canvases) {
    for (const bounds of graphs) {
      for (const inset of [0, 28]) {
        const viewport = getViewportForBounds(
          bounds, canvas.width, canvas.height, AGENT_MAP_INLINE_MIN_ZOOM, 2, agentMapInlineFitPadding(inset),
        );
        const left = bounds.x * viewport.zoom + viewport.x;
        const top = bounds.y * viewport.zoom + viewport.y;
        const right = left + bounds.width * viewport.zoom;
        const bottom = top + bounds.height * viewport.zoom;
        const label = JSON.stringify({ canvas, bounds, inset, viewport });
        // xyflow floors the applied paddings, so float noise can move one side by up to 1px.
        const slack = 1 + 1e-6;
        assert.ok(left >= AGENT_MAP_INLINE_GAP_PX - slack, label);
        assert.ok(top >= AGENT_MAP_INLINE_GAP_PX - slack, label);
        assert.ok(right <= canvas.width - AGENT_MAP_INLINE_CONTROLS_RESERVE_PX + slack, label);
        assert.ok(bottom <= canvas.height - AGENT_MAP_INLINE_GAP_PX - inset + slack, label);
        // A node never reaches the controls column.
        assert.ok(right < canvas.width - AGENT_MAP_INLINE_CONTROLS_MARGIN_PX - AGENT_MAP_CONTROL_BUTTON_PX, label);
      }
    }
  }
});

test("reserves the controls and expand button column with a gap and pads a bottom overlay", () => {
  const controls = AGENT_MAP_INLINE_CONTROLS_MARGIN_PX + AGENT_MAP_CONTROL_BUTTON_PX;
  const expand = AGENT_MAP_INLINE_EXPAND_EDGE_PX + AGENT_MAP_INLINE_EXPAND_BUTTON_PX;
  assert.ok(AGENT_MAP_INLINE_CONTROLS_RESERVE_PX >= Math.max(controls, expand) + AGENT_MAP_INLINE_GAP_PX);
  assert.deepEqual(agentMapInlineFitPadding(), { top: "12px", right: "48px", bottom: "12px", left: "12px" });
  assert.equal(agentMapInlineFitPadding(27.2).bottom, "40px");
  assert.equal(agentMapInlineFitPadding(Number.NaN).bottom, "12px");
  assert.equal(agentMapInlineFitPadding(-5).bottom, "12px");
});
