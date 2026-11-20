import { describe, expect, it } from 'vitest';
import type { EvaluationRunVM } from '../model-assessment';
import type { KitTestResultVM, KitTestRow } from '../kit-results';
import {
  buildRecommendationRequest,
  evaluationChecks,
  kitChecks,
  parseRecommendation,
  type RecommendationCheck,
  type RecommendationRun,
} from '../model-recommendation';
import { recommendationEvidence } from '../recommendation-display';

const run = (id: string, overrides: Partial<EvaluationRunVM> = {}): EvaluationRunVM => ({
  id, name: id, status: 'Completed', analysisStatus: 'Completed', regression: 'Healthy',
  pass: 0, fail: 0, error: 0, excluded: 0, ...overrides,
});

const pair = (a: Partial<EvaluationRunVM> = {}, b: Partial<EvaluationRunVM> = {}, models = ['GPT5Chat', 'Opus48']):
  RecommendationRun[] => [
  { run: run('a', a), model: models[0], modelCode: models[0] },
  { run: run('b', b), model: models[1], modelCode: models[1] },
];

const check = (a?: string, b?: string, question = 'Q', testSet = 'Set'): RecommendationCheck => ({
  testSet, question, metric: 'General quality',
  a: a ? { status: a, reason: `A ${a}` } : undefined,
  b: b ? { status: b, reason: `B ${b}` } : undefined,
});

const evalIds = new Set(['a', 'b']);

function ready(checks: RecommendationCheck[], runs = pair()) {
  const request = buildRecommendationRequest({ runs, resultRunIds: evalIds, checks, agentName: ' Zava ' });
  if (request.state !== 'ready') throw new Error(`Expected ready, got ${request.state}`);
  return request;
}

describe('buildRecommendationRequest gating', () => {
  it.each([1, 3])('asks for exactly two runs (%s selected)', (count) => {
    const runs = ['a', 'b', 'c'].slice(0, count).map((id) => ({ run: run(id), model: id }));
    expect(buildRecommendationRequest({ runs, resultRunIds: evalIds, checks: [check('Pass', 'Pass')] }))
      .toEqual({ state: 'select-two', selected: count });
  });

  it('never compares Copilot Studio evaluations with Kit tests', () => {
    const request = buildRecommendationRequest({
      runs: pair({}, { kit: { status: 'Completed', testRunId: 'k', pass: 1, fail: 0, total: 1, regressed: 0, improved: 0 } }),
      resultRunIds: new Set(['a']),
      checks: [check('Pass', 'Pass')],
    });
    expect(request.state).toBe('mixed-kinds');
  });

  it('waits for Kit results and reports when they fail to load', () => {
    const base = { runs: pair(), resultRunIds: new Set<string>(), checks: [] };
    expect(buildRecommendationRequest({ ...base, kitLoading: true }).state).toBe('loading');
    expect(buildRecommendationRequest({ ...base, kitError: true, kitLoading: true }).state).toBe('data-error');
  });

  it('ignores Kit loading state for evaluation runs', () => {
    const request = buildRecommendationRequest({
      runs: pair(), resultRunIds: evalIds, checks: [check('Pass', 'Fail')], kitLoading: true, kitError: true,
    });
    expect(request.state).toBe('ready');
  });

  it.each([
    ['no checks', []],
    ['only errors and unscored results', [check('Error', 'Pass'), check('Pass', 'Excluded'), check('Pending', 'Pending')]],
    ['disjoint checks', [check('Pass', undefined, 'Q1'), check(undefined, 'Fail', 'Q2')]],
  ])('does not call AI when no check is scored in both runs (%s)', (_, checks) => {
    expect(buildRecommendationRequest({ runs: pair(), resultRunIds: evalIds, checks }).state).toBe('no-shared-checks');
  });
});

describe('buildRecommendationRequest payload', () => {
  it('counts shared outcomes, coverage and pass rates on checks scored in both runs', () => {
    const { payload } = ready([
      check('Pass', 'Pass', 'Q1'),
      check('Pass', 'Fail', 'Q2'),
      check('Fail', 'Pass', 'Q3'),
      check('Fail', 'Pass', 'Q4'),
      check('Fail', 'Failed', 'Q5'),
      check('Error', 'Pass', 'Q6'),
      check('Pass', undefined, 'Q7'),
      check(undefined, 'Pass', 'Q8', 'Other set'),
    ]);
    expect(payload.agentName).toBe('Zava');
    expect(payload.kind).toBe('Copilot Studio evaluations');
    expect(payload.shared).toEqual({
      scored: 5, bothPass: 1, onlyAPass: 1, onlyBPass: 2, bothFail: 1,
      passRateA: 40, passRateB: 60, differencePoints: 20, qualityLeader: null,
    });
    expect(payload.coverage).toEqual({ onlyInA: 1, onlyInB: 1, errorOrUnresolvedInEither: 1, sameChecks: false });
    expect(payload.runA.checks).toEqual({ total: 7, pass: 3, fail: 3, error: 1, other: 0 });
    expect(payload.runA.errorShare).toBe(14.3);
    expect(payload.runB.passRate).toBe(71.4);
    expect(payload.testSets.map((set) => set.name)).toEqual(['Other set', 'Set']);
    expect(payload.evidence.onlyBPass.map((item) => item.question)).toEqual(['Q3', 'Q4']);
    expect(payload.evidence.errors[0]).toMatchObject({ question: 'Q6', a: 'Error', b: 'Pass', reasonA: 'A Error' });
  });

  it('states each model\u2019s own counts so joint buckets are not misread as per-model scores', () => {
    const checks = [
      ...Array.from({ length: 12 }, (_, i) => check('Pass', 'Pass', `P${i}`)),
      check('Fail', 'Pass', 'X1'),
      check('Fail', 'Fail', 'X2'),
      ...Array.from({ length: 4 }, (_, i) => check(undefined, 'Fail', `B${i}`)),
    ];
    const { payload } = ready(checks, pair({}, {}, ['GPT-6 Astra', 'Claude Opus 4.8']));
    expect(payload.runA.sharedChecks).toEqual({ pass: 12, fail: 2, passRate: 85.7 });
    expect(payload.runB.sharedChecks).toEqual({ pass: 13, fail: 1, passRate: 92.9 });
    expect(payload.runA.checksOnlyInThisRun).toEqual({ pass: 0, fail: 0, error: 0, other: 0 });
    expect(payload.runB.checksOnlyInThisRun).toEqual({ pass: 0, fail: 4, error: 0, other: 0 });
    expect(payload.facts).toEqual([
      'GPT-6 Astra passed 12 and failed 2 of the 14 checks both runs scored (85.7% pass rate).',
      'Claude Opus 4.8 passed 13 and failed 1 of the 14 checks both runs scored (92.9% pass rate).',
      'On those checks, 12 checks passed in both runs and 1 check failed in both runs.',
      '0 checks passed with GPT-6 Astra but failed with Claude Opus 4.8; 1 check passed with Claude Opus 4.8 but failed with GPT-6 Astra.',
      'Claude Opus 4.8 also ran 4 checks that GPT-6 Astra did not: 0 passed, 4 failed.',
    ]);
  });

  it('shows how many checks only one run had next to the shared count', () => {
    const request = ready([
      check('Pass', 'Pass', 'Q1'),
      check('Pass', undefined, 'Q2'),
      ...Array.from({ length: 4 }, (_, i) => check(undefined, 'Fail', `B${i}`)),
    ], pair({}, {}, ['GPT-6 Astra', 'Claude Opus 4.8']));
    expect(recommendationEvidence(request, ['GPT-6 Astra', 'Claude Opus 4.8'])).toBe(
      'GPT-6 Astra: 2 results, 100% shared pass · Claude Opus 4.8: 5 results, 100% shared pass · 1 shared',
    );
  });

  it('names the earlier and later run in facts when both runs used the same model', () => {
    const { payload } = ready([check('Pass', 'Fail'), check('Pass', undefined, 'Q2')], pair({}, {}, ['GPT56Chat', 'gpt56chat']));
    expect(payload.facts[0]).toBe('The earlier run passed 1 and failed 0 of the 1 check both runs scored (100% pass rate).');
    expect(payload.facts.at(-1)).toBe('The earlier run also ran 1 check that the later run did not: 1 passed, 0 failed.');
  });

  it('samples evidence and clips long text', () => {
    const long = `${'x'.repeat(300)}  `;
    const { payload } = ready(Array.from({ length: 9 }, (_, i) => check('Fail', 'Pass', `${i} ${long}`)));
    expect(payload.evidence.onlyBPass).toHaveLength(6);
    expect(payload.evidenceIsSample).toBe(true);
    expect(payload.evidence.onlyBPass[0].question).toHaveLength(240);
    expect(payload.evidence.onlyBPass[0].question.endsWith('…')).toBe(true);
  });

  it('names a quality leader only for a clear gap backed by at least two net checks', () => {
    const tied = (n: number) => Array.from({ length: n }, (_, i) => check('Pass', 'Pass', `T${i}`));
    const leaderOf = (checks: RecommendationCheck[]) => ready(checks).payload.shared.qualityLeader;
    expect(leaderOf([...tied(16), check('Pass', 'Fail', 'X1')])).toBeNull();
    expect(leaderOf([...tied(16), check('Pass', 'Fail', 'X1'), check('Pass', 'Fail', 'X2')])).toBe('A');
    expect(leaderOf([...tied(16), check('Fail', 'Pass', 'X1'), check('Fail', 'Pass', 'X2')])).toBe('B');
    expect(leaderOf([...tied(60), check('Fail', 'Pass', 'X1'), check('Fail', 'Pass', 'X2')])).toBeNull();
  });

  it('compares credits only when both runs report them', () => {
    const credited = ready([check('Pass', 'Pass')], pair(
      { credits: { conversation: 90, evaluators: 10 } },
      { credits: { conversation: 50, evaluators: 10, partial: true } },
    )).payload;
    expect(credited.credits).toEqual({
      bothReported: true,
      perCheckA: 100,
      perCheckB: 60,
      cheaperRun: 'B',
      savingPercent: 40,
      extraCostPercent: 66.7,
      material: true,
      tieBreak: 'B',
      comparableCoverage: true,
      note: null,
    });
    expect(credited.runB.credits).toEqual({ total: 60, toAnswer: 50, toScore: 10, partial: true });

    const oneSided = ready([check('Pass', 'Pass')], pair({ credits: { conversation: 5, evaluators: 1 } })).payload;
    expect(oneSided.credits).toMatchObject({ bothReported: false, cheaperRun: null, savingPercent: null, material: false, note: 'Only one run reported Copilot Credits.' });

    const close = ready([check('Pass', 'Pass')], pair(
      { credits: { conversation: 100, evaluators: 0 } },
      { credits: { conversation: 110, evaluators: 0 } },
    )).payload;
    expect(close.credits).toMatchObject({ cheaperRun: 'A', extraCostPercent: 10, material: false, tieBreak: null });
    expect(ready([check('Pass', 'Pass')]).payload.credits.note).toMatch(/Microsoft Copilot harness/);
  });

  it('flags two runs of the same model and keys the request by run pair and outcome', () => {
    const same = ready([check('Pass', 'Fail')], pair({}, {}, ['GPT56Chat', 'gpt56chat']));
    expect(same.payload.sameModel).toBe(true);
    const other = ready([check('Pass', 'Pass')]);
    expect(other.payload.sameModel).toBe(false);
    expect(other.key).not.toBe(same.key);
  });
});

describe('check extraction', () => {
  it('maps evaluation rows to readable outcomes for each run', () => {
    const checks = evaluationChecks([{
      testSet: 'Set',
      question: 'Hi',
      metric: 'GeneralQuality',
      byRun: new Map([['a', { status: 'Fail', reason: 'Plain reason', metric: 'GeneralQuality' }]]),
    }], 'a', 'b');
    expect(checks).toEqual([{
      testSet: 'Set', question: 'Hi', metric: 'Response Quality',
      a: { status: 'Fail', reason: 'Plain reason' }, b: undefined,
    }]);
  });

  it('matches Kit results by each run\u2019s Kit test run', () => {
    const result = (code: number) => ({ id: `r${code}`, testRunId: 'x', code, reason: `code ${code}` }) as unknown as KitTestResultVM;
    const row: KitTestRow = {
      key: 't1', utterance: 'Hello', questions: ['Hello', 'Bye'], metric: 'Response match', testSetName: 'Kit set',
      byRun: new Map([['kit-a', result(1)], ['kit-b', result(4)]]),
    };
    const kitRun = (testRunId: string) => run(testRunId, {
      kit: { status: 'Completed', testRunId: testRunId.toUpperCase(), pass: 0, fail: 0, total: 1, regressed: 0, improved: 0 },
    });
    expect(kitChecks([row], kitRun('kit-a'), kitRun('kit-b'))).toEqual([{
      testSet: 'Kit set', question: 'Hello → Bye', metric: 'Response match',
      a: { status: 'Pass', reason: 'code 1' }, b: { status: 'Error', reason: 'code 4' },
    }]);
  });
});

describe('recommendation decision', () => {
  const same = (n: number, prefix = 'T') => Array.from({ length: n }, (_, i) => check('Pass', 'Pass', `${prefix}${i}`));
  const decisionOf = (checks: RecommendationCheck[], runs = pair()) => ready(checks, runs).payload.decision;

  it('needs at least three shared checks and fewer than half errors', () => {
    expect(decisionOf(same(2))).toMatchObject({ verdict: 'insufficient', basis: 'too-few-shared-checks', confidence: 'low' });
    const errors = [...same(4), ...Array.from({ length: 4 }, (_, i) => check('Error', 'Pass', `E${i}`))];
    expect(decisionOf(errors)).toMatchObject({ verdict: 'insufficient', basis: 'too-many-errors', confidence: 'low' });
  });

  it('recommends neither when both runs pass under 75% of shared checks', () => {
    const checks = [...same(2), ...Array.from({ length: 6 }, (_, i) => check('Fail', 'Fail', `F${i}`))];
    expect(decisionOf(checks)).toMatchObject({ verdict: 'neither', basis: 'both-below-quality-bar', recommendedModel: null });
  });

  it('never prefers one run of a model over another run of the same model', () => {
    const checks = [...same(20), check('Fail', 'Pass', 'X1'), check('Fail', 'Pass', 'X2'), check('Fail', 'Pass', 'X3')];
    expect(decisionOf(checks, pair({}, {}, ['GPT56Chat', 'gpt56chat']))).toMatchObject({ verdict: 'equivalent', basis: 'same-model' });
  });

  it('recommends the clear quality leader, with medium confidence for a narrow margin', () => {
    const narrow = [...same(20), check('Fail', 'Pass', 'X1'), check('Fail', 'Pass', 'X2')];
    expect(decisionOf(narrow)).toMatchObject({
      verdict: 'B', basis: 'better-quality', recommendedModel: 'Opus48', confidence: 'medium', confidenceFactors: ['narrow-quality-margin'],
    });
    const wide = [...same(20), ...Array.from({ length: 4 }, (_, i) => check('Pass', 'Fail', `X${i}`))];
    expect(decisionOf(wide)).toMatchObject({ verdict: 'A', recommendedModel: 'GPT5Chat', confidence: 'high', confidenceFactors: [] });
  });

  it('breaks a quality tie with materially fewer credits, otherwise calls it equivalent', () => {
    const credits = (conversation: number, partial = false) => ({ credits: { conversation, evaluators: 0, partial } });
    expect(decisionOf(same(20), pair(credits(100), credits(60)))).toMatchObject({
      verdict: 'B', basis: 'same-quality-fewer-credits', confidence: 'high',
    });
    expect(decisionOf(same(20), pair(credits(100, true), credits(60)))).toMatchObject({ confidence: 'medium', confidenceFactors: ['partial-credits'] });
    expect(decisionOf(same(20), pair(credits(100), credits(95)))).toMatchObject({ verdict: 'equivalent', basis: 'no-meaningful-difference' });
  });

  it('compares credits per check, so a tie is broken even when coverage differs', () => {
    const checks = [...same(14), ...Array.from({ length: 4 }, (_, i) => check(undefined, 'Fail', `B${i}`))];
    const credits = (conversation: number) => ({ credits: { conversation, evaluators: 0 } });
    const request = ready(checks, pair(credits(300), credits(130), ['GPT-6 Astra', 'Claude Opus 4.8']));
    expect(request.payload.credits).toMatchObject({ perCheckA: 21.43, perCheckB: 7.22, cheaperRun: 'B', tieBreak: 'B', comparableCoverage: false });
    expect(request.payload.decision).toMatchObject({ verdict: 'B', basis: 'same-quality-fewer-credits', confidence: 'medium' });
    expect(recommendationEvidence(request, ['GPT-6 Astra', 'Claude Opus 4.8'])).toBe(
      'GPT-6 Astra: 14 results, 100% shared pass, 300.00 credits (21.43/result) · Claude Opus 4.8: 18 results, 100% shared pass, 130.00 credits (7.22/result) · 14 shared',
    );
    // Fewer credits in total but more per check is not cheaper.
    const fewerTotal = ready(checks, pair(credits(100), credits(110))).payload.credits;
    expect(fewerTotal).toMatchObject({ perCheckA: 7.14, perCheckB: 6.11, cheaperRun: 'B', tieBreak: 'B' });
  });

  it('lowers confidence for small samples, different coverage, errors and incomplete runs', () => {
    expect(decisionOf(same(5)).confidenceFactors).toEqual(['small-sample']);
    expect(decisionOf(same(10)).confidenceFactors).toEqual(['moderate-sample']);
    const differentChecks = [...same(20), ...Array.from({ length: 3 }, (_, i) => check('Pass', undefined, `O${i}`))];
    expect(decisionOf(differentChecks)).toMatchObject({ confidence: 'medium', confidenceFactors: ['coverage-differs'] });
    expect(decisionOf(same(20), pair({ status: 'Completed With Errors' }))).toMatchObject({ confidence: 'low', confidenceFactors: ['completed-with-errors'] });
    const errors = [...same(20), ...Array.from({ length: 6 }, (_, i) => check('Error', 'Pass', `E${i}`))];
    expect(decisionOf(errors).confidenceFactors).toEqual(['many-errors']);
  });
});

describe('parseRecommendation', () => {
  const decision = ready([check('Pass', 'Pass'), check('Pass', 'Pass'), check('Fail', 'Pass'), check('Fail', 'Pass')]).payload.decision;
  const output = {
    verdict: 'b', confidence: 'Low', headline: ' Use Opus ',
    reasons: ['r1', '', 'r2', 'r3', 'r4', 'r5'], tradeoffs: ['t'], caveats: 'not a list',
  };

  it('uses the app decision for verdict and confidence and trims the wording', () => {
    expect(decision).toMatchObject({ verdict: 'B', confidence: 'low' });
    const forced = { ...decision, confidence: 'high' as const };
    expect(parseRecommendation(JSON.stringify({ ...output, confidence: 'certain' }), forced)).toEqual({
      verdict: 'B', confidence: 'high', headline: 'Use Opus',
      reasons: ['r1', 'r2', 'r3', 'r4'], tradeoffs: ['t'], caveats: [],
    });
    expect(parseRecommendation({ headline: 'No verdict echoed' }, decision).verdict).toBe('B');
  });

  it('reads list entries returned as { item } objects', () => {
    const parsed = parseRecommendation({
      headline: 'Use Opus',
      reasons: [{ item: ' r1 ' }, { item: '' }, { other: 'x' }, 'r2'],
      tradeoffs: [{ item: 't' }],
      caveats: [{ item: 'c' }],
    }, decision);
    expect(parsed).toMatchObject({ reasons: ['r1', 'r2'], tradeoffs: ['t'], caveats: ['c'] });
  });

  it.each([null, {}, { verdict: 'B', headline: ' ' }, { verdict: 'A', headline: 'Written for the other model' }])(
    'rejects output that is missing or contradicts the decision (%j)',
    (value) => expect(() => parseRecommendation(value, decision)).toThrow(),
  );
});
