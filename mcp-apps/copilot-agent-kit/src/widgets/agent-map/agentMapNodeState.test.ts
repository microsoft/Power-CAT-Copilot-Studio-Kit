import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileAgentMapFlowNodes,
  updateMovedNodePosition,
} from "./agentMapNodeState";

interface TestNode {
  id: string;
  position: { x: number; y: number };
  data: { dimmed: boolean };
}

test("keeps a dragged position while taking fresh data from the rebuilt graph", () => {
  const base: TestNode[] = [{ id: "tool:a", position: { x: 0, y: 0 }, data: { dimmed: true } }];
  const current: TestNode[] = [{ id: "tool:a", position: { x: 120, y: 40 }, data: { dimmed: false } }];

  const reconciled = reconcileAgentMapFlowNodes(base, current, new Map());

  assert.deepEqual(reconciled[0].position, { x: 120, y: 40 });
  assert.deepEqual(reconciled[0].data, { dimmed: true });
});

test("restores a cached position when the canvas remounts", () => {
  const base: TestNode[] = [{ id: "tool:a", position: { x: 0, y: 0 }, data: { dimmed: false } }];

  const reconciled = reconcileAgentMapFlowNodes(base, [], new Map([["tool:a", { x: 9, y: 9 }]]));

  assert.deepEqual(reconciled[0].position, { x: 9, y: 9 });
});

test("returns the layout position untouched for an unmoved node", () => {
  const base: TestNode[] = [{ id: "tool:a", position: { x: 3, y: 4 }, data: { dimmed: false } }];

  assert.equal(reconcileAgentMapFlowNodes(base, [], new Map())[0], base[0]);
});

test("records one drag without mutating the previous snapshot", () => {
  const before = new Map([["tool:a", { x: 1, y: 1 }]]);

  const after = updateMovedNodePosition(before, "tool:b", { x: 5, y: 6 });

  assert.deepEqual([...after.entries()], [["tool:a", { x: 1, y: 1 }], ["tool:b", { x: 5, y: 6 }]]);
  assert.equal(before.has("tool:b"), false);
});
