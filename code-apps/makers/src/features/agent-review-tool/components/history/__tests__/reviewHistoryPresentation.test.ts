import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import type { ReviewHistoryEntry } from '../../../contracts/ReviewResult';
import { ReviewHistoryCards } from '../ReviewHistoryCards';
import { ReviewHistoryGrid } from '../ReviewHistoryGrid';
import { reviewScoreLabel } from '../reviewHistoryPresentation';

function review(overrides: Partial<ReviewHistoryEntry> = {}): ReviewHistoryEntry {
  return {
    reviewId: 'synthetic-review', botId: 'synthetic-agent', botName: 'Synthetic agent',
    componentIdUnique: 'synthetic-component',
    reviewKind: 'standard', scoreState: 'measured', versionNumber: 1,
    freshness: 'version-unknown', overallScore: 80, patternScore: 80, instructionScore: 80,
    totalIssueCount: 0, highSeverityCount: 0, mediumSeverityCount: 0, lowSeverityCount: 0,
    reviewedOn: new Date('2026-01-02T10:00:00Z'), durationMs: 1, status: 'completed',
    ...overrides,
  };
}

function render<Props extends object>(component: ComponentType<Props>, props: Props): string {
  return renderToStaticMarkup(createElement(FluentProvider, { theme: webLightTheme }, createElement(component, props)));
}

describe('history score-label compatibility', () => {
  it.each([undefined, 0, 100])('labels an explicitly unassessed score without showing %s as measured', overallScore => {
    expect(reviewScoreLabel(review({ scoreState: 'not-assessed', overallScore }))).toBe('Not assessed');
  });

  it('preserves the existing N/A label for non-applicable Copilot scores', () => {
    expect(reviewScoreLabel(review({ reviewKind: 'copilot', scoreState: 'not-applicable' }))).toBe('N/A');
  });

  it.each(['standard', 'copilot'] as const)('preserves a measured zero for %s reviews', reviewKind => {
    expect(reviewScoreLabel(review({ reviewKind, overallScore: 0 }))).toBe('0%');
  });

  it('does not change a historical saved number with unknown scoring provenance', () => {
    expect(reviewScoreLabel(review({ scoreState: 'legacy-unknown', overallScore: 57 }))).toBe('57%');
  });

  it('does not show an explicitly unavailable legacy score as zero', () => {
    expect(reviewScoreLabel(review({
      scoreState: 'legacy-unknown',
      overallScore: 0,
      overallScoreApplicable: false,
    }))).toBe('Not assessed');
  });

  it.each([undefined, 0, 100])('renders unassessed history cards neutrally with stored score %s', overallScore => {
    const markup = render(ReviewHistoryCards, {
      entries: [review({ scoreState: 'not-assessed', overallScore })],
      selectedReviewId: null,
      onOpenReview: () => undefined,
    });
    const score = markup.match(/<span[^>]*>Not assessed<\/span>/)?.[0];
    expect(score).toBeDefined();
    expect(score).toContain('color:var(--colorNeutralForeground2)');
    expect(markup).toContain('score Not assessed');
    expect(markup).not.toContain('>0%<');
    expect(markup).not.toContain('>100%<');
    expect(markup).not.toContain('undefined%');
  });

  it('renders the same explicit label in the history list', () => {
    const markup = render(ReviewHistoryGrid, {
      entries: [review({ scoreState: 'not-assessed', overallScore: undefined })],
      selectedReviewId: null,
      sortColumn: 'overallScore',
      sortDirection: 'descending',
      onSortChange: () => undefined,
      onOpenReview: () => undefined,
    });
    expect(markup).toContain('>Not assessed<');
    expect(markup).not.toContain('undefined%');
    expect(markup).not.toContain('>N/A<');
    expect(markup).toContain('Stored issues');
    expect(markup).toContain('Stored high');
  });

  it('labels card counts as stored summaries without recalculating them', () => {
    const markup = render(ReviewHistoryCards, {
      entries: [review({ totalIssueCount: 234, highSeverityCount: 79 })],
      selectedReviewId: null, onOpenReview: () => undefined,
    });
    expect(markup).toContain('234 stored issues');
    expect(markup).toContain('79 stored high severity');
  });

  it('keeps non-applicable Copilot history cards neutral', () => {
    const markup = render(ReviewHistoryCards, {
      entries: [review({ reviewKind: 'copilot', scoreState: 'not-applicable', overallScore: 100 })],
      selectedReviewId: null,
      onOpenReview: () => undefined,
    });
    const score = markup.match(/<span[^>]*>N\/A<\/span>/)?.[0];
    expect(score).toContain('color:var(--colorNeutralForeground2)');
    expect(markup).toContain('score N/A');
    expect(markup).not.toContain('>100%<');
  });
});
