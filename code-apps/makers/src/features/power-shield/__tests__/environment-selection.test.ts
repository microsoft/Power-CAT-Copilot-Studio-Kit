import { describe, it, expect } from 'vitest';
import { filterEnvironments, mergePageSelection } from '../shared/utils/environmentSelection';
import type { PpEnvironment } from '../models/environment';

const env = (name: string, displayName: string, sku: string, location: string): PpEnvironment => ({
  id: `/env/${name}`,
  name,
  type: 'environment',
  displayName,
  environmentSku: sku,
  location,
});

const ITEMS = [
  env('a', 'Contoso Prod', 'Production', 'unitedstates'),
  env('b', 'Contoso Sandbox', 'Sandbox', 'europe'),
  env('c', 'Fabrikam Prod', 'Production', 'europe'),
];

describe('mergePageSelection', () => {
  it('keeps selections from other pages', () => {
    const next = mergePageSelection(new Set(['x', 'a']), new Set(['a', 'b']), new Set(['a', 'b']));
    expect([...next].sort()).toEqual(['a', 'b', 'x']);
  });

  it('keeps an ID that is not in the item list at all', () => {
    const next = mergePageSelection(new Set(['gone']), new Set(['a']), new Set(['a']));
    expect(next.has('gone')).toBe(true);
  });

  it('unticking on the current page removes only that ID', () => {
    const next = mergePageSelection(new Set(['a', 'b', 'x']), new Set(['a', 'b']), new Set(['b']));
    expect([...next].sort()).toEqual(['b', 'x']);
  });

  it('ignores page selections that are not on the page', () => {
    const next = mergePageSelection(new Set(), new Set(['a']), new Set(['a', 'zz']));
    expect([...next]).toEqual(['a']);
  });
});

describe('filterEnvironments', () => {
  it('filters by search text, ignoring case', () => {
    expect(filterEnvironments(ITEMS, 'contoso', [], []).map((e) => e.name)).toEqual(['a', 'b']);
  });

  it('filters by type', () => {
    expect(filterEnvironments(ITEMS, '', ['Production'], []).map((e) => e.name)).toEqual(['a', 'c']);
  });

  it('filters by location', () => {
    expect(filterEnvironments(ITEMS, '', [], ['europe']).map((e) => e.name)).toEqual(['b', 'c']);
  });

  it('combines search, type and location', () => {
    expect(filterEnvironments(ITEMS, 'prod', ['Production'], ['europe']).map((e) => e.name)).toEqual(['c']);
  });
});
