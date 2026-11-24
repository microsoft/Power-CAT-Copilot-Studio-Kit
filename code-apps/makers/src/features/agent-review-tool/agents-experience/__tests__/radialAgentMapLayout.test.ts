/**
 * Radial layout geometry.
 *
 * The map's whole claim is "the agent, surrounded by its components". These
 * tests pin the two properties that claim depends on: every direct component
 * sits on one ring, and that ring uses the full circle.
 */
import { describe, expect, it } from 'vitest';

import { createRadialAgentMapLayout } from '../services/agent-map/radialAgentMapLayout';
import type { AgentMapNode, AgentMapNodeCategory } from '../contracts/AgentMap';

const node = (id: string, category: AgentMapNodeCategory, depth = 1): AgentMapNode =>
  ({ id, category, depth, label: id, warnings: [], resolution: 'resolved' }) as AgentMapNode;

/** ZAVA Visual Merchandiser: 2 tools, 4 skills, 1 knowledge, 1 connected agent. */
const zava = (): AgentMapNode[] => [
  node('agent', 'agent', 0),
  node('planogram', 'tool'), node('photos', 'tool'),
  node('planner', 'skill'), node('audit', 'skill'),
  node('refresh', 'skill'), node('handover', 'skill'),
  node('standards', 'knowledge'),
  node('storeops', 'connected-agent'),
];

const polar = (layout: ReturnType<typeof createRadialAgentMapLayout>, id: string) => {
  const n = layout.nodes.find(candidate => candidate.id === id)!;
  const cx = n.x + n.width / 2;
  const cy = n.y + n.height / 2;
  return { radius: Math.hypot(cx, cy), angle: Math.atan2(cy, cx) };
};

describe('radial agent map layout', () => {
  it('centres the agent', () => {
    const layout = createRadialAgentMapLayout(zava());
    expect(polar(layout, 'agent').radius).toBeCloseTo(0, 5);
  });

  it('puts every direct component on one ring', () => {
    // The previous layout derived a per-ring capacity from a fixed radius, which
    // evaluated to 1 for a narrow sector — so the four skills were stacked on
    // four concentric rings instead of spread around the agent.
    const layout = createRadialAgentMapLayout(zava());
    const radii = layout.nodes
      .filter(n => n.id !== 'agent')
      .map(n => Math.hypot(n.x + n.width / 2, n.y + n.height / 2));
    const spread = Math.max(...radii) - Math.min(...radii);
    expect(spread).toBeLessThan(1);
  });

  it('uses the full circle rather than one quadrant', () => {
    const layout = createRadialAgentMapLayout(zava());
    const angles = layout.nodes
      .filter(n => n.id !== 'agent')
      .map(n => polar(layout, n.id).angle);
    // Normalised to [0, 2pi), the occupied arc must cover most of the circle.
    const normalised = angles.map(a => (a + Math.PI * 2) % (Math.PI * 2)).sort((x, y) => x - y);
    const largestGap = normalised.reduce((worst, a, i) => {
      const next = i === normalised.length - 1
        ? normalised[0] + Math.PI * 2
        : normalised[i + 1];
      return Math.max(worst, next - a);
    }, 0);
    // No empty wedge wider than a quarter turn.
    expect(largestGap).toBeLessThan(Math.PI / 2);
  });

  it('never overlaps two components on the ring', () => {
    const layout = createRadialAgentMapLayout(zava());
    const placed = layout.nodes.filter(n => n.id !== 'agent');
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i];
        const b = placed[j];
        const overlaps =
          a.x < b.x + b.width && b.x < a.x + a.width &&
          a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('leaves visible space between neighbours, not merely zero overlap', () => {
    // Cards that only just fail to overlap read as one solid block. The arc
    // allotted per node must exceed the node width by a clear margin.
    const layout = createRadialAgentMapLayout(zava());
    const placed = layout.nodes.filter(n => n.id !== 'agent');
    const gaps: number[] = [];
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i];
        const b = placed[j];
        const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
        const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
        gaps.push(Math.hypot(dx, dy));
      }
    }
    expect(Math.min(...gaps)).toBeGreaterThan(16);
  });

  it('grows the ring instead of overlapping when there are many components', () => {
    const many = [node('agent', 'agent', 0), ...Array.from({ length: 40 }, (_, i) => node(`t${i}`, 'tool'))];
    const layout = createRadialAgentMapLayout(many);
    const radii = layout.nodes.filter(n => n.id !== 'agent').map(n => Math.hypot(n.x + n.width / 2, n.y + n.height / 2));
    expect(Math.min(...radii)).toBeGreaterThan(320);
  });

  it('pushes a connected agent\'s own children to an outer ring', () => {
    const nested = [
      node('agent', 'agent', 0),
      node('storeops', 'connected-agent'),
      node('child', 'connected-agent', 2),
    ];
    const layout = createRadialAgentMapLayout(nested);
    expect(polar(layout, 'child').radius).toBeGreaterThan(polar(layout, 'storeops').radius);
  });

  it('does not throw when there is no agent node', () => {
    expect(() => createRadialAgentMapLayout([node('t1', 'tool')])).not.toThrow();
  });

  it('keeps the ring clear of the centred agent', () => {
    // A component drawn on top of the agent would make the "surrounded by"
    // reading impossible, and the agent card is wider than a component card.
    const layout = createRadialAgentMapLayout(zava());
    const agentNode = layout.nodes.find(n => n.id === 'agent')!;
    const agentReach = Math.hypot(agentNode.width, agentNode.height) / 2;
    layout.nodes
      .filter(n => n.id !== 'agent')
      .forEach(n => {
        expect(polar(layout, n.id).radius).toBeGreaterThan(agentReach);
      });
  });
});
