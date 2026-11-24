import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SkillScoreStrip } from '../components/SkillScoreStrip';
import type { SkillBundleScoresView } from '../components/viewTypes';

describe('Incomplete readiness score display', () => {
  it('does not display a green safety pass when no file was fully assessed', () => {
    const complete = { value: 90, status: 'complete' as const, coveragePercent: 100 };
    const scores: SkillBundleScoresView = {
      quality: complete,
      integrity: complete,
      safety: { value: null, status: 'unavailable', coveragePercent: 0 },
      readiness: { value: null, status: 'unavailable', coveragePercent: 0 },
      safetyGate: 'none',
    };
    const html = renderToStaticMarkup(createElement(SkillScoreStrip, { scores }));

    expect(html).not.toContain('Gate: pass');
  });

  it('does not announce null percent or render an empty score for partial readiness', () => {
    const complete = { value: 90, status: 'complete' as const, coveragePercent: 100 };
    const scores: SkillBundleScoresView = {
      quality: complete,
      integrity: complete,
      safety: complete,
      readiness: { value: null, status: 'partial', coveragePercent: 33 },
      safetyGate: 'none',
    };
    const html = renderToStaticMarkup(createElement(SkillScoreStrip, { scores }));

    expect(html).not.toContain('null%');
    expect(html).toContain('Operational readiness: unavailable, 33% coverage');
  });
});
