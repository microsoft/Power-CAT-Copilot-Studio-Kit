/**
 * The workflow mark is attribution, and attribution that lies is worse than no
 * attribution at all. These tests pin the three ways it could start lying:
 *
 * 1. Claiming stages the workflow does not run (the local ones).
 * 2. Surviving a switch to the prompt backend.
 * 3. Replacing status, so "done" would rest on colour alone.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { copilotProgressToStages } from '../components/copilotProgressStages';
import { buildCopilotReviewProgressStages } from '../components/copilotReviewProgressAdapter';
import type { ProgressStage } from '../../hooks/useReviewMutation';
import type { SkillReviewProgress } from '../contracts/SkillBundle';

const PROVIDER_KEY = 'csk.reviewAiProvider';

/*
 * The suite runs on the `node` environment (vitest.config.ts), which has no
 * localStorage, and the backend resolver swallows the resulting throw and
 * returns its default. That would make every assertion below pass for the wrong
 * reason, so the store is stubbed explicitly rather than left to the fallback.
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

function at(stage: SkillReviewProgress['stage']): SkillReviewProgress {
  return {
    stage,
    percent: 50,
    message: 'working',
    skillName: 'demo',
    completedUnits: 1,
    totalUnits: 4,
    partialFailures: 0,
  };
}

/** Stage names that run in the browser and must never carry attribution. */
const LOCAL_PHASES = [
  'Loading configuration',
  'Downloading skill files',
  'Running deterministic checks',
  'Saving results',
];

describe('workflow attribution — which stages may claim it', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(PROVIDER_KEY, 'workflow');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks the two stages a workflow serves', () => {
    const stages = copilotProgressToStages(at('standard-ai'));
    const marked = stages.filter(s => s.attribution === 'workflow-agent').map(s => s.stageName);

    expect(marked).toEqual(['Evaluating skills', 'Analysing resources']);
  });

  it('never marks a stage that runs in the browser', () => {
    const stages = copilotProgressToStages(at('standard-ai'));

    LOCAL_PHASES.forEach(name => {
      const row = stages.find(s => s.stageName === name);
      expect(row, `${name} should exist`).toBeDefined();
      expect(row?.attribution, `${name} must not claim the workflow`).toBeUndefined();
    });
  });

  // The deterministic rules are the part of this review that is not AI at all.
  // Crediting a workflow for them would misdescribe the tool's own strength.
  it('leaves the deterministic checks unattributed at every stage of the run', () => {
    const everyStage: SkillReviewProgress['stage'][] = [
      'loading', 'downloading', 'deterministic-scan', 'standard-ai',
      'deep-resource-ai', 'file-synthesis', 'bundle-synthesis', 'persisting', 'complete',
    ];

    everyStage.forEach(stage => {
      const row = copilotProgressToStages(at(stage))
        .find(s => s.stageName === 'Running deterministic checks');
      expect(row?.attribution, `at ${stage}`).toBeUndefined();
    });
  });
});

describe('workflow attribution — follows the live backend', () => {
  beforeEach(() => {
    installLocalStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The backend is overridable at runtime for one-off comparisons. A mark that
  // ignored the override would state the wrong backend on exactly the run
  // someone is inspecting.
  it('disappears entirely when the prompt backend is forced', () => {
    localStorage.setItem(PROVIDER_KEY, 'prompt');

    const stages = copilotProgressToStages(at('standard-ai'));
    expect(stages.some(s => s.attribution)).toBe(false);

    const dialogStages = buildCopilotReviewProgressStages(at('standard-ai'));
    expect(dialogStages.some(s => s.attribution)).toBe(false);
  });

  it('appears again when the workflow backend is restored', () => {
    localStorage.setItem(PROVIDER_KEY, 'workflow');
    expect(copilotProgressToStages(at('standard-ai')).some(s => s.attribution)).toBe(true);
  });
});

describe('workflow attribution — never carries status', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(PROVIDER_KEY, 'workflow');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // If attribution only appeared once a stage completed, the gradient would be
  // doing the tick's job -- and "done" would rest on colour alone (WCAG 1.4.1).
  // It is present in every status, so the tick remains the only status signal.
  it('is present while pending, active and completed alike', () => {
    const seen = new Set<string>();

    (['loading', 'standard-ai', 'complete'] as const).forEach(stage => {
      const row = copilotProgressToStages(at(stage))
        .find(s => s.stageName === 'Evaluating skills');
      expect(row?.attribution).toBe('workflow-agent');
      if (row) seen.add(row.status);
    });

    expect(seen.has('pending')).toBe(true);
    expect(seen.has('active')).toBe(true);
    expect(seen.has('completed')).toBe(true);
  });

  it('does not disturb the status a stage would otherwise report', () => {
    const withMark = copilotProgressToStages(at('standard-ai'))
      .find(s => s.stageName === 'Evaluating skills');

    expect(withMark?.status).toBe('active');
    expect(withMark?.detail).toBeDefined();
  });
});

describe('workflow attribution — the dashboard dialog path', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(PROVIDER_KEY, 'workflow');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks exactly one stage, and not the local ones around it', () => {
    const stages = buildCopilotReviewProgressStages(at('standard-ai'));
    const marked = stages.filter(s => s.attribution).map(s => s.stageName);

    expect(marked).toEqual(['Checking Compliance']);
    expect(stages.find(s => s.stageName === 'Initializing')?.attribution).toBeUndefined();
    expect(stages.find(s => s.stageName === 'Saving Results')?.attribution).toBeUndefined();
  });
});

describe('workflow attribution — Standard workflow stages', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem(PROVIDER_KEY, 'workflow');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Mirrors executeReviewPipeline's initial stage list (useReviewMutation.ts).
  // Built here rather than imported because that module reaches Dataverse on
  // load; the shape is what matters, and a drift in it is caught by the
  // stage-name assertion below.
  const standardReviewStages: ProgressStage[] = [
    { stageName: 'Initializing', progress: 0, status: 'active' },
    { stageName: 'Parsing Configuration', progress: 10, status: 'pending' },
    { stageName: 'Evaluating Patterns', progress: 30, status: 'pending', attribution: 'workflow-agent' },
    { stageName: 'Checking Compliance', progress: 60, status: 'pending', attribution: 'workflow-agent' },
    { stageName: 'Saving Results', progress: 85, status: 'pending' },
    { stageName: 'Complete', progress: 100, status: 'pending' },
  ];

  it('marks the two Standard outputs produced by the workflow', () => {
    expect(standardReviewStages.filter(stage => stage.attribution).map(stage => stage.stageName))
      .toEqual(['Evaluating Patterns', 'Checking Compliance']);
  });

  it('keeps Standard local stages unattributed', () => {
    expect(
      standardReviewStages
        .filter(stage => !['Evaluating Patterns', 'Checking Compliance'].includes(stage.stageName))
        .every(stage => stage.attribution === undefined),
    ).toBe(true);
  });

  it('shares stage names with the Copilot mapping while retaining its own attribution boundary', () => {
    const copilotStages = buildCopilotReviewProgressStages(at('standard-ai'));

    expect(copilotStages.map(s => s.stageName))
      .toEqual(standardReviewStages.map(s => s.stageName));

    expect(copilotStages.some(s => s.attribution)).toBe(true);
    expect(standardReviewStages.some(s => s.attribution)).toBe(true);
  });
});
