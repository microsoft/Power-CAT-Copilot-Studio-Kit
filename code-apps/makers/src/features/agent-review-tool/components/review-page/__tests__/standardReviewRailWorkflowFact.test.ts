// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewResult } from '../../../contracts/ReviewResult';
import { createReportReview } from '../../../utils/__tests__/csPdfFixtures';
import { StandardReviewPage } from '../StandardReviewPage';

const state = vi.hoisted(() => ({ review: undefined as ReviewResult | undefined }));

vi.mock('../../../hooks/useStandardReview', () => ({
  useStandardReview: () => ({
    review: state.review,
    isLoading: false,
    isLoadingDetails: false,
    isError: false,
    error: undefined,
    notFound: false,
  }),
}));
vi.mock('../../../hooks/useBotPublication', () => ({ useBotPublication: () => ({ data: undefined }) }));
vi.mock('../../../context/standardReviewRunnerContext', () => ({
  useStandardReviewRunner: () => ({ isRunning: false, start: vi.fn() }),
}));
vi.mock('../../../hooks/useStandardReviewExports', () => ({
  useStandardReviewExports: () => ({
    downloadPdfReport: vi.fn(),
    downloadPublicPdfReport: vi.fn(),
    downloadSarifReport: vi.fn(),
    isPdfDownloading: false,
    isSarifDownloading: false,
    isExporting: false,
  }),
}));
vi.mock('../StandardFindingsWorkspace', () => ({ StandardFindingsWorkspace: () => null }));
vi.mock('../StandardAgentMapWorkspace', () => ({ StandardAgentMapWorkspace: () => null }));
vi.mock('../../dialogs/CSAgentDetailsDrawer', () => ({ CSAgentDetailsDrawer: () => null }));
vi.mock('../../history/ReviewHistory', () => ({ ReviewHistory: () => null }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  state.review = createReportReview();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Standard review summary rail', () => {
  it('aligns the wrapped Workflow result lines to the right edge, as the other values', async () => {
    await act(async () => root.render(createElement(
      MemoryRouter,
      { initialEntries: ['/agent-review-tool/standard/synthetic-agent?reviewId=synthetic-review'] },
      createElement(
        FluentProvider,
        { theme: webLightTheme },
        createElement(StandardReviewPage, {
          botId: 'synthetic-agent',
          reviewId: 'synthetic-review',
          sourceEnvironment: 'zip',
        }),
      ),
    )));

    const rail = container.querySelector<HTMLElement>('aside[aria-label="Review summary"]');
    expect(rail, 'Review summary rail').not.toBeNull();
    const badge = [...rail!.querySelectorAll<HTMLElement>('.fui-Badge')]
      .find(node => node.textContent === 'Workflow verified');
    expect(badge, 'Workflow verified badge').toBeDefined();
    const workflowValue = badge!.parentElement!;
    expect(workflowValue.textContent).toBe('Workflow verified1 of 1 result units');
    expect(getComputedStyle(workflowValue).flexWrap).toBe('wrap');
    expect(getComputedStyle(workflowValue).justifyContent).toBe('flex-end');
    expect(getComputedStyle(workflowValue).textAlign).toBe('right');

    const rowOf = (label: string) => [...rail!.querySelectorAll<HTMLElement>('span')]
      .find(node => node.textContent === label && node.nextElementSibling)?.parentElement;
    expect(getComputedStyle(rowOf('Workflow result')!).alignItems).toBe('baseline');
    for (const label of ['Agent', 'Reviewed', 'Reviewed by']) {
      expect(getComputedStyle(rowOf(label)!).alignItems, label).toBe('center');
    }
  });
});
