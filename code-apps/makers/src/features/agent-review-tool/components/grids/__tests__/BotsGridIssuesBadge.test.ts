// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewGridRow } from '../../../contracts/ReviewResult';
import { BotsGrid } from '../BotsGrid';

vi.mock('../../../context/FilterContext', () => ({
  useFilterContext: () => ({ searchQuery: '', currentPage: 0, pageSize: 10 }),
}));

const HIGH_COUNTS = [7, 71, 123];

const rows: ReviewGridRow[] = HIGH_COUNTS.map(count => ({
  botId: `agent-${count}`,
  botName: `Agent ${count}`,
  overallScore: 70,
  totalIssueCount: count + 1,
  highSeverityCount: count,
  reviewedOn: new Date('2026-11-19T08:00:00Z'),
  status: 'completed',
  hasReviewData: true,
  harness: 'standard',
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('BotsGrid high-severity badge', () => {
  it.each(HIGH_COUNTS)('keeps the "%i high" badge on one line when the Issues column is narrow', async (count) => {
    await act(async () => root.render(createElement(
      FluentProvider,
      { theme: webLightTheme },
      createElement(BotsGrid, { rows, onReview: vi.fn(), onView: vi.fn(), onReviewFromZip: vi.fn() }),
    )));

    const badge = [...container.querySelectorAll<HTMLElement>('.fui-Badge')]
      .find(node => node.textContent === `${count} high`);
    expect(badge, `Badge "${count} high"`).toBeDefined();
    expect(getComputedStyle(badge!).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(badge!).flexShrink).toBe('0');

    const cell = badge!.parentElement!;
    const total = cell.firstElementChild as HTMLElement;
    expect(total.textContent).toBe(String(count + 1));
    expect(getComputedStyle(cell).flexWrap).toBe('nowrap');
    expect(getComputedStyle(total).flexShrink).toBe('0');
  });
});
