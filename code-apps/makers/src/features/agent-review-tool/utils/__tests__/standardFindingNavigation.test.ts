import { describe, expect, it } from 'vitest';
import type { ComplianceIssueDetail } from '../../contracts/DisplayModels';
import type { PatternTopic } from '../../contracts/StageOutputs';
import {
  createComplianceFindingItems,
  createPatternFindingItems,
  reconcileFindingComparison,
  reconcileFindingSelection,
} from '../standardFindingNavigation';

function pattern(overrides: Partial<PatternTopic> = {}): PatternTopic {
  return {
    item: 'Topic',
    componentId: 'topic-1',
    current: 'Saved description',
    ...overrides,
  };
}

function issue(overrides: Partial<ComplianceIssueDetail> = {}): ComplianceIssueDetail {
  return {
    id: 'issue-1',
    title: 'Define scope',
    description: 'Scope is incomplete.',
    recommendation: 'Add the supported scope.',
    severity: 'High',
    ...overrides,
  };
}

describe('standard finding navigation', () => {
  it('keeps pattern identities stable when entries are reordered', () => {
    const first = pattern({ componentId: 'topic-a', item: 'Topic A' });
    const second = pattern({ componentId: 'topic-b', item: 'Topic B' });

    const original = createPatternFindingItems([first, second]);
    const reordered = createPatternFindingItems([second, first]);

    expect(reordered.map(item => item.id)).toEqual([
      original[1].id,
      original[0].id,
    ]);
  });

  it('uses variable and setting identity to keep same-component entries distinct', () => {
    const items = createPatternFindingItems([
      pattern({ variable: 'CustomerId', setting: 'Input' }),
      pattern({ variable: 'Region', setting: 'Input' }),
    ]);

    expect(new Set(items.map(item => item.id)).size).toBe(2);
  });

  it('does not collapse duplicate issue IDs with different saved content', () => {
    const items = createComplianceFindingItems([
      issue(),
      issue({ title: 'Define exclusions', description: 'Exclusions are missing.' }),
    ]);

    expect(new Set(items.map(item => item.id)).size).toBe(2);
  });

  it('preserves a selected stable ID and falls back after removal', () => {
    const items = createPatternFindingItems([
      pattern({ componentId: 'topic-a', item: 'Topic A' }),
      pattern({ componentId: 'topic-b', item: 'Topic B' }),
    ]);

    expect(reconcileFindingSelection(items, items[1].id)).toBe(items[1].id);
    expect(reconcileFindingSelection(items.slice(0, 1), items[1].id)).toBe(items[0].id);
    expect(reconcileFindingSelection([], items[1].id)).toBeNull();
  });

  it('reconciles two distinct overlap participants after reorder and removal', () => {
    const items = createPatternFindingItems([
      pattern({ componentId: 'a', item: 'A' }),
      pattern({ componentId: 'b', item: 'B' }),
      pattern({ componentId: 'c', item: 'C' }),
    ]);

    expect(reconcileFindingComparison(items, items[1].id, items[0].id)).toEqual({
      leftId: items[1].id,
      rightId: items[0].id,
    });
    expect(reconcileFindingComparison(items, items[1].id, items[1].id)).toEqual({
      leftId: items[1].id,
      rightId: items[0].id,
    });
    expect(reconcileFindingComparison(items.slice(1), items[0].id, items[2].id)).toEqual({
      leftId: items[1].id,
      rightId: items[2].id,
    });
  });
});
