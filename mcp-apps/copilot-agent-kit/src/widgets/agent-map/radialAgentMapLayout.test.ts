import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMapViewNode, AgentMapNodeCategory } from "./agentMapViewModel";
import { createRadialAgentMapLayout } from "./radialAgentMapLayout";

function node(
  id: string,
  category: AgentMapNodeCategory,
  depth = 1,
): AgentMapViewNode {
  return {
    id,
    category,
    depth,
    label: id,
    subtitle: id,
    details: {},
    warnings: [],
    resolution: "resolved",
    searchText: id,
  };
}

/** ZAVA Visual Merchandiser: 2 tools, 4 skills, 1 knowledge, 1 connected agent. */
function zava(): AgentMapViewNode[] {
  return [
    node("agent", "agent", 0),
    node("planogram", "tool"), node("photos", "tool"),
    node("planner", "skill"), node("audit", "skill"),
    node("refresh", "skill"), node("handover", "skill"),
    node("standards", "knowledge"),
    node("storeops", "connected-agent"),
  ];
}

function polar(
  layout: ReturnType<typeof createRadialAgentMapLayout>,
  id: string,
) {
  const placed = layout.nodes.find((candidate) => candidate.id === id)!;
  const cx = placed.x + placed.width / 2;
  const cy = placed.y + placed.height / 2;
  return { radius: Math.hypot(cx, cy), angle: Math.atan2(cy, cx) };
}

test("uses the Code App concentric-radial algorithm and card geometry", () => {
  const layout = createRadialAgentMapLayout(zava());

  assert.equal(layout.algorithm, "concentric-radial");
  const agent = layout.nodes.find((placed) => placed.id === "agent")!;
  assert.deepEqual(
    { width: agent.width, height: agent.height, x: agent.x, y: agent.y },
    { width: 260, height: 84, x: -130, y: -42 },
  );
  const component = layout.nodes.find((placed) => placed.id === "planogram")!;
  assert.deepEqual({ width: component.width, height: component.height }, { width: 240, height: 76 });
});

test("puts every direct component on one ring", () => {
  const layout = createRadialAgentMapLayout(zava());
  const radii = layout.nodes
    .filter((placed) => placed.id !== "agent")
    .map((placed) => Math.hypot(placed.x + placed.width / 2, placed.y + placed.height / 2));

  assert.ok(Math.max(...radii) - Math.min(...radii) < 1);
});

test("uses the full circle rather than one quadrant", () => {
  const layout = createRadialAgentMapLayout(zava());
  const angles = layout.nodes
    .filter((placed) => placed.id !== "agent")
    .map((placed) => polar(layout, placed.id).angle)
    .map((angle) => (angle + Math.PI * 2) % (Math.PI * 2))
    .sort((left, right) => left - right);
  const largestGap = angles.reduce((worst, angle, index) => {
    const next = index === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[index + 1];
    return Math.max(worst, next - angle);
  }, 0);

  assert.ok(largestGap < Math.PI / 2);
});

test("leaves visible space between neighbours, not merely zero overlap", () => {
  const layout = createRadialAgentMapLayout(zava());
  const placed = layout.nodes.filter((candidate) => candidate.id !== "agent");
  const gaps: number[] = [];
  for (let left = 0; left < placed.length; left += 1) {
    for (let right = left + 1; right < placed.length; right += 1) {
      const a = placed[left];
      const b = placed[right];
      const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
      const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
      gaps.push(Math.hypot(dx, dy));
    }
  }

  assert.ok(Math.min(...gaps) > 16);
});

test("grows the ring instead of overlapping when there are many components", () => {
  const many = [
    node("agent", "agent", 0),
    ...Array.from({ length: 40 }, (_, index) => node(`t${index}`, "tool")),
  ];
  const layout = createRadialAgentMapLayout(many);
  const radii = layout.nodes
    .filter((placed) => placed.id !== "agent")
    .map((placed) => Math.hypot(placed.x + placed.width / 2, placed.y + placed.height / 2));

  assert.ok(Math.min(...radii) > 320);
});

test("keeps evaluation sets and test cases in one contiguous sector", () => {
  // The MCP contract keeps both evaluation categories; the Code App layout
  // folds them into one sector so the map does not read as two unrelated arcs.
  const layout = createRadialAgentMapLayout([
    node("agent", "agent", 0),
    node("tool-a", "tool"), node("tool-b", "tool"),
    node("set-a", "evaluation-set"), node("set-b", "evaluation-set"),
    node("case-a", "test-case"), node("case-b", "test-case"),
  ]);
  // Ordered clockwise from 12 o'clock, which is where the first sector starts.
  const clockwise = layout.nodes
    .filter((placed) => placed.id !== "agent")
    .map((placed) => ({
      id: placed.id,
      angle: (polar(layout, placed.id).angle + Math.PI * 2.5) % (Math.PI * 2),
    }))
    .sort((left, right) => left.angle - right.angle)
    .map((entry) => entry.id);

  assert.deepEqual(clockwise, ["tool-a", "tool-b", "set-a", "set-b", "case-a", "case-b"]);
});

test("does not throw when there is no agent node", () => {
  assert.doesNotThrow(() => createRadialAgentMapLayout([node("t1", "tool")]));
});

test("keeps the ring clear of the centred agent", () => {
  const layout = createRadialAgentMapLayout(zava());
  const agent = layout.nodes.find((placed) => placed.id === "agent")!;
  const reach = Math.hypot(agent.width, agent.height) / 2;

  layout.nodes
    .filter((placed) => placed.id !== "agent")
    .forEach((placed) => assert.ok(polar(layout, placed.id).radius > reach));
});
