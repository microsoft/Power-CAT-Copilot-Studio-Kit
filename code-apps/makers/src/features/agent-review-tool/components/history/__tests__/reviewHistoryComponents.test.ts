import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const historySource = readFileSync(
  new URL('../ReviewHistory.tsx', import.meta.url),
  'utf8',
);
const gridSource = readFileSync(
  new URL('../ReviewHistoryGrid.tsx', import.meta.url),
  'utf8',
);
const cardsSource = readFileSync(
  new URL('../ReviewHistoryCards.tsx', import.meta.url),
  'utf8',
);
const paginationSource = readFileSync(
  new URL('../ReviewHistoryPagination.tsx', import.meta.url),
  'utf8',
);
const presentationSource = readFileSync(
  new URL('../reviewHistoryPresentation.ts', import.meta.url),
  'utf8',
);
const standardRouteSource = readFileSync(
  new URL('../../review-page/StandardReviewRoute.tsx', import.meta.url),
  'utf8',
);
const standardHookSource = readFileSync(
  new URL('../../../hooks/useStandardReview.ts', import.meta.url),
  'utf8',
);
const standardPageSource = readFileSync(
  new URL('../../review-page/StandardReviewPage.tsx', import.meta.url),
  'utf8',
);
const viewHookSource = readFileSync(
  new URL('../../../hooks/useReviewHistoryView.ts', import.meta.url),
  'utf8',
);
const standardMutationSource = readFileSync(
  new URL('../../../hooks/useReviewMutation.ts', import.meta.url),
  'utf8',
);
const copilotMutationSource = readFileSync(
  new URL('../../../agents-experience/hooks/useCopilotReviewMutation.ts', import.meta.url),
  'utf8',
);
const botsGridSource = readFileSync(
  new URL('../../grids/BotsGrid.tsx', import.meta.url),
  'utf8',
);
const fluentGridSource = readFileSync(
  new URL('../../../../../shared/components/FluentDataGrid.tsx', import.meta.url),
  'utf8',
);

describe('review history component contract', () => {
  it('defaults to List and feeds both views from one controlled page slice', () => {
    expect(viewHookSource).toContain("useState<ReviewHistoryViewMode>('list')");
    expect(historySource).toContain('entries={view.pageEntries}');
    expect(historySource.match(/entries=\{view\.pageEntries\}/g)).toHaveLength(2);
  });

  it('does not couple history to dashboard FilterContext or review mutations', () => {
    const combined = `${historySource}\n${gridSource}\n${cardsSource}`;
    expect(combined).not.toContain('useFilterContext');
    expect(combined).not.toContain('useReviewMutation');
    expect(combined).not.toContain('useCopilotReviewMutation');
  });

  it('uses Fluent DataGrid and interactive card semantics', () => {
    expect(gridSource).toContain('<FluentDataGrid');
    expect(cardsSource).toContain('<Card');
    expect(cardsSource).toContain('role="button"');
    expect(cardsSource).toContain('ReviewFreshnessBadge freshness={entry.freshness}');
    expect(cardsSource).not.toContain('<CardPreview');
  });

  it('matches the home-grid pagination layout without numbered buttons', () => {
    expect(paginationSource).toContain('Items per page');
    expect(paginationSource).toContain('Previous');
    expect(paginationSource).toContain('Next');
    expect(paginationSource).not.toContain("'primary'");
    expect(paginationSource).not.toContain('Go directly to a page');
    expect(paginationSource).toContain('aria-live="polite"');
  });

  it('keeps history actions neutral and shows compact score-only values', () => {
    expect(gridSource).toContain('appearance="subtle"');
    expect(gridSource).not.toContain("appearance={entry.reviewId");
    expect(presentationSource).not.toContain('Legacy');
    expect(gridSource).not.toContain("label: 'Reviewer'");
    expect(cardsSource).not.toContain('Unknown reviewer');
    expect(historySource).toContain('aria-label="Show review history as a list"');
    expect(historySource).toContain('aria-label="Show review history as cards"');
    expect(historySource).toContain('appearance="subtle"');
    expect(historySource).toContain('List20Filled');
    expect(historySource).toContain('Grid20Filled');
  });

  it('supports native Fluent column resizing', () => {
    expect(fluentGridSource).toContain('resizableColumns');
    expect(fluentGridSource).toContain(
      'columnSizingOptions={columnSizingOptions}',
    );
  });

  it('selects Standard persisted results by exact review ID', () => {
    expect(standardRouteSource).toContain("const reviewId = search.get('reviewId');");
    expect(standardRouteSource).toContain('reviewId={reviewId}');
    expect(standardHookSource).toContain(
      'list.data?.find((review) => review.reviewId === reviewId)',
    );
  });

  it('keeps the home-grid View action tied to completed stored reviews', () => {
    expect(botsGridSource).toContain(
      "const canView = row.status === 'completed' && !!row.hasReviewData;",
    );
    expect(botsGridSource).not.toContain("'Version unknown'");
  });

  it('uses the shared subject key for history invalidation', () => {
    expect(standardMutationSource).toContain('getReviewSubjectKey(input)');
    expect(copilotMutationSource).toContain('getReviewSubjectKey(input)');
  });

  it('guards Standard latest-version review while a review is running', () => {
    expect(standardPageSource).toContain('isReviewing={standardRunner.isRunning}');
    expect(standardPageSource).toContain('disabled={isReviewing}');
  });

  it('focuses a real heading when Version history replaces the review surface', () => {
    expect(standardPageSource).toContain('historyHeadingRef.current?.focus()');
    expect(standardPageSource).toContain('<h1 ref={historyHeadingRef} tabIndex={-1} className={styles.historyTitle}>Version history</h1>');
  });
});
