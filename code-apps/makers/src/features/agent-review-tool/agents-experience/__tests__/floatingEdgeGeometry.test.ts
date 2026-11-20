/**
 * Floating-edge geometry for the radial agent map.
 *
 * Fixed handles (target on the left, source on the right) are correct for a
 * left-to-right graph and wrong for a radial one: a node left of the agent had
 * its line routed around the back of the card to reach a left-side handle. These
 * pin the direct-route behaviour that replaces it.
 */
import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';

import {
  borderIntersection,
  floatingEdgePoints,
  type NodeBox,
} from '../components/agent-map/floatingEdgeGeometry';

/** A 100x50 node centred on (cx, cy). */
const at = (cx: number, cy: number): NodeBox => ({
  x: cx - 50,
  y: cy - 25,
  width: 100,
  height: 50,
});

describe('borderIntersection', () => {
  it('leaves the right border for a node to the right', () => {
    const point = borderIntersection(at(0, 0), at(400, 0));
    expect(point.x).toBe(50);
    expect(point.y).toBe(0);
    expect(point.position).toBe(Position.Right);
  });

  it('leaves the left border for a node to the left', () => {
    // The case the fixed handles got wrong: this must exit left, not wrap.
    const point = borderIntersection(at(0, 0), at(-400, 0));
    expect(point.x).toBe(-50);
    expect(point.position).toBe(Position.Left);
  });

  it('leaves the top border for a node directly above', () => {
    const point = borderIntersection(at(0, 0), at(0, -400));
    expect(point.y).toBe(-25);
    expect(point.position).toBe(Position.Top);
  });

  it('leaves the bottom border for a node directly below', () => {
    const point = borderIntersection(at(0, 0), at(0, 400));
    expect(point.y).toBe(25);
    expect(point.position).toBe(Position.Bottom);
  });

  it('always lands exactly on the border, at any angle', () => {
    // The property that matters: the point must sit on the rectangle, never
    // inside it (line starts under the card) or outside (line floats free).
    const from = at(0, 0);
    for (let deg = 0; deg < 360; deg += 7) {
      const rad = (deg * Math.PI) / 180;
      const to = at(Math.cos(rad) * 500, Math.sin(rad) * 500);
      const { x, y } = borderIntersection(from, to);
      const onVertical = Math.abs(Math.abs(x) - 50) < 1e-9 && Math.abs(y) <= 25 + 1e-9;
      const onHorizontal = Math.abs(Math.abs(y) - 25) < 1e-9 && Math.abs(x) <= 50 + 1e-9;
      expect(onVertical || onHorizontal, `angle ${deg}`).toBe(true);
    }
  });

  it('points toward the other node on a diagonal', () => {
    const point = borderIntersection(at(0, 0), at(400, 400));
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeGreaterThan(0);
  });

  it('does not collapse when two nodes share a centre', () => {
    const point = borderIntersection(at(0, 0), at(0, 0));
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
  });
});

describe('floatingEdgePoints', () => {
  it('gives each end a point facing the other', () => {
    const { source, target } = floatingEdgePoints(at(0, 0), at(400, 0));
    expect(source.position).toBe(Position.Right);
    expect(target.position).toBe(Position.Left);
  });

  it('mirrors correctly when the target is to the left', () => {
    const { source, target } = floatingEdgePoints(at(0, 0), at(-400, 0));
    expect(source.position).toBe(Position.Left);
    expect(target.position).toBe(Position.Right);
  });
});
