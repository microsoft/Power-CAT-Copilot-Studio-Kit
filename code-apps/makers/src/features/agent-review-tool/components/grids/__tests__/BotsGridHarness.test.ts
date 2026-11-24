import { createElement, Fragment, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewGridRow } from '../../../contracts/ReviewResult';
import { UNSUPPORTED_HARNESS_MESSAGE } from '../../../agents-experience/services/detection';
import { BotsGrid } from '../BotsGrid';

// renderToStaticMarkup is a server render, and Fluent renders no Tooltip content in a server render. This mock renders the content.
vi.mock('@fluentui/react-components', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Tooltip: ({ content, children }: PropsWithChildren<{ content: string }>) =>
      createElement(Fragment, null, children, createElement('span', { role: 'tooltip' }, content)),
  };
});

vi.mock('../../../context/FilterContext', () => ({
  useFilterContext: () => ({ searchQuery: '', currentPage: 0, pageSize: 10 }),
}));

const rows: ReviewGridRow[] = [
  {
    botId: 'future-agent',
    botName: 'Future agent',
    overallScore: 0,
    totalIssueCount: 0,
    highSeverityCount: 0,
    status: 'not-reviewed',
    harness: 'unsupported',
  },
  {
    botId: 'classic-agent',
    botName: 'Classic agent',
    overallScore: 0,
    totalIssueCount: 0,
    highSeverityCount: 0,
    status: 'not-reviewed',
    harness: 'standard',
  },
];

function buttonTag(markup: string, ariaLabel: string): string | undefined {
  return markup.match(new RegExp(`<button[^>]*aria-label="${ariaLabel}"[^>]*>`))?.[0];
}

describe('BotsGrid unsupported harness (issue 947)', () => {
  const markup = renderToStaticMarkup(createElement(
    FluentProvider,
    { theme: webLightTheme },
    createElement(BotsGrid, { rows, onReview: vi.fn(), onView: vi.fn(), onReviewFromZip: vi.fn() }),
  ));

  it('shows the harness label of each agent', () => {
    expect(markup).toContain('>Unsupported harness<');
    expect(markup).toContain('>Standard<');
  });

  it('shows the exact message for the badge and for the Review button', () => {
    expect(markup.split(UNSUPPORTED_HARNESS_MESSAGE).length - 1).toBe(2);
  });

  it('keeps the Review button focusable but unavailable for an unsupported harness', () => {
    const unsupported = buttonTag(markup, 'Review is not available for Future agent');
    expect(unsupported).toBeDefined();
    expect(unsupported).toContain('aria-disabled="true"');
    expect(unsupported).not.toContain(' disabled=""');

    const standard = buttonTag(markup, 'Review connected agent Classic agent');
    expect(standard).toBeDefined();
    expect(standard).not.toContain('aria-disabled="true"');
  });
});
