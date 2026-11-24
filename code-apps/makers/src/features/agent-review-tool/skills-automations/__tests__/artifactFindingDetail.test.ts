/**
 * Render-contract tests for the finding detail body.
 *
 * The rest of the suite is service-level, and that gap let a real crash ship:
 * the body rendered `fixSteps` entries — objects of `{ order, action }` —
 * straight as React children, which throws on the first click of any finding.
 * TypeScript did not catch it because Fluent v9 slot typing widens `children`
 * past `ReactNode`.
 *
 * These render through `react-dom/server`, which needs no jsdom and no new
 * dependency, and which throws on exactly that mistake. Written with
 * `createElement` rather than JSX so the file stays `.ts` and matches the
 * existing vitest `include` globs.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ArtifactFindingDetail } from '../components/ArtifactFindingDetail';
import type { ArtifactFinding } from '../contracts/ArtifactReview';

function finding(over: Partial<ArtifactFinding> = {}): ArtifactFinding {
  return {
    id: 'SEC-SECRET:SKILL.md',
    ruleId: 'SEC-SECRET',
    severity: 'critical',
    dimension: 'safety',
    title: 'A credential is present in the bundle',
    fact: 'A password literal was found in SKILL.md.',
    why: 'Anyone who receives the bundle receives the credential with it.',
    evidence: 'password Sup3rSecret',
    recommendation: 'Remove the literal and read the value from a connection.',
    fixSteps: [
      { order: 1, action: 'Delete the literal from SKILL.md.' },
      { order: 2, action: 'Rotate the credential.' },
    ],
    referenceIds: [],
    confidence: 'high',
    resourcePath: 'SKILL.md',
    line: 3,
    runtimes: ['cowork'],
    source: 'deterministic',
    ...over,
  } as ArtifactFinding;
}

const render = (f: ArtifactFinding) =>
  renderToStaticMarkup(createElement(ArtifactFindingDetail, { finding: f }));

const renderCompact = (f: ArtifactFinding) =>
  renderToStaticMarkup(createElement(ArtifactFindingDetail, { finding: f, compact: true }));

describe('ArtifactFindingDetail', () => {
  it('renders the action text of each fix step, not the step object', () => {
    const markup = render(finding());

    expect(markup).toContain('Delete the literal from SKILL.md.');
    expect(markup).toContain('Rotate the credential.');
    // The bug rendered `[object Object]` where the action text belongs.
    expect(markup).not.toContain('[object Object]');
  });

  it('puts the recommended action before evidence and impact', () => {
    const markup = render(finding());

    expect(markup).toContain('Recommended action');
    expect(markup).toContain('Remove the literal and read the value from a connection.');
    expect(markup.indexOf('Recommended action')).toBeLessThan(markup.indexOf('Evidence'));
    expect(markup.indexOf('Evidence')).toBeLessThan(markup.indexOf('Impact'));
    expect(markup).toContain('Impact');
    expect(markup).toContain('Anyone who receives the bundle receives the credential with it.');
    expect(markup).not.toContain('What to do');
  });

  it('states the consequence plainly instead of asking the reader why it matters', () => {
    // "Why it matters" is a prompt to the writer, not a label for the reader,
    // and it appears verbatim in enough generated prose to read as filler.
    expect(render(finding())).not.toContain('Why it matters');
  });

  it('renders section labels as real headings so the drawer is navigable', () => {
    const markup = render(finding());

    expect(markup).toMatch(/<h3[^>]*>Recommended action<\/h3>/);
    expect(markup).toMatch(/<h3[^>]*>Evidence<\/h3>/);
    expect(markup).toMatch(/<h3[^>]*>Impact<\/h3>/);
    expect(markup).not.toContain('What was found');
    expect(markup).not.toContain('How to fix it');
  });

  it('does not render an empty step list when a finding carries no steps', () => {
    const markup = render(finding({ fixSteps: [] }));

    expect(markup).toContain('Recommended action');
    expect(markup).not.toContain('<ol');
  });

  it('states plainly when a rule cites no published source', () => {
    const markup = render(finding({ referenceIds: [] }));

    expect(markup).toContain('No published source is cited for this rule.');
  });

  it('shows the product scope when a finding is product-specific', () => {
    const markup = render(finding({ runtimes: ['cowork', 'scout'] }));

    expect(markup).toContain('Product scope:');
    expect(markup).toContain('Copilot Cowork');
    expect(markup).toContain('Microsoft Scout');
  });

  it('shows actionable metadata without evaluator-internal labels', () => {
    const markup = render(finding({ runtimes: [] }));

    expect(markup).toContain('Location:');
    expect(markup).toContain('SKILL.md:');
    expect(markup).toContain('Confidence:');
    expect(markup).toContain('Critical');
    expect(markup).not.toContain('Deterministic');
    expect(markup).not.toContain('SEC-SECRET');
    expect(markup).not.toContain('Product scope:');
  });

  it('gives Critical stronger visual emphasis than High without relying on color alone', () => {
    expect(render(finding({ severity: 'critical' }))).toContain('data-emphasis="strong"');
    expect(render(finding({ severity: 'high' }))).toContain('data-emphasis="standard"');
  });

  it('does not repeat the observation when fact and evidence are identical', () => {
    const observation = 'The description is 502 characters.';
    const markup = render(finding({ fact: observation, evidence: observation }));

    expect(markup.match(/The description is 502 characters\./g)).toHaveLength(1);
  });

  it('keeps the action visible and collapses supporting detail in compact mode', () => {
    const markup = renderCompact(finding());

    expect(markup).toMatch(/<h4[^>]*>Recommended action<\/h4>/);
    expect(markup).toContain('Remove the literal and read the value from a connection.');
    expect(markup).toContain('Evidence');
    expect(markup).toContain('Impact');
    expect(markup).toContain('Sources');
    expect(markup).toMatch(/<h4[^>]*>Evidence<\/h4>/);
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/<h3[^>]*>Recommended action<\/h3>/);
  });
});
