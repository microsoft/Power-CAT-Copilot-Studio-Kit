import { describe, expect, it } from 'vitest';
import { resolveTabRouteValue } from '../../../shared/review-shell/useTabRouteState';
import type { StandardWorkspaceId } from '../StandardWorkspaceNavigation';
import {
  defaultStandardContentTab,
  isStandardWorkspaceId,
  standardContentTabValidator,
} from '../standardWorkspaceRoute';

/** Resolves the 2 route values in the same order as StandardReviewPage. */
function resolveRoute(query: string) {
  const search = new URLSearchParams(query);
  const workspace = resolveTabRouteValue<StandardWorkspaceId>(
    search,
    'workspace',
    'findings',
    isStandardWorkspaceId,
  );
  const tab = resolveTabRouteValue(
    search,
    'tab',
    defaultStandardContentTab(workspace),
    standardContentTabValidator(workspace),
  );
  return { workspace, tab };
}

describe('standard workspace route', () => {
  it('opens the upgrade readiness tab from a Harness URL', () => {
    expect(resolveRoute('workspace=harness&tab=upgrade-readiness&reviewId=review-1')).toEqual({
      workspace: 'harness',
      tab: 'upgrade-readiness',
    });
  });

  it('uses the upgrade readiness tab when a Harness URL has no Harness tab', () => {
    expect(resolveRoute('workspace=harness&tab=compliance')).toEqual({
      workspace: 'harness',
      tab: 'upgrade-readiness',
    });
    expect(resolveRoute('workspace=harness')).toEqual({
      workspace: 'harness',
      tab: 'upgrade-readiness',
    });
  });

  it('uses Pattern analysis when a findings URL has a Harness tab', () => {
    expect(resolveRoute('workspace=findings&tab=upgrade-readiness')).toEqual({
      workspace: 'findings',
      tab: 'patterns',
    });
  });

  it('keeps the finding tab for the findings and Architecture workspaces', () => {
    expect(resolveRoute('workspace=findings&tab=compliance')).toEqual({
      workspace: 'findings',
      tab: 'compliance',
    });
    expect(resolveRoute('workspace=agent-map&tab=compliance')).toEqual({
      workspace: 'agent-map',
      tab: 'compliance',
    });
  });

  it('opens the harness fit tab from a Harness URL', () => {
    expect(resolveRoute('workspace=harness&tab=harness-fit')).toEqual({
      workspace: 'harness',
      tab: 'harness-fit',
    });
  });

  it('uses Pattern analysis when a findings URL has the harness fit tab', () => {
    expect(resolveRoute('workspace=findings&tab=harness-fit')).toEqual({
      workspace: 'findings',
      tab: 'patterns',
    });
  });

  it('uses the findings workspace and Pattern analysis for a missing or unknown workspace', () => {
    expect(resolveRoute('workspace=unknown&tab=upgrade-readiness')).toEqual({
      workspace: 'findings',
      tab: 'patterns',
    });
    expect(resolveRoute('')).toEqual({ workspace: 'findings', tab: 'patterns' });
  });
});
