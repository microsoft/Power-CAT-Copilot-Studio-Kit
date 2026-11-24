import { describe, expect, it } from 'vitest';
import { clampScore } from '../scoreDisplay';
import { scoreBand } from '../../../agents-experience/services/scoreBands';

/**
 * The bar is driven by persisted review payloads, some written by earlier
 * versions of the pipeline. A value outside 0–100, or a non-number, must not
 * overflow the track or paint an undefined tone.
 */
describe('clampScore', () => {
  it('passes ordinary scores through unchanged', () => {
    expect(clampScore(0)).toBe(0);
    expect(clampScore(72)).toBe(72);
    expect(clampScore(100)).toBe(100);
  });

  it('clamps values outside the track', () => {
    expect(clampScore(-15)).toBe(0);
    expect(clampScore(140)).toBe(100);
  });

  it('treats any non-finite payload value as zero rather than claiming a score', () => {
    // 0 rather than 100: a malformed payload must never be presented as a
    // perfect result. An unknown score reads as failing, not as passing.
    expect(clampScore(Number.NaN)).toBe(0);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampScore(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('always yields a value the band mapping can tone', () => {
    for (const raw of [Number.NaN, -1, 0, 49, 50, 79, 80, 100, 1000]) {
      expect(['green', 'amber', 'red']).toContain(scoreBand(clampScore(raw)));
    }
  });
});
