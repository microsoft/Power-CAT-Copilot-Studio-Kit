import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MS_PER_CASE,
  estimateMsPerCase,
  evaluationProgress,
  parseEvaluationProgress,
} from '../evaluation-progress';
import type { EvaluationRunVM } from '../model-assessment';

describe('parseEvaluationProgress', () => {
  it('reads what the flow writes and ignores anything unusable', () => {
    expect(parseEvaluationProgress('{"setCases":[10,5],"setsDone":1,"setStartedOn":"2026-10-23T10:00:00Z"}'))
      .toEqual({ setCases: [10, 5], setsDone: 1, setStartedOn: '2026-10-23T10:00:00Z' });
    expect(parseEvaluationProgress('{"setCases":[null,4],"setsDone":9}')).toEqual({ setCases: [0, 4], setsDone: 2 });
    expect(parseEvaluationProgress(undefined)).toBeUndefined();
    expect(parseEvaluationProgress('not json')).toBeUndefined();
    expect(parseEvaluationProgress('{"setCases":[],"setsDone":0}')).toBeUndefined();
  });
});

describe('evaluationProgress', () => {
  const start = Date.parse('2026-10-23T10:00:00Z');
  const setStartedOn = new Date(start).toISOString();

  it('weights finished test sets by their test cases', () => {
    expect(evaluationProgress({ setCases: [10, 30], setsDone: 1, setStartedOn }, start)).toEqual({
      fraction: 0.25,
      label: 'Test set 2 of 2 · Evaluating 30 test cases',
    });
  });

  it('estimates the running test set at a steady pace, then keeps moving without filling it', () => {
    const progress = { setCases: [10], setsDone: 0, setStartedOn };
    const at = (seconds: number) => evaluationProgress(progress, start + seconds * 1000, 1000).fraction;
    expect(at(5)).toBeCloseTo(0.5);
    expect(at(8)).toBeCloseTo(0.8);
    expect(at(10)).toBeCloseTo(0.9);
    // Copilot Studio took far longer than the estimate: still moving, never full.
    expect(at(30)).toBeGreaterThan(at(20));
    expect(at(600)).toBeGreaterThan(at(30));
    expect(at(600)).toBeLessThan(1);
    expect(evaluationProgress(progress, start).label).toBe('Test set 1 of 1 · Evaluating 10 test cases');
    expect(evaluationProgress({ setCases: [1], setsDone: 0 }, start).label).toBe('Test set 1 of 1 · Evaluating 1 test case');
  });

  it('still moves when Copilot Studio gives no test case counts', () => {
    expect(evaluationProgress({ setCases: [0, 0], setsDone: 1 }, start))
      .toEqual({ fraction: 0.5, label: 'Test set 2 of 2' });
  });
});

describe('estimateMsPerCase', () => {
  const run = (status: string, startedOn: string, completedOn: string, cases?: number[]): EvaluationRunVM => ({
    id: completedOn, name: 'Run', status, pass: 0, fail: 0, error: 0, excluded: 0, startedOn, completedOn,
    ...(cases ? { progress: { setCases: cases, setsDone: cases.length - 1 } } : {}),
  });

  it('learns the pace from the agent’s recent completed assessments', () => {
    expect(estimateMsPerCase([
      run('Completed', '2026-10-23T11:44:49Z', '2026-10-23T11:49:52Z', [10]),
      run('Completed With Errors', '2026-10-23T11:30:00Z', '2026-10-23T11:30:10Z', [10]),
      run('Completed', '2026-10-23T11:20:00Z', '2026-10-23T11:26:12Z', [6, 4]),
      run('Completed', '2026-10-22T10:00:00Z', '2026-10-22T10:01:00Z'),
    ])).toBeCloseTo((30_300 + 37_200) / 2);
  });

  it('uses the default pace until the agent has a completed assessment with test case counts', () => {
    expect(estimateMsPerCase([])).toBe(DEFAULT_MS_PER_CASE);
    expect(estimateMsPerCase([run('Evaluation Running', '2026-10-23T11:44:49Z', '', [10])])).toBe(DEFAULT_MS_PER_CASE);
  });
});
