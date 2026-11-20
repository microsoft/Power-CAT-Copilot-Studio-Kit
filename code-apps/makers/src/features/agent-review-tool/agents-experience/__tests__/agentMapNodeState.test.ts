import type { Node, XYPosition } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  reconcileAgentMapFlowNodes,
  updateMovedNodePosition,
} from '../components/agent-map/agentMapNodeState';

type TestNode = Node<{ label: string }>;

function node(id: string, position: XYPosition, label: string): TestNode {
  return {
    id,
    position,
    data: { label },
  };
}

describe('Agent Map node state', () => {
  it('keeps moved positions when filtered nodes are rebuilt', () => {
    const currentNode = {
      ...node('visible', { x: 240, y: 360 }, 'Old label'),
      measured: { width: 220, height: 92 },
    };
    const baseNodes = [
      node('visible', { x: 20, y: 30 }, 'Updated label'),
      node('restored', { x: 40, y: 50 }, 'Restored node'),
      node('new', { x: 60, y: 70 }, 'New node'),
    ];
    const movedPositions = new Map<string, XYPosition>([
      ['restored', { x: 480, y: 520 }],
    ]);

    const result = reconcileAgentMapFlowNodes(baseNodes, [currentNode], movedPositions);

    expect(result).toEqual([
      {
        ...currentNode,
        data: { label: 'Updated label' },
        position: { x: 240, y: 360 },
      },
      node('restored', { x: 480, y: 520 }, 'Restored node'),
      node('new', { x: 60, y: 70 }, 'New node'),
    ]);
  });

  it('returns an immutable snapshot when a drag stops', () => {
    const movedPositions = new Map<string, XYPosition>([
      ['existing', { x: 10, y: 20 }],
    ]);

    const result = updateMovedNodePosition(
      movedPositions,
      'moved',
      { x: 180, y: 260 },
    );

    expect(movedPositions).toEqual(new Map([
      ['existing', { x: 10, y: 20 }],
    ]));
    expect(result).toEqual(new Map([
      ['existing', { x: 10, y: 20 }],
      ['moved', { x: 180, y: 260 }],
    ]));
  });
});
