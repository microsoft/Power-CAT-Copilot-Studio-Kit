/**
 * What the progress dialog tells a user during a long wait.
 *
 * Every artifact review this environment has recorded took between 2m33s and
 * 10m26s, and all of them completed. For that whole time the dialog previously
 * showed one frozen line —
 * "Review agent is analysing 1 components" — which was wrong in three ways at
 * once: it never changed, it counted skills while saying "components", and it
 * gave no way to tell a slow review from a dead one.
 *
 * These tests pin the three replacements, all of which are backed by measured
 * values rather than estimates:
 *   - the scope line counts real files from the parsed archive,
 *   - the AI stage detail repeats what the workflow actually finished,
 *   - the slow-run note appears only past every observed healthy duration.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildArtifactProgressStages,
  buildArtifactScopeSummary,
  describeAiProgress,
  SLOW_REVIEW_AFTER_MS,
  SLOW_REVIEW_NOTE,
} from '../components/artifactProgressStages';
import type { ArtifactReviewProgress } from '../contracts/ArtifactReview';

const PROVIDER_KEY = 'csk.reviewAiProvider';

/* The resolver reads localStorage, which the node environment lacks. */
function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
}

function progress(over: Partial<ArtifactReviewProgress> = {}): ArtifactReviewProgress {
  return { stage: 'ai', percent: 55, message: 'Reviewing my-skill', ...over };
}

describe('scope summary — counts files, not just skills', () => {
  it('reports both counts, so the number matches the folder the user zipped', () => {
    // The reported bug: an archive of assets/, references/, scripts/ and
    // SKILL.md showed "1 components". The file count is the figure the user
    // can check against their own folder listing.
    expect(buildArtifactScopeSummary(progress({ skillCount: 1, fileCount: 14 }))).toBe(
      '1 skill · 14 files',
    );
  });

  it('says "skill", never "component"', () => {
    const summary = buildArtifactScopeSummary(progress({ skillCount: 1, fileCount: 3 })) ?? '';
    expect(summary).toContain('skill');
    expect(summary).not.toMatch(/component/i);
  });

  it('singularises a one-file bundle', () => {
    expect(buildArtifactScopeSummary(progress({ skillCount: 1, fileCount: 1 }))).toBe(
      '1 skill · 1 file',
    );
  });

  it('pluralises correctly when an archive holds several skills', () => {
    expect(buildArtifactScopeSummary(progress({ skillCount: 2, fileCount: 9 }))).toBe(
      '2 skills · 9 files',
    );
  });

  it('shows nothing until the archive has been read', () => {
    // A placeholder such as "0 files" during the reading stage would be read as
    // a real measurement of an empty bundle.
    expect(buildArtifactScopeSummary(progress({ stage: 'reading' }))).toBeUndefined();
    expect(buildArtifactScopeSummary(undefined)).toBeUndefined();
  });
});

describe('AI stage detail — proof the workflow is alive', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(PROVIDER_KEY, 'workflow');
  });
  afterEach(() => vi.unstubAllGlobals());

  function detailOf(p: ArtifactReviewProgress, label: string) {
    return buildArtifactProgressStages(p).find((s) => s.stageName === label)?.detail;
  }

  it('repeats what the workflow reported finishing', () => {
    const detail = detailOf(
      progress({ lastCompleted: 'Reviewed agent-harness-explorer' }),
      'Reviewing wording and instructions with AI',
    );

    expect(detail).toContain('Reviewed agent-harness-explorer');
  });

  it('keeps the phase message alongside it, so the line still says what is happening', () => {
    const detail = detailOf(
      progress({ message: 'Reviewing my-skill', lastCompleted: 'Reviewed my-skill' }),
      'Reviewing wording and instructions with AI',
    );

    expect(detail).toContain('Reviewing my-skill');
  });

  it('falls back to the phase message before the workflow reports anything', () => {
    // `cat_laststatus` is null until the first unit of work completes, which is
    // most of the wait on a slow run.
    expect(
      detailOf(progress({ message: 'Handing my-skill to the review agent' }), 'Reviewing wording and instructions with AI'),
    ).toBe('Handing my-skill to the review agent');
  });

  it('never attaches the workflow line to a stage that runs in the browser', () => {
    // Only the AI stage is served by the workflow. A last-completed line on the
    // scoring stage would credit local compute to the agent.
    const stages = buildArtifactProgressStages(
      progress({ stage: 'scoring', lastCompleted: 'Reviewed my-skill' }),
    );
    const scoring = stages.find((s) => s.stageName === 'Scoring against the authoring rubric');

    expect(scoring?.detail).not.toContain('Reviewed my-skill');
  });
});

describe('AI stage wording — names the skill being reviewed', () => {
  // The reassurance a user asked for: the message should name the thing being
  // worked on, so it can be checked against the file they uploaded.
  it('names the skill while the agent is running', () => {
    expect(describeAiProgress('expense-report', true)).toContain('expense-report');
  });

  it('names the skill before the agent has picked the job up', () => {
    expect(describeAiProgress('expense-report', false)).toContain('expense-report');
  });

  it('distinguishes handing over from actively reviewing', () => {
    // Two phases that previously shared one frozen line.
    expect(describeAiProgress('x', false)).not.toBe(describeAiProgress('x', true));
  });

  it('never says "component"', () => {
    expect(describeAiProgress('expense-report', true)).not.toMatch(/component/i);
    expect(describeAiProgress('expense-report', false)).not.toMatch(/component/i);
  });
});

describe('slow-run threshold', () => {
  it('sits past every observed healthy run', () => {
    // Every artifact review recorded in Dataverse, matched to its job row by
    // timestamp: 2m33s, 3m16s, 7m35s, 9m03s, 10m04s, 10m26s. The note must not
    // fire on any of those, or it stops meaning "longer than usual".
    //
    // This assertion previously used 3m03s, taken from four runs that cannot be
    // traced to any artifact review. Those durations match the Copilot Studio
    // reviews sharing the job table (median 3m10s over sixteen runs), and
    // calibrating on them made the note fire on four of the six real runs.
    const observedSlowestMs = (10 * 60 + 26) * 1000;
    expect(SLOW_REVIEW_AFTER_MS).toBeGreaterThan(observedSlowestMs);
  });

  it('fires well before the 45-minute ceiling', () => {
    // Reassurance that arrives at minute 44 is worthless.
    expect(SLOW_REVIEW_AFTER_MS).toBeLessThan(15 * 60 * 1000);
  });

  it('states the typical duration, so "longer than usual" is checkable', () => {
    expect(SLOW_REVIEW_NOTE).toMatch(/ten minutes/i);
  });

  it('tells the user this window stops waiting by itself', () => {
    // Without a ceiling the only readings are "wait forever" or "it is broken".
    expect(SLOW_REVIEW_NOTE).toMatch(/45 minutes/i);
  });

  it('does not claim the review itself stops at that ceiling', () => {
    // DEFAULT_DEADLINE_MS is documented as a client-side ceiling: "The job keeps
    // running server-side after this fires." An earlier draft said "the review
    // stops automatically after 45 minutes", which described a server behaviour
    // that does not exist.
    expect(SLOW_REVIEW_NOTE).not.toMatch(/review stops automatically/i);
    expect(SLOW_REVIEW_NOTE).toMatch(/app stops waiting/i);
  });

  it('does not imply that waiting is futile', () => {
    // The two slowest recorded runs took 9m03s and 10m26s, and both produced a
    // full result. So a long wait must be attributed to load, and the note has
    // to say what is still true of the review rather than only what is slow.
    expect(SLOW_REVIEW_NOTE).toMatch(/not that the review has stopped/i);
  });

  it('never offers cancelling as a way to stop the review', () => {
    // The dialog no longer has a discard action, and it never could stop the
    // work: `cancel()` aborts a client AbortController while the workflow run
    // carries on to completion with the AI call already paid for. The note must
    // not reintroduce the idea by describing a button that is gone.
    expect(SLOW_REVIEW_NOTE).not.toMatch(/discard/i);
    expect(SLOW_REVIEW_NOTE).not.toMatch(/cancel/i);
    expect(SLOW_REVIEW_NOTE).not.toMatch(/try again later/i);
  });

  it('tells the reader the result survives the app closing', () => {
    // True since resumeArtifactReview: the row carries the artifact hash, the
    // job was always submitted under that hash, and the history sweep looks it
    // up and finishes the review wherever the reader lands next.
    expect(SLOW_REVIEW_NOTE).toMatch(/closing or refreshing the app is safe/i);
  });

  it('says where the result will be waiting, not merely that it is safe', () => {
    // Collection happens on the sweep that runs when the tab is opened. A reader
    // told only "it is safe" has no reason to go and look.
    expect(SLOW_REVIEW_NOTE).toMatch(/next time you open Skills and automations/i);
  });

  it('no longer instructs the reader to keep the app open', () => {
    // This was the note's central caveat while collection was client-only.
    // Leaving it in would send readers back to babysitting a dialog for no
    // reason, and would contradict the sentence above it.
    expect(SLOW_REVIEW_NOTE).not.toMatch(/keep the app open/i);
    expect(SLOW_REVIEW_NOTE).not.toMatch(/only saved if the app is still running/i);
  });

  it('does not restate the "Continue in background" button', () => {
    // Leaving the dialog is safe — the run is held above the router — but that
    // is what the button in the same dialog footer already offers, from the
    // first second of the review rather than from the twelfth minute. Copy that
    // narrates a visible control costs a sentence, carries no information, and
    // suggests the button was not enough on its own.
    //
    // So the note is scoped to what the button cannot say: the typical
    // duration, that a long wait means load, that closing the whole app is
    // safe too, and when the app gives up.
    expect(SLOW_REVIEW_NOTE).not.toMatch(/close this dialog/i);
    expect(SLOW_REVIEW_NOTE).not.toMatch(/carry on working/i);
    expect(SLOW_REVIEW_NOTE).not.toMatch(/continue in background/i);
  });

  it('leaves the review is not presented as the recommended action', () => {
    // The dialog exists to show progress. "Continue in background" is an escape
    // hatch for a reader who does not want to wait, not the thing they should
    // do, so it must not carry the filled emphasis that Fluent reserves for a
    // recommended action — that reads as an instruction to go away and competes
    // with the stage list beside it. It is the only control in that footer, so
    // it is found without the weight.
    const source = readFileSync(
      resolve(__dirname, '../../components/dialogs/ReviewProgressDialog.tsx'),
      'utf-8',
    );
    const footer = source.slice(source.indexOf('{onContinueInBackground && ('));
    const button = footer.slice(0, footer.indexOf('Continue in background'));
    expect(button).toMatch(/appearance="secondary"/);
    expect(button).not.toMatch(/appearance="primary"/);
  });

  it('does not describe "not finished" as the result of leaving', () => {
    // It no longer is. A review only lands there if the job failed or cannot be
    // found, and the grid explains that itself, at the point it happens.
    expect(SLOW_REVIEW_NOTE).not.toMatch(/not finished/i);
  });
});
