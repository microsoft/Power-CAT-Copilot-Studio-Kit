import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScoreHint } from '../ScoreHint';
import { STANDARD_REVIEW_LIMITS } from '../../../utils/standardReviewProjection';

const HERE = dirname(fileURLToPath(import.meta.url));
const FEATURE = join(HERE, '..', '..', '..');

/**
 * The three review screens each compute their score differently, so each one
 * writes its own wording. What must not vary is that the explanation exists,
 * sits behind the same trigger, and opens under the same heading. These are the
 * guards for that — the wording itself is deliberately not asserted.
 */
interface ReviewPageSource {
  name: string;
  file: string;
  hintFile?: string;
}

const REVIEW_PAGES: readonly ReviewPageSource[] = [
  {
    name: 'Copilot Studio agents',
    file: join(FEATURE, 'components', 'review-page', 'StandardReviewPage.tsx'),
  },
  {
    name: 'M365 declarative agents',
    file: join(FEATURE, 'declarative-agent', 'DeclarativeReviewPage.tsx'),
    hintFile: join(FEATURE, 'declarative-agent', 'components', 'DAScoreHint.tsx'),
  },
  {
    name: 'Skills & automations',
    file: join(FEATURE, 'skills-automations', 'components', 'ArtifactResultsPanel.tsx'),
    hintFile: join(FEATURE, 'skills-automations', 'components', 'ArtifactScoreHint.tsx'),
  },
];

const sourceOf = (file: string) => readFileSync(file, 'utf8');
const hintSourceOf = ({ file, hintFile }: ReviewPageSource) => sourceOf(hintFile ?? file);

describe('ScoreHint', () => {
  const render = (props: Parameters<typeof ScoreHint>[0]) =>
    renderToStaticMarkup(createElement(ScoreHint, props));

  it('opens under the heading the grounded-configuration rail established', () => {
    const html = render({ basis: 'B', caveat: 'C' });
    expect(html).toContain('How this score is calculated');
  });

  it('states the basis and the caveat', () => {
    const html = render({ basis: 'Two parts, weighted evenly.', caveat: 'It does not measure answers.' });
    expect(html).toContain('Two parts, weighted evenly.');
    expect(html).toContain('It does not measure answers.');
  });

  it('omits the redistribution block when a screen has nothing to redistribute', () => {
    const html = render({ basis: 'B', caveat: 'C' });
    // Three blocks would mean an empty one rendered; only two are expected.
    expect(html.match(/<span/g)).toHaveLength(3);
  });

  it('adds the redistribution block when given one', () => {
    const html = render({ basis: 'B', caveat: 'C', redistribution: 'Weight is shared out.' });
    expect(html).toContain('Weight is shared out.');
    expect(html.match(/<span/g)).toHaveLength(4);
  });

  it('shows an optional weighted score breakdown', () => {
    const html = render({
      basis: 'B',
      caveat: 'C',
      breakdownLabel: 'Artifact score breakdown',
      breakdown: [
        { key: 'clarity', label: 'Trigger clarity', weight: 20, value: '80% · 4/5' },
        { key: 'focus', label: 'Task focus', value: 'not assessed' },
      ],
    });

    expect(html).toContain('aria-label="Artifact score breakdown"');
    expect(html).toContain('Trigger clarity');
    expect(html).toContain('×20');
    expect(html).toContain('80% · 4/5');
    expect(html).toContain('not assessed');
  });

  it('renders no wrapper of its own, so the popover controls the spacing', () => {
    // A fragment, not a div: the blocks must be direct children of the popover
    // surface to inherit its column gap. A wrapper here would collapse it.
    const html = render({ basis: 'B', caveat: 'C' });
    expect(html.startsWith('<span')).toBe(true);
  });
});

describe('score explanation consistency across review screens', () => {
  it.each(REVIEW_PAGES)('$name explains how its score is calculated', (page) => {
    const { file } = page;
    const source = sourceOf(file);
    expect(source).toContain('scoreHint');
    expect(hintSourceOf(page)).toContain('<ScoreHint');
  });

  it.each(REVIEW_PAGES)('$name uses the shared component rather than its own markup', (page) => {
    // The three pages sit at different depths, so match the module, not the
    // relative prefix.
    const source = hintSourceOf(page);
    expect(source).toMatch(/from '(\.\.\/)+shared\/review-shell\/ScoreHint'/);
  });

  it.each(REVIEW_PAGES)('$name states what its score does not claim', (page) => {
    // The caveat prop is required by the type, but a screen could still pass an
    // empty string past tsc. Assert the prop is present and non-trivial.
    const source = hintSourceOf(page);
    const caveat = /caveat="([^"]{20,})"/.exec(source)?.[1]
      ?? (source.includes('caveat={STANDARD_REVIEW_LIMITS}') ? STANDARD_REVIEW_LIMITS : '');
    expect(caveat.length, 'expected a caveat of substance').toBeGreaterThanOrEqual(20);
  });

  it('no review screen hand-rolls the heading outside the shared component', () => {
    for (const page of REVIEW_PAGES) {
      expect(sourceOf(page.file)).not.toContain('How this score is calculated');
      expect(hintSourceOf(page)).not.toContain('How this score is calculated');
    }
  });
});

describe('Copilot Studio agents sub-score weights', () => {
  const source = sourceOf(REVIEW_PAGES[0].file);

  it('shows the effective weighted calculation in the score popout', () => {
    expect(source).toContain(
      "'Overall score = (Pattern score × 50%) + (Instructions score × 50%).'",
    );
    expect(source).toContain('breakdownLabel="Overall score breakdown"');
    expect(source).toContain("key: 'patterns'");
    expect(source).toContain("key: 'instructions'");
    expect(source).toContain('weight: effectiveWeightFor(hasPatterns)');
    expect(source).toContain('weight: effectiveWeightFor(hasInstructions)');
  });

  it('labels both sub-scores with the weight the review actually used', () => {
    // Previously the two sub-scores carried no weight at all, on the mistaken
    // note that they were unweighted. They are a 50/50 mean.
    expect(source).toContain("weight: weightFor(hasPatterns)");
    expect(source).toContain("weight: weightFor(hasInstructions)");
  });

  it('shows 100% rather than 50% when only one stage ran', () => {
    expect(source).toContain("bothRan ? '50%' : '100%'");
    expect(source).toContain("'Overall score = Pattern score × 100%. Instructions were not assessed.'");
    expect(source).toContain("'Overall score = Instructions score × 100%. Patterns were not assessed.'");
  });

  it('marks a stage that did not run as not assessed rather than scoring it zero', () => {
    expect(source).toContain("!ran ? 'Not assessed'");
    expect(source).toContain('const hasPatterns = model.scores.pattern !== null');
    expect(source).toContain('const hasInstructions = model.scores.instruction !== null');
    expect(source).toContain('percent: model.scores.pattern');
    expect(source).toContain('percent: model.scores.instruction');
  });

  it('does not invent weights for scores saved under an unknown policy', () => {
    expect(source).toMatch(
      /!ran \|\| model\.scores\.legacy[\s\S]*?\? undefined/,
    );
    expect(source).not.toContain("model.scores.legacy ? 'saved'");
  });

  it('does not infer that all pillars are unavailable when the overall score is absent', () => {
    expect(source).toContain("scoreUnavailableReason: 'An overall score is not available for this review.'");
  });

  it('explains a composite score from the breakdown the scorer recorded, not a restated weight', () => {
    // DEF-1: the page kept claiming a 50/50 blend after the headline moved onto the
    // six-pillar composite. The weights must come from the scorer, so the two cannot
    // drift apart again.
    expect(source).toContain('pillarContributions(model.scores.pillars)');
    expect(source).toContain('const isComposite = contributions.some(c => c.applicable && c.score !== null)');
    expect(source).toContain('Math.round(contribution.effectiveWeight)');
    // The composite branch is reached before the old 50/50 blend, so a regraded
    // review can never fall through to it.
    expect(source).toMatch(/isComposite[\s\S]{0,200}weighted mean of the review pillars[\s\S]{0,200}Pattern score × 50%/);
  });

  it('names the pillars with the standard harness spelling, in the rail and the tooltip', () => {
    // This page serves the standard harness, whose Skills pillar is filled entirely by
    // topic rules. The label comes from the shared harness policy so the page, the PDF
    // and the copilot rail cannot drift into three spellings of one pillar.
    expect(source).toContain("pillarNameLabelFor('standard', name)");
    expect(source).toContain('label: pillarLabel(contribution.pillar)');
    // The tooltip's React key stays on the pillar itself: a label is copy, not identity.
    expect(source).toContain('key: contribution.pillar');
  });

  it('keeps a partial score honest about the evidence behind it', () => {
    expect(source).toContain("model.scores.status === 'partial'");
  });
});
