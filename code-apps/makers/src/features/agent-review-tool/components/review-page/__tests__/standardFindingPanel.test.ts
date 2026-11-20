import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from '../../../shared/review-shell/useMediaQuery';

const pageSource = readFileSync(
  new URL('../StandardReviewPage.tsx', import.meta.url),
  'utf8',
);
const drawerSource = readFileSync(
  new URL('../StandardFindingDrawer.tsx', import.meta.url),
  'utf8',
);
const findingContentStylesSource = readFileSync(
  new URL('../standardFindingContentStyles.ts', import.meta.url),
  'utf8',
);
const actionableFindingSources = [
  readFileSync(new URL('../StandardPatternFindingContent.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('../StandardComplianceFindingContent.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('../StandardFindingContentShared.tsx', import.meta.url), 'utf8'),
];
const shellSource = readFileSync(
  new URL('../../../shared/review-shell/ReviewPageShell.tsx', import.meta.url),
  'utf8',
);

function MediaQueryProbe({ query }: { query: string }) {
  return createElement('span', null, useMediaQuery(query) ? 'overlay' : 'inline');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('standard finding panel', () => {
  it('replaces the summary rail with a wider inline panel on large screens', () => {
    expect(pageSource).toContain('drawerOpen={findingDrawerOpen && !findingUsesOverlay}');
    expect(pageSource).toContain('drawerReplacesRail={findingDrawerOpen}');
    expect(pageSource).toContain('drawerPresentation="panel"');
    expect(pageSource).not.toContain('drawerMatchesRailWidth={findingDrawerOpen}');
    expect(drawerSource).toContain("width: '560px'");
    expect(shellSource).toContain('showDrawerAsPanel && styles.pageWithPanel');
    expect(shellSource).toContain('showDrawerAsPanel && styles.containerDocked');
    expect(shellSource).toContain('{showDrawerAsPanel && drawer}');
    expect(shellSource).toContain('{showDrawerInGrid && (');
    expect(drawerSource).toContain('!overlay && styles.inlineDrawer');
    expect(drawerSource).toContain('!overlay && styles.inlineBody');
    expect(drawerSource).toContain("overflowY: 'visible'");
    expect(drawerSource).not.toContain("maxHeight: '100vh'");
  });

  it('uses the concise action-first content only in the finding drawer', () => {
    expect(drawerSource.match(/presentation="actionable"/g) ?? []).toHaveLength(2);
  });

  it('uses compact spacing between finding details', () => {
    const getStyle = (name: string) => findingContentStylesSource.match(
      new RegExp(`  ${name}: \\{([\\s\\S]*?)\\n  \\},`),
    )?.[1];

    expect(getStyle('root')).toContain('gap: tokens.spacingVerticalM');
    expect(getStyle('settings')).toContain('gap: tokens.spacingVerticalL');
    expect(getStyle('setting')).toContain('gap: tokens.spacingVerticalS');
    expect(getStyle('setting')).toContain('paddingTop: tokens.spacingVerticalM');
    expect(getStyle('reviewContent')).toContain('gap: tokens.spacingVerticalM');
  });

  it('removes browser-default margins from actionable semantic headings', () => {
    expect(findingContentStylesSource).toMatch(/heading:\s*\{[\s\S]*?margin: 0,/);

    actionableFindingSources.forEach(source => {
      const semanticHeadings = source.match(
        /<(?:Subtitle2|Body1Strong)\s+as=(?:"h[345]"|\{headingLevel\})[^>]*>/g,
      ) ?? [];
      expect(semanticHeadings.length).toBeGreaterThan(0);
      semanticHeadings.forEach(tag => {
        expect(tag).toContain('className={styles.heading}');
      });
    });
  });

  it('returns focus to the finding trigger after the panel closes', () => {
    expect(pageSource).toContain('findingTriggerRef.current = trigger');
    expect(pageSource).toContain('if (trigger?.isConnected) trigger.focus()');
  });

  it('uses an overlay while keeping the summary rail mounted on narrow screens', () => {
    expect(pageSource).toContain('overlay={findingUsesOverlay}');
    expect(pageSource).toContain('drawer={findingUsesOverlay ? undefined : findingDrawer}');
    expect(pageSource).toContain('overlay={findingUsesOverlay ? findingDrawer : undefined}');
    expect(drawerSource).toContain('overlay ? OverlayDrawer : InlineDrawer');
  });

  it('uses the configured responsive breakpoint on the first render', () => {
    expect(pageSource).toContain(
      "const STANDARD_FINDING_OVERLAY_QUERY = '(max-width: 1499px)'",
    );
    vi.stubGlobal('window', {
      matchMedia: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });

    const html = renderToStaticMarkup(
      createElement(MediaQueryProbe, { query: '(max-width: 1499px)' }),
    );

    expect(html).toContain('overlay');
  });
});
