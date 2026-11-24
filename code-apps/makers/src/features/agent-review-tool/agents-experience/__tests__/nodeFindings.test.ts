/**
 * Attaching review findings to Agent map nodes.
 *
 * The rule that raises a finding stamps the component it inspected, so the link
 * is recorded where it is known rather than reconstructed from a title later.
 * These pin that contract, and in particular that nothing is ever attached by
 * name -- a misattributed finding sends a maker to fix the wrong component.
 */
import { describe, expect, it } from 'vitest';

import {
  formatFindingTally,
  formatNodeReviewSummary,
  hasAttributedFindings,
  selectNodeFindings,
} from '../components/agent-map/nodeFindings';
import type { FindingView } from '../components/viewTypes';
import type { AgentMapNode } from '../contracts/AgentMap';

const finding = (over: Partial<FindingView>): FindingView => ({
  id: 'TOL-02',
  sev: 'warning',
  family: 'Tools',
  provenance: 'deterministic',
  ai: false,
  title: 'Tool has a weak description',
  sub: '',
  fact: '',
  why: '',
  fix: '',
  dimension: 'quality',
  refTitle: '',
  refUrl: '',
  source: 'Microsoft Learn',
  how: '',
  fixSteps: [],
  references: [],
  ...over,
} as FindingView);

const node = (over: Partial<AgentMapNode> = {}): AgentMapNode => ({
  id: 'n1',
  category: 'tool',
  label: 'Planogram Archive',
  componentIdUnique: 'u-tool-1',
  resolution: 'resolved',
  details: {},
  ...over,
} as AgentMapNode);

describe('selectNodeFindings', () => {
  it('returns only the findings stamped with this component', () => {
    const result = selectNodeFindings(node(), [
      finding({ id: 'TOL-02', componentIdUnique: 'u-tool-1' }),
      finding({ id: 'TOL-04', componentIdUnique: 'u-tool-2', sev: 'error' }),
    ], true);

    expect(result.findings.map(f => f.id)).toEqual(['TOL-02']);
  });

  it('returns all review findings for the root agent', () => {
    const result = selectNodeFindings(node({
      category: 'agent',
      componentIdUnique: undefined,
    }), [
      finding({ id: 'TOL-02', componentIdUnique: 'u-tool-1' }),
      finding({ id: 'SKL-04', componentIdUnique: 'u-skill-1', sev: 'error' }),
    ], true);

    expect(result.findings.map(f => f.id)).toEqual(['SKL-04', 'TOL-02']);
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(1);
  });

  it('never attaches a finding by name', () => {
    // The title names this exact component, which is precisely the trap: with
    // no stamped id there is no proof the finding is about this node.
    const result = selectNodeFindings(node(), [
      finding({ title: 'Tool "Planogram Archive" has a weak description' }),
    ], true);

    expect(result.findings).toHaveLength(0);
  });

  it('orders worst first', () => {
    const result = selectNodeFindings(node(), [
      finding({ id: 'a', sev: 'info', componentIdUnique: 'u-tool-1' }),
      finding({ id: 'b', sev: 'error', componentIdUnique: 'u-tool-1' }),
      finding({ id: 'c', sev: 'warning', componentIdUnique: 'u-tool-1' }),
    ], true);

    expect(result.findings.map(f => f.id)).toEqual(['b', 'c', 'a']);
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.infos).toBe(1);
  });

  it('reports a clean component as clean, not unavailable', () => {
    const result = selectNodeFindings(node(), [
      finding({ componentIdUnique: 'u-tool-2' }),
    ], true);

    expect(result.findings).toHaveLength(0);
    expect(result.attributionUnavailable).toBe(false);
  });

  it('distinguishes a legacy review from a clean component', () => {
    // No finding in the review carries an id, so silence here means the review
    // predates stamping. Saying "no findings" would assert something untrue.
    const result = selectNodeFindings(node(), [finding({})], false);

    expect(result.attributionUnavailable).toBe(true);
  });

  it('treats a review with no findings as clean rather than legacy', () => {
    const result = selectNodeFindings(node(), [], false);

    expect(result.findings).toHaveLength(0);
    expect(result.attributionUnavailable).toBe(false);
  });

  it('returns nothing for a node with no component identity', () => {
    const result = selectNodeFindings(
      node({ componentIdUnique: undefined }),
      [finding({ componentIdUnique: 'u-tool-1' })],
      true,
    );
    expect(result.findings).toHaveLength(0);
  });

  it('handles no selection without throwing', () => {
    expect(selectNodeFindings(undefined, [finding({})], true).findings).toEqual([]);
  });
});

describe('hasAttributedFindings', () => {
  it('is true when any finding carries a component id', () => {
    expect(hasAttributedFindings([finding({}), finding({ componentIdUnique: 'x' })])).toBe(true);
  });

  it('is false for a legacy review', () => {
    expect(hasAttributedFindings([finding({}), finding({})])).toBe(false);
  });
});

describe('formatFindingTally', () => {
  it('omits zero counts', () => {
    const result = selectNodeFindings(node(), [
      finding({ sev: 'error', componentIdUnique: 'u-tool-1' }),
      finding({ sev: 'error', componentIdUnique: 'u-tool-1' }),
    ], true);
    expect(formatFindingTally(result)).toBe('2 errors');
  });

  it('singularises', () => {
    const result = selectNodeFindings(node(), [
      finding({ sev: 'error', componentIdUnique: 'u-tool-1' }),
      finding({ sev: 'warning', componentIdUnique: 'u-tool-1' }),
    ], true);
    expect(formatFindingTally(result)).toBe('1 error · 1 warning');
  });
});

describe('formatNodeReviewSummary', () => {
  it('reports an empty review as clean when a component has no unique id', () => {
    const selectedNode = node({ componentIdUnique: undefined });
    const result = selectNodeFindings(selectedNode, [], false);

    expect(formatNodeReviewSummary(selectedNode, result)).toBe(
      'No review findings were linked to this component.',
    );
  });
});
