import { describe, expect, it } from 'vitest';
import type { FindingView } from '../components/viewTypes';
import { buildFindingsGroupedView } from '../components/findings/findingsGroupedModel';

/** Minimal FindingView factory for grouping-model tests. */
function finding(overrides: Partial<FindingView> = {}): FindingView {
  return {
    id: 'RULE-01',
    sev: 'warning',
    family: 'Instructions',
    provenance: 'deterministic',
    ai: false,
    title: 'Test finding',
    sub: 'subtitle',
    fact: 'evidence',
    why: 'why it matters',
    fix: 'how to fix',
    dimension: 'quality',
    refTitle: 'Ref',
    refUrl: 'learn.microsoft.com/x',
    source: 'Microsoft Learn',
    how: 'Deterministic',
    fixSteps: [],
    references: [],
    ...overrides,
  };
}

describe('buildFindingsGroupedView', () => {
  it('groups findings by family', () => {
    const { groups } = buildFindingsGroupedView([
      finding({ id: 'INS-01', family: 'Instructions' }),
      finding({ id: 'TL-01', family: 'Tools' }),
      finding({ id: 'INS-02', family: 'Instructions' }),
    ]);

    const instructions = groups.find((g) => g.family === 'Instructions');
    const tools = groups.find((g) => g.family === 'Tools');
    expect(instructions?.rows).toHaveLength(2);
    expect(tools?.rows).toHaveLength(1);
  });

  it('orders groups worst-severity first, then by breadth', () => {
    const { groups } = buildFindingsGroupedView([
      finding({ id: 'A-01', family: 'AlphaInfo', sev: 'info' }),
      finding({ id: 'A-02', family: 'AlphaInfo', sev: 'info' }),
      finding({ id: 'B-01', family: 'BetaError', sev: 'error' }),
    ]);

    // BetaError has an error (worst) so it leads despite fewer findings.
    expect(groups[0].family).toBe('BetaError');
    expect(groups[1].family).toBe('AlphaInfo');
  });

  it('orders rows worst-severity first inside a group', () => {
    const { groups } = buildFindingsGroupedView([
      finding({ id: 'X-INFO', family: 'Models', sev: 'info' }),
      finding({ id: 'X-ERR', family: 'Models', sev: 'error' }),
      finding({ id: 'X-WARN', family: 'Models', sev: 'warning' }),
    ]);

    expect(groups[0].rows.map((r) => r.finding.id)).toEqual(['X-ERR', 'X-WARN', 'X-INFO']);
  });

  it('counts findings per severity in each group', () => {
    const { groups } = buildFindingsGroupedView([
      finding({ id: 'K-01', family: 'Knowledge', sev: 'error' }),
      finding({ id: 'K-02', family: 'Knowledge', sev: 'warning' }),
      finding({ id: 'K-03', family: 'Knowledge', sev: 'warning' }),
    ]);

    expect(groups[0].counts).toEqual({ error: 1, warning: 2, info: 0 });
  });

  it('assigns unique keys to findings sharing a rule id across families', () => {
    const { groups } = buildFindingsGroupedView([
      finding({ id: 'DUP-01', family: 'Instructions' }),
      finding({ id: 'DUP-01', family: 'Tools' }),
    ]);

    const keys = groups.flatMap((g) => g.rows.map((r) => r.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('preserves source row keys when a severity filter hides other findings', () => {
    const allFindings = [
      finding({ id: 'ERR-01', sev: 'error' }),
      finding({ id: 'WARN-01', sev: 'warning' }),
    ];
    const visibleFindings = allFindings.filter(item => item.sev === 'warning');
    const { groups } = buildFindingsGroupedView(visibleFindings, allFindings);

    expect(groups[0].rows[0].key).toBe('1');
  });

  it('returns no groups for an empty finding list', () => {
    expect(buildFindingsGroupedView([]).groups).toEqual([]);
  });
});
