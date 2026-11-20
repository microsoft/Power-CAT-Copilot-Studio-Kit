import { describe, expect, it } from 'vitest';
import { stepProgress } from '../step-progress';
import { groupKitRowsBySet, kitAssessmentSteps, kitMetricName, kitResultLabel, kitSteps, kitResultTone, pivotKitResults, type KitTestResultVM } from '../kit-results';

const result = (over: Partial<KitTestResultVM>): KitTestResultVM => ({
  id: 'r', testRunId: 'RUN-A', code: 1, ...over,
});

describe('pivotKitResults', () => {
  it('groups the same Kit test across runs by test id', () => {
    const rows = pivotKitResults([
      result({ id: '1', testId: 'T1', testRunId: 'RUN-A', utterance: 'hi', expected: 'How', code: 2 }),
      result({ id: '2', testId: 't1', testRunId: 'RUN-B', utterance: 'hi', code: 1 }),
      result({ id: '3', testId: 'T2', testRunId: 'RUN-A', utterance: 'bye' }),
    ]);
    expect(rows.map((row) => row.utterance)).toEqual(['bye', 'hi']);
    const hi = rows[1];
    expect(hi.expected).toBe('How');
    expect(hi.byRun.get('run-a')?.code).toBe(2);
    expect(hi.byRun.get('run-b')?.code).toBe(1);
  });

  it('falls back to the utterance when a result has no test id', () => {
    const rows = pivotKitResults([
      result({ id: '1', testRunId: 'A', utterance: 'Hi ' }),
      result({ id: '2', testRunId: 'B', utterance: 'hi' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].byRun.size).toBe(2);
  });

  it('keeps conversation turns ordered without counting them as separate test cases', () => {
    const questions = ['Hi', 'Show a card', 'Hi'];
    const rows = pivotKitResults([
      result({ id: '1', testId: 'conversation', testType: 5, questions }),
      result({ id: '2', testId: 'conversation', testRunId: 'RUN-B', testType: 5, questions }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].questions).toEqual(questions);
    expect(rows[0].metric).toBe('Conversation Flow');
    expect(rows[0].byRun.size).toBe(2);
  });

  it('uses recorded turns from another run when the first result has none', () => {
    const rows = pivotKitResults([
      result({ id: '1', testId: 'conversation', testType: 5, questions: [] }),
      result({ id: '2', testId: 'conversation', testRunId: 'RUN-B', testType: 5, questions: ['First', 'Next'] }),
    ]);
    expect(rows[0].questions).toEqual(['First', 'Next']);
  });

  it('recognizes a conversation with only one recorded turn and aligns turns by test id', () => {
    const rows = pivotKitResults([
      result({ testId: 'conversation', testType: 5, turns: [
        { id: 'a1', testId: 'turn-1', utterance: 'Hello', code: 2 },
        { id: 'turn-2', testId: 'turn-2', utterance: 'Next', fromDefinition: true },
      ] }),
      result({ id: 'b', testRunId: 'RUN-B', testId: 'conversation', testType: 5, turns: [
        { id: 'b1', testId: 'TURN-1', utterance: 'Hello', code: 1 },
        { id: 'b2', testId: 'turn-2', utterance: 'Next', code: 1 },
      ] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].multiTurn).toBe(true);
    expect(rows[0].turns).toHaveLength(2);
    expect(rows[0].turns?.[0].byRun.get('run-a')?.code).toBe(2);
    expect(rows[0].turns?.[1].byRun.get('run-a')?.code).toBeUndefined();
    expect(rows[0].turns?.[1].byRun.get('run-b')?.code).toBe(1);
  });

  it('retains the conversation identity when no turn results exist', () => {
    const [row] = pivotKitResults([result({ testType: 5 })]);
    expect(row.multiTurn).toBe(true);
    expect(row.turns).toEqual([]);
  });
});

describe('kit result labels', () => {
  it('maps Kit result codes to labels and tones', () => {
    expect([1, 2, 4, 5, 3, 9].map(kitResultLabel)).toEqual(['Passed', 'Failed', 'Error', 'Pending', 'Unknown', 'Unknown']);
    expect([1, 2, 4, 5, 3].map(kitResultTone)).toEqual(['success', 'danger', 'warning', 'brand', 'neutral']);
  });
});

describe('groupKitRowsBySet', () => {
  it('puts Kit conversation sets and cases first without reordering their turns', () => {
    const groups = groupKitRowsBySet(pivotKitResults([
      result({ testId: 'plain', utterance: 'Alpha', testSetName: 'A single-only' }),
      result({ testId: 'mixed-single', utterance: 'A single', testSetName: 'B mixed' }),
      result({ testId: 'mixed-conversation', utterance: 'Z conversation', testSetName: 'B mixed',
        testType: 5, questions: ['First', 'Second'] }),
      result({ testId: 'conversation', utterance: 'Z multi', testSetName: 'Z conversations',
        testType: 5, questions: ['Hello', 'Next'] }),
    ]));
    expect(groups.map((group) => group.name)).toEqual(['B mixed', 'Z conversations', 'A single-only']);
    expect(groups[0].rows.map((row) => row.key)).toEqual(['mixed-conversation', 'mixed-single']);
    expect(groups[0].rows[0].turns?.map((turn) => turn.utterance)).toEqual(['First', 'Second']);
  });

  it('groups Kit tests by test set name with a fallback', () => {
    const groups = groupKitRowsBySet(pivotKitResults([
      result({ id: '1', testId: 'a', utterance: 'x', testSetName: 'Smoke' }),
      result({ id: '2', testId: 'b', utterance: 'y', testSetName: 'Demo' }),
      result({ id: '3', testId: 'c', utterance: 'z' }),
    ]));
    expect(groups.map((group) => [group.name, group.rows.length])).toEqual([['Demo', 1], ['Kit tests', 1], ['Smoke', 1]]);
  });
});

describe('kitSteps', () => {
  const kit = (status: string, pass = 0, fail = 0) =>
    ({ status, pass, fail, total: pass + fail, regressed: 0, improved: 0 });
  it('mirrors the assessment steps for each Kit status', () => {
    expect(kitSteps(undefined)).toEqual(['active', 'pending', 'pending', 'pending']);
    expect(kitSteps(kit('Running'))).toEqual(['done', 'active', 'pending', 'pending']);
    expect(kitSteps(kit('Analysing'))).toEqual(['done', 'done', 'done', 'active']);
    expect(kitSteps(kit('Completed', 4, 3))).toEqual(['done', 'done', 'done', 'done']);
    expect(kitSteps(kit('Failed'))).toEqual(['done', 'skipped', 'skipped', 'skipped']);
    expect(kitSteps(kit('Timed Out', 1, 1))).toEqual(['done', 'done', 'skipped', 'skipped']);
  });
});

describe('stepProgress', () => {
  it('counts done steps and the active fraction, ignoring skipped steps', () => {
    expect(stepProgress(['done', 'active', 'pending', 'pending'], 0.5)).toBe(1.5 / 4);
    expect(stepProgress(['done', 'skipped', 'skipped', 'skipped'])).toBe(1);
    expect(stepProgress(['done', 'done', 'done', 'done'], 0.5)).toBe(1);
    expect(stepProgress(['skipped'])).toBe(0);
  });

  it('weights each step so the long running step moves most of the bar', () => {
    const weights = [10, 70, 5, 15];
    expect(stepProgress(['done', 'active', 'pending', 'pending'], 0.5, weights)).toBeCloseTo(0.45);
    expect(stepProgress(['done', 'done', 'done', 'active'], 0, weights)).toBeCloseTo(0.85);
    expect(stepProgress(['done', 'skipped', 'skipped', 'skipped'], 0, weights)).toBe(1);
  });
});

describe('kitAssessmentSteps', () => {
  const run = (status: string, kit?: object) => ({ id: 'r', name: 'r', status, kit } as never);

  it('shows detection as active before the run starts', () => {
    expect(kitAssessmentSteps(undefined, true)).toEqual(['active', 'pending', 'pending', 'pending']);
  });

  it('skips the test steps when the model did not change', () => {
    expect(kitAssessmentSteps(run('No Change'), false)).toEqual(['done', 'skipped', 'skipped', 'skipped']);
  });

  it('shows testing as active while waiting for the Kit run', () => {
    expect(kitAssessmentSteps(run('Evaluation Running'), true)).toEqual(['done', 'active', 'pending', 'pending']);
  });

  it('marks every step done for a completed run', () => {
    expect(kitAssessmentSteps(run('Completed'), false)).toEqual(['done', 'done', 'done', 'done']);
  });
});

describe('kitMetricName', () => {
  it('names response-match tests by their comparison operator', () => {
    expect(kitMetricName(1, 1)).toBe('Exact Response Match');
    expect(kitMetricName(1, 3)).toBe('Required Information Included');
    expect(kitMetricName(undefined, 9)).toBe('Response Provided');
  });

  it('names other test types by what they check', () => {
    expect(kitMetricName(2, undefined)).toBe('Topic Routing');
    expect(kitMetricName(4, undefined)).toBe('Generative Answer Quality');
    expect(kitMetricName(5, 3)).toBe('Conversation Flow');
  });

  it('falls back to a generic name', () => {
    expect(kitMetricName(undefined, undefined)).toBe('Response Check');
  });
});

describe('pivotKitResults utterance labels', () => {
  it('keeps multi-line conversation questions and labels empty conversation tests', () => {
    const rows = pivotKitResults([
      { id: 'a', testRunId: 'r1', utterance: 'Hi\nShow a card', testType: 5, code: 1 },
      { id: 'b', testRunId: 'r1', testType: 5, code: 4 },
    ]);
    expect(rows.map((row) => row.utterance)).toEqual([
      '(conversation test, no questions recorded)',
      'Hi\nShow a card',
    ]);
  });
});
