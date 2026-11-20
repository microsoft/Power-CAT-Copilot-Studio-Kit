import { describe, expect, it } from 'vitest';
import {
  TOP_FINDINGS, collapseToTop, collapseToggleLabel, findingCountLabel, matchesQuery, severityAppearance,
} from '../findings';

describe('matchesQuery', () => {
  it('matches any field, case-insensitively, on a substring', () => {
    const fields = ['Missing instructions', 'instructions', undefined, 'ART-014'];
    expect(matchesQuery(fields, 'MISSING')).toBe(true);
    expect(matchesQuery(fields, 'instruction')).toBe(true);
    expect(matchesQuery(fields, 'art-014')).toBe(true);
    expect(matchesQuery(fields, 'orchestration')).toBe(false);
  });

  it('treats an empty or whitespace query as no filter', () => {
    expect(matchesQuery(['anything'], '')).toBe(true);
    expect(matchesQuery(['anything'], '   ')).toBe(true);
  });

  it('ignores absent fields instead of matching them', () => {
    expect(matchesQuery([undefined, null], 'x')).toBe(false);
  });
});

describe('collapseToTop', () => {
  const items = [1, 2, 3, 4, 5];

  it('shows the top few and reports the rest', () => {
    expect(collapseToTop(items, false)).toEqual({ visible: [1, 2, 3], hidden: 2, collapsible: true });
  });

  it('shows everything once expanded', () => {
    expect(collapseToTop(items, true)).toEqual({ visible: items, hidden: 0, collapsible: true });
  });

  it('offers no control for a group that never had a tail', () => {
    expect(collapseToTop([1, 2], false)).toEqual({ visible: [1, 2], hidden: 0, collapsible: false });
    expect(collapseToTop([], false)).toEqual({ visible: [], hidden: 0, collapsible: false });
  });

  it('keeps the control visible after it is used', () => {
    // Deriving the control from `hidden > 0` alone makes it vanish the moment it is clicked,
    // stranding the reader in an expanded list with no way back.
    expect(collapseToggleLabel(collapseToTop(items, false))).toBe('Show 2 more');
    expect(collapseToggleLabel(collapseToTop(items, true))).toBe(`Show top ${TOP_FINDINGS} only`);
    expect(collapseToggleLabel(collapseToTop([1], false))).toBeUndefined();
  });

  it('does not alias its input array', () => {
    const input = [1, 2];
    const result = collapseToTop(input, true);
    result.visible.push(3);
    expect(input).toEqual([1, 2]);
  });
});

describe('severityAppearance', () => {
  it('maps both severity vocabularies the two apps use', () => {
    expect(severityAppearance('error')).toBe('danger');
    expect(severityAppearance('High')).toBe('danger');
    expect(severityAppearance('warning')).toBe('warning');
    expect(severityAppearance('Medium')).toBe('warning');
    expect(severityAppearance('info')).toBe('informative');
    expect(severityAppearance('Low')).toBe('informative');
    expect(severityAppearance('something new')).toBe('informative');
  });
});

describe('findingCountLabel', () => {
  it('gets the singular right, because groups of one are common', () => {
    expect(findingCountLabel(1)).toBe('1 finding');
    expect(findingCountLabel(0)).toBe('0 findings');
    expect(findingCountLabel(12)).toBe('12 findings');
  });
});
