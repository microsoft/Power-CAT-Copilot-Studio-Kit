import type { XYPosition } from '@xyflow/react';
import type { AgentMapNode } from './AgentMap.types';

const DIRECT_RADIUS = 320;
const NESTED_RADIUS = 470;

/** Create stable concentric positions with the primary agent at the center. */
export function createRadialAgentMapLayout(
  nodes: readonly AgentMapNode[],
): ReadonlyMap<string, XYPosition> {
  const positions = new Map<string, XYPosition>();
  const agent = nodes.find(node => node.category === 'agent');
  if (agent) positions.set(agent.id, { x: -120, y: -42 });

  const placeRing = (ringNodes: AgentMapNode[], radius: number) => {
    ringNodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / ringNodes.length;
      positions.set(node.id, {
        x: radius * Math.cos(angle) - 120,
        y: radius * Math.sin(angle) - 38,
      });
    });
  };

  const nonAgentNodes = nodes
    .filter(node => node.category !== 'agent')
    .sort((left, right) =>
      (left.depth ?? 1) - (right.depth ?? 1)
      || left.category.localeCompare(right.category)
      || left.id.localeCompare(right.id));

  placeRing(nonAgentNodes.filter(node => (node.depth ?? 1) <= 1), DIRECT_RADIUS);
  placeRing(nonAgentNodes.filter(node => (node.depth ?? 1) > 1), NESTED_RADIUS);
  return positions;
}
