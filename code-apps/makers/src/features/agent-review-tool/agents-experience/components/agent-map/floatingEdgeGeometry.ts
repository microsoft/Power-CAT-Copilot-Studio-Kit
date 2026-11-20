/**
 * Geometry for floating agent-map edges.
 *
 * React Flow attaches an edge to a fixed handle, which suits a left-to-right
 * graph. The agent map is radial: capabilities surround the agent, so for any
 * node left of centre a line bound to a left-side target handle has to travel
 * around the back of the card to reach it. That is the "connects from behind"
 * artefact.
 *
 * A floating edge instead meets each node at the point on its border facing the
 * other node, so a line always takes the direct route regardless of angle.
 */
import { Position } from '@xyflow/react';

/** Minimal rectangle description; matches what a React Flow node exposes. */
export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloatingPoint {
  x: number;
  y: number;
  position: Position;
}

/** Centre of a node box. */
function centreOf(box: NodeBox): { cx: number; cy: number } {
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/**
 * The point where the line from `from`'s centre to `to`'s centre crosses
 * `from`'s border.
 *
 * Solved by scaling the centre-to-centre vector until it touches the nearer of
 * the vertical and horizontal edges, which is exact for a rectangle and needs no
 * iteration.
 *
 * @param from - The node whose border is being intersected.
 * @param to - The node being pointed at.
 */
export function borderIntersection(from: NodeBox, to: NodeBox): FloatingPoint {
  const { cx, cy } = centreOf(from);
  const { cx: tx, cy: ty } = centreOf(to);

  const dx = tx - cx;
  const dy = ty - cy;

  // Concentric nodes have no meaningful direction; anchor at the top so the
  // edge is still drawn rather than collapsing to a zero-length path.
  if (dx === 0 && dy === 0) {
    return { x: cx, y: from.y, position: Position.Top };
  }

  const halfW = from.width / 2;
  const halfH = from.height / 2;

  // How far along the vector each border plane sits; the smaller one is hit first.
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  const x = cx + dx * scale;
  const y = cy + dy * scale;

  // The reported side drives React Flow's arrow orientation and curvature.
  const position = scaleX <= scaleY
    ? (dx > 0 ? Position.Right : Position.Left)
    : (dy > 0 ? Position.Bottom : Position.Top);

  return { x, y, position };
}

/**
 * Both endpoints for one edge.
 *
 * @param source - Source node box.
 * @param target - Target node box.
 */
export function floatingEdgePoints(
  source: NodeBox,
  target: NodeBox,
): { source: FloatingPoint; target: FloatingPoint } {
  return {
    source: borderIntersection(source, target),
    target: borderIntersection(target, source),
  };
}
