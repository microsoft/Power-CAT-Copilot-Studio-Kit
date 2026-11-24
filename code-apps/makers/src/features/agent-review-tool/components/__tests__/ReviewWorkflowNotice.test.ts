import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, type FetchQueryOptions } from '@tanstack/react-query';
import type { ReviewWorkflowAvailability } from '../../services/ReviewWorkflowAvailabilityService';

const { useQuery, getAvailability, useMediaQuery } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getAvailability: vi.fn(),
  useMediaQuery: vi.fn(),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery,
}));
vi.mock('../../services/ReviewWorkflowAvailabilityService', () => ({
  getReviewWorkflowAvailability: getAvailability,
}));
vi.mock('../../shared/review-shell/useMediaQuery', () => ({ useMediaQuery }));

import { ReviewWorkflowNotice, ReviewWorkflowRouteNotice } from '../ReviewWorkflowNotice';

const setupGuideUrl = 'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENTREVIEWTOOL_REFERENCE_GUIDE.md#set-up-agent-review-with-the-setup-wizard-and-installer';

const missing: ReviewWorkflowAvailability = {
  status: 'missing-addon',
  installation: 'absent',
  connectionReadiness: 'not-verified',
  message: 'The Agent Review Workflow add-on is not installed. Saved reviews remain available.',
};

beforeEach(() => {
  vi.clearAllMocks();
  getAvailability.mockReset();
  useMediaQuery.mockReturnValue(true);
  useQuery.mockReturnValue({
    data: missing,
    isPending: false,
    isFetching: false,
    isFetchedAfterMount: true,
    refetch: vi.fn(),
  });
});

describe('ReviewWorkflowNotice', () => {
  it('shows a permanent accessible warning and an explicit retry action', () => {
    const html = renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('Agent Review Workflow add-on is not installed');
    expect(html).toContain('Saved reviews remain available');
    expect(html).toContain('Check again');
    expect(html).not.toContain('Dismiss');
  });

  it('keeps the retry action beside the message on wide screens', () => {
    const html = renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    expect(html).toContain('fui-MessageBarActions__containerAction');
    expect(html).toContain('Check again');
  });

  it('lets the retry action reflow below the message on narrow screens', () => {
    useMediaQuery.mockReturnValue(false);
    const html = renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    expect(html).not.toContain('fui-MessageBarActions__containerAction');
    expect(html).toContain('Check again');
  });

  it.each([true, false])('wraps the whole message when wide layout is %s', (isWide) => {
    useMediaQuery.mockReturnValue(isWide);
    const html = renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    expect(html).toContain('fui-MessageBar__bottomReflowSpacer');
    expect(html).toContain('Saved reviews remain available');
  });

  it('links to the stable setup section in a safe, named new tab', () => {
    const html = renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    expect(html).toContain(`href="${setupGuideUrl}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Agent Review setup guide (opens in a new tab)');
  });

  it('keeps the retry action disabled while the check is running', () => {
    useQuery.mockReturnValue({
      data: missing,
      isPending: false,
      isFetching: true,
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    expect(html).toContain('Checking...');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('Check again');
  });

  it('does not show a warning while the first check is pending', () => {
    useQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isFetching: true,
    });
    expect(renderToStaticMarkup(createElement(ReviewWorkflowNotice))).toBe('');
  });

  it.each([true, false])('never shows a cached failure from an earlier mount while fetching is %s', (isFetching) => {
    useQuery.mockReturnValue({
      data: { ...missing, status: 'unverifiable' },
      isPending: false,
      isFetching,
      isFetchedAfterMount: false,
    });
    expect(renderToStaticMarkup(createElement(ReviewWorkflowNotice))).toBe('');
  });

  it('checks again on every mount even when the cache has data', () => {
    renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    expect(useQuery.mock.calls[0][0]).toMatchObject({
      staleTime: 0,
      refetchOnMount: 'always',
    });
  });

  it('retries two transient host failures before publishing the current result', async () => {
    const unavailable = { ...missing, status: 'unverifiable', detail: 'The host is not ready.' };
    getAvailability.mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce({ ...missing, status: 'available' });
    renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    const options = useQuery.mock.calls[0][0] as FetchQueryOptions;
    const client = new QueryClient();
    try {
      await expect(client.fetchQuery({ ...options, retryDelay: 0 }))
        .resolves.toMatchObject({ status: 'available' });
      expect(getAvailability).toHaveBeenCalledTimes(3);
    } finally {
      client.clear();
    }
  });

  it('reports an unverifiable check only after both retries fail', async () => {
    const unavailable = { ...missing, status: 'unverifiable', detail: 'Permission check failed.' };
    getAvailability.mockResolvedValue(unavailable);
    renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    const options = useQuery.mock.calls[0][0] as FetchQueryOptions;
    const client = new QueryClient();
    try {
      await expect(client.fetchQuery({ ...options, retryDelay: 0 }))
        .resolves.toEqual(unavailable);
      expect(getAvailability).toHaveBeenCalledTimes(3);
    } finally {
      client.clear();
    }
  });

  it('does not retry a confirmed setup condition', async () => {
    getAvailability.mockResolvedValue(missing);
    renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    const options = useQuery.mock.calls[0][0] as FetchQueryOptions;
    const client = new QueryClient();
    try {
      await expect(client.fetchQuery({ ...options, retryDelay: 0 })).resolves.toEqual(missing);
      expect(getAvailability).toHaveBeenCalledOnce();
    } finally {
      client.clear();
    }
  });

  it('does not hide a current failed check behind a cached available result', () => {
    useQuery.mockReturnValue({
      data: { ...missing, status: 'available' },
      isPending: false,
      isFetching: false,
      isFetchedAfterMount: true,
      isError: true,
      error: new Error('The current check failed.'),
    });
    expect(renderToStaticMarkup(createElement(ReviewWorkflowNotice)))
      .toContain('Unable to verify Agent Review');
  });

  it('does not advertise setup or healthy connections from an active workflow', () => {
    useQuery.mockReturnValue({
      data: { ...missing, status: 'available', installation: 'legacy' },
      isPending: false,
      isFetching: false,
    });
    expect(renderToStaticMarkup(createElement(ReviewWorkflowNotice))).toBe('');
  });

  it('does not label a failed check as a missing add-on', () => {
    useQuery.mockReturnValue({
      data: {
        ...missing,
        status: 'unverifiable',
        installation: 'unverifiable',
        message: 'Agent Review availability could not be verified.',
        detail: 'Permission check failed.',
      },
      isPending: false,
      isFetching: false,
    });
    const html = renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    expect(html).toContain('Unable to verify Agent Review');
    expect(html).toContain('Check details');
    expect(html).toContain(`href="${setupGuideUrl}"`);
    expect(html).not.toContain('not installed');
  });

  it('reports a query error as unverifiable rather than setup required', () => {
    useQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isFetching: false,
      error: new Error('Network request failed'),
    });
    const html = renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    expect(html).toContain('Unable to verify Agent Review');
    expect(html).not.toContain('Agent Review setup required');
  });

  it('does not show a setup-required title in government clouds', () => {
    useQuery.mockReturnValue({
      data: { ...missing, status: 'unsupported-cloud', message: 'Agent Review is not available in GCC.' },
      isPending: false,
      isFetching: false,
    });
    const html = renderToStaticMarkup(createElement(ReviewWorkflowNotice));
    expect(html).toContain('Agent Review unavailable');
    expect(html).not.toContain('Agent Review setup required');
    expect(html).not.toContain(setupGuideUrl);
  });

  it.each([
    '/agent-review-tool',
    '/agent-review-tool/standard/bot',
    '/agent-review-tool/copilot/bot',
    '/agent-review-tool/declarative/review',
    '/agent-review-tool/skills/review',
  ])('covers direct route %s without redirecting it', (path) => {
    const html = renderToStaticMarkup(createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(ReviewWorkflowRouteNotice),
    ));
    expect(html).toContain('add-on is not installed');
  });

  it('does not run the availability query on unrelated pages', () => {
    const html = renderToStaticMarkup(createElement(
      MemoryRouter,
      { initialEntries: ['/adaptive-cards'] },
      createElement(ReviewWorkflowRouteNotice),
    ));
    expect(html).toBe('');
    expect(useQuery).not.toHaveBeenCalled();
  });
});
