/**
 * Render contract for `ReviewWaitFooter` — the part of the progress dialog that
 * carries a long wait.
 *
 * The dialog itself cannot be tested this way: Fluent renders it through a
 * portal, which produces no markup under `react-dom/server`. That is why the
 * footer is a separate component, and it is the reason this file targets the
 * footer directly rather than the dialog around it.
 *
 * The footer once showed an elapsed clock. It no longer does, and several tests
 * here exist to keep it that way: none of the three things a reader can do —
 * wait, carry on working, or close the app — changes on the number, and a
 * stopwatch on a wait nobody can influence only makes the wait feel longer.
 * `startedAt` is still passed, because the slow-run threshold needs it.
 *
 * Written with `createElement` so the file stays `.ts` and matches the vitest
 * include globs, mirroring `artifactResultsPanel.test.ts`.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';

import {
  ReviewWaitFooter,
  type ReviewWaitFooterProps,
} from '../../components/dialogs/ReviewWaitFooter';

const NOTE = 'Most reviews finish within ten minutes.';
const FOUR_MINUTES = 4 * 60 * 1000;

function render(props: ReviewWaitFooterProps = {}): string {
  const markup = renderMarkup(props);
  // Strip tags so assertions read against text, never Griffel class hashes.
  return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

function renderMarkup(props: ReviewWaitFooterProps = {}): string {
  return renderToStaticMarkup(
    createElement(SSRProvider, null, createElement(ReviewWaitFooter, props)),
  );
}

describe('wait footer — no elapsed clock', () => {
  it('shows no elapsed time in the first minute', () => {
    expect(render({ startedAt: Date.now() - 42_000 })).not.toContain('42s');
  });

  it('shows no elapsed time on a long run either', () => {
    // The run the user reported sat on one frozen line for roughly ten minutes.
    // Counting that out loud told them nothing they could act on.
    const markup = render({ startedAt: Date.now() - (9 * 60 + 7) * 1000 });

    expect(markup).not.toContain('9m');
    expect(markup).not.toContain('elapsed');
  });

  it('renders nothing at all when given a start time and nothing else', () => {
    // Without the clock a bare `startedAt` has nothing to say, and an empty
    // bordered strip under the stage list would read as a rendering fault.
    // CopilotReviewPage passes exactly this.
    expect(render({ startedAt: Date.now() - 42_000 }).trim()).toBe('');
  });

  it('renders nothing at all when given no props', () => {
    expect(render().trim()).toBe('');
  });

  it('renders nothing on error, where timing means nothing', () => {
    const markup = render({
      startedAt: Date.now() - 60_000,
      scopeSummary: '1 skill · 14 files',
      failed: true,
    });

    expect(markup.trim()).toBe('');
  });
});

describe('wait footer — scope line', () => {
  it('renders the caller-supplied scope verbatim', () => {
    // The caller owns the wording because "component" is right for the agent
    // tabs and wrong for an uploaded archive.
    expect(render({ scopeSummary: '1 skill · 14 files' })).toContain('1 skill · 14 files');
  });

  it('never says "component"', () => {
    expect(render({ scopeSummary: '1 skill · 14 files' })).not.toMatch(/component/i);
  });

  it('renders a scope with no run in progress, so the line appears before timing starts', () => {
    const markup = render({ scopeSummary: '1 skill · 14 files' });

    expect(markup).toContain('1 skill · 14 files');
    expect(markup).not.toContain('elapsed');
  });
});

describe('wait footer — slow-run note', () => {
  it('stays hidden while the run is within its normal duration', () => {
    const markup = render({
      startedAt: Date.now() - 60_000,
      slowAfterMs: FOUR_MINUTES,
      slowNote: NOTE,
    });

    expect(markup).not.toContain('Most reviews finish');
  });

  it('appears once the threshold passes', () => {
    const markup = render({
      startedAt: Date.now() - 5 * 60 * 1000,
      slowAfterMs: FOUR_MINUTES,
      slowNote: NOTE,
    });

    expect(markup).toContain('Most reviews finish');
  });

  it('uses quiet status text instead of a MessageBar', () => {
    const markup = renderMarkup({
      startedAt: Date.now() - 5 * 60 * 1000,
      slowAfterMs: FOUR_MINUTES,
      slowNote: NOTE,
    });

    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('fui-MessageBar');
  });

  it('does not appear on error, where the failure message is the explanation', () => {
    const markup = render({
      startedAt: Date.now() - 5 * 60 * 1000,
      slowAfterMs: FOUR_MINUTES,
      slowNote: NOTE,
      failed: true,
    });

    expect(markup).not.toContain('Most reviews finish');
  });

  it('never appears without a threshold, however long the run', () => {
    const markup = render({ startedAt: Date.now() - 60 * 60 * 1000, slowNote: NOTE });

    expect(markup).not.toContain('Most reviews finish');
  });

  it('never appears without a note, so a bare threshold cannot render an empty bar', () => {
    const markup = render({ startedAt: Date.now() - 60 * 60 * 1000, slowAfterMs: FOUR_MINUTES });

    expect(markup.trim()).toBe('');
  });
});

describe('wait footer — expected duration', () => {
  const EXPECTED = 'usually 3–10 min';

  it('appears from the first seconds, where the progress bar is most misleading', () => {
    // The AI stage reports 60% the instant it starts and reports nothing again
    // until it returns. So at twenty seconds the bar already reads past half
    // while nearly all of the wait remains. With the clock gone this line is the
    // only thing on screen that contradicts that impression.
    const markup = render({ startedAt: Date.now() - 20_000, expectedLabel: EXPECTED });

    expect(markup).toContain(EXPECTED);
  });

  it('gives way to the slow note rather than repeating it', () => {
    // Both state the typical duration. Showing them together would read as the
    // dialog arguing with itself over the same number.
    const markup = render({
      startedAt: Date.now() - 5 * 60 * 1000,
      slowAfterMs: FOUR_MINUTES,
      slowNote: NOTE,
      expectedLabel: EXPECTED,
    });

    expect(markup).toContain('Most reviews finish');
    expect(markup).not.toContain(EXPECTED);
  });

  it('is withheld until a run exists, having nothing to qualify on its own', () => {
    const markup = render({ scopeSummary: '1 skill · 14 files', expectedLabel: EXPECTED });

    expect(markup).toContain('1 skill · 14 files');
    expect(markup).not.toContain(EXPECTED);
  });

  it('is absent for callers that pass no expectation, leaving the other tabs unchanged', () => {
    const markup = render({ startedAt: Date.now() - 20_000, scopeSummary: '4 topics' });

    expect(markup).toContain('4 topics');
    expect(markup).not.toContain('usually');
  });

  it('renders beside the scope, not on a line of its own', () => {
    const markup = render({
      startedAt: Date.now() - 20_000,
      scopeSummary: '1 skill · 14 files',
      expectedLabel: EXPECTED,
    });

    expect(markup).toContain('1 skill · 14 files');
    expect(markup).toContain(EXPECTED);
  });
});
