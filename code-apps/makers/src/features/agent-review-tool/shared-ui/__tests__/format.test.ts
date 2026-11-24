/**
 * Tests for the formatting shared by both review apps.
 *
 * These are the rules that decide whether two apps look like one product, and they are the only
 * part of `shared-ui` that can be tested in this app's `node` environment — the components
 * themselves are presentational and have no logic worth asserting without a DOM.
 */

import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatDuration,
  formatPercent,
  pluralize,
  toneForScore,
} from '../format';

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(1234)).toBe((1234).toLocaleString());
  });

  it('rounds rather than truncating', () => {
    expect(formatCount(2.6)).toBe('3');
  });

  // A count that cannot be computed must not render as a confident zero.
  it('renders a dash for values that are not finite', () => {
    expect(formatCount(Number.NaN)).toBe('—');
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('keeps millisecond precision below a second', () => {
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(940)).toBe('940 ms');
  });

  it('switches to one decimal of seconds at a second', () => {
    expect(formatDuration(1000)).toBe('1.0 s');
    expect(formatDuration(15200)).toBe('15.2 s');
  });

  it('switches to minutes at a minute', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(95000)).toBe('1m 35s');
  });

  // A negative duration is a bug upstream; showing "-3 ms" would hide it behind plausible output.
  it('refuses negative and non-finite input', () => {
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('drops a trailing zero decimal', () => {
    expect(formatPercent(9)).toBe('9%');
    expect(formatPercent(9.04)).toBe('9%');
  });

  it('keeps one decimal when it carries information', () => {
    expect(formatPercent(8.62)).toBe('8.6%');
  });

  // Every percentage in these contracts is 0-100. A 0-1 fraction arriving here would render as
  // "1%" and look entirely reasonable, so the boundary is asserted rather than assumed.
  it('treats its input as 0-100, not a fraction', () => {
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent(0.5)).toBe('0.5%');
  });
});

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'occurrence')).toBe('1 occurrence');
  });

  it('uses the plural for zero and for many', () => {
    expect(pluralize(0, 'occurrence')).toBe('0 occurrences');
    expect(pluralize(3, 'occurrence')).toBe('3 occurrences');
  });

  it('accepts an irregular plural', () => {
    expect(pluralize(2, 'analysis', 'analyses')).toBe('2 analyses');
  });
});

describe('toneForScore', () => {
  it('bands scores at 80 and 60', () => {
    expect(toneForScore(80)).toBe('good');
    expect(toneForScore(79.9)).toBe('fair');
    expect(toneForScore(60)).toBe('fair');
    expect(toneForScore(59.9)).toBe('poor');
  });

  // An absent score is "not known yet", which must not be coloured as a failure.
  it('does not report an unknown score as poor', () => {
    expect(toneForScore(undefined)).toBe('fair');
    expect(toneForScore(Number.NaN)).toBe('fair');
  });
});
