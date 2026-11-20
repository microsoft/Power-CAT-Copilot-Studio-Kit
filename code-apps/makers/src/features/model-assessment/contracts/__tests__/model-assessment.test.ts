import { describe, it, expect } from 'vitest';
import {
  sourceTone,
  regressionTone,
  runTone,
  resultTone,
  deltaTone,
  isRegression,
  formatWhen,
  formatRunName,
  type TrackedAgentVM,
  type EvaluationRunVM,
} from '../model-assessment';
import {
  classifyRunStatuses,
  compareRunsChronologically,
  isComparableRun,
  isScoredRun,
  withRunSummary,
} from '../comparison-utils';
import { parseModelNameHint } from '../../services/model-parser';

describe('formatRunName', () => {
  it.each(['2026-09-15T04:07:41.243Z', '2026-09-15T04:07:41Z'])(
    'formats the generated timestamp %s using the shared local date format',
    (iso) => {
      expect(formatRunName(`Customer Support Case Agent - ${iso}`))
        .toBe(`Customer Support Case Agent - ${formatWhen(iso)}`);
    },
  );

  it.each(['', 'RUN-1', 'Agent - 2026-99-15T04:07:41.243Z', 'Agent - September assessment'])(
    'preserves other names and unparseable dates: %s',
    (name) => expect(formatRunName(name)).toBe(name),
  );
});

const agent = (over: Partial<TrackedAgentVM> = {}): TrackedAgentVM => ({
  id: 'a',
  name: 'Agent',
  schema: 'cat_agent',
  sourceStatus: 'Active',
  regression: 'Healthy',
  lastRunStatus: 'Completed',
  pass: 0,
  fail: 0,
  error: 0,
  excluded: 0,
  ...over,
});

const run = (over: Partial<EvaluationRunVM> = {}): EvaluationRunVM => ({
  id: 'r',
  name: 'RUN-1',
  status: 'Completed',
  analysisStatus: 'Completed',
  regression: 'Healthy',
  pass: 0,
  fail: 0,
  error: 0,
  excluded: 0,
  ...over,
});

describe('tone mapping', () => {
  it('maps source status tones and is space/case insensitive', () => {
    expect(sourceTone('Active')).toBe('success');
    expect(sourceTone('Deleted')).toBe('danger');
    expect(sourceTone('Access Denied')).toBe('warning');
    expect(sourceTone('Inactive')).toBe('neutral');
    expect(sourceTone(undefined)).toBe('neutral');
  });

  it('maps regression tones', () => {
    expect(regressionTone('Healthy')).toBe('success');
    expect(regressionTone('Warning')).toBe('warning');
    expect(regressionTone('Critical')).toBe('danger');
    expect(regressionTone('Not Assessed')).toBe('neutral');
  });

  it('maps run status tones incl. multi-word labels', () => {
    expect(runTone('Completed')).toBe('success');
    expect(runTone('Requested')).toBe('brand');
    expect(runTone('Completed With Errors')).toBe('warning');
    expect(runTone('Timed Out')).toBe('warning');
    expect(runTone('Failed')).toBe('danger');
    expect(runTone('No Change')).toBe('neutral');
  });

  it('maps result and delta tones', () => {
    expect(resultTone('Pass')).toBe('success');
    expect(resultTone('Fail')).toBe('danger');
    expect(resultTone('Error')).toBe('warning');
    expect(deltaTone('Regressed')).toBe('danger');
    expect(deltaTone('Improved')).toBe('success');
    expect(deltaTone('New')).toBe('brand');
    expect(deltaTone('Removed')).toBe('warning');
    expect(deltaTone('Unchanged')).toBe('neutral');
  });
});

describe('isRegression', () => {
  it('treats critical and warning as regressions', () => {
    expect(isRegression('Critical')).toBe(true);
    expect(isRegression('Warning')).toBe(true);
    expect(isRegression('Healthy')).toBe(false);
    expect(isRegression('Not Assessed')).toBe(false);
  });
});

describe('formatWhen', () => {
  it('returns em dash for missing or invalid dates', () => {
    expect(formatWhen(undefined)).toBe('—');
    expect(formatWhen('not-a-date')).toBe('—');
  });

  it('formats a valid ISO date with its year', () => {
    expect(formatWhen('2024-01-15T10:30:00Z')).toContain('2024');
  });
});

describe('multi-run comparison helpers', () => {
  it('only permits completed runs with stored results', () => {
    const persisted = new Set(['r']);
    expect(isComparableRun(run({ status: 'Completed', pass: 1 }), persisted)).toBe(true);
    expect(isComparableRun(run({ status: 'Running', pass: 1 }), persisted)).toBe(false);
    expect(isComparableRun(run({ status: 'Completed', pass: 1 }), new Set())).toBe(false);
  });

  it('treats a completed Kit-mode run with Kit results as comparable', () => {
    const kit = { status: 'Completed', testRunId: 'k1', pass: 6, fail: 1, total: 7, regressed: 0, improved: 0 };
    expect(isComparableRun(run({ status: 'Completed', kit }), new Set())).toBe(true);
    expect(isComparableRun(run({ status: 'Completed', kit: { ...kit, status: 'Running' } }), new Set())).toBe(false);
    expect(isComparableRun(run({ status: 'Completed', kit: { ...kit, total: 0 } }), new Set())).toBe(false);
  });

  it('includes completed-with-errors snapshots without treating active or empty runs as comparable', () => {
    const assessment = run({ agentId: 'a', status: 'Completed With Errors', regression: 'Critical', fail: 1, error: 1 });
    expect(isComparableRun(assessment, new Set(['r']))).toBe(true);
    expect(isComparableRun(assessment, new Set())).toBe(false);
    expect(withRunSummary(agent(), [assessment], new Set(['r'])))
      .toMatchObject({ lastRunStatus: 'Completed With Errors', regression: 'Critical', fail: 1, error: 1 });
  });

  it('offers only runs that scored a test case for comparison', () => {
    const persisted = new Set(['r']);
    const unscored = run({ status: 'Completed With Errors', regression: 'Not Assessed', error: 5 });
    expect(isComparableRun(unscored, persisted)).toBe(true);
    expect(isScoredRun(unscored, persisted)).toBe(false);
    expect(isScoredRun({ ...unscored, fail: 1 }, persisted)).toBe(true);
    expect(isScoredRun(run({ status: 'Completed', pass: 1 }), persisted)).toBe(true);
    const kit = { status: 'Completed', testRunId: 'k1', pass: 6, fail: 1, total: 7, regressed: 0, improved: 0 };
    expect(isScoredRun(run({ status: 'Completed', kit }), new Set())).toBe(true);
  });

  it('detects intermediate regressions across three runs', () => {
    expect(classifyRunStatuses(['Pass', 'Fail', 'Pass'])).toBe('regressed');
    expect(classifyRunStatuses(['Fail', 'Pass', 'Pass'])).toBe('improved');
    expect(classifyRunStatuses(['Pass', 'Excluded', 'Excluded'])).toBe('changed');
    expect(classifyRunStatuses(['Pass', 'Pass', 'Pass'])).toBe('unchanged');
    expect(classifyRunStatuses([undefined, 'Pass'])).toBe('unchanged');
    expect(classifyRunStatuses(['Pass', undefined, 'Fail'])).toBe('regressed');
  });

  it('orders runs deterministically using created date and id fallbacks', () => {
    const earlier = run({ id: 'a', createdOn: '2026-01-01T00:00:00Z' });
    const later = run({ id: 'b', createdOn: '2026-01-02T00:00:00Z' });
    expect([later, earlier].sort(compareRunsChronologically).map((item) => item.id))
      .toEqual(['a', 'b']);
  });

  it('keeps latest status while using the latest completed result summary', () => {
    const summary = withRunSummary(agent(), [
      run({ id: 'new', agentId: 'a', status: 'Running', pass: 1 }),
      run({ id: 'old', agentId: 'a', status: 'Completed', regression: 'Critical', fail: 2 }),
    ], new Set(['old']));
    expect(summary.lastRunStatus).toBe('Running');
    expect(summary.lastRunId).toBe('new');
    expect(summary.regression).toBe('Critical');
    expect(summary.fail).toBe(2);
  });
});

describe('model parser', () => {
  it('normalizes quoted and unquoted modelNameHint values', () => {
    expect(parseModelNameHint('aiSettings:\n  modelNameHint: GPT5Chat\n')).toBe('GPT5Chat');
    expect(parseModelNameHint('aiSettings:\n  modelNameHint: "Opus48"\n')).toBe('Opus48');
    expect(parseModelNameHint("aiSettings:\n  modelNameHint: 'Opus47'\n")).toBe('Opus47');
    expect(parseModelNameHint('aiSettings: true')).toBeUndefined();
  });
});
