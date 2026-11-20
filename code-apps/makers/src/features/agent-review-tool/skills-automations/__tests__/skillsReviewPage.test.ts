/**
 * Render-contract tests for the Skills and Automations review route.
 *
 * The third tab used to replace its own contents with the result, which left it
 * on the landing page URL with the tab strip still overhead and no breadcrumb
 * out — the same review looked like a different product depending on which tab
 * produced it. These tests hold the result to its own screen.
 *
 * Rendered through `react-dom/server` with `createElement`, so the file stays
 * `.ts` and needs no jsdom, matching `artifactResultsPanel.test.ts`. The query
 * cache is seeded directly rather than mocked, so the real hook is under test:
 * SSR never resolves a promise, but a pre-seeded cache resolves synchronously.
 */
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// The store reaches the generated service, which loads the Power Apps SDK — a
// subpath that node cannot resolve outside a PAC host. These tests seed the
// query cache instead of reading, so a stub is enough. Mirrors
// `artifactReviewStore.test.ts`.
vi.mock('../../../../generated/services/Cat_agentreviewsesService', () => ({
  Cat_agentreviewsesService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => ({ success: true, data: {} }),
    update: async () => ({ success: true, data: {} }),
    delete: async () => ({ success: true }),
  },
}));

import { SkillsReviewPage } from '../components/SkillsReviewPage';
import { artifactReviewQueryKey } from '../hooks/useArtifactReviewRecord';
import {
  RUBRIC_DIMENSION_IDS,
  type ArtifactReviewResult,
  type RubricDimensionScore,
} from '../contracts/ArtifactReview';
import type { StoredArtifactReview } from '../services/artifactReviewStore';

const REVIEW_ID = '11111111-2222-3333-4444-555555555555';

function dimensions(): RubricDimensionScore[] {
  return RUBRIC_DIMENSION_IDS.map((id) => ({
    id,
    score: 4,
    assessment: `Assessment for ${id}.`,
    evidence: 'evidence line',
  }));
}

function result(over: Partial<ArtifactReviewResult> = {}): ArtifactReviewResult {
  const score = { value: 80, status: 'complete' as const, coveragePercent: 100 };
  return {
    status: 'complete',
    artifactKind: 'skill',
    artifactName: 'expense-report',
    artifactHash: 'a'.repeat(64),
    selectedRuntimes: ['cowork'],
    scores: { quality: score, integrity: score, safety: score, readiness: score, safetyGate: 'none' },
    dimensions: dimensions(),
    runtimeVerdicts: [],
    findings: [],
    files: [],
    uncompressedBytes: 0,
    recommendation: 'submit',
    aiAvailable: true,
    reviewedAt: '2026-02-01T10:00:00.000Z',
    ...over,
  } as ArtifactReviewResult;
}

function stored(): StoredArtifactReview {
  return {
    reviewId: REVIEW_ID,
    componentIdUnique: 'a'.repeat(64),
    artifactName: 'expense-report',
    reviewedOn: '2026-02-01T10:00:00.000Z',
    result: result(),
  };
}

/**
 * Renders the page at its real route. `seed` writes straight into the cache so
 * the by-id query has an answer during a server render.
 */
function renderPage(options: {
  state?: unknown;
  seed?: (client: QueryClient) => void;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  options.seed?.(client);

  const tree: ReactElement = createElement(
    SSRProvider,
    null,
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        {
          initialEntries: [
            { pathname: `/agent-review-tool/skills/${REVIEW_ID}`, state: options.state ?? null },
          ],
        },
        createElement(SkillsReviewPage, { reviewId: REVIEW_ID }),
      ),
    ),
  );

  return renderToStaticMarkup(tree);
}

describe('SkillsReviewPage', () => {
  it('paints a review handed over in router state without waiting for a read', () => {
    const html = renderPage({ state: { result: result() } });

    expect(html).toContain('expense-report');
    // A spinner here would mean the result in hand was ignored and the reader
    // was made to wait for the row that was just written.
    expect(html).not.toContain('Loading saved review');
  });

  it('leads back to the review tool through a breadcrumb', () => {
    const html = renderPage({ state: { result: result() } });

    expect(html).toContain('Agent Review Tool');
    expect(html).toContain('aria-label="Navigation"');
  });

  it('loads a review by id when nothing was handed over', () => {
    const html = renderPage({
      seed: (client) => client.setQueryData(artifactReviewQueryKey(REVIEW_ID), stored()),
    });

    expect(html).toContain('expense-report');
  });

  it('waits rather than claiming the review is missing while the read is open', () => {
    const html = renderPage();

    expect(html).toContain('Loading saved review');
    expect(html).not.toContain('This review is unavailable');
  });

  it('says the review is unavailable once the read comes back empty', () => {
    const html = renderPage({
      seed: (client) => client.setQueryData(artifactReviewQueryKey(REVIEW_ID), null),
    });

    expect(html).toContain('This review is unavailable');
  });
});
