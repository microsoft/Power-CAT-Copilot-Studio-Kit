import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReviewSummaryRail } from '../ReviewSummaryRail';
import type { ReviewRailModel } from '../reviewShellTypes';

const sharedRailSource = readFileSync(
  fileURLToPath(new URL('../ReviewSummaryRail.tsx', import.meta.url)),
  'utf8',
);
const copilotRailSource = readFileSync(
  fileURLToPath(
    new URL('../../../agents-experience/components/SummaryRail.tsx', import.meta.url),
  ),
  'utf8',
);
const glowSource = readFileSync(
  fileURLToPath(new URL('../ReviewSummaryGlow.tsx', import.meta.url)),
  'utf8',
);

describe('review summary rail', () => {
  it('applies the shared glow to every review summary rail', () => {
    expect(sharedRailSource).toContain('REVIEW_SUMMARY_GLOW_CLASS');
    expect(copilotRailSource).toContain('REVIEW_SUMMARY_GLOW_CLASS');
  });

  describe('review summary score availability', () => {
    function renderRail(score: number | null, subScores: ReviewRailModel['subScores']) {
      return renderToStaticMarkup(createElement(ReviewSummaryRail, {
        model: {
          score, scoreLabel: 'Overall score', subScores, facts: [],
          scoreUnavailableReason: 'An overall score is not available for this review.',
        },
      }));
    }

    it('does not claim that every pillar is unassessed when only the saved overall score is unavailable', () => {
      const html = renderRail(null, [
        { label: 'Pattern score', percent: 24 },
        { label: 'Instructions score', percent: 61 },
      ]);

      expect(html).toContain('An overall score is not available for this review.');
      expect(html).not.toContain('No dimension could be assessed');
      expect(html).toContain('Pattern score 24 out of 100');
      expect(html).toContain('Instructions score 61 out of 100');
    });

    it('does not infer assessment scope when every saved score is unavailable', () => {
      const html = renderRail(null, [{ label: 'Pattern score', percent: null }]);

      expect(html).toContain('An overall score is not available for this review.');
      expect(html).not.toContain('No dimension could be assessed');
      expect(html).not.toContain('role="img"');
    });

    it('preserves a measured zero for shared review consumers', () => {
      const html = renderRail(0, [{ label: 'Pattern score', percent: 0 }]);

      expect(html).toContain('Overall score 0 out of 100');
      expect(html).toContain('Pattern score 0 out of 100');
      expect(html).not.toContain('An overall score is not available');
    });

    it('preserves the existing no-assessment explanation for other review consumers', () => {
      const html = renderToStaticMarkup(createElement(ReviewSummaryRail, {
        model: { score: null, scoreLabel: 'Overall score', facts: [] },
      }));

      expect(html).toContain('No dimension could be assessed, so this review carries no score.');
    });
  });

  it('runs one light-indigo animation for six seconds and respects reduced motion', () => {
    expect(glowSource).toContain('reviewSummaryIndigoGlow 6s ease-in-out 1');
    expect(glowSource).toContain('prefers-reduced-motion: reduce');
    expect(glowSource).toContain('tokens.colorBrandBackground2');
    expect(glowSource).toContain('tokens.colorBrandStroke2');
  });
});
