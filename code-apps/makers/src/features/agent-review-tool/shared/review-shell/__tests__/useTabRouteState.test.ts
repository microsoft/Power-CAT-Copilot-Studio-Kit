import { describe, expect, it } from 'vitest';
import {
  resolveTabRouteValue,
  withTabRouteValue,
} from '../useTabRouteState';

const isWorkspace = (value: string) => value === 'findings' || value === 'agent-map';

describe('resolveTabRouteValue', () => {
  it('reads an independently named route parameter', () => {
    const search = new URLSearchParams('workspace=agent-map&tab=compliance&reviewId=review-1');

    expect(resolveTabRouteValue(search, 'workspace', 'findings', isWorkspace))
      .toBe('agent-map');
  });

  it('uses the fallback for a missing or invalid value', () => {
    expect(resolveTabRouteValue(
      new URLSearchParams('reviewId=review-1'),
      'workspace',
      'findings',
      isWorkspace,
    )).toBe('findings');
    expect(resolveTabRouteValue(
      new URLSearchParams('workspace=unknown'),
      'workspace',
      'findings',
      isWorkspace,
    )).toBe('findings');
  });

  it('derives each value from the current URL instead of retained local state', () => {
    const first = new URLSearchParams('workspace=findings');
    const afterBrowserNavigation = new URLSearchParams('workspace=agent-map');

    expect(resolveTabRouteValue(first, 'workspace', 'findings', isWorkspace)).toBe('findings');
    expect(resolveTabRouteValue(
      afterBrowserNavigation,
      'workspace',
      'findings',
      isWorkspace,
    )).toBe('agent-map');
  });

  it('updates one route selection without removing other parameters', () => {
    const search = new URLSearchParams(
      'workspace=findings&tab=patterns&reviewId=review-1&sourceEnvironment=env-1',
    );

    expect(withTabRouteValue(search, 'workspace', 'agent-map').toString()).toBe(
      'workspace=agent-map&tab=patterns&reviewId=review-1&sourceEnvironment=env-1',
    );
    expect(search.get('workspace')).toBe('findings');
  });
});
