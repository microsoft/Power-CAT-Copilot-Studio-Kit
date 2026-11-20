import { describe, expect, it } from 'vitest';
import type { ReviewResult } from '../../contracts/ReviewResult';
import {
  getReviewFreshness,
  getReviewSubjectKey,
  selectLatestReviews,
  sortReviewsNewestFirst,
} from '../reviewHistory';

function review(
  reviewId: string,
  reviewedOn: string,
  overrides: Partial<ReviewResult> = {},
): ReviewResult {
  return {
    reviewId,
    botId: 'bot-1',
    componentIdUnique: 'component-1',
    botName: 'Agent',
    overallScore: 80,
    patternScore: 80,
    instructionScore: 80,
    highSeverityCount: 0,
    mediumSeverityCount: 0,
    lowSeverityCount: 0,
    totalIssueCount: 0,
    reviewedOn: new Date(reviewedOn),
    durationMs: 1,
    status: 'completed',
    sourceEnvironment: '',
    ...overrides,
  };
}

describe('review history utilities', () => {
  it('uses bot identity for live reviews and component identity for ZIP reviews', () => {
    expect(getReviewSubjectKey({
      botId: 'bot-1',
      sourceEnvironment: 'https://org.crm.dynamics.com',
    })).toBe('https://org.crm.dynamics.com:bot:bot-1');

    expect(getReviewSubjectKey({
      botId: 'synthetic-id',
      componentIdUnique: 'component-1',
      sourceEnvironment: 'zip',
    })).toBe('zip:component-1');
  });

  it('orders by review date, created date, then review ID', () => {
    const reviews = [
      review('a', '2026-01-01T10:00:00Z', { createdOn: new Date('2026-01-01T10:01:00Z') }),
      review('c', '2026-01-01T10:00:00Z', { createdOn: new Date('2026-01-01T10:02:00Z') }),
      review('b', '2026-01-01T10:00:00Z', { createdOn: new Date('2026-01-01T10:02:00Z') }),
    ];

    expect(sortReviewsNewestFirst(reviews).map((item) => item.reviewId))
      .toEqual(['c', 'b', 'a']);
  });

  it('keeps one latest live and ZIP review per subject', () => {
    const latest = selectLatestReviews([
      review('live-old', '2026-01-01T00:00:00Z'),
      review('live-new', '2026-02-01T00:00:00Z'),
      review('zip-old', '2026-01-01T00:00:00Z', {
        botId: 'zip-a',
        componentIdUnique: 'zip-component',
        sourceEnvironment: 'zip',
      }),
      review('zip-new', '2026-03-01T00:00:00Z', {
        botId: 'zip-b',
        componentIdUnique: 'zip-component',
        sourceEnvironment: 'zip',
      }),
    ]);

    expect(latest.map((item) => item.reviewId)).toEqual(['zip-new', 'live-new']);
  });

  it('derives current, stale, unknown, and unpublished states', () => {
    expect(getReviewFreshness(
      '2026-01-01T00:00:00Z',
      new Date('2026-01-01T00:00:00Z'),
    )).toBe('current');
    expect(getReviewFreshness(
      '2026-01-01T00:00:00Z',
      new Date('2026-02-01T00:00:00Z'),
    )).toBe('stale');
    expect(getReviewFreshness(undefined, new Date())).toBe('version-unknown');
    expect(getReviewFreshness('2026-01-01T00:00:00Z', undefined)).toBe('not-published');
    expect(getReviewFreshness('2026-01-01T00:00:00Z', new Date(), 'zip'))
      .toBe('version-unknown');
  });
});
