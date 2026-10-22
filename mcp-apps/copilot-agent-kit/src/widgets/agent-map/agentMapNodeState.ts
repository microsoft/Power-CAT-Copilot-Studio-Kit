import type { Node, XYPosition } from "@xyflow/react";

/**
 * Apply current or cached positions to rebuilt graph nodes while taking all
 * non-position properties from the latest filtered graph.
 */
export function reconcileAgentMapFlowNodes<TNode extends Node>(
  baseNodes: readonly TNode[],
  currentNodes: readonly TNode[],
  movedPositions: ReadonlyMap<string, XYPosition>,
): TNode[] {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));

  return baseNodes.map((baseNode) => {
    const currentNode = currentById.get(baseNode.id);
    const movedPosition = movedPositions.get(baseNode.id);
    const position = currentNode?.position ?? movedPosition ?? baseNode.position;

    if (!currentNode && !movedPosition) return baseNode;
    return {
      ...currentNode,
      ...baseNode,
      position,
    };
  });
}

/** Return a new saved-position snapshot after one node drag completes. */
export function updateMovedNodePosition(
  movedPositions: ReadonlyMap<string, XYPosition>,
  nodeId: string,
  position: XYPosition,
): ReadonlyMap<string, XYPosition> {
  const nextPositions = new Map(movedPositions);
  nextPositions.set(nodeId, { ...position });
  return nextPositions;
}
