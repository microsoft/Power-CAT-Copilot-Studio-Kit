import { Position } from '@xyflow/react';

interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloatingPoint {
  x: number;
  y: number;
  position: Position;
}

function borderIntersection(from: NodeBox, to: NodeBox): FloatingPoint {
  const centerX = from.x + from.width / 2;
  const centerY = from.y + from.height / 2;
  const targetX = to.x + to.width / 2;
  const targetY = to.y + to.height / 2;
  const dx = targetX - centerX;
  const dy = targetY - centerY;

  if (dx === 0 && dy === 0) {
    return { x: centerX, y: from.y, position: Position.Top };
  }

  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : (from.width / 2) / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : (from.height / 2) / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return {
    x: centerX + dx * scale,
    y: centerY + dy * scale,
    position: scaleX <= scaleY
      ? (dx > 0 ? Position.Right : Position.Left)
      : (dy > 0 ? Position.Bottom : Position.Top),
  };
}

/** Return edge endpoints on the node borders facing one another. */
export function floatingEdgePoints(source: NodeBox, target: NodeBox) {
  return {
    source: borderIntersection(source, target),
    target: borderIntersection(target, source),
  };
}
