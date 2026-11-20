/**
 * Unit tests for copilotReviewRouteState parsing and helpers (Task 11).
 *
 * Covers:
 * - Run route parsing
 * - View route parsing with reviewId
 * - View route without reviewId throws exact message
 * - Defaults (booleans default to false)
 * - Legacy `mode` parameters on old bookmarks are ignored, not rejected
 * - Navigation helper builders
 */
import { describe, it, expect } from 'vitest';
import {
  parseCopilotReviewRouteState,
  buildRunSearchParams,
  buildViewSearchParams,
} from '../utils/copilotReviewRouteState';

describe('parseCopilotReviewRouteState', () => {
  it('parses a run route with componentIdUnique', () => {
    const result = parseCopilotReviewRouteState(
      new URLSearchParams('run=1&componentIdUnique=33333333-3333-3333-3333-333333333333'),
    );
    expect(result).toEqual({
      run: true,
      view: false,
      componentIdUnique: '33333333-3333-3333-3333-333333333333',
      reviewId: null,
      agentVersion: null,
    });
  });

  it('ignores a legacy mode parameter from an old bookmark', () => {
    const result = parseCopilotReviewRouteState(
      new URLSearchParams('mode=deep&run=1&componentIdUnique=abc'),
    );
    expect(result).toEqual({
      run: true,
      view: false,
      componentIdUnique: 'abc',
      reviewId: null,
      agentVersion: null,
    });
  });

  it('parses a view route with reviewId', () => {
    const result = parseCopilotReviewRouteState(
      new URLSearchParams('view=1&reviewId=44444444-4444-4444-4444-444444444444'),
    );
    expect(result).toEqual({
      run: false,
      view: true,
      componentIdUnique: null,
      reviewId: '44444444-4444-4444-4444-444444444444',
      agentVersion: null,
    });
  });

  it('throws exact message when view=1 without reviewId', () => {
    expect(() =>
      parseCopilotReviewRouteState(new URLSearchParams('view=1')),
    ).toThrow('Persisted review ID is required for view mode');
  });

  it('throws when both run=1 and view=1 are set', () => {
    expect(() =>
      parseCopilotReviewRouteState(
        new URLSearchParams('run=1&view=1&componentIdUnique=abc&reviewId=xyz'),
      ),
    ).toThrow('Cannot specify both run and view modes');
  });

  it('throws when run=1 without componentIdUnique', () => {
    expect(() =>
      parseCopilotReviewRouteState(new URLSearchParams('run=1')),
    ).toThrow('componentIdUnique is required for run mode');
  });

  it('returns all false/null for empty params', () => {
    const result = parseCopilotReviewRouteState(new URLSearchParams(''));
    expect(result).toEqual({
      run: false,
      view: false,
      componentIdUnique: null,
      reviewId: null,
      agentVersion: null,
    });
  });
});

describe('buildRunSearchParams', () => {
  it('produces valid run-mode search string without a depth parameter', () => {
    const qs = buildRunSearchParams(
      'My Agent',
      'comp-id',
      null,
      null,
      '2026-08-25T10:00:00Z',
    );
    const parsed = new URLSearchParams(qs);
    expect(parsed.get('name')).toBe('My Agent');
    expect(parsed.get('run')).toBe('1');
    expect(parsed.get('componentIdUnique')).toBe('comp-id');
    expect(parsed.get('agentVersion')).toBe('2026-08-25T10:00:00Z');
    expect(parsed.get('mode')).toBeNull();
  });
});

describe('buildViewSearchParams', () => {
  it('produces valid view-mode search string', () => {
    const qs = buildViewSearchParams('Bot A', 'review-123');
    const parsed = new URLSearchParams(qs);
    expect(parsed.get('name')).toBe('Bot A');
    expect(parsed.get('view')).toBe('1');
    expect(parsed.get('reviewId')).toBe('review-123');
  });
});
