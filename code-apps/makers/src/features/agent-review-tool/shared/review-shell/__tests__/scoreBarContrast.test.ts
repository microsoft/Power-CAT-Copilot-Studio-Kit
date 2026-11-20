import { describe, expect, it } from 'vitest';
import { webLightTheme } from '@fluentui/react-components';
import { scoreBand } from '../../../agents-experience/services/scoreBands';

/**
 * The score bar is the only visual carrier of the band, so its fill must be
 * distinguishable from the track. WCAG 1.4.11 requires 3:1 for a graphic that
 * conveys meaning.
 *
 * `colorPaletteMarigoldBackground3` — the obvious choice for "caution", and
 * what `SummaryRail` still uses — measures 1.89:1 and fails. This test exists
 * so that swapping it back is caught rather than discovered in an audit.
 */

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const TRACK = webLightTheme.colorNeutralStroke3;
const MIN_GRAPHIC_CONTRAST = 3;

describe('score bar band colours', () => {
  it.each([
    ['green', webLightTheme.colorPaletteGreenBackground3],
    ['amber', webLightTheme.colorPaletteDarkOrangeBackground3],
    ['red', webLightTheme.colorPaletteRedBackground3],
  ])('%s fill meets WCAG 1.4.11 against the track', (_band, fill) => {
    expect(contrastRatio(fill, TRACK)).toBeGreaterThanOrEqual(MIN_GRAPHIC_CONTRAST);
  });

  it('records why marigold was rejected, so it is not reinstated', () => {
    expect(contrastRatio(webLightTheme.colorPaletteMarigoldBackground3, TRACK))
      .toBeLessThan(MIN_GRAPHIC_CONTRAST);
  });
});

describe('score band thresholds drive the bar tone', () => {
  it.each([
    [100, 'green'],
    [80, 'green'],
    [79, 'amber'],
    [50, 'amber'],
    [49, 'red'],
    [0, 'red'],
  ])('score %i reads as %s', (score, expected) => {
    expect(scoreBand(score)).toBe(expected);
  });
});
