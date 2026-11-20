/**
 * Render-contract tests for the results panel and the files explorer.
 *
 * These two components carry the three things the results view was rebuilt to
 * do: show a review summary rail that matches the agent tabs, replace that rail
 * with compact finding details, name rubric weights outright, and prove every
 * file in the bundle was read. None of that is reachable from a unit test of the
 * pipeline, and none of
 * it can be exercised end-to-end in local dev — the Power Apps SDK waits on a
 * PAC host that a plain Vite server does not provide, so every Dataverse call
 * hangs and no review ever completes. A render contract is therefore the only
 * check that fails when this structure regresses.
 *
 * Rendered through `react-dom/server`, which needs no jsdom, and written with
 * `createElement` so the file stays `.ts` and matches the vitest include globs.
 * This mirrors `artifactHistoryList.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArtifactFilesExplorer } from '../components/ArtifactFilesExplorer';
import { ArtifactDimensionRail } from '../components/ArtifactDimensionRail';
import {
  ArtifactResultsPanel,
  DimensionCard,
  VerdictCard,
} from '../components/ArtifactResultsPanel';
import { ArtifactScoreHint } from '../components/ArtifactScoreHint';
import {
  RUBRIC_DIMENSION_IDS,
  RUBRIC_DIMENSION_LABELS,
  type ArtifactFinding,
  type ArtifactReviewResult,
  type ReviewedFile,
  type RubricDimensionScore,
  type RuntimeVerdict,
} from '../contracts/ArtifactReview';

afterEach(() => {
  vi.unstubAllGlobals();
});

const runtimeIconSource = readFileSync(
  fileURLToPath(new URL('../components/RuntimeIcon.tsx', import.meta.url)),
  'utf8',
);

/** Six dimensions at one score. A flat 4 of 5 is 80%, whatever the weights. */
function dimensions(score: number | null): RubricDimensionScore[] {
  return RUBRIC_DIMENSION_IDS.map((id) => ({
    id,
    score,
    assessment: `Assessment for ${RUBRIC_DIMENSION_LABELS[id]}.`,
    evidence: 'evidence line',
  }));
}

function finding(over: Partial<ArtifactFinding> = {}): ArtifactFinding {
  return {
    id: 'SEC-01',
    ruleId: 'SEC-01',
    family: 'Safety',
    severity: 'critical',
    title: 'Hardcoded API key',
    fact: 'api_key = "sk-live-4f9a"',
    why: 'A key committed to a bundle is readable by anyone who installs it.',
    fix: 'Read the key from an environment variable.',
    referenceId: 'ref-1' as ArtifactFinding['referenceId'],
    ai: false,
    evidence: 'api_key = "sk-live-4f9a"',
    recommendation: 'Read the key from an environment variable.',
    fixSteps: [{ order: 1, action: 'Remove the literal.' }],
    referenceIds: [],
    confidence: 'high',
    runtimes: [],
    source: 'deterministic',
    resourcePath: 'scripts/extract.py',
    line: 12,
    ...over,
  } as ArtifactFinding;
}

const FILES: ReviewedFile[] = [
  { path: 'SKILL.md', bytes: 1420, isBinary: false, text: '# Expense report\n' },
  { path: 'references/policy.md', bytes: 860, isBinary: false, text: 'Policy text\n' },
  { path: 'scripts/extract.py', bytes: 640, isBinary: false, text: 'api_key = "sk-live-4f9a"\n' },
  { path: 'scripts/upload.sh', bytes: 210, isBinary: false, text: 'curl ...\n' },
];

function result(over: Partial<ArtifactReviewResult> = {}): ArtifactReviewResult {
  const score = { value: 80, status: 'complete' as const, coveragePercent: 100 };
  return {
    status: 'complete',
    artifactKind: 'skill',
    artifactName: 'expense-report',
    artifactHash: 'a'.repeat(64),
    selectedRuntimes: ['cowork', 'scout'],
    scores: { quality: score, integrity: score, safety: score, readiness: score, safetyGate: 'none' },
    dimensions: dimensions(4),
    runtimeVerdicts: [
      {
        runtime: 'cowork',
        verdict: 'runs',
        score: 82,
        findingIds: [],
        basis: 'tool-catalogue',
        catalogueVersion: '1',
        catalogueSnapshotDate: '2026-07-28',
      },
    ],
    findings: [finding()],
    files: FILES,
    uncompressedBytes: 3130,
    recommendation: 'keep-private',
    aiAvailable: true,
    reviewedAt: '2026-01-01T10:00:00.000Z',
    ...over,
  } as ArtifactReviewResult;
}

const renderPanel = (
  over: Partial<ArtifactReviewResult> = {},
  selectedFinding: ArtifactFinding | null = null,
) =>
  renderToStaticMarkup(
    createElement(
      SSRProvider,
      null,
      createElement(ArtifactResultsPanel, {
        result: result(over),
        selectedFinding,
        onSelectFinding: () => {},
        onDismissFinding: () => {},
        onReviewAnother: () => {},
        // The tab always supplies this, so the default render must too.
        onBack: () => {},
      }),
    ),
  );

const renderVerdict = (verdict: RuntimeVerdict) =>
  renderToStaticMarkup(createElement(SSRProvider, null, createElement(VerdictCard, { verdict })));

const renderScoreHint = (over: Partial<ArtifactReviewResult> = {}) =>
  renderToStaticMarkup(createElement(ArtifactScoreHint, { result: result(over) }));

const renderDimensionRail = (dimension: RubricDimensionScore) =>
  renderToStaticMarkup(
    createElement(
      SSRProvider,
      null,
      createElement(ArtifactDimensionRail, { dimension, onDismiss: () => {} }),
    ),
  );

const renderDimensionCard = (dimension: RubricDimensionScore) =>
  renderToStaticMarkup(
    createElement(
      SSRProvider,
      null,
      createElement(DimensionCard, {
        dimension,
        aiAssisted: true,
        onViewDetails: () => {},
      }),
    ),
  );

const renderExplorer = (over: Partial<Parameters<typeof ArtifactFilesExplorer>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(
      SSRProvider,
      null,
      createElement(ArtifactFilesExplorer, {
        files: FILES,
        findings: [finding()],
        onSelectFinding: () => {},
        ...over,
      }),
    ),
  );

describe('ArtifactResultsPanel', () => {
  it('gives Critical stronger visual emphasis than High in the findings grid', () => {
    const html = renderPanel({
      findings: [
        finding({ id: 'critical', severity: 'critical', title: 'Critical issue' }),
        finding({ id: 'high', severity: 'high', title: 'High issue' }),
      ],
    });

    expect(html).toContain('data-emphasis="strong"');
    expect(html).toContain('data-emphasis="standard"');
  });

  it('shows the weighted overall score as a percentage', () => {
    // Every dimension at 4 of 5 is 80% under any weighting, so this asserts the
    // rail reads the rubric rather than the runtime verdicts — the verdict here
    // scores 82, and 82 must not appear as the overall figure.
    expect(renderPanel()).toContain('80%');
  });

  it('names the artifact under review', () => {
    expect(renderPanel()).toContain('expense-report');
  });

  it('does not present user-selected runtimes as review evidence', () => {
    const html = renderPanel({ selectedRuntimes: ['cowork', 'scout', 'copilot-studio'] });

    expect(html).not.toContain('Runtimes selected');
    expect(html).not.toContain('Runtimes judged');
  });

  it('uses Vite imports so runtime icons remain inside the hosted app path', () => {
    expect(runtimeIconSource).toContain(
      "import coworkIcon from '../../assets/CopilotCowork.png?inline';",
    );
    expect(runtimeIconSource).toContain(
      "import scoutIcon from '../../assets/MicrosoftScout.png?inline';",
    );
    expect(runtimeIconSource).toContain(
      "import copilotStudioIcon from '../../assets/CopilotStudio_scalable.svg';",
    );
    expect(runtimeIconSource).not.toContain("from '/media/");
  });

  it('leads back to the review tool through a breadcrumb, not a back button', () => {
    // The results replace the whole tab, so the way back has to be named. The
    // other two review tabs use this same crumb wording; a plain "Back to list"
    // button would break that and would compete with the primary action.
    const html = renderPanel();

    expect(html).toContain('Agent Review Tool');
    expect(html).not.toContain('Back to list');
  });

  it('offers exactly one header action, "Review another"', () => {
    // The header used to carry two buttons. Only one remains, and the
    // breadcrumb replaced the other. Appearance is a single prop and is not
    // assertable from static markup — Fluent emits hashed Griffel classes that
    // change on every version bump — so this asserts the count and the label,
    // which is what actually regressed when a second button crept back in.
    const html = renderPanel();
    const headerActions = html.match(/>Review another</g) ?? [];

    expect(headerActions.length).toBe(1);
    expect(html).not.toContain('Back to list');
  });

  it('offers the three artifact result tabs', () => {
    const html = renderPanel();
    for (const tab of ['Findings', 'Rubric dimensions', 'Files']) {
      expect(html, `missing tab: ${tab}`).toContain(tab);
    }
    expect(html).not.toContain('Runtime verdicts');
  });

  it('shows only accessible product icons for the guidance applied to an existing review', () => {
    const html = renderPanel();

    expect(html).toContain('Guidance applied');
    expect(html).toContain('aria-label="Copilot Cowork"');
    expect(html).toContain('aria-label="Microsoft Scout"');
    expect(html).not.toContain('>Copilot Cowork<');
    expect(html).not.toContain('>Microsoft Scout<');
    expect(html.match(/<img/g)).toHaveLength(2);
  });

  it('keeps scoring weights out of the rubric cards', () => {
    const html = renderPanel();

    expect(html).not.toContain('% weight');
  });

  it('omits portability from the artifact-only review summary', () => {
    const html = renderPanel();

    expect(html).not.toContain('Portability');
    expect(html).toContain('Microsoft skill-authoring, 5 dimensions');
  });

  it('defines dimension scoring and shows the weighted calculation in the score popover', () => {
    const html = renderScoreHint();

    expect(html).toContain('AI-assisted writing dimensions use the evaluator');
    expect(html).toContain('Deterministic dimensions start at 5');
    expect(html).toContain('2.5 for Critical');
    expect(html).toContain('aria-label="Artifact score breakdown"');
    expect(html).toContain('not Microsoft certification or approval');
    expect(html).toContain('×20');
    expect(html).toContain('×15');
    expect(html).toContain('×25');
    expect(html).toContain('×10');
    expect(html).toContain('80% · 4/5');
  });

  it('reports the blocking finding rather than burying it', () => {
    expect(renderPanel()).toContain('Hardcoded API key');
  });

  it('replaces Review summary with compact finding details in the same rail slot', () => {
    const firstFinding = finding({
      id: 'high-1',
      severity: 'high',
      title: 'First high finding',
      recommendation: 'Fix the first problem.',
    });
    const secondFinding = finding({
      id: 'medium-2',
      severity: 'medium',
      title: 'Second medium finding',
    });
    const html = renderPanel(
      { findings: [firstFinding, secondFinding], recommendation: 'revise' },
      firstFinding,
    );

    expect(html).toContain('Finding details');
    expect(html).toMatch(/<h2[^>]*>Finding details<\/h2>/);
    expect(html).toContain('First high finding');
    expect(html).toContain('1 of 2');
    expect(html).toContain('aria-label="Back to review summary"');
    expect(html).toContain('Review summary');
    expect(html).toContain('aria-label="Previous finding"');
    expect(html).toContain('aria-label="Next finding"');
    expect(html).toContain('Recommended action');
    expect(html).not.toContain('Overall score');

    const previousButton = html.match(/<button(?=[^>]*aria-label="Previous finding")[^>]*>/)?.[0];
    expect(previousButton).toContain('aria-disabled="true"');
    expect(previousButton).not.toContain(' disabled');
  });

  it('keeps the summary rail under a finding overlay at the shell breakpoint', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    const selected = finding({ title: 'Narrow-screen finding' });
    const html = renderPanel({ findings: [selected] }, selected);

    expect(html).toContain('Overall score');
    expect(html).not.toContain('aria-label="Back to review summary"');
  });

  it('renders a review whose dimensions were never assessed', () => {
    // A partial review still has to draw. Showing nothing at all would read as
    // a crash, and showing a zero would read as a bad skill.
    const html = renderPanel({ dimensions: dimensions(null), aiAvailable: false });

    // The earlier version of this test asserted only `not.toThrow()`, which is
    // why a rail reading "0%" shipped. Assert the absence of the wrong number,
    // not just the absence of a crash.
    expect(html).not.toContain('>0%<');
    expect(html).not.toContain('0 out of 100');
    expect(html).toContain('--');
    expect(html).toContain('No dimension could be assessed');
  });

  it('shows only the recommendation and a finding action', () => {
    const html = renderPanel();

    expect(html).toContain('Recommendation: Keep private');
    expect(html).toContain('Open finding');
    expect(html).not.toContain('Remove the literal');
    expect(html).not.toContain('Then review again');
  });

  it('opens the finding without repeating its explanation', () => {
    const html = renderPanel({
      recommendation: 'revise',
      findings: [
        finding({
          severity: 'high',
          title: 'Broken reference in SKILL.md',
          recommendation: 'Restore the referenced file.',
          fixSteps: [{ order: 1, action: 'Restore the missing file.' }],
        }),
      ],
    });

    expect(html).toContain('Recommendation: Revise');
    expect(html).toContain('Open finding');
    expect(html).toContain('aria-label="Open finding: Broken reference in SKILL.md"');
    expect(html).not.toContain('Restore the missing file');
    expect(html).not.toContain('blocks Submit');
    expect(html).not.toContain('not a Microsoft certification or approval');
  });

  it('offers the first finding when the review has more than one', () => {
    const html = renderPanel({
      recommendation: 'revise',
      findings: [
        finding({
          id: 'high-1',
          severity: 'high',
          title: 'First high finding',
          fixSteps: [{ order: 1, action: 'Fix the first problem.' }],
        }),
        finding({
          id: 'high-2',
          severity: 'high',
          title: 'Second high finding',
          fixSteps: [{ order: 1, action: 'Fix the second problem.' }],
        }),
      ],
    });

    expect(html).toContain('Open first finding');
    expect(html).toContain('aria-label="Open first finding: First high finding"');
    expect(html).not.toContain('Fix the first problem');
    expect(html).not.toContain('confirmed high-severity findings');
  });

  it('opens the finding linked to a blocked runtime without duplicating the runtime reason', () => {
    const html = renderPanel({
      recommendation: 'keep-private',
      runtimeVerdicts: [
        {
          runtime: 'cowork',
          verdict: 'will-not-run',
          score: 40,
          findingIds: ['SEC-01'],
          basis: 'tool-catalogue',
          catalogueVersion: '1',
          catalogueSnapshotDate: '2026-07-28',
        },
      ],
    });

    expect(html).toContain('aria-label="Open finding: Hardcoded API key"');
    expect(html).not.toContain('Cowork will not run this artifact');
  });

  it('does not add an explanation when the score alone held it back', () => {
    const html = renderPanel({
      recommendation: 'revise',
      dimensions: dimensions(3),
      findings: [finding({ severity: 'low' })],
    });

    expect(html).toContain('Recommendation: Revise');
    expect(html).toContain('Open finding');
    expect(html).not.toContain('The average is');
  });

  it('does not expose runtime verdicts for an artifact-only review', () => {
    const html = renderPanel({
      runtimeVerdicts: [
        {
          runtime: 'cowork',
          verdict: 'runs',
          score: 100,
          findingIds: [],
          catalogueVersion: '1',
          catalogueSnapshotDate: '2026-07-28',
          basis: 'tool-catalogue',
        },
      ],
    });

    expect(html).not.toContain('Runtime verdicts');
    expect(html).not.toContain('runtimes judged');
  });

  it('names the package contract, not a tool list, where the runtime publishes one', () => {
    // Copilot Studio publishes no tool list and never will — tools there are
    // added per agent. It does publish a skill package format, so the card
    // states that instead. Printing the tool-list sentence here named a check
    // that never ran; printing nothing at all read as a skipped runtime.
    const html = renderVerdict({
      runtime: 'copilot-studio',
      verdict: 'runs',
      score: 100,
      findingIds: [],
      catalogueVersion: '1',
      catalogueSnapshotDate: '2026-08-10',
      basis: 'package-contract',
    });

    expect(html).toContain('Package compatible');
    expect(html).toContain('The package format is valid');
    expect(html).toContain('Tools configured on the target agent were not assessed');
    expect(html).not.toContain('100 / 100');
    expect(html).not.toContain('Based on');
    expect(html).not.toContain('2026');
  });

  it('describes a clean tool-catalogue verdict without foregrounding its source date', () => {
    const html = renderVerdict({
      runtime: 'cowork',
      verdict: 'runs',
      score: 82,
      findingIds: [],
      catalogueVersion: '1',
      catalogueSnapshotDate: '2026-07-28',
      basis: 'tool-catalogue',
    });

    expect(html).toContain('No known compatibility issues found');
    expect(html).not.toContain('Based on');
    expect(html).not.toContain('2026');
  });

  it('folds AI-assisted scores into one consistently scaled rubric', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../components/ArtifactResultsPanel.tsx', import.meta.url)),
      'utf8',
    );

    expect(source).not.toContain('function AiAssessmentSummary');
    expect(source).toContain('result.aiAssessment');
    expect(source).toContain('SparkleRegular');
    expect(source).not.toContain('<Badge appearance="tint" color="informative" size="small">');
    expect(source).not.toContain('% weight');
    expect(source).not.toContain('dimension.score} / 10');
    expect(source).not.toContain('<Caption1 className={styles.muted}>/ 5</Caption1>');
    expect(source).toContain('<span className={styles.dimensionTitle}>');
    expect(source).toContain('className={styles.dimensionScore}');
  });

  it('explains how to improve every dimension scored below 100 percent', () => {
    const html = dimensions(4).map(renderDimensionCard).join('');

    expect(html).toContain('How to improve:');
    expect(html).toContain('State the exact situations that should trigger this skill');
    expect(html).toContain('Make each step explicit, ordered, and executable');
  });

  it('does not invent improvement advice for dimensions scored at 100 percent', () => {
    const html = dimensions(5).map(renderDimensionCard).join('');

    expect(html).not.toContain('How to improve:');
  });

  it('uses the review summary rail for the full dimension rationale', () => {
    const html = renderDimensionRail(dimensions(4)[0]);

    expect(html).toContain('Review summary');
    expect(html).toContain('Rubric dimension');
    expect(html).toContain('How to improve');
    expect(html).toContain('Evaluator assessment');
    expect(html).toContain('Supporting evidence');
  });

  it('labels the rubric action by its purpose', () => {
    const html = renderDimensionCard(dimensions(4)[0]);

    expect(html).toContain('Why this score');
    expect(html).toContain('Why Trigger clarity received this score');
    expect(html).not.toContain('View details');
  });

  it('claims no evidence at all when the runtime published none', () => {
    // Reserved for an unidentifiable upload, where no rule of any kind ran.
    const html = renderVerdict({
      runtime: 'copilot-studio',
      verdict: 'not-evaluated',
      score: null,
      findingIds: [],
      catalogueVersion: '1',
      catalogueSnapshotDate: '2026-08-10',
      basis: 'none',
    });

    expect(html).not.toContain('Based on the list of tools');
    expect(html).not.toContain('Based on the skill package format');
    expect(html).toContain('publishes nothing this skill can be checked against');

    // A null score must not render as a number, and "No issues found" would
    // read as a clean bill of health for a check that never ran.
    expect(html).not.toContain('/ 100');
    expect(html).not.toContain('No issues found');
  });

  // The defect this replaces: a Scout automation reported "Runs, 100 / 100" on
  // Copilot Cowork, a runtime with no automation import at all. No finding named
  // Cowork, so the verdict fell through to its success branch and printed
  // absence of evidence as evidence of success.
  it('states why a runtime has no verdict, instead of claiming no issues were found', () => {
    const html = renderVerdict({
      runtime: 'cowork',
      verdict: 'not-applicable',
      score: null,
      findingIds: [],
      catalogueVersion: '1',
      catalogueSnapshotDate: '2026-07-28',
      basis: 'none',
      notApplicableReason:
        'Copilot Cowork installs skill folders built around a SKILL.md. It has no import path for a Scout automation file, so there is no compatibility question to answer. Microsoft Scout is where this format runs.',
    });

    expect(html).toContain('Not applicable');
    expect(html).toContain('no import path');
    expect(html).toContain('Microsoft Scout is where this format runs');

    // None of the three phrasings that would read as a pass.
    expect(html).not.toContain('No issues found');
    expect(html).not.toContain('/ 100');
    expect(html).not.toContain('publishes nothing this skill can be checked against');
  });

  it('falls back to a plain sentence when no stored reason is present', () => {
    // Rows written before the field existed carry no reason. Rendering an empty
    // caption under a "Not applicable" badge would leave the reader guessing.
    const html = renderVerdict({
      runtime: 'copilot-studio',
      verdict: 'not-applicable',
      score: null,
      findingIds: [],
      catalogueVersion: '1',
      catalogueSnapshotDate: '2026-08-10',
      basis: 'none',
    });

    expect(html).toContain('cannot install this file format');
    expect(html).not.toContain('No issues found');
  });
});

describe('ArtifactFilesExplorer', () => {
  it('lists every file that was read', () => {
    const html = renderExplorer();
    for (const f of FILES) {
      const name = f.path.split('/').pop() as string;
      expect(html, `missing file: ${f.path}`).toContain(name);
    }
  });

  it('shows both folders of the bundle', () => {
    const html = renderExplorer();
    expect(html).toContain('references');
    expect(html).toContain('scripts');
  });

  it('shows compact file findings above the source instead of repeating their detail', () => {
    const html = renderExplorer();

    expect(html).toContain('File findings');
    expect(html).toContain('Hardcoded API key');
    expect(html).toContain('Line 12');
    expect(html.indexOf('File findings')).toBeLessThan(html.indexOf('api_key'));
    expect(html).not.toContain('A key committed to a bundle is readable');
  });

  it('labels findings without a reliable line as applying to the whole file', () => {
    const html = renderExplorer({ findings: [finding({ line: undefined })] });

    expect(html).toContain('File-level');
    expect(html).toContain('has no line highlight');
  });

  it('does not duplicate file metadata above the explorer', () => {
    const html = renderExplorer();

    expect(html).not.toContain('SHA-256');
    expect(html).not.toContain('files read');
    expect(html).not.toContain('review complete');
  });

  it('makes the scrollable source region keyboard reachable and names it', () => {
    const html = renderExplorer();

    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Contents of scripts/extract.py"');
  });

  it('renders a review stored before files were recorded', () => {
    // Reviews saved by earlier builds carry no `files`, and the explorer is the
    // one tab that cannot fall back to the result body.
    expect(() => renderExplorer({ files: undefined, uncompressedBytes: undefined })).not.toThrow();
  });

  it('explains what a shaded line means', () => {
    // Without a key the shading is described only by the hidden span in the
    // gutter, so a sighted reader is told less than a listening one, and the
    // colour is the only carrier of severity.
    const html = renderExplorer({ findings: [finding({ line: 1 })] });
    expect(html).toContain('Shaded lines:');
    expect(html).toContain('critical or high');
    expect(html).toContain('medium');
    expect(html).toContain('low or info');
  });

  it('says how many findings are about the file rather than a line', () => {
    // The header can read "3 findings" beside a file with one mark in it. Left
    // unexplained that reads as two findings quietly lost.
    const html = renderExplorer({
      findings: [
        finding({ line: 1 }),
        finding({ id: 'b', line: undefined }),
        finding({ id: 'c', line: undefined }),
      ],
    });
    expect(html).toContain('2 of 3 findings apply to the whole file and have no line highlight');
  });

  it('shows no key for a file that has no findings', () => {
    const html = renderExplorer({ findings: [] });
    expect(html).not.toContain('Shaded lines:');
  });
});
