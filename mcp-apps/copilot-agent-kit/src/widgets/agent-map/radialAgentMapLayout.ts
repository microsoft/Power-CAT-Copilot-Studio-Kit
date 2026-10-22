import type {
  AgentMapLayout,
  AgentMapLayoutNode,
  AgentMapNodeCategory,
  AgentMapViewNode,
} from "./agentMapViewModel";

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
 * non-overlapping: at 40px the arc allotted per node equals the node width
 * exactly, so cards touch edge to edge and read as one block.
 */
const ARC_GAP = 88;

const GROUP_ORDER = [
  "tool",
  "skill",
  "topic",
  "knowledge",
  "connected-agent",
  "trigger",
  "evaluation",
  "unknown",
] as const;

type RadialGroup = typeof GROUP_ORDER[number];

const CATEGORY_GROUP: Record<AgentMapNodeCategory, RadialGroup | "agent"> = {
  agent: "agent",
  tool: "tool",
  skill: "skill",
  topic: "topic",
  action: "topic",
  knowledge: "knowledge",
  "connected-agent": "connected-agent",
  trigger: "trigger",
  // Evaluation sets and test cases share one sector so the two halves of the
  // same evaluation story sit together instead of on opposite sides.
  "evaluation-set": "evaluation",
  "test-case": "evaluation",
  unknown: "unknown",
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

/** Radius at which `count` nodes fit inside `span` radians without overlapping. */
function radiusForBatch(count: number, span: number): number {
  if (count <= 0 || span <= 0) return FIRST_RING_RADIUS;
  return Math.max(FIRST_RING_RADIUS, (count * (NODE_WIDTH + ARC_GAP)) / span);
}

function placeGroup(
  nodes: AgentMapViewNode[],
  startAngle: number,
  span: number,
  baseRadius: number,
): AgentMapLayoutNode[] {
  const topLevel = nodes.filter((node) => node.depth <= 1);
  const nested = nodes.filter((node) => node.depth > 1);
  const positioned: AgentMapLayoutNode[] = [];

  const placeBatch = (batch: AgentMapViewNode[], radius: number): void => {
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
  placeBatch(nested, Math.max(baseRadius + RING_GAP, radiusForBatch(nested.length, span)));
  return positioned;
}

/** Place the agent at center and components in stable category-based concentric sectors. */
export function createRadialAgentMapLayout(nodes: AgentMapViewNode[]): AgentMapLayout {
  const agent = nodes.find((node) => node.category === "agent");
  const groups = new Map<RadialGroup, AgentMapViewNode[]>();

  nodes
    .filter((node) => node.category !== "agent")
    .sort((left, right) =>
      left.depth - right.depth
      || left.category.localeCompare(right.category)
      || left.id.localeCompare(right.id))
    .forEach((node) => {
      const group = CATEGORY_GROUP[node.category] as RadialGroup;
      const entries = groups.get(group) ?? [];
      entries.push(node);
      groups.set(group, entries);
    });

  const activeGroups = GROUP_ORDER.filter((group) => (groups.get(group)?.length ?? 0) > 0);
  // Weight each sector by how many nodes it holds, so a four-skill group gets
  // four times the arc of a single knowledge source rather than an equal share.
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
    (node) => node.category !== "agent" && node.depth <= 1,
  ).length;
  const ringRadius = radiusForBatch(directCount, Math.PI * 2);

  // Start at the top of the circle so the first group reads clockwise from 12
  // o'clock, which is where the eye lands first.
  let cursor = -Math.PI / 2;
  activeGroups.forEach((group) => {
    const groupNodes = groups.get(group) ?? [];
    const span = (Math.PI * 2 * weightOf(group)) / totalWeight;
    positions.push(...placeGroup(groupNodes, cursor, span, ringRadius));
    cursor += span;
  });

  return { nodes: positions, algorithm: "concentric-radial" };
}
