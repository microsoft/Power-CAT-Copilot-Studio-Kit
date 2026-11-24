import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const reviewPageSource = readFileSync(
  new URL('../StandardReviewPage.tsx', import.meta.url),
  'utf8',
);
const findingsWorkspaceSource = readFileSync(
  new URL('../StandardFindingsWorkspace.tsx', import.meta.url),
  'utf8',
);
const shellSource = readFileSync(
  new URL('../../../shared/review-shell/ReviewPageShell.tsx', import.meta.url),
  'utf8',
);
const shellTypesSource = readFileSync(
  new URL('../../../shared/review-shell/reviewShellTypes.ts', import.meta.url),
  'utf8',
);
const workspaceNavigationUrl = new URL(
  '../StandardWorkspaceNavigation.tsx',
  import.meta.url,
);

describe('Standard Review workspaces', () => {
  it('renders the workspace switch before the result card layout', () => {
    expect(shellTypesSource).toContain('workspaceNavigation?: ReactNode');
    expect(shellSource).toMatch(
      /\{workspaceNavigation\}[\s\S]*?<div className=\{layoutClass\}>/,
    );
    expect(reviewPageSource).toContain('workspaceNavigation=');
  });

  it('uses the Microsoft Copilot harness capsule treatment for Review findings, Architecture, and Harness', () => {
    const workspaceNavigationPath = fileURLToPath(workspaceNavigationUrl);

    expect(existsSync(workspaceNavigationPath)).toBe(true);
    if (!existsSync(workspaceNavigationPath)) return;

    const workspaceNavigationSource = readFileSync(workspaceNavigationUrl, 'utf8');
    const findingsIndex = workspaceNavigationSource.indexOf('Review findings');
    const mapIndex = workspaceNavigationSource.indexOf('Architecture');

    expect(findingsIndex).toBeGreaterThanOrEqual(0);
    expect(mapIndex).toBeGreaterThan(findingsIndex);
    expect(workspaceNavigationSource.indexOf('Harness')).toBeGreaterThan(mapIndex);
    expect(workspaceNavigationSource).toContain('appearance="subtle-circular"');
    expect(workspaceNavigationSource).toContain('<nav');
  });

  it('uses the card TabList for Pattern analysis and Agent instructions', () => {
    expect(reviewPageSource).toContain("id: 'patterns'");
    expect(reviewPageSource).toContain("label: 'Pattern analysis'");
    expect(reviewPageSource).toContain("id: 'compliance'");
    expect(reviewPageSource).toContain("label: 'Agent instructions'");
    expect(findingsWorkspaceSource).not.toContain('<TabList');
    expect(findingsWorkspaceSource).not.toContain('appearance="subtle-circular"');
    expect(reviewPageSource).toContain('<StandardFindingsWorkspace');
    expect(reviewPageSource).toContain('<StandardAgentMapWorkspace');
  });

  it('owns both URL selections at page level and closes details when either changes', () => {
    expect(reviewPageSource).toContain("'workspace'");
    expect(reviewPageSource).toContain("'tab'");
    expect(reviewPageSource).toMatch(
      /setSelectedRouteTab\(id as StandardContentTabId\);[\s\S]*?closeFindingDrawer\(\);/,
    );
    expect(reviewPageSource).toMatch(
      /const handleWorkspaceSelect = useCallback\([\s\S]*?setSelectedWorkspace\(id as StandardWorkspaceId\);[\s\S]*?closeFindingDrawer\(\);/,
    );
  });

  it('does not render a redundant inner tab strip for Architecture', () => {
    expect(reviewPageSource).toContain("hideTabList={selectedWorkspace === 'agent-map'}");
    expect(shellSource).toContain(
      'aria-labelledby={hideTabList ? undefined : `review-tab-${tab.id}`}',
    );
    expect(shellSource).toContain('aria-label={hideTabList ? tab.label : undefined}');
  });

  it('shows the upgrade readiness tab in the Harness workspace', () => {
    expect(reviewPageSource).toMatch(
      /useTabRouteState<StandardWorkspaceId>\(\s*'findings',\s*isStandardWorkspaceId,\s*'workspace',/,
    );
    expect(reviewPageSource).toMatch(
      /useTabRouteState<StandardContentTabId>\(\s*defaultStandardContentTab\(selectedWorkspace\),\s*standardContentTabValidator\(selectedWorkspace\),\s*'tab',/,
    );
    expect(reviewPageSource).toContain("id: 'upgrade-readiness'");
    expect(reviewPageSource).toContain("label: 'Upgrade readiness'");
    expect(reviewPageSource).toContain('<UpgradeReadinessPanel');
    expect(reviewPageSource).toContain('const harnessTabs: ReviewTabModel[] = [upgradeReadinessTab, harnessFitTab];');
    expect(reviewPageSource).toContain("id: 'harness-fit'");
    expect(reviewPageSource).toContain("label: 'Harness fit'");
    expect(reviewPageSource).toContain('<HarnessFitPanel');
    expect(reviewPageSource).toContain("handleContentTabSelect('upgrade-readiness')");
    expect(reviewPageSource).toContain("document.getElementById('review-tab-upgrade-readiness')?.focus();");
    expect(reviewPageSource).toContain('harness: harnessTabs,');
    expect(reviewPageSource).toContain("hideRail={selectedWorkspace === 'agent-map'}");
  });

  it('keeps a short review scope note in the Overall score info popout', () => {
    expect(reviewPageSource).not.toContain('ReviewContextDisclosure');
    expect(reviewPageSource).toContain(
      'caveat="Static review of saved authoring settings only. '
      + 'It does not measure answer quality, runtime behavior, access controls, '
      + 'or production readiness."',
    );
  });
});
