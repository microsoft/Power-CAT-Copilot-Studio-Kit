import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import {
  RendererProvider,
  createDOMRenderer,
  renderToStyleElements,
} from '@griffel/react';
import { prettyModelSeries } from '../services/modelDisplay';
import { skillScorePercent, normalizedDimensionScore } from '../components/skillHelpers';
import { SummaryRail } from '../components/SummaryRail';
import { SkillScoreStrip } from '../components/SkillScoreStrip';
import { SkillDrillView } from '../components/skills/SkillDrill';
import type { ReviewSummaryView, SkillBundleScoresView, SkillView } from '../components/viewTypes';

describe('prettyModelSeries — matches the Copilot Studio model picker', () => {
  // All three shapes occur in live agent configuration.
  it.each([
    ['claude-opus-5', 'Claude Opus 5'],
    ['claude-sonnet-5', 'Claude Sonnet 5'],
    ['claude-opus-4-8', 'Claude Opus 4.8'],
    ['Sonnet46', 'Claude Sonnet 4.6'],
    ['Opus5', 'Claude Opus 5'],
    ['GPT5Chat', 'GPT-5 Chat'],
    ['GPT56Reasoning', 'GPT-5.6 Reasoning'],
  ])('%s -> %s', (input, expected) => {
    expect(prettyModelSeries(input)).toBe(expected);
  });

  it('returns an unrecognised series untouched rather than inventing a name', () => {
    expect(prettyModelSeries('some-future-model-x')).toBe('Some Future Model X');
    expect(prettyModelSeries('Mystery')).toBe('Mystery');
    expect(prettyModelSeries('')).toBe('');
  });
});

describe('dimension score normalisation — the >100% grade bug', () => {
  it('scales a 0-100 score onto the 0-10 rubric', () => {
    // The model answers 90 meaning 9.0; unscaled this rendered as "90/10".
    expect(normalizedDimensionScore(90)).toBe(9);
    expect(normalizedDimensionScore(85)).toBe(8.5);
  });

  it('leaves a correct 0-10 score alone', () => {
    expect(normalizedDimensionScore(9)).toBe(9);
    expect(normalizedDimensionScore(0)).toBe(0);
    expect(normalizedDimensionScore(10)).toBe(10);
  });

  it('clamps out-of-range and non-finite values', () => {
    expect(normalizedDimensionScore(9999)).toBe(10);
    expect(normalizedDimensionScore(-5)).toBe(0);
    expect(normalizedDimensionScore(Number.NaN)).toBe(0);
  });

  const skill = (scores: number[]): SkillView =>
    ({
      dimensions: scores.map((score, i) => ({ key: `d${i}`, score, rationale: '' })),
    }) as unknown as SkillView;

  it('never reports a grade above 100%', () => {
    // Observed in production: 630% average quality on ZAVA Visual Merchandiser.
    expect(skillScorePercent(skill([90, 85, 92, 15]))).toBeLessThanOrEqual(100);
  });

  it('grades a 0-100 payload the same as its 0-10 equivalent', () => {
    expect(skillScorePercent(skill([90, 80, 70, 60]))).toBe(skillScorePercent(skill([9, 8, 7, 6])));
  });

  it('still returns null when there is no real grade', () => {
    expect(skillScorePercent(skill([]))).toBeNull();
  });

  it('renders legacy dimension progress at its normalized percentage', () => {
    const legacySkill: SkillView = {
      id: 'legacy-skill',
      schemaName: 'legacy.skill',
      name: 'Legacy skill',
      description: 'Legacy persisted review.',
      source: 'Uploaded',
      safetyFlagged: false,
      sizeLabel: '1 KB',
      dimensions: [{ key: 'Clarity', score: 68, rationale: 'Partially clear.' }],
      evaluationState: 'complete',
      markdown: '',
    };

    const html = renderToStaticMarkup(
      createElement(
        FluentProvider,
        { theme: webLightTheme },
        createElement(SkillDrillView, {
          skill: legacySkill,
          backLabel: 'Clarity',
          onBack: () => undefined,
        }),
      ),
    );

    expect(html).toContain('style="width:68%');
    expect(html).not.toContain('style="width:680%');
  });
});

describe('skill score strip responsiveness', () => {
  it('reflows narrow cards and keeps badge text on one line', () => {
    const score = { value: 100, status: 'complete' as const, coveragePercent: 100 };
    const scores: SkillBundleScoresView = {
      quality: score,
      integrity: score,
      safety: { value: null, status: 'unavailable', coveragePercent: 100 },
      readiness: score,
      safetyGate: 'none',
    };
    const renderer = createDOMRenderer();

    renderToStaticMarkup(
      createElement(
        RendererProvider,
        { renderer },
        createElement(
          FluentProvider,
          { theme: webLightTheme },
          createElement(SkillScoreStrip, { scores }),
        ),
      ),
    );
    const css = renderToStyleElements(renderer)
      .map(element => String(element.props.dangerouslySetInnerHTML?.__html ?? ''))
      .join('\n');

    expect(css).toMatch(/grid-template-columns:repeat\(auto-fit,\s*minmax\(10rem,\s*1fr\)\)/);
    expect(css).toContain('white-space:nowrap');
  });
});

describe('review reference summary', () => {
  it('does not show citation sources with a zero count', () => {
    const summary: ReviewSummaryView = {
      agentName: 'ZAVA Visual Merchandiser',
      score: 80,
      passed: 1,
      warnings: 0,
      errors: 0,
      infos: 0,
      notApplicable: 0,
      countsAreChecks: true,
      rulesEvaluated: 1,
      model: 'GPT-5.6',
      memoryEnabled: false,
      webSearchEnabled: false,
      duration: '00:01',
      reviewedBy: 'Tester',
      refCounts: { learn: 22, owasp: 0, anthropic: 0, mitreCwe: 0 },
      capabilitiesCovered: 0,
      capabilitiesTotal: 0,
      testCases: 0,
      multiTurnCases: 0,
      graders: 'None',
      evaluationSets: 0,
    };

    const html = renderToStaticMarkup(
      createElement(SSRProvider, null, createElement(SummaryRail, { summary })),
    );

    expect(html).toContain('22');
    expect(html).toContain('Microsoft Learn');
    expect(html).not.toContain('OWASP');
    expect(html).not.toContain('Anthropic');
  });

  it('renders an unscored empty review as not applicable', () => {
    const summary: ReviewSummaryView = {
      agentName: 'Empty Agent',
      score: null,
      passed: 0,
      warnings: 0,
      errors: 0,
      infos: 0,
      notApplicable: 0,
      countsAreChecks: true,
      rulesEvaluated: 0,
      model: 'Default model',
      memoryEnabled: false,
      webSearchEnabled: false,
      duration: '00:00',
      reviewedBy: 'Tester',
      refCounts: { learn: 0, owasp: 0, anthropic: 0, mitreCwe: 0 },
      capabilitiesCovered: 0,
      capabilitiesTotal: 0,
      testCases: 0,
      multiTurnCases: 0,
      graders: 'None',
      evaluationSets: 0,
    };

    const html = renderToStaticMarkup(
      createElement(SSRProvider, null, createElement(SummaryRail, { summary })),
    );

    expect(html).toContain(
      'aria-label="Grounded configuration score is not applicable because no scored configuration is present"',
    );
    expect(html).toContain('N/A');
  });
});
