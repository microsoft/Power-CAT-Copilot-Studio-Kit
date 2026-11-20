import { describe, expect, it } from 'vitest';
import {
  changeAssessedWithErrors,
  friendlySetError,
  GENERIC_RUN_FAILURE,
  isRunInProgress,
  isKitNotPickedUp,
  isRunNotPickedUp,
  isSkippedConcurrentRun,
  LOCK_RELEASED_MESSAGE,
  NO_MODEL_CHANGED_LABEL,
  parseResultReason,
  previousModelsByAgent,
  runDisplayStatus,
  runNotice,
  SET_TIMED_OUT_REASON,
  SET_UNSCORED_PREFIX,
  setNeedsFix,
  unfinishedRunModel,
  withModelState,
  type EvaluationRunVM,
  type TrackedAgentVM,
} from '../model-assessment';
import { metricDisplayName, withMetricCategory, withMetricDisplayNames } from '../metric-display';
import { displayQuestions, parseTestCase, parseTestCaseQuestions } from '../test-case-questions';
import { classificationGraderName, parseClassificationGraders } from '../test-set-graders';
import { withUniqueTestSetNames } from '../test-sets';
import { withRunSummary } from '../comparison-utils';

const run = (over: Partial<EvaluationRunVM> = {}): EvaluationRunVM => ({
  id: 'r1', name: 'Run', status: 'Completed', analysisStatus: '', regression: '',
  pass: 0, fail: 0, error: 0, excluded: 0, ...over,
});

const skipped = (over: Partial<EvaluationRunVM> = {}) =>
  run({ status: 'Failed', errorMessage: LOCK_RELEASED_MESSAGE, ...over });

const agent = (over: Partial<TrackedAgentVM> = {}): TrackedAgentVM => ({
  id: 'a1', name: 'Agent', schema: 'cr_agent', sourceStatus: 'Active', regression: '',
  lastRunStatus: '', pass: 0, fail: 0, error: 0, excluded: 0, ...over,
});

describe('metric display names', () => {
  it.each([
    ['GeneralQuality', 'Response Quality'],
    ['CapabilityUse', 'Tool and Capability Use'],
    ['AnyKeywordMatch', 'Required Information Coverage'],
    ['CompareMeaning', 'Meaning Alignment'],
    ['TextSimilarity', 'Response Similarity'],
    ['CustomLabels', 'Business Classification'],
    ['generalquality', 'Response Quality'],
    ['external', 'Test set not scored'],
  ])('%s → %s', (raw, friendly) => expect(metricDisplayName(raw)).toBe(friendly));

  it('humanizes unknown metrics and replaces identifiers inside free text', () => {
    expect(metricDisplayName('ContentSafety')).toBe('Content Safety');
    expect(withMetricDisplayNames('GeneralQuality dropped; CompareMeaning stable'))
      .toBe('Response Quality dropped; Meaning Alignment stable');
  });

  it.each([
    ['ContentSafety:selfharm', 'Content Safety (Self-harm)'],
    ['ContentSafety:hateunfairness', 'Content Safety (Hate and unfairness)'],
    ['ContentSafety#2', 'Content Safety (2)'],
    ['CustomLabels#2', 'Business Classification (2)'],
    ['ContentSafety:violence#2', 'Content Safety (Violence, 2)'],
  ])('names each evaluation method separately: %s → %s', (raw, friendly) => {
    expect(metricDisplayName(raw)).toBe(friendly);
  });

  it('keeps multi-word labels and names categorized metrics inside free text', () => {
    expect(metricDisplayName('Copilot Credits')).toBe('Copilot Credits');
    expect(withMetricDisplayNames('ContentSafety:selfharm passed')).toBe('Content Safety (Self-harm) passed');
  });

  describe('Business Classification method names', () => {
    const definition = [
      'kind: EvaluationSet',
      'graders:',
      '  - kind: ContainsAnyGrader',
      '  - kind: PromptGrader',
      '    name: length',
      '    labels:',
      '      - name: message',
      '        outcome: Pass',
      '      - name: details',
      '        outcome: Fail',
      '  - kind: PromptGrader',
      '    name: PII',
      '    labels:',
      '      - name: personal details',
      '        outcome: Pass',
      '      - name: "others personal data "',
      '        outcome: Fail',
    ].join('\n');
    const graders = parseClassificationGraders(definition);
    const labelled = (label: string) => JSON.stringify({ data: { label }, status: 'Pass' });

    it('reads each classification method of a test set in order', () => {
      expect(graders).toEqual([
        { name: 'length', labels: ['message', 'details'] },
        { name: 'PII', labels: ['personal details', 'others personal data'] },
      ]);
      expect(parseClassificationGraders('not: [valid')).toEqual([]);
    });

    it('names the method by the label it assigned, else by position', () => {
      expect(classificationGraderName('CustomLabels#2', labelled('others personal data '), graders)).toBe('PII');
      expect(classificationGraderName('CustomLabels', labelled('personal details'), graders)).toBe('PII');
      expect(classificationGraderName('CustomLabels#2', '{"status":"Error"}', graders)).toBe('PII');
      expect(classificationGraderName('CustomLabels', undefined, graders)).toBe('length');
    });

    it('leaves single-method sets and other metrics unnamed', () => {
      expect(classificationGraderName('CustomLabels', labelled('message'), graders.slice(0, 1))).toBeUndefined();
      expect(classificationGraderName('GeneralQuality', labelled('message'), graders)).toBeUndefined();
      expect(classificationGraderName('CustomLabels#3', undefined, graders)).toBeUndefined();
    });

    it('shows the method name instead of the repeat number', () => {
      expect(metricDisplayName('CustomLabels#2', 'PII')).toBe('Business Classification (PII)');
      expect(metricDisplayName('CustomLabels#2', '  ')).toBe('Business Classification (2)');
    });
  });

  it('gives older Content Safety results the per-category identity from their reason', () => {
    const reason = '{"data":{"category":"SelfHarm","severity":"0","threshold":"3"},"status":"Pass"}';
    expect(withMetricCategory('ContentSafety', reason)).toBe('ContentSafety:selfharm');
    expect(withMetricCategory('ContentSafety:violence', reason)).toBe('ContentSafety:violence');
    expect(withMetricCategory('ContentSafety', '{"status":"Error"}')).toBe('ContentSafety');
    expect(withMetricCategory('ContentSafety', 'not json')).toBe('ContentSafety');
    expect(withMetricCategory('GeneralQuality', reason)).toBe('GeneralQuality');
  });
});

describe('test case questions', () => {
  it('reads single-turn inputs', () => {
    expect(parseTestCaseQuestions('kind: EvaluationData\nrows:\n  - input: Hello?\n')).toEqual(['Hello?']);
  });

  it('returns no questions for malformed data and falls back to the saved question', () => {
    expect(parseTestCaseQuestions('::: not yaml [')).toEqual([]);
    expect(parseTestCaseQuestions(undefined)).toEqual([]);
    expect(displayQuestions({ question: 'Saved' })).toEqual(['Saved']);
    expect(displayQuestions({ question: 'Saved', questions: ['A', 'B'] })).toEqual(['A', 'B']);
  });
});

describe('skipped concurrent runs', () => {
  it('labels a lock-release run that never started as "No model changed"', () => {
    expect(isSkippedConcurrentRun(skipped())).toBe(true);
    expect(runDisplayStatus(skipped())).toBe(NO_MODEL_CHANGED_LABEL);
  });

  it('keeps genuine failures as Failed', () => {
    for (const r of [
      skipped({ startedOn: '2026-09-10T00:00:00Z' }),
      skipped({ historyId: 'h1' }),
      skipped({ fail: 1 }),
      skipped({ errorMessage: 'Evaluation API returned 500' }),
    ]) {
      expect(isSkippedConcurrentRun(r)).toBe(false);
      expect(runDisplayStatus(r)).toBe('Failed');
    }
  });

  it('summarizes an agent from its latest non-skipped run', () => {
    const summary = withRunSummary(agent(), [
      skipped({ id: 'new', agentId: 'a1', createdOn: '2026-09-15T10:00:00Z' }),
      run({ id: 'old', agentId: 'a1', status: 'Completed', pass: 3, createdOn: '2026-09-14T10:00:00Z',
        completedOn: '2026-09-14T11:00:00Z' }),
    ], new Set(['old']));
    expect(summary.lastRunId).toBe('old');
    expect(summary.lastRunStatus).toBe('Completed');
  });
});

describe('flow failure notices', () => {
  const flowMessage = 'The assessment stopped while reading the agent from Copilot Studio. Step "Get Bot Configuration" failed: Not found';

  it('shows the failing step the flow wrote back', () => {
    expect(runNotice(run({ status: 'Failed', errorMessage: flowMessage })))
      .toEqual({ intent: 'error', title: 'Assessment failed', message: flowMessage });
  });

  it('titles Kit failures and previous runs, and falls back to the Kit message', () => {
    const kit = { status: 'Failed', message: 'Kit setup is invalid', pass: 0, fail: 0, total: 0, regressed: 0, improved: 0 };
    expect(runNotice(run({ status: 'Failed', kit }))).toMatchObject({ title: 'Kit tests failed', message: 'Kit setup is invalid' });
    expect(runNotice(run({ status: 'No Change', kit }), true))
      .toMatchObject({ intent: 'warning', title: 'Last Kit test run failed' });
  });

  it('turns lock and stale messages into plain language', () => {
    const lock = runNotice(skipped({ startedOn: '2026-09-10T00:00:00Z' }));
    expect(lock).toMatchObject({ intent: 'error', title: 'Assessment failed' });
    expect(lock?.message).not.toContain('lock');
    const stale = runNotice(run({ status: 'Stale', errorMessage: 'Lock auto-reclaimed: prior run was stale.' }));
    expect(stale).toMatchObject({ intent: 'warning', title: 'Assessment stopped responding' });
    expect(stale?.message).not.toContain('Lock');
  });

  it('says nothing for healthy, running, cancelled or skipped runs', () => {
    for (const r of [run(), run({ status: 'Evaluation Running' }), run({ status: 'Cancelled' }), skipped()]) {
      expect(runNotice(r)).toBeUndefined();
    }
  });

  it('uses a generic message when the flow could not record one', () => {
    expect(runNotice(run({ status: 'Failed' }))?.message).toBe(GENERIC_RUN_FAILURE);
  });

  it('names the connection reference the flow needs', () => {
    const message = runNotice(run({ status: 'Failed', errorMessage:
      'The Copilot Studio connection used by the assessment flow is missing or not set up, so no evaluation was started. Ask an admin to set the connection reference new_sharedmicrosoftcopilotstudio_710f2 in the solution.' }))?.message;
    expect(message).toContain('cat_CopilotStudioKitAutomatedTests');
    expect(message).not.toContain('new_sharedmicrosoftcopilotstudio_710f2');
  });

  it.each([
    ['failed', 'Copilot Studio reported that the evaluation failed. Open the test set in Copilot Studio to see why.'],
    ['Canceled', 'The evaluation was cancelled in Copilot Studio before it finished.'],
    ['running', SET_TIMED_OUT_REASON],
    ['', SET_TIMED_OUT_REASON],
  ])('explains a test set whose evaluation ended as "%s"', (state, friendly) => {
    expect(friendlySetError(`External evaluation ended in state: ${state}`)).toBe(friendly);
  });

  it('keeps the reason Copilot Studio gave for a test set it could not run', () => {
    const reason = "Copilot Studio could not run this test set: 'intentMatch' is not supported.";
    expect(friendlySetError(`  ${reason} `)).toBe(reason);
    expect(friendlySetError(' ')).toBeUndefined();
    expect(setNeedsFix(reason)).toBe(true);
  });

  it('names the test-case details missing from a test set where nothing could be scored', () => {
    const reason = `${SET_UNSCORED_PREFIX} Check that each test case has what its test methods need. Test methods: `;
    expect(friendlySetError(`${reason}CompareMeaning, TextSimilarity, AnyKeywordMatch.`)).toBe(
      'No test case could be scored. Meaning Alignment and Response Similarity need an expected response in every test case. '
      + 'Required Information Coverage needs keywords in every test case.',
    );
    expect(friendlySetError(`${reason}GeneralQuality, CustomLabels.`)).toBe('No test case could be scored.');
    expect(setNeedsFix(`${reason}CompareMeaning.`)).toBe(true);
  });

  it.each([
    ['CompareMeaning', "Couldn't be scored. Meaning Alignment needs an expected response in this test case."],
    ['GeneralQuality', "Couldn't be scored."],
  ])('explains a %s result Copilot Studio returned as a bare error', (metric, text) => {
    expect(parseResultReason('{"data":{},"status":"Error"}', metric)).toBe(text);
  });

  it.each([
    ['External evaluation ended in state: running', false],
    [SET_TIMED_OUT_REASON, false],
    ['The evaluation was cancelled in Copilot Studio before it finished.', false],
    ['External evaluation ended in state: failed', true],
    ['Copilot Studio could not run this test set: The agent has been evaluated more than 20 times in the last 24 hours. Please wait before trying again.', false],
    [undefined, true],
  ])('asks to fix the test set only when another run would not help (%s)', (reason, needsFix) => {
    expect(setNeedsFix(reason)).toBe(needsFix);
  });

  it('puts the latest failure on the agent for the grid', () => {
    const summary = withRunSummary(agent(), [run({ agentId: 'a1', status: 'Failed', errorMessage: flowMessage })], new Set());
    expect(summary.lastRunMessage).toBe(flowMessage);
  });
});

describe('model state on refresh', () => {
  it('uses history for previous model when the live model is unchanged', () => {
    const state = withModelState(agent({ currentModel: 'GPT41', liveModel: 'gpt-41' }), 'GPT4o');
    expect(state).toMatchObject({ currentModel: 'GPT41', previousModel: 'GPT4o', modelChangePending: false });
  });

  it('shows the live model as current and the last assessed model as previous when it changed', () => {
    const state = withModelState(agent({ currentModel: 'GPT41', liveModel: 'GPT5Auto' }), 'GPT4o');
    expect(state).toMatchObject({ currentModel: 'GPT5Auto', previousModel: 'GPT41', modelChangePending: true });
  });

  it('takes the previous model from the assessed model, skipping a newer change that completed with errors', () => {
    const history = [
      { id: 'h3', agentId: 'a1', changeType: 'Model Changed', previousModel: 'Opus47', currentModel: 'GPT41' },
      { id: 'h2', agentId: 'a1', changeType: 'Model Changed', previousModel: 'GPT4o', currentModel: 'Opus47' },
      { id: 'h1', agentId: 'a2', changeType: 'Model Changed', previousModel: 'Sonnet45', currentModel: 'GPT5Auto' },
    ];
    const map = previousModelsByAgent([agent({ currentModel: 'opus-47' }), agent({ id: 'a2', currentModel: 'GPT41' })], history);
    expect(map.get('a1')).toBe('GPT4o');
    expect(map.get('a2')).toBe('Sonnet45');
  });
});

describe('model change assessed with errors', () => {
  const history = [{ id: 'h1', agentId: 'a1', changeType: 'Model Changed', previousModel: 'Opus47', currentModel: 'GPT41' }];
  const summarize = (status: string, historyId?: string) => withModelState(withRunSummary(
    agent({ currentModel: 'Opus47', liveModel: 'GPT41' }),
    [run({ agentId: 'a1', status, historyId, fail: 1 })], new Set(['r1']), history,
  ), undefined);

  it('flags a pending change whose latest assessment of the live model completed with errors', () => {
    const state = summarize('Completed With Errors', 'h1');
    expect(state.lastRunModel).toBe('GPT41');
    expect(changeAssessedWithErrors(state)).toBe(true);
  });

  it('does not flag clean runs, unlinked runs or errors on another model', () => {
    expect(changeAssessedWithErrors(summarize('Completed', 'h1'))).toBe(false);
    expect(changeAssessedWithErrors(summarize('Completed With Errors'))).toBe(false);
    const otherModel = { ...summarize('Completed With Errors', 'h1'), currentModel: 'GPT5Auto' };
    expect(changeAssessedWithErrors(otherModel)).toBe(false);
  });
});

describe('model of a run that stopped early', () => {
  const history = [{ id: 'h1', agentId: 'a1', changeType: 'Model Changed', previousModel: 'GPT5Chat', currentModel: 'Opus48' }];

  it.each(['Failed', 'Timed Out', 'Cancelled', 'Stale'])('gives the model a %s run was assessing', (status) => {
    expect(unfinishedRunModel([run({ status, historyId: 'h1' })], history)).toBe('Opus48');
  });

  it('counts a Kit track that failed and passes over a run skipped for another in progress', () => {
    const kitFailed = run({ status: 'Completed', historyId: 'h1', kit: { status: 'Failed', pass: 0, fail: 0, total: 7, regressed: 0, improved: 0 } });
    expect(unfinishedRunModel([skipped(), kitFailed], history)).toBe('Opus48');
  });

  it('gives nothing for finished or unlinked runs', () => {
    expect(unfinishedRunModel([run({ historyId: 'h1' })], history)).toBeUndefined();
    expect(unfinishedRunModel([run({ status: 'Completed With Errors', historyId: 'h1' })], history)).toBeUndefined();
    expect(unfinishedRunModel([run({ status: 'Failed' })], history)).toBeUndefined();
    expect(unfinishedRunModel([], history)).toBeUndefined();
  });
});

describe('test sets that share a name', () => {
  const result = (id: string, testSetId: string, over = {}) => ({
    id, name: id, runId: 'run-1', testSet: 'MODELCHECK Evaluate', testSetId, status: 'Pass', ...over,
  });
  const agentByRun = new Map([['run-1', 'agent-1'], ['run-2', 'agent-2']]);

  it('flags multi-turn test cases', () => {
    expect(parseTestCase('kind: MultiTurnEvaluationCase\nactivities: []\n').multiTurn).toBe(true);
    expect(parseTestCase('kind: EvaluationData\nrows:\n  - input: Hi\n').multiTurn).toBe(false);
  });

  it('reads user turns whose text sits next to the activity value', () => {
    const data = [
      'kind: MultiTurnEvaluationCase',
      'activities:',
      '  - activity:',
      '      value:',
      '        from:',
      '          role: user',
      '      text:',
      '        - Install the CLI.',
      '  - activity:',
      '      value:',
      '        from:',
      '          role: agent',
      '      text:',
      '        - Which OS?',
      '  - activity:',
      '      value:',
      '        from:',
      '          role: user',
      '      text:',
      '        - Windows.',
    ].join('\n');
    expect(parseTestCase(data).questions).toEqual(['Install the CLI.', 'Windows.']);
  });

  it('keeps a single-response set and a conversation set apart', () => {
    const labelled = withUniqueTestSetNames([
      result('a', 'SET-B'),
      result('b', 'set-a', { multiTurn: true }),
    ], agentByRun);
    expect(labelled.map((r) => r.testSet)).toEqual(['MODELCHECK Evaluate', 'MODELCHECK Evaluate (Conversation)']);
  });

  it('numbers same-type sets in stable set-id order', () => {
    const labelled = withUniqueTestSetNames([result('a', 'set-b'), result('b', 'set-a')], agentByRun);
    expect(labelled.map((r) => r.testSet)).toEqual(['MODELCHECK Evaluate (2)', 'MODELCHECK Evaluate']);
  });

  it('leaves identically named sets of different agents unchanged', () => {
    const input = [result('a', 'set-a'), result('b', 'set-b', { runId: 'run-2' })];
    expect(withUniqueTestSetNames(input, agentByRun)).toBe(input);
  });
});
describe('run in progress', () => {
  it('treats queued, detecting, evaluating and analysing runs as in progress', () => {
    for (const status of ['Requested', 'Detecting', 'Evaluation Running', 'Evaluation Completed']) {
      expect(isRunInProgress(status)).toBe(true);
    }
  });

  it('treats finished runs as not in progress', () => {
    for (const status of ['Completed', 'Completed With Errors', 'No Change', 'Failed', 'Timed Out', undefined]) {
      expect(isRunInProgress(status)).toBe(false);
    }
  });

  it('flags a request the flow has not picked up after two minutes', () => {
    const now = Date.parse('2026-10-28T10:00:00Z');
    const requested = (over: Partial<EvaluationRunVM>) => run({ status: 'Requested', ...over });
    expect(isRunNotPickedUp(requested({ createdOn: '2026-10-28T09:58:00Z' }), now)).toBe(true);
    expect(isRunNotPickedUp(requested({ createdOn: '2026-10-28T09:58:30Z' }), now)).toBe(false);
    expect(isRunNotPickedUp(requested({ createdOn: '2026-10-28T09:50:00Z', startedOn: '2026-10-28T09:50:05Z' }), now)).toBe(false);
    expect(isRunNotPickedUp(run({ status: 'Detecting', createdOn: '2026-10-28T09:50:00Z' }), now)).toBe(false);
  });

  it('flags Kit tests the Kit test flow has not picked up two minutes after the run started', () => {
    const now = Date.parse('2026-10-28T10:00:00Z');
    const handedOff = (over: Partial<EvaluationRunVM>) => run({ status: 'Evaluation Running', ...over });
    expect(isKitNotPickedUp(handedOff({ startedOn: '2026-10-28T09:58:00Z' }), now)).toBe(true);
    expect(isKitNotPickedUp(handedOff({ startedOn: '2026-10-28T09:58:30Z' }), now)).toBe(false);
    expect(isKitNotPickedUp(handedOff({
      startedOn: '2026-10-28T09:50:00Z', kit: { status: 'Running', pass: 0, fail: 0, total: 4, regressed: 0, improved: 0 },
    }), now)).toBe(false);
    // Copilot Studio evaluations report progress and counts; they are not waiting for Kit tests.
    expect(isKitNotPickedUp(handedOff({ startedOn: '2026-10-28T09:50:00Z', pass: 3 }), now)).toBe(false);
    expect(isKitNotPickedUp(run({ status: 'Detecting', startedOn: '2026-10-28T09:50:00Z' }), now)).toBe(false);
  });
});