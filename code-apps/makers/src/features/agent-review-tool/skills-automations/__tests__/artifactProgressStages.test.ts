/**
 * Workflow attribution for the artifact review (spec 018).
 *
 * The artifact review renders the shared `ReviewProgressDialog`, which carries
 * the workflow mark. `workflowAttribution.test.ts` already pins the rule that
 * the mark must never claim a stage the workflow does not run — this file pins
 * the same rule for the third review type, which was added after it.
 *
 * The mark matters more here than elsewhere: five of the six stages run in the
 * browser, so a user watching a slow run needs to know which one is waiting on
 * Dataverse and which are local compute.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildArtifactProgressStages,
  WORKFLOW_SERVED_STAGE,
} from '../components/artifactProgressStages';
import type { ArtifactReviewProgress } from '../contracts/ArtifactReview';

const PROVIDER_KEY = 'csk.reviewAiProvider';

/*
 * The suite runs on the `node` environment, which has no localStorage, and the
 * backend resolver swallows the throw and returns its default. Every assertion
 * would then pass for the wrong reason.
 */
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

function at(stage: ArtifactReviewProgress['stage']): ArtifactReviewProgress {
  return { stage, percent: 50, message: 'working' } as ArtifactReviewProgress;
}

/** Stage labels that run in the browser and must never carry attribution. */
const LOCAL_LABELS = [
  'Reading the uploaded files',
  'Identifying the artifact type',
  'Checking packaging, structure, safety and runtime fit',
  'Scoring against the authoring rubric',
];

describe('artifact progress — which stages may claim the workflow', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(PROVIDER_KEY, 'workflow');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('marks exactly one stage, the AI one', () => {
    const marked = buildArtifactProgressStages(at('ai'))
      .filter((s) => s.attribution === 'workflow-agent')
      .map((s) => s.stageName);

    expect(marked).toEqual(['Reviewing wording and instructions with AI']);
  });

  it('never marks a stage that runs in the browser', () => {
    const stages = buildArtifactProgressStages(at('ai'));

    LOCAL_LABELS.forEach((name) => {
      const row = stages.find((s) => s.stageName === name);
      expect(row, `${name} should exist`).toBeDefined();
      expect(row?.attribution, `${name} must not claim the workflow`).toBeUndefined();
    });
  });

  // The deterministic rules are the part of this review that is not AI at all.
  // Crediting a workflow for them would misdescribe the tool's own strength.
  it('leaves the deterministic stage unattributed at every point in the run', () => {
    (['reading', 'detecting', 'deterministic', 'ai', 'scoring', 'complete'] as const).forEach(
      (stage) => {
        const row = buildArtifactProgressStages(at(stage)).find(
          (s) => s.stageName === 'Checking packaging, structure, safety and runtime fit',
        );
        expect(row?.attribution, `at ${stage}`).toBeUndefined();
      },
    );
  });

  it('exports the served stage so the mark and the adapter cannot drift apart', () => {
    expect(WORKFLOW_SERVED_STAGE).toBe('ai');
  });
});

describe('artifact progress — follows the live backend', () => {
  beforeEach(() => installLocalStorage());
  afterEach(() => vi.unstubAllGlobals());

  it('disappears entirely when the prompt backend is forced', () => {
    localStorage.setItem(PROVIDER_KEY, 'prompt');

    expect(buildArtifactProgressStages(at('ai')).some((s) => s.attribution)).toBe(false);
  });

  it('appears again when the workflow backend is restored', () => {
    localStorage.setItem(PROVIDER_KEY, 'workflow');

    expect(buildArtifactProgressStages(at('ai')).some((s) => s.attribution)).toBe(true);
  });
});

describe('artifact progress — never carries status', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(PROVIDER_KEY, 'workflow');
  });
  afterEach(() => vi.unstubAllGlobals());

  // If attribution only appeared once a stage completed, the mark would be
  // doing the tick's job, and "done" would rest on colour alone (WCAG 1.4.1).
  it('is present while pending, active and completed alike', () => {
    const seen = new Set<string>();

    (['reading', 'ai', 'complete'] as const).forEach((stage) => {
      const row = buildArtifactProgressStages(at(stage)).find(
        (s) => s.stageName === 'Reviewing wording and instructions with AI',
      );
      expect(row?.attribution).toBe('workflow-agent');
      if (row) seen.add(row.status);
    });

    expect(seen.has('pending')).toBe(true);
    expect(seen.has('active')).toBe(true);
    expect(seen.has('completed')).toBe(true);
  });
});

describe('artifact progress — stage ordering', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(PROVIDER_KEY, 'workflow');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('marks earlier stages completed and later ones pending', () => {
    const stages = buildArtifactProgressStages(at('scoring'));

    expect(stages[0].status).toBe('completed');
    expect(stages[3].status).toBe('completed');
    expect(stages[4].status).toBe('active');
    expect(stages[5].status).toBe('pending');
  });

  it('reports the final stage as completed rather than active', () => {
    // "Review complete" spinning forever would read as a stall on the very
    // step that says it finished.
    const stages = buildArtifactProgressStages(at('complete'));
    expect(stages[5].status).toBe('completed');
  });

  it('shows the live message only on the stage it describes', () => {
    const stages = buildArtifactProgressStages(at('ai'));

    expect(stages[3].detail).toBe('working');
    expect(stages.filter((s) => s.detail).length).toBe(1);
  });

  it('turns the current stage red when the review failed there', () => {
    const stages = buildArtifactProgressStages(at('ai'), true);

    expect(stages[3].status).toBe('error');
    expect(stages[3].detail).toBeUndefined();
  });

  it('starts at the first stage before any progress arrives', () => {
    const stages = buildArtifactProgressStages(undefined);

    expect(stages).toHaveLength(6);
    expect(stages[0].status).toBe('active');
    expect(stages[0].progress).toBe(0);
    expect(stages.slice(1).every((s) => s.status === 'pending')).toBe(true);
  });

  it('does not show active or completed steps if an error precedes progress', () => {
    const stages = buildArtifactProgressStages(undefined, true);

    expect(stages[0].status).toBe('error');
    expect(stages[0].progress).toBe(0);
    expect(stages.slice(1).every(stage => stage.status === 'pending')).toBe(true);
    expect(stages.some(stage => stage.status === 'active' || stage.status === 'completed')).toBe(false);
  });
});

/*
 * A large archive is split so the agent can review the pieces in parallel. The
 * first build of that leaked the split into the dialog: it showed the backend's
 * own last-completed ping, which parallel iterations overwrite, so the line read
 * "portion 4 of 6" then "portion 2 of 6" and looked like the review was running
 * backwards. The bar sat at one number throughout. These pin the fix.
 */
describe('artifact progress — a split archive reports a count, not a ping', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(PROVIDER_KEY, 'workflow');
  });
  afterEach(() => vi.unstubAllGlobals());

  function split(completedParts: number, totalParts = 6): ArtifactReviewProgress {
    return {
      stage: 'ai',
      percent: 55,
      message: 'Reviewing my-skill against the authoring rubric',
      // Present and misleading on purpose: the fix is that this is ignored
      // once the archive was split, not that the backend stops sending it.
      lastCompleted: 'my-skill (portion 2 of 6)',
      completedParts,
      totalParts,
    };
  }

  const aiStage = (p: ArtifactReviewProgress) =>
    buildArtifactProgressStages(p).find((s) => s.stageName.startsWith('Reviewing wording'))!;

  it('counts what finished instead of naming what finished last', () => {
    expect(aiStage(split(4)).detail).toBe(
      'Reviewing my-skill against the authoring rubric — 4 of 6 parts reviewed',
    );
  });

  it('never shows the word "portion" to the user', () => {
    // The word is an internal parallelism detail. Someone who uploaded one zip
    // has no way to know what a portion is or how many they should expect.
    [0, 1, 3, 6].forEach((done) => {
      expect(aiStage(split(done)).detail).not.toContain('portion');
    });
  });

  it('moves the bar as parts finish, so a long run does not look stalled', () => {
    const percents = [0, 1, 2, 3, 4, 5, 6].map((done) => aiStage(split(done)).progress);

    // Strictly rising, and never falling back on any step.
    percents.forEach((p, i) => {
      if (i > 0) expect(p, `after ${i} parts`).toBeGreaterThan(percents[i - 1]);
    });
    expect(percents[0]).toBe(55);
  });

  it('stops short of the next stage, which has not started', () => {
    // The last part finishing does not end the AI stage; the agent still runs
    // its coverage pass. Landing on the scoring stage's 85 would say otherwise.
    expect(aiStage(split(6)).progress).toBeLessThan(85);
  });

  it('clamps a count that overshoots rather than reporting past the total', () => {
    // countCompletedComponents reads live rows. A stray row must not produce
    // "7 of 6 parts reviewed" or push the bar past its ceiling.
    expect(aiStage(split(7)).detail).toContain('6 of 6 parts reviewed');
    expect(aiStage(split(7)).progress).toBe(aiStage(split(6)).progress);
  });

  it('leaves an unsplit review on its existing wording', () => {
    // Most uploads are one skill and are never split. They keep the ping,
    // which names the one thing being worked on and cannot race.
    const one: ArtifactReviewProgress = {
      stage: 'ai',
      percent: 55,
      message: 'Reviewing my-skill against the authoring rubric',
      lastCompleted: 'my-skill',
    };

    expect(aiStage(one).detail).toBe(
      'Reviewing my-skill against the authoring rubric — last completed: my-skill',
    );
    expect(aiStage(one).progress).toBe(55);
  });

  it('does not count a single part, which is not a split', () => {
    const one = { ...split(1, 1) };
    expect(aiStage(one).detail).not.toContain('parts reviewed');
    expect(aiStage(one).progress).toBe(55);
  });

  it('holds the fixed percent once the stage is behind us', () => {
    // Interpolating a completed stage would leave its bar short of full.
    const later: ArtifactReviewProgress = { ...split(3), stage: 'scoring' };
    expect(aiStage(later).progress).toBe(55);
  });
});
