/**
 * Render-contract tests for the history list.
 *
 * The list is the only place a past review is visible, so a render crash or a
 * mislabelled verdict is a silent loss of the user's work. Rendered through
 * `react-dom/server`, which needs no jsdom, and written with `createElement`
 * so the file stays `.ts` and matches the existing vitest include globs.
 *
 * The list matches `DAGrid`, so the assertions below track that contract: a
 * card rather than nothing when empty, a skeleton rather than a spinner while
 * loading, a compact relative date, and a colour-coded score.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';

import { ArtifactHistoryList } from '../components/ArtifactHistoryList';
import type { ArtifactReviewResult, RubricDimensionScore } from '../contracts/ArtifactReview';
import type { StoredArtifactReview } from '../services/artifactReviewStore';

/**
 * Six dimensions at one score each. The overall figure is a weighted mean of
 * these, so a flat set makes the expected percentage readable: every score 4
 * out of 5 is 80%, whatever the weights.
 */
function dimensions(score: number | null): RubricDimensionScore[] {
  return (
    [
      'trigger-clarity',
      'task-focus',
      'instruction-quality',
      'portability',
      'safety-evidence',
      'packaging-quality',
    ] as const
  ).map((id) => ({ id, score, assessment: 'assessment', evidence: '' }));
}

function result(over: Partial<ArtifactReviewResult> = {}): ArtifactReviewResult {
  const score = { value: 80, status: 'complete' as const, coveragePercent: 100 };
  return {
    status: 'complete',
    artifactKind: 'skill',
    artifactName: 'expense-report',
    artifactHash: 'hash-a',
    selectedRuntimes: ['cowork'],
    scores: { quality: score, integrity: score, safety: score, readiness: score, safetyGate: 'none' },
    dimensions: dimensions(4),
    runtimeVerdicts: [
      {
        runtime: 'cowork',
        verdict: 'runs',
        score: 82,
        findingIds: [],
        catalogueVersion: '1',
        catalogueSnapshotDate: '2026-01-01',
      },
    ],
    findings: [],
    recommendation: 'submit',
    aiAvailable: true,
    reviewedAt: '2026-01-01T10:00:00.000Z',
    ...over,
  };
}

function stored(
  over: Partial<ArtifactReviewResult> = {},
  reviewId = 'row-1',
  reviewedOn?: Date,
): StoredArtifactReview {
  const r = result(over);
  return {
    reviewId,
    componentIdUnique: `${r.artifactHash}:${r.selectedRuntimes.join(',')}`,
    artifactName: r.artifactName,
    reviewedOn,
    result: r,
  };
}

/**
 * `SSRProvider` because `DataGrid` generates element ids; without it Fluent
 * warns on every render and buries any real failure in the noise.
 */
const render = (
  entries: StoredArtifactReview[],
  over: { isLoading?: boolean; loadError?: string | null; searchTerm?: string } = {},
) =>
  renderToStaticMarkup(
    createElement(
      SSRProvider,
      null,
      createElement(ArtifactHistoryList, {
        entries,
        isLoading: over.isLoading ?? false,
        loadError: over.loadError ?? null,
        onOpen: () => {},
        onRetry: () => {},
        onUpload: () => {},
        searchTerm: over.searchTerm ?? '',
        onClearSearch: () => {},
      }),
    ),
  );

describe('ArtifactHistoryList', () => {
  it('invites a first review rather than showing an empty table', () => {
    const markup = render([]);

    expect(markup).toContain('No skills or automations reviewed yet');
    expect(markup).toContain('Review a skill or automation');
  });

  /*
    A search that hides every row used to fall into the cold-start card, so a
    reader with a full history was told they had reviewed nothing and was
    offered an upload button for a problem a backspace would fix.
  */
  it('separates a search that matches nothing from an empty history', () => {
    const markup = render([], { searchTerm: 'sad' });

    expect(markup).toContain('No reviews match your search');
    expect(markup).not.toContain('No skills or automations reviewed yet');
  });

  it('quotes the term back so the reader can see what was searched for', () => {
    expect(render([], { searchTerm: 'sad' })).toContain('sad');
  });

  it('offers to clear the search, and does not offer to spend an AI review', () => {
    const markup = render([], { searchTerm: 'sad' });

    expect(markup).toContain('Clear search');
    expect(markup).not.toContain('Review a skill or automation');
  });

  it('treats a search of only spaces as no search at all', () => {
    // Trimming has to happen on both sides of the filter, or a stray space
    // shows the no-match card over a list that was never filtered.
    expect(render([], { searchTerm: '   ' })).toContain('No skills or automations reviewed yet');
  });

  it('does not call the entry action a file, because a bundle is a zip', () => {
    // "Review from file" read as a single document, so the control looked wrong
    // for the .zip bundle that is the commonest upload. The label names the
    // artifact instead of the container, which is true for every accepted type.
    expect(render([])).not.toContain('Review a file');
  });

  it('names the artifact and its kind', () => {
    const markup = render([stored()]);

    expect(markup).toContain('expense-report');
    expect(markup).toContain('Agent skill');
  });

  it('says the kind was not identified rather than guessing one', () => {
    const markup = render([stored({ artifactKind: undefined })]);

    expect(markup).toContain('Not identified');
  });

  it('renders the recommendation as its label, not its raw value', () => {
    const markup = render([stored({ recommendation: 'keep-private' })]);

    expect(markup).toContain('Keep private');
    expect(markup).not.toContain('keep-private');
  });

  it('names every runtime that was reviewed', () => {
    const markup = render([
      stored({
        selectedRuntimes: ['cowork', 'scout'],
        runtimeVerdicts: [
          {
            runtime: 'cowork',
            verdict: 'runs',
            score: 82,
            findingIds: [],
            catalogueVersion: '1',
            catalogueSnapshotDate: '2026-01-01',
          },
          {
            runtime: 'scout',
            verdict: 'will-not-run',
            score: 20,
            findingIds: [],
            catalogueVersion: '1',
            catalogueSnapshotDate: '2026-01-01',
          },
        ],
      }),
    ]);

    expect(markup).toContain('Cowork');
    expect(markup).toContain('Scout');
  });

  it('keeps three runtimes inside one compact icon group', () => {
    const markup = render([
      stored({
        selectedRuntimes: ['cowork', 'scout', 'copilot-studio'],
        runtimeVerdicts: (['cowork', 'scout', 'copilot-studio'] as const).map((runtime) => ({
          runtime,
          verdict: 'runs' as const,
          score: 80,
          findingIds: [],
          catalogueVersion: '1',
          catalogueSnapshotDate: '2026-01-01',
        })),
      }),
    ]);

    expect(markup).not.toContain('>Cowork<');
    expect(markup).not.toContain('>Scout<');
    expect(markup).toContain('aria-label="Runtime fit: Copilot Cowork: Runs; Microsoft Scout: Runs; Copilot Studio: Runs"');
    expect(markup).toContain('tabindex="0"');
  });

  it('shows each runtime mark without repeating its accessible name', () => {
    const markup = render([
      stored({
        selectedRuntimes: ['cowork', 'scout'],
        runtimeVerdicts: (['cowork', 'scout'] as const).map((runtime) => ({
          runtime,
          verdict: 'runs' as const,
          score: 80,
          findingIds: [],
          catalogueVersion: '1',
          catalogueSnapshotDate: '2026-01-01',
        })),
      }),
    ]);

    expect(markup).toContain('data:image/png;base64,');
    expect(markup).not.toContain('CopilotCowork.png');
    expect(markup).not.toContain('MicrosoftScout.png');
    expect(markup).toContain('aria-label="Runtime fit: Copilot Cowork: Runs; Microsoft Scout: Runs"');
    // The group announces the runtimes once, so each product mark stays decorative.
    expect(markup).toContain('aria-hidden="true"');
  });

  it('shows a runtime that cannot install the format as not applicable, never as a pass', () => {
    const markup = render([
      stored({
        artifactKind: 'automation',
        selectedRuntimes: ['cowork', 'scout'],
        runtimeVerdicts: [
          {
            runtime: 'cowork',
            verdict: 'not-applicable',
            score: null,
            findingIds: [],
            basis: 'none',
            catalogueVersion: '1',
            catalogueSnapshotDate: '2026-01-01',
            notApplicableReason: 'Copilot Cowork installs skill folders built around a SKILL.md.',
          },
          {
            runtime: 'scout',
            verdict: 'runs',
            score: 100,
            findingIds: [],
            catalogueVersion: '1',
            catalogueSnapshotDate: '2026-01-01',
          },
        ],
      }),
    ]);

    expect(markup).toContain('Not applicable');
    expect(markup).toContain('Scout automation');
    expect(markup).toContain('data-verdict="not-applicable"');
    expect(markup).toContain('data-verdict="runs"');
  });

  it('shows the selected runtime without inventing a fit verdict', () => {
    const markup = render([stored({ runtimeVerdicts: [] })]);

    expect(markup).toContain('aria-label="Selected runtimes: Copilot Cowork"');
    expect(markup).not.toContain('data-verdict=');
  });

  it('shows selected runtime logos without question marks when fit was not evaluated', () => {
    const markup = render([
      stored({
        selectedRuntimes: ['cowork', 'scout', 'copilot-studio'],
        runtimeVerdicts: (['cowork', 'scout', 'copilot-studio'] as const).map((runtime) => ({
          runtime,
          verdict: 'not-evaluated' as const,
          score: null,
          findingIds: [],
          basis: 'none' as const,
          catalogueVersion: '1',
          catalogueSnapshotDate: '2026-01-01',
        })),
      }),
    ]);

    expect(markup).toContain('>Runtimes<');
    expect(markup).toContain(
      'aria-label="Selected runtimes: Copilot Cowork; Microsoft Scout; Copilot Studio"',
    );
    expect(markup).not.toContain('data-verdict="not-evaluated"');
    expect(markup).not.toContain('Runtime fit');
  });

  it('shows the score as a percentage, matching the other review grids', () => {
    expect(render([stored()])).toContain('80%');
  });

  /*
    The score follows the rubric, not the runtime checkboxes. The same skill
    reviewed against one runtime or three must score the same, so a verdict
    score moving must not move the overall figure.
  */
  it('scores from the rubric dimensions, not from the runtime verdicts', () => {
    const markup = render([
      stored({
        selectedRuntimes: ['cowork', 'scout'],
        runtimeVerdicts: [
          {
            runtime: 'cowork',
            verdict: 'runs',
            score: 20,
            findingIds: [],
            catalogueVersion: '1',
            catalogueSnapshotDate: '2026-01-01',
          },
          {
            runtime: 'scout',
            verdict: 'runs-with-issues',
            score: 30,
            findingIds: [],
            catalogueVersion: '1',
            catalogueSnapshotDate: '2026-01-01',
          },
        ],
      }),
    ]);

    expect(markup).toContain('80%');
    expect(markup).not.toContain('25%');
  });

  it('shows a placeholder rather than 0% when nothing was scored', () => {
    const markup = render([stored({ dimensions: dimensions(null), runtimeVerdicts: [] })]);

    expect(markup).toContain('--');
    expect(markup).not.toContain('0%');
  });

  it('renders one row per stored review', () => {
    const markup = render([
      stored({ artifactHash: 'a', artifactName: 'first-skill' }, 'row-a'),
      stored({ artifactHash: 'b', artifactName: 'second-skill' }, 'row-b'),
    ]);

    expect(markup).toContain('first-skill');
    expect(markup).toContain('second-skill');
  });

  it('does not render any object as [object Object]', () => {
    expect(render([stored()])).not.toContain('[object Object]');
  });

  it('never claims the reviews are kept in the browser', () => {
    expect(render([stored()])).not.toContain('Kept in this browser only');
  });

  it('offers no per-row delete control, so the grid cannot destroy a review', () => {
    const markup = render([stored()]);

    expect(markup).not.toContain('Delete the review of expense-report');
    expect(markup).not.toContain('Remove');
  });

  it('offers no control that would delete every review at once', () => {
    const markup = render([stored()]);

    expect(markup).not.toContain('Clear history');
  });

  it('marks a review run in the last few minutes as recent', () => {
    const markup = render([stored({}, 'row-1', new Date())]);

    expect(markup).toContain('Recently reviewed');
    expect(markup).toContain('Just now');
  });

  it('does not mark an old review as recent', () => {
    const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const markup = render([stored({}, 'row-1', old)]);

    expect(markup).not.toContain('Recently reviewed');
    expect(markup).toContain('5d ago');
  });

  it('says "Never" rather than "Invalid Date" for an unreadable timestamp', () => {
    const markup = render([stored({ reviewedAt: 'not-a-date' })]);

    expect(markup).toContain('Never');
    expect(markup).not.toContain('Invalid Date');
  });

  it('offers a retry rather than leaving the user stuck with a broken list', () => {
    const markup = render([], { loadError: 'Dataverse said no.' });

    expect(markup).toContain('Try again');
  });

  it('shows a skeleton instead of an empty table while reading', () => {
    const markup = render([], { isLoading: true });

    expect(markup).toContain('Loading past reviews');
    expect(markup).not.toContain('No skills or automations reviewed yet');
  });

  it('reports a load failure rather than pretending there is no history', () => {
    const markup = render([], { loadError: 'Dataverse said no.' });

    expect(markup).toContain('Dataverse said no.');
    expect(markup).toContain('You can still review a file');
  });

  /*
    A reserved row exists before anything has been judged. It carries a
    placeholder recommendation and an empty verdict list purely to satisfy the
    result type, so every cell that would otherwise state a verdict has to
    recognise the state first. Rendering one as though it were a result would
    publish a decision nothing made.
  */
  describe('a review that has not been assessed', () => {
    const running = () =>
      stored({
        status: 'in-progress',
        dimensions: [],
        runtimeVerdicts: [],
        findings: [],
        recommendation: 'revise',
        startedAt: '2026-01-01T10:00:00.000Z',
      });

    const stopped = () =>
      stored({
        status: 'failed',
        dimensions: [],
        runtimeVerdicts: [],
        findings: [],
        recommendation: 'revise',
        startedAt: '2026-01-01T10:00:00.000Z',
        error: 'The app was closed before the results could be saved.',
      });

    it('says a running review is running, rather than showing it as scoreless', () => {
      const markup = render([running()]);

      expect(markup).toContain('Running');
    });

    it('says a stranded review did not finish', () => {
      const markup = render([stopped()]);

      expect(markup).toContain('Not finished');
    });

    it('does not state a recommendation that no review produced', () => {
      // `revise` is a placeholder on the reserved row. Printing it would be the
      // tool inventing a verdict.
      const markup = render([running()]);

      expect(markup).toContain('Not decided');
      expect(markup).not.toContain('Needs work');
    });

    it('marks the date as a start, not as a review', () => {
      const markup = render([running()]);

      expect(markup).toMatch(/Started/);
    });

    it('does not offer to open a review that has no result to show', () => {
      const markup = render([running()]);

      expect(markup).toMatch(/disabled/);
    });

    it('still shows the artifact name, so the row can be recognised', () => {
      const markup = render([running()]);

      expect(markup).toContain('expense-report');
    });
  });
});
