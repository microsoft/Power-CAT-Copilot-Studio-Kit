/**
 * Locks the merge both Standard review surfaces share.
 *
 * The Content Inventory gate turns on `ReviewDialogV2` and `StandardReviewPage`
 * exporting byte-identical PDF and SARIF. That holds because both hand the same
 * object to the same pure generators — so the composition of that object is the
 * single point where the two could silently diverge.
 */

import { describe, it, expect } from 'vitest';
import { composeReviewResult } from '../composeReviewResult';
import type { ReviewResult } from '../../contracts/ReviewResult';

const base = {
  reviewId: 'r-1',
  botId: 'b-1',
  botName: 'Contoso HR Assistant',
  overallScore: 82,
} as unknown as ReviewResult;

describe('composeReviewResult', () => {
  it('returns null when there is no record yet', () => {
    expect(composeReviewResult(null, undefined)).toBeNull();
    expect(composeReviewResult(undefined, { overallScore: 99 })).toBeNull();
  });

  it('returns the bare record while stage outputs are still in flight', () => {
    // The summary must render during the details fetch. Returning null here
    // would put a spinner over a record the surface already holds.
    expect(composeReviewResult(base, undefined)).toBe(base);
    expect(composeReviewResult(base, null)).toBe(base);
  });

  it('lets stage outputs win over the list projection', () => {
    // The list row and the detail blob can both carry a field. The detail blob
    // is the fuller record, so it must be the one that survives.
    const merged = composeReviewResult(base, { overallScore: 91 } as Partial<ReviewResult>);
    expect(merged?.overallScore).toBe(91);
  });

  it('keeps record fields the stage outputs do not carry', () => {
    const merged = composeReviewResult(base, { overallScore: 91 } as Partial<ReviewResult>);
    expect(merged?.botName).toBe('Contoso HR Assistant');
    expect(merged?.reviewId).toBe('r-1');
  });

  it('does not mutate either input', () => {
    const details = { overallScore: 91 } as Partial<ReviewResult>;
    const snapshot = JSON.stringify(base);
    composeReviewResult(base, details);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(details).toEqual({ overallScore: 91 });
  });

  it('retains saved availability and date when partial details omit their values', () => {
    const reviewedOn = new Date('2025-01-02T00:00:00Z');
    const merged = composeReviewResult({ ...base, patternScoreApplicable: false, reviewedOn }, {
      patternScoreApplicable: undefined, reviewedOn: undefined, instructionScoreApplicable: false,
    });
    expect(merged?.patternScoreApplicable).toBe(false);
    expect(merged?.instructionScoreApplicable).toBe(false);
    expect(merged?.reviewedOn).toBe(reviewedOn);
  });

  it('produces an identical object from identical inputs', () => {
    // The property the export parity rests on: the dialog and the page compose
    // from the same two queries, so they must arrive at the same value.
    const details = { overallScore: 91, botName: 'Renamed' } as Partial<ReviewResult>;
    expect(composeReviewResult(base, details)).toEqual(composeReviewResult(base, details));
  });
});
