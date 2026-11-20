import { describe, expect, it, vi } from 'vitest';
import {
  isKitActive, isRunInProgress, kitLabel, kitTone, runDisplayStatus, runTone, showKitBadge,
  type EvaluationRunVM, type KitRunVM,
} from '../model-assessment';
import { isAwaitingKitStart, shouldPollKit } from '../../hooks/useKitTests';
import { buildComparisonPdf } from '../../services/comparison-export';
import { classifyRunStatuses } from '../comparison-utils';
import { kitRowNeedsAttention, kitRowStatuses, pivotKitResults } from '../kit-results';

vi.mock('../../services/model-assessment-service', () => ({
  getKitOptions: vi.fn(),
  getKitProgress: vi.fn(),
  getRunById: vi.fn(),
  saveKitSettings: vi.fn(),
}));

const kit = (status: string, extra: Partial<KitRunVM> = {}): KitRunVM => ({
  status, pass: 0, fail: 0, total: 0, regressed: 0, improved: 0, ...extra,
});

const run = (status: string, extra: Partial<EvaluationRunVM> = {}): EvaluationRunVM => ({
  id: 'r1', name: 'r1', status, analysisStatus: 'Completed', regression: 'Healthy',
  pass: 1, fail: 0, error: 0, excluded: 0, completedOn: '2026-09-11T12:00:00Z', ...extra,
});

describe('Kit test track helpers', () => {
  it('treats running and analysing as active', () => {
    expect(isKitActive('Running')).toBe(true);
    expect(isKitActive('Analysing')).toBe(true);
    expect(isKitActive('Completed')).toBe(false);
    expect(isKitActive('Timed Out')).toBe(false);
    expect(isKitActive(undefined)).toBe(false);
  });

  it('labels and colours each Kit status', () => {
    expect(kitLabel(kit('Running'))).toBe('Kit tests running');
    expect(kitLabel(kit('Analysing'))).toBe('Kit summary pending');
    expect(kitLabel(kit('Completed', { pass: 8, total: 10 }))).toBe('Kit 8/10 passed');
    expect(kitLabel(kit('Timed Out'))).toBe('Kit timed out');
    expect(kitLabel(kit('Skipped'))).toBe('Kit skipped');
    expect(kitTone(kit('Running'))).toBe('brand');
    expect(kitTone(kit('Completed', { pass: 10, total: 10 }))).toBe('success');
    expect(kitTone(kit('Completed', { pass: 9, fail: 1, total: 10, regressed: 1 }))).toBe('warning');
    expect(kitTone(kit('Failed'))).toBe('danger');
    expect(kitTone(kit('Skipped'))).toBe('neutral');
  });

  it('waits for the Kit flow to start only shortly after a model-change assessment', () => {
    const finished = Date.parse('2026-09-11T12:00:00Z');
    expect(isAwaitingKitStart(run('Completed'), true, finished + 60_000)).toBe(true);
    expect(isAwaitingKitStart(run('Completed'), true, finished + 10 * 60_000)).toBe(false);
    expect(isAwaitingKitStart(run('Completed'), false, finished + 60_000)).toBe(false);
    expect(isAwaitingKitStart(run('Running'), true, finished + 60_000)).toBe(false);
    expect(isAwaitingKitStart(run('Completed', { kit: kit('Running') }), true, finished)).toBe(false);
  });

  it('expects the Kit flow while the Copilot evaluation is still running', () => {
    const running = run('Evaluation Running', { completedOn: undefined });
    expect(isAwaitingKitStart(running, true)).toBe(true);
    expect(shouldPollKit(running, true)).toBe(true);
    expect(shouldPollKit(running, false)).toBe(false);
  });

  it('polls while the Kit track is active', () => {
    expect(shouldPollKit(run('Completed', { kit: kit('Running') }), true)).toBe(true);
    expect(shouldPollKit(run('Completed', { kit: kit('Completed') }), true)).toBe(false);
    expect(shouldPollKit(undefined, true)).toBe(false);
  });

  it('adds the Kit results and summary to the PDF', () => {
    const doc = buildComparisonPdf({
      agentName: 'Helpdesk',
      runs: [{
        run: run('Completed', {
          ai: 'Nothing regressed.',
          kit: kit('Completed', { pass: 8, fail: 2, total: 10, regressed: 1, improved: 0, summary: 'One Kit test regressed.' }),
        }),
        model: 'GPT-5 Auto',
      }],
      rows: [],
    });
    const pdf = doc.output();
    for (const text of ['Copilot Agent Kit tests', 'One Kit test regressed.']) {
      expect(pdf).toContain(`(${text}`);
    }
    expect(pdf).toContain('8 of 10 passed, 2 failed, 1 regressed');
  });
});

describe('showKitBadge', () => {
  it('hides the Kit badge when the run status already tells the outcome', () => {
    for (const status of ['Skipped', 'Failed', 'Timed Out', 'Completed']) expect(showKitBadge(kit(status))).toBe(false);
    expect(showKitBadge(undefined)).toBe(false);
  });

  it('shows the Kit badge only while the Kit tests are in progress', () => {
    for (const status of ['Running', 'Analysing']) expect(showKitBadge(kit(status))).toBe(true);
  });
});

describe('runDisplayStatus with a Kit track', () => {
  it('shows one in-progress Kit status instead of Evaluation Running', () => {
    const status = runDisplayStatus(run('Evaluation Running', { kit: kit('Running') }));
    expect(status).toBe('Kit tests running');
    expect(isRunInProgress(status)).toBe(true);
    expect(runTone(status)).toBe('brand');
    expect(runDisplayStatus(run('Evaluation Running', { kit: kit('Analysing') }))).toBe('Kit summary pending');
  });

  it('shows the run outcome once the Kit tests finish', () => {
    expect(runDisplayStatus(run('Completed', { kit: kit('Completed', { pass: 9, total: 9 }) }))).toBe('Completed');
    expect(runDisplayStatus(run('Evaluation Running'))).toBe('Evaluation Running');
  });
});

describe('Kit rows in the comparison filters', () => {
  const runs = [
    run('Completed', { id: 'a', kit: kit('Completed', { testRunId: 'KA' }) }),
    run('Completed', { id: 'b', kit: kit('Completed', { testRunId: 'kb' }) }),
  ];
  const [row] = pivotKitResults([
    { id: '1', testRunId: 'ka', testId: 't', utterance: 'Hi', code: 1 },
    { id: '2', testRunId: 'kb', testId: 't', utterance: 'Hi', code: 2 },
  ]);

  it('maps Kit results to evaluation statuses so regressions are classified', () => {
    expect(kitRowStatuses(row, runs)).toEqual(['Pass', 'Fail']);
    expect(classifyRunStatuses(kitRowStatuses(row, runs))).toBe('regressed');
    expect(kitRowNeedsAttention(row, runs)).toBe(true);
  });

  it('does not flag a Kit test that passed in every run', () => {
    const [passed] = pivotKitResults([{ id: '1', testRunId: 'ka', testId: 't', utterance: 'Hi', code: 1 }]);
    expect(kitRowStatuses(passed, runs)).toEqual(['Pass', undefined]);
    expect(kitRowNeedsAttention(passed, runs)).toBe(false);
  });
});
