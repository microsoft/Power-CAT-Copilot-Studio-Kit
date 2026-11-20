import type {
  AgentMapLayout,
  AgentMapLayoutNode,
  AgentMapNode,
  AgentMapNodeCategory,
} from '../../contracts/AgentMap';

const NODE_WIDTH = 240;
// Two title lines plus the category caption, inside the pill's padding.
const NODE_HEIGHT = 76;
const AGENT_WIDTH = 260;
const AGENT_HEIGHT = 84;
const FIRST_RING_RADIUS = 320;
const RING_GAP = 150;
/**
 * Clear space between neighbours on a ring.
 *
 * Sized so adjacent cards are visibly separated rather than merely
 * non-overlapping: at the previous 40px the arc allotted per node equalled the
 * node width exactly, so cards touched edge to edge and read as one block.
 */
const ARC_GAP = 88;

const GROUP_ORDER = [
  'topic',
  'tool',
  'skill',
  'knowledge',
  'entity',
  'configuration',
  'connected-agent',
  'child-agent',
  'trigger',
  'evaluation',
  'unknown',
] as const;

type RadialGroup = typeof GROUP_ORDER[number];

const CATEGORY_GROUP: Record<AgentMapNodeCategory, RadialGroup | 'agent'> = {
  agent: 'agent',
  topic: 'topic',
  tool: 'tool',
  skill: 'skill',
  knowledge: 'knowledge',
  entity: 'entity',
  configuration: 'configuration',
  'connected-agent': 'connected-agent',
  'child-agent': 'child-agent',
  trigger: 'trigger',
  'evaluation-set': 'evaluation',
  'test-case': 'evaluation',
  unknown: 'unknown',
};

/**
 * Angular slot each node needs on a ring of the given radius.
 *
 * Arc length per node is the node width plus a gap; converting that to an angle
 * is what lets the ring grow to fit rather than pushing nodes onto extra rings.
 */
function angularSlot(radius: number): number {
  return (NODE_WIDTH + ARC_GAP) / radius;
}

/**
 * Radius at which `count` nodes fit inside `span` radians without overlapping.
 *
 * Previously a fixed radius was used and the per-ring capacity was derived from
 * it, which produced a capacity of 1 for narrow sectors — so a four-skill group
 * was stacked across four concentric rings instead of spread around the agent.
 * Solving for the radius instead keeps every top-level component on one ring.
 */
function radiusForBatch(count: number, span: number): number {
  if (count <= 0 || span <= 0) return FIRST_RING_RADIUS;
  return Math.max(FIRST_RING_RADIUS, (count * (NODE_WIDTH + ARC_GAP)) / span);
}

function placeGroup(
  nodes: AgentMapNode[],
  startAngle: number,
  span: number,
  baseRadius: number,
): AgentMapLayoutNode[] {
  const topLevel = nodes.filter(node => node.depth <= 1);
  const nested = nodes.filter(node => node.depth > 1);
  const positioned: AgentMapLayoutNode[] = [];

  const placeBatch = (batch: AgentMapNode[], radius: number): void => {
    if (batch.length === 0) return;
    // Inset by half a slot at each end so neighbouring sectors do not collide.
    const inset = Math.min(angularSlot(radius) / 2, span / 4);
    const usable = Math.max(span - inset * 2, 0);
    batch.forEach((node, index) => {
      const t = batch.length === 1 ? 0.5 : index / (batch.length - 1);
      const angle = startAngle + inset + usable * t;
      positioned.push({
        id: node.id,
        x: radius * Math.cos(angle) - NODE_WIDTH / 2,
        y: radius * Math.sin(angle) - NODE_HEIGHT / 2,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  };

  placeBatch(topLevel, baseRadius);
  // Nested components (a connected agent's own children) sit on an outer ring so
  // the first ring stays a clean circle of the agent's direct components.
  placeBatch(nested, Math.max(baseRadius + RING_GAP, radiusForBatch(nested.length, span)));
  return positioned;
}

/** Place the agent at center and components in stable category-based concentric sectors. */
export function createRadialAgentMapLayout(nodes: AgentMapNode[]): AgentMapLayout {
  const agent = nodes.find(node => node.category === 'agent');
  const groups = new Map<RadialGroup, AgentMapNode[]>();

  nodes
    .filter(node => node.category !== 'agent')
    .sort((left, right) =>
      left.depth - right.depth ||
      left.category.localeCompare(right.category) ||
      left.id.localeCompare(right.id))
    .forEach(node => {
      const group = CATEGORY_GROUP[node.category] as RadialGroup;
      const entries = groups.get(group) ?? [];
      entries.push(node);
      groups.set(group, entries);
    });

  const activeGroups = GROUP_ORDER.filter(group => (groups.get(group)?.length ?? 0) > 0);
  // Weight each sector by how many nodes it holds, so a four-skill group gets
  // four times the arc of a single knowledge source rather than an equal share.
  // The floor of 1 keeps a lone component from collapsing to a sliver.
  const weightOf = (group: RadialGroup) => Math.max(1, groups.get(group)?.length ?? 0);
  const totalWeight = activeGroups.reduce((sum, group) => sum + weightOf(group), 0);

  const positions: AgentMapLayoutNode[] = agent
    ? [{
        id: agent.id,
        x: -AGENT_WIDTH / 2,
        y: -AGENT_HEIGHT / 2,
        width: AGENT_WIDTH,
        height: AGENT_HEIGHT,
      }]
    : [];

  // One shared radius for every direct component, sized to fit them all around
  // the full circle. This is what makes the map read as the agent surrounded by
  // its capabilities rather than as scattered arcs at differing distances.
  const directCount = nodes.filter(
    node => node.category !== 'agent' && node.depth <= 1,
  ).length;
  const ringRadius = radiusForBatch(directCount, Math.PI * 2);

  // Start at the top of the circle so the first group reads clockwise from 12
  // o'clock, which is where the eye lands first.
  let cursor = -Math.PI / 2;
  activeGroups.forEach(group => {
    const groupNodes = groups.get(group) ?? [];
    const span = (Math.PI * 2 * weightOf(group)) / totalWeight;
    positions.push(...placeGroup(groupNodes, cursor, span, ringRadius));
    cursor += span;
  });

  return { nodes: positions, algorithm: 'concentric-radial' };
}
