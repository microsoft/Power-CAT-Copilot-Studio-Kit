import { describe, expect, it } from 'vitest';
import {
  computeGroundedScore,
  computePillarBreakdown,
  evaluationCoverageScore,
  deriveEvaluationSignals,
  pillarContributions,
  rescorePillars,
  rescoreGroundedScore,
  severityCounts,
  summarizeRuleResults,
  PILLAR_WEIGHTS,
  type GroundedScoreInput,
  type PillarBreakdown,
  type PillarName,
} from '../services/scoring';
import { scoreBand, GREEN_THRESHOLD } from '../services/scoreBands';
import type { GroundedFinding, RuleEvaluationResult, RuleEvaluationStatus } from '../contracts/Findings';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel';

const finding = (over: Partial<GroundedFinding>): GroundedFinding => ({
  id: 'X', family: 'F', severity: 'warning', title: 't', fact: 'f', why: 'w', fix: 'x',
  referenceId: 'ms-agents-overview', ai: false, ...over,
});

const model = (over: Partial<AgentsExperienceModel> = {}): AgentsExperienceModel => ({
  agentSettings: { instructions: 'x'.repeat(80), raw: {} },
  tools: [], skills: [], connectedAgents: [], knowledge: [],
  evaluationSets: [], testCases: [], multiTurnCases: [], triggers: [], unknownKinds: [],
  ...over,
});

const evalSet = { name: 'set1', graders: ['General quality'], schemaname: 's1' };
const testCase = { name: 'tc1', input: 'x', schemaname: 't1' };

/** Build one Instructions-family rule result with a given status and key. */
const rule = (
  status: RuleEvaluationStatus,
  over: Partial<RuleEvaluationResult> = {},
): RuleEvaluationResult => ({ key: 'INS-01', ruleId: 'INS-01', family: 'Instructions', status, ...over });

// Instructions family always has these deterministic rules (all passed by default,
// so tests can override just the rule(s) under test without re-declaring the rest).
const cleanInstructionResults = (): RuleEvaluationResult[] => [
  { key: 'INS-01', ruleId: 'INS-01', family: 'Instructions', status: 'passed' },
  { key: 'INS-07', ruleId: 'INS-07', family: 'Instructions', status: 'passed' },
  { key: 'INS-08', ruleId: 'INS-08', family: 'Instructions', status: 'passed' },
];

const input = (over: Partial<GroundedScoreInput> = {}): GroundedScoreInput => ({
  model: model(),
  findings: [],
  ruleResults: cleanInstructionResults(),
  coverage: { covered: 0, total: 0 },
  ...over,
});

/** Composite score for a single-pillar (Instructions-only) scenario — used by the monotonic-invariant tests. */
function scoreFor(ruleResults: RuleEvaluationResult[], dismissed?: readonly string[]): number {
  const score = computeGroundedScore(input({ ruleResults, dismissed }));
  if (score === null) throw new Error('Expected a measurable score');
  return score;
}

describe('dismissed rules ("Ignore this rule")', () => {
  it('returns the credit a set-aside failing rule was costing', () => {
    expect(scoreFor([rule('error')], ['INS-01'])).toBe(scoreFor([rule('passed')]));
  });

  it('credits only the instance set aside, not every instance of the same rule', () => {
    // The reviewer decided the rubric is wrong about one component. That says nothing about the
    // other three, and crediting them too would let one click excuse a rule everywhere it fired.
    const results: RuleEvaluationResult[] = ['a', 'b', 'c', 'd'].map(s => ({
      key: `INS-09:${s}`, ruleId: 'INS-09', family: 'Instructions', status: 'error' as const,
    }));
    const pillarScore = (dismissed?: readonly string[]) =>
      computePillarBreakdown(input({ ruleResults: results, dismissed }))
        .find(p => p.pillar === 'Instructions')?.score;

    expect(pillarScore()).toBe(0);
    expect(pillarScore(['INS-09:a'])).toBe(25);
    expect(pillarScore(['INS-09:a', 'INS-09:b'])).toBe(50);
  });

  it('ignores a dismissal whose rule instance did not run', () => {
    // Carried-forward dismissals can outlive the component they were about.
    expect(scoreFor([rule('error')], ['SKL-99:deleted-skill'])).toBe(scoreFor([rule('error')]));
  });

  it('hands an unevaluated agent its whole Evaluation pillar back when its single row is set aside', () => {
    // With no test set the other slices have nothing to measure, so Evaluation is one row — and
    // setting aside the only row in a pillar sets aside the pillar, not 35% of it.
    const sig = { hasSet: false, coverageRatio: 0, multiTurn: false, expectedOk: false };
    expect(evaluationCoverageScore(sig)).toBe(0);
    expect(evaluationCoverageScore({ ...sig, setDismissed: true })).toBe(100);
  });

  it('satisfies the multi-turn slice when EVL-05 is set aside', () => {
    const withSet = {
      model: model({ evaluationSets: [evalSet], testCases: [testCase] }),
      coverage: { covered: 1, total: 1 },
    };
    expect(deriveEvaluationSignals(input(withSet)).multiTurn).toBe(false);
    expect(deriveEvaluationSignals(input({ ...withSet, dismissed: ['EVL-05'] })).multiTurn).toBe(true);
  });

  it('credits one uncovered capability without crediting the rest', () => {
    const base = {
      model: model({ evaluationSets: [evalSet], testCases: [testCase] }),
      coverage: { covered: 0, total: 4, uncoveredIds: ['t1', 't2', 't3', 't4'] },
    };
    expect(deriveEvaluationSignals(input(base)).coverageRatio).toBe(0);
    expect(deriveEvaluationSignals(input({ ...base, dismissed: ['EVL-02:t1'] })).coverageRatio).toBe(0.25);
    // Setting aside the consolidated coverage row credits every capability at once.
    expect(deriveEvaluationSignals(input({ ...base, dismissed: ['EVL-02'] })).coverageRatio).toBe(1);
  });
});

describe('evaluationCoverageScore', () => {
  it('is 0 when no usable test set exists', () => {
    expect(evaluationCoverageScore({ hasSet: false, coverageRatio: 1, multiTurn: true, expectedOk: true })).toBe(0);
  });
  it('is 100 for a full, multi-turn, expected-complete set with full coverage', () => {
    expect(evaluationCoverageScore({ hasSet: true, coverageRatio: 1, multiTurn: true, expectedOk: true })).toBe(100);
  });
  it('rewards a set even with zero capability coverage but caps well below full', () => {
    expect(evaluationCoverageScore({ hasSet: true, coverageRatio: 0, multiTurn: false, expectedOk: true })).toBe(45);
  });
  it('caps conversation-only readiness at 60 when capability coverage is unverified', () => {
    expect(evaluationCoverageScore({ hasSet: true, coverageRatio: 0, multiTurn: true, expectedOk: true })).toBe(60);
  });
  it('scales with capability coverage', () => {
    expect(evaluationCoverageScore({ hasSet: true, coverageRatio: 1, multiTurn: false, expectedOk: true })).toBe(85);
  });
});

describe('deriveEvaluationSignals', () => {
  it('requires both a set and at least one case for hasSet', () => {
    expect(deriveEvaluationSignals(input({ model: model({ evaluationSets: [evalSet] }) })).hasSet).toBe(false);
    expect(deriveEvaluationSignals(input({ model: model({ evaluationSets: [evalSet], testCases: [testCase] }) })).hasSet).toBe(true);
  });
  it('reads coverage ratio, multi-turn and expected-response signals', () => {
    const sig = deriveEvaluationSignals(input({
      model: model({ evaluationSets: [evalSet], testCases: [testCase], multiTurnCases: [{ name: 'm', schemaname: 'm1' }] }),
      coverage: { covered: 1, total: 2 },
      findings: [finding({ id: 'EVL-04' })],
    }));
    expect(sig).toEqual({ hasSet: true, coverageRatio: 0.5, multiTurn: true, expectedOk: false, setDismissed: false });
  });
  it('treats a multi-turn-only test set as a usable test set', () => {
    // Regression: multi-turn cases were parsed into multiTurnCases only, so an
    // agent whose entire test set was multi-turn scored hasSet=false and
    // forfeited the whole Evaluation pillar.
    const multiTurnOnly = model({
      evaluationSets: [evalSet],
      testCases: [{ name: 'mt1', input: 'turn one', schemaname: 'm1', turns: 3, multiTurn: true }],
      multiTurnCases: [{ name: 'mt1', schemaname: 'm1' }],
    });
    const sig = deriveEvaluationSignals(input({ model: multiTurnOnly }));
    expect(sig.hasSet).toBe(true);
    expect(evaluationCoverageScore(sig)).toBeGreaterThan(0);
  });
  it('withholds capability credit for unverified coverage even when there is nothing to divide', () => {
    const sig = deriveEvaluationSignals(input({
      model: model({
        evaluationSets: [evalSet],
        testCases: [{ ...testCase, multiTurn: true }],
        multiTurnCases: [{ name: 'tc1', schemaname: 't1' }],
      }),
      coverage: { covered: 0, total: 0, basis: 'unverified' },
    }));
    expect(sig.coverageRatio).toBe(0);
    expect(evaluationCoverageScore(sig)).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Task 3 — score v2: monotonic rule-instance credit invariants
// ---------------------------------------------------------------------------

describe('computeGroundedScore — rule-instance credit (score v2)', () => {
  it('only a fail reduces a pillar in full — needs attention costs half, and both beat error', () => {
    // "Needs attention" is neither a clean pass nor a defect, so it earns half credit: enough to
    // keep a prompt-to-look-at-something from reading as a failure, little enough that setting one
    // aside visibly moves the score. Ordering is what matters — passed > warning > error.
    expect(scoreFor([rule('warning')])).toBeLessThan(scoreFor([rule('passed')]));
    expect(scoreFor([rule('warning')])).toBeGreaterThan(scoreFor([rule('error')]));
  });

  it('an informational outcome is excluded from the score entirely — numerator and denominator', () => {
    // A fact cannot be satisfied or missed. Leaving info in the denominator was not neutral: it was
    // a guaranteed full-credit row that diluted every real result beside it, so one Fail next to one
    // fact scored 50 instead of 0. Adding an informational row must not move the score at all.
    const withInfo = scoreFor([rule('error'), rule('info', { key: 'INS-04', ruleId: 'INS-04' })]);
    const withoutInfo = scoreFor([rule('error')]);
    expect(withInfo).toBe(withoutInfo);
  });

  it('a duplicate rule instance under the same key collapses — cannot double-count', () => {
    const single = scoreFor([rule('warning')]);
    const duplicated = scoreFor([rule('warning'), rule('warning')]);
    expect(duplicated).toBe(single);
  });

  it('1, 2, 3, or 20 findings from one rule cannot change its credit — only the rule-instance status matters', () => {
    // The scorer only ever sees one RuleEvaluationResult per rule instance,
    // regardless of how many findings that rule produced — this is the
    // structural guarantee that replaces finding-count-based scoring.
    const many = Array.from({ length: 20 }, () => rule('warning'));
    expect(scoreFor(many)).toBe(scoreFor([rule('warning')]));
  });

  it('needs attention sits between a clean pass and an error within the same pillar', () => {
    const other = { key: 'INS-07', ruleId: 'INS-07', family: 'Instructions', status: 'passed' } as const;
    const clean = scoreFor([rule('passed'), other]);
    const warned = scoreFor([rule('warning'), other]);
    const failed = scoreFor([rule('error'), other]);
    expect(warned).toBeLessThan(clean);
    expect(warned).toBeGreaterThan(failed);
    expect(failed).toBeLessThan(clean);
  });

  it('a record instance is excluded, so it cannot dilute a failing pillar', () => {
    // A record always carries `info`, and `info` earns full credit. Scored, one record beside one
    // failure would report 50 for a pillar where the only judged rule failed.
    const failing = scoreFor([{ key: 'TOL-02', ruleId: 'TOL-02', family: 'Tools', status: 'error' }]);
    const failingWithRecord = scoreFor([
      { key: 'TOL-02', ruleId: 'TOL-02', family: 'Tools', status: 'error' },
      { key: 'TOL-01', ruleId: 'TOL-01', family: 'Tools', status: 'info', kind: 'record' },
    ]);
    expect(failingWithRecord).toBe(failing);
  });

  it('a legacy record with no kind is still excluded, resolved from its rule id', () => {
    const failing = scoreFor([{ key: 'TOL-02', ruleId: 'TOL-02', family: 'Tools', status: 'error' }]);
    const legacy = scoreFor([
      { key: 'TOL-02', ruleId: 'TOL-02', family: 'Tools', status: 'error' },
      { key: 'TOL-01', ruleId: 'TOL-01', family: 'Tools', status: 'info' },
    ]);
    expect(legacy).toBe(failing);
  });

  it('an out-of-registry family cannot move the composite', () => {
    const withUnknownFamily = scoreFor([
      ...cleanInstructionResults(),
      { key: 'ZZZ-01', ruleId: 'ZZZ-01', family: 'NotAPillar', status: 'error' },
    ]);
    expect(withUnknownFamily).toBe(scoreFor(cleanInstructionResults()));
  });

  it('warning + error for the same key resolves to error (worst status wins on dedupe)', () => {
    const mixed = scoreFor([
      { key: 'INS-01', ruleId: 'INS-01', family: 'Instructions', status: 'warning' },
      { key: 'INS-01', ruleId: 'INS-01', family: 'Instructions', status: 'error' },
    ]);
    const errorOnly = scoreFor([{ key: 'INS-01', ruleId: 'INS-01', family: 'Instructions', status: 'error' }]);
    expect(mixed).toBe(errorOnly);
  });

  it('reordering rule results does not change the score', () => {
    const a = scoreFor([rule('passed'), rule('warning', { key: 'INS-07', ruleId: 'INS-07' }), rule('error', { key: 'INS-08', ruleId: 'INS-08' })]);
    const b = scoreFor([rule('error', { key: 'INS-08', ruleId: 'INS-08' }), rule('passed'), rule('warning', { key: 'INS-07', ruleId: 'INS-07' })]);
    expect(a).toBe(b);
  });

  it('not-applicable rule instances are excluded from the denominator entirely', () => {
    const withNotApplicable = scoreFor([
      rule('passed'),
      { key: 'INS-07', ruleId: 'INS-07', family: 'Instructions', status: 'not-applicable' },
    ]);
    const withoutIt = scoreFor([rule('passed')]);
    expect(withNotApplicable).toBe(withoutIt);
  });

  it('a failed rule instance is excluded from credit and marks the pillar incomplete', () => {
    const breakdown = computePillarBreakdown(input({
      ruleResults: [
        { key: 'INS-01', ruleId: 'INS-01', family: 'Instructions', status: 'passed' },
        { key: 'INS-07', ruleId: 'INS-07', family: 'Instructions', status: 'failed' },
      ],
    }));
    const instructions = breakdown.find(p => p.pillar === 'Instructions')!;
    expect(instructions.complete).toBe(false);
    // Only the passed instance counts toward the score (100%, not dragged down by 'failed').
    expect(instructions.score).toBe(100);
  });
});

describe('summarizeRuleResults', () => {
  it('counts only passed as passed, and excludes info/not-applicable/failed from evaluated', () => {
    const summary = summarizeRuleResults([
      { key: 'A', ruleId: 'A', family: 'F', status: 'passed' },
      { key: 'B', ruleId: 'B', family: 'F', status: 'info' },
      { key: 'C', ruleId: 'C', family: 'F', status: 'warning' },
      { key: 'D', ruleId: 'D', family: 'F', status: 'not-applicable' },
      { key: 'E', ruleId: 'E', family: 'F', status: 'failed' },
    ]);
    expect(summary).toEqual({ passed: 1, evaluated: 2, hasFailed: true });
  });

  it('deduplicates by key before counting', () => {
    const summary = summarizeRuleResults([
      { key: 'A', ruleId: 'A', family: 'F', status: 'passed' },
      { key: 'A', ruleId: 'A', family: 'F', status: 'passed' },
    ]);
    expect(summary.evaluated).toBe(1);
  });
});

describe('computeGroundedScore (weighted pillars)', () => {
  it('caps an otherwise-clean agent with no eval at the documented 70', () => {
    const score = computeGroundedScore(input({
      model: model({ agentSettings: { instructions: 'x'.repeat(80), raw: {} } }),
    }));
    // Instructions 100 carries the whole non-evaluation share => 70.
    expect(score).toBe(70);
  });

  it('reaches 100 when instructions are clean and evaluation is fully covered', () => {
    const score = computeGroundedScore(input({
      model: model({
        agentSettings: { instructions: 'x'.repeat(80), raw: {} },
        evaluationSets: [evalSet], testCases: [testCase], multiTurnCases: [{ name: 'm', schemaname: 'm1' }],
      }),
      coverage: { covered: 0, total: 0 },
    }));
    expect(score).toBe(100);
  });

  it('includes a conditional pillar only when the capability is present', () => {
    const withTool = computeGroundedScore(input({
      model: model({
        agentSettings: { instructions: 'x'.repeat(80), raw: {} },
        tools: [{ name: 'tA', kind: 'ConnectorTool', schemaname: 'ta' }],
        evaluationSets: [evalSet], testCases: [testCase], multiTurnCases: [{ name: 'm', schemaname: 'm1' }],
      }),
      ruleResults: [...cleanInstructionResults(), { key: 'TOOL-01', ruleId: 'TOOL-01', family: 'Tools', status: 'passed' }],
    }));
    expect(withTool).toBe(100);
  });

  it('applies the same evaluation penalty to bare and capability-rich agents', () => {
    // Both agents are flawless on every applicable rule but have no test set,
    // so both must forfeit exactly the 30-point Evaluation share.
    const bare = computeGroundedScore(input({
      model: model({ agentSettings: { instructions: 'x'.repeat(80), raw: {} } }),
    }));
    const rich = computeGroundedScore(input({
      model: model({
        agentSettings: { instructions: 'x'.repeat(80), raw: {} },
        tools: [{ name: 'tA', kind: 'ConnectorTool', schemaname: 'ta' }],
        skills: [{ name: 'sA', schemaname: 'sa', markdown: '', body: '', componentId: 'c1', componentIdUnique: 'cu1', source: 'inline-markdown', resourceCount: 0 }],
        knowledge: [{ name: 'kA', schemaname: 'ka' }],
        connectedAgents: [{ name: 'aA', schemaname: 'aa' }],
      }),
      ruleResults: [
        ...cleanInstructionResults(),
        { key: 'TOOL-01', ruleId: 'TOOL-01', family: 'Tools', status: 'passed' },
        { key: 'SKL-01:sa', ruleId: 'SKL-01', family: 'Skills', status: 'passed' },
        { key: 'KNW-01', ruleId: 'KNW-01', family: 'Knowledge', status: 'passed' },
        { key: 'AGT-01', ruleId: 'AGT-01', family: 'Connected agents', status: 'passed' },
      ],
    }));
    expect(bare).toBe(70);
    expect(rich).toBe(70);
  });

  it('never reaches the healthy band without an evaluation set', () => {
    // Guards the "no eval, no go" product rule. The rule spans two independently
    // editable places — the pillar weights here and the band thresholds in
    // scoreBands.ts — so this chains the real scorer into the real band function
    // rather than asserting either number in isolation. Retuning the weights or
    // lowering the green cut-point far enough to let an untested agent read as
    // healthy must fail this test.
    const flawlessButUntested = computeGroundedScore(input({
      model: model({
        agentSettings: { instructions: 'x'.repeat(80), raw: {} },
        tools: [{ name: 'tA', kind: 'ConnectorTool', schemaname: 'ta' }],
        skills: [{ name: 'sA', schemaname: 'sa', markdown: '', body: '', componentId: 'c1', componentIdUnique: 'cu1', source: 'inline-markdown', resourceCount: 0 }],
        knowledge: [{ name: 'kA', schemaname: 'ka' }],
        connectedAgents: [{ name: 'aA', schemaname: 'aa' }],
      }),
      ruleResults: [
        ...cleanInstructionResults(),
        { key: 'TOOL-01', ruleId: 'TOOL-01', family: 'Tools', status: 'passed' },
        { key: 'SKL-01:sa', ruleId: 'SKL-01', family: 'Skills', status: 'passed' },
        { key: 'KNW-01', ruleId: 'KNW-01', family: 'Knowledge', status: 'passed' },
        { key: 'AGT-01', ruleId: 'AGT-01', family: 'Connected agents', status: 'passed' },
      ],
    }));

    expect(flawlessButUntested).toBeLessThan(GREEN_THRESHOLD);
    expect(scoreBand(flawlessButUntested)).not.toBe('green');
  });

  it('lets a failing conditional pillar drag the score below a bare agent', () => {
    const withFailingTool = computeGroundedScore(input({
      model: model({
        agentSettings: { instructions: 'x'.repeat(80), raw: {} },
        tools: [{ name: 'tA', kind: 'ConnectorTool', schemaname: 'ta' }],
      }),
      ruleResults: [...cleanInstructionResults(), { key: 'TOOL-01', ruleId: 'TOOL-01', family: 'Tools', status: 'error' }],
    }));
    // Instructions 100 (25) + Tools 0 (12) => 70 * 2500/37 = 47.
    expect(withFailingTool).toBe(47);
  });
});

describe('computePillarBreakdown', () => {
  it('marks baseline pillars applicable and unused conditional pillars not', () => {
    const rows = computePillarBreakdown(input());
    const byName = Object.fromEntries(rows.map(r => [r.pillar, r]));
    expect(byName.Instructions.applicable).toBe(true);
    expect(byName.Evaluation.applicable).toBe(true);
    // No skills and no tools, and every rule in those pillars reads only that population,
    // so there is nothing to judge and the weight is redistributed.
    expect(byName.Skills.applicable).toBe(false);
    expect(byName.Tools.applicable).toBe(false);
    // Knowledge and Orchestration each hold rules that read instruction text -- citing
    // sources, link safety, tool-routing hints, escalation guidance. The agent has
    // instructions, so those judgements can be made and must count. Gating these on the
    // knowledge and delegation populations alone computed them and then discarded them,
    // which let an agent fail all four and still score 100.
    expect(byName.Knowledge.applicable).toBe(true);
    expect(byName.Orchestration.applicable).toBe(true);
  });
  it('weights evaluation at 30 and instructions at 25', () => {
    expect(PILLAR_WEIGHTS.Evaluation).toBe(30);
    expect(PILLAR_WEIGHTS.Instructions).toBe(25);
  });
  it('an agent with no skills has Skills.applicable === false regardless of rule results', () => {
    const rows = computePillarBreakdown(input({ model: model({ skills: [] }) }));
    expect(rows.find(p => p.pillar === 'Skills')!.applicable).toBe(false);
  });

  it('marks every score pillar not applicable when the agent has no measurable configuration', () => {
    const emptyModel = model({
      agentSettings: { instructions: '', raw: {} },
    });
    const rows = computePillarBreakdown(input({
      model: emptyModel,
      ruleResults: [],
    }));

    expect(rows.every((pillar) => !pillar.applicable && pillar.score === null)).toBe(true);
    expect(computeGroundedScore(input({
      model: emptyModel,
      ruleResults: [],
    }))).toBeNull();
  });
});

/**
 * The score explainer in the UI reads these shares. DEF-1 was the explainer
 * restating a weight the scorer had stopped using, so the first test here is the
 * one that matters: the shares must reproduce the composite, not merely look
 * plausible beside it.
 */
describe('pillarContributions', () => {
  const pillar = (
    name: PillarName,
    applicable: boolean,
    score: number | null,
  ): PillarBreakdown => ({
    // `complete` is deliberately true throughout: it records whether a pillar's
    // rules all ran, and `compositeFromBreakdown` never reads it, so varying it
    // here would imply it changes the shares when it cannot.
    pillar: name, weight: PILLAR_WEIGHTS[name], applicable, score, complete: true,
  });
  const recombine = (rows: readonly PillarBreakdown[]) => Math.round(
    pillarContributions(rows).reduce((sum, c) => sum + c.effectiveWeight * (c.score ?? 0), 0) / 100,
  );
  const weightOf = (rows: readonly PillarBreakdown[], name: PillarName) =>
    pillarContributions(rows).find(c => c.pillar === name)!.effectiveWeight;

  it('reproduces the composite it explains', () => {
    const scored = input({
      model: model({
        agentSettings: { instructions: 'x'.repeat(80), raw: {} },
        tools: [{ name: 'tA', kind: 'ConnectorTool', schemaname: 'ta' }],
        evaluationSets: [evalSet], testCases: [testCase],
      }),
    });
    expect(recombine(computePillarBreakdown(scored))).toBe(computeGroundedScore(scored));
  });

  it('gives the pinned pillar the whole score when nothing else could be measured', () => {
    const rows = [
      pillar('Evaluation', true, 80),
      pillar('Instructions', false, null),
      pillar('Skills', false, null),
    ];
    expect(weightOf(rows, 'Evaluation')).toBe(100);
    expect(recombine(rows)).toBe(80);
  });

  it('shares the remaining weight in proportion to the declared weights', () => {
    const rows = [
      pillar('Evaluation', true, 100),
      pillar('Instructions', true, 80),
      pillar('Skills', true, 60),
      pillar('Tools', false, null),
    ];
    // Instructions 25 and Skills 15 split the 70 left after Evaluation's pinned 30.
    expect(weightOf(rows, 'Evaluation')).toBe(30);
    expect(weightOf(rows, 'Instructions')).toBeCloseTo(43.75, 10);
    expect(weightOf(rows, 'Tools')).toBe(0);
    expect(recombine(rows)).toBe(computeCompositeByHand(rows));
  });

  it('still reserves the pinned share when the pinned pillar was not assessed', () => {
    // The scorer divides by the full 100 whether or not Evaluation produced a number,
    // so the explainer must show the 30 points it reserved rather than hide them and
    // imply the other pillars carried the whole score.
    const rows = [pillar('Evaluation', false, null), pillar('Instructions', true, 100)];
    expect(weightOf(rows, 'Evaluation')).toBe(30);
    expect(weightOf(rows, 'Instructions')).toBe(70);
    expect(recombine(rows)).toBe(70);
  });

  it('excludes an applicable pillar that produced no score from the denominator', () => {
    const rows = [
      pillar('Evaluation', true, 100),
      pillar('Instructions', true, 60),
      pillar('Skills', true, null),
    ];
    expect(weightOf(rows, 'Instructions')).toBe(70);
    expect(weightOf(rows, 'Skills')).toBe(0);
  });
});

/** The composite restated independently, so the test does not check the code against itself. */
function computeCompositeByHand(rows: readonly PillarBreakdown[]): number {
  const evaluation = rows.find(r => r.pillar === 'Evaluation');
  const pinned = evaluation?.applicable ? (evaluation.score ?? 0) : 0;
  const others = rows.filter(r => r.pillar !== 'Evaluation' && r.applicable && r.score !== null);
  const otherWeight = others.reduce((sum, r) => sum + r.weight, 0);
  const othersScore = others.reduce((sum, r) => sum + r.weight * (r.score as number), 0) / otherWeight;
  return Math.round((30 * pinned + 70 * othersScore) / 100);
}

describe('severityCounts', () => {  it('counts severities, excluding info from error/warning', () => {
    expect(severityCounts([
      finding({ severity: 'error' }), finding({ severity: 'warning' }),
      finding({ severity: 'warning' }), finding({ severity: 'info' }),
    ])).toEqual({ warnings: 2, errors: 1, infos: 1 });
  });
});

/**
 * `rescorePillars` had no test anywhere, which is how both defects below survived: each one is
 * silent, and the symptom of either is a score that fails to move when a reviewer sets a rule
 * aside — indistinguishable from the reviewer having changed nothing.
 *
 * The rows used here are the real ones a Standard review of Agent Analytics renders (37 across the
 * eight families below), so these are the families the rescorer actually meets rather than invented
 * ones. Statuses are stated per test, because `scoreLegacyDeterministicRules` excludes `failed`
 * from the denominator outright — only `error`, `warning` and `passed` rows can be credited, so a
 * dismissal of a `failed` row is correctly a no-op.
 */
describe('rescorePillars', () => {
  const stored = (pillar: PillarName, score: number | null): PillarBreakdown =>
    ({ pillar, weight: PILLAR_WEIGHTS[pillar], applicable: true, score, complete: true });

  const row = (ruleId: string, family: string, status: RuleEvaluationStatus): RuleEvaluationResult =>
    ({ key: ruleId, ruleId, family, status });

  const rescore = (
    pillar: PillarBreakdown, ruleResults: RuleEvaluationResult[], dismissed: string[] = [],
  ) => rescorePillars({ pillars: [pillar], ruleResults, coverage: { covered: 0, total: 0 }, dismissed })[0];

  /**
   * Only `Instructions` and `Evaluation` are keys of `FAMILY_TO_PILLAR`, so resolving by family
   * alone dropped every row in the other six families — 22 of the 37 rendered — out of its pillar's
   * denominator. Dismissing one then did nothing at all, which is the whole "Tools answered a
   * dismissal with nothing" report: Tools' only Standard rows render under family `Architecture`.
   */
  const RENDERED_FAMILIES: ReadonlyArray<{ family: string; ruleId: string; pillar: PillarName }> = [
    { family: 'Architecture',      ruleId: 'STD-TOL-ROUTING-DESCRIPTION',  pillar: 'Tools' },
    { family: 'Architecture',      ruleId: 'local-pattern-7',              pillar: 'Orchestration' },
    { family: 'Model Description', ruleId: 'STD-PATTERN-MODEL-DESCRIPTION', pillar: 'Skills' },
    { family: 'Model Description', ruleId: 'STD-ROUTE-TOPIC-OVERLAP',      pillar: 'Orchestration' },
    { family: 'Model Naming',      ruleId: 'STD-PATTERN-MODEL-NAME',       pillar: 'Skills' },
    { family: 'Input Variables',   ruleId: 'STD-PATTERN-INPUT-NAME',       pillar: 'Skills' },
    { family: 'Output Variables',  ruleId: 'STD-PATTERN-OUTPUT-NAME',      pillar: 'Skills' },
    { family: 'Orchestration',     ruleId: 'STD-PATTERN-MISSING-TRIGGERS', pillar: 'Skills' },
    { family: 'Instructions',      ruleId: 'scope-definition',             pillar: 'Instructions' },
  ];

  it.each(RENDERED_FAMILIES)(
    'moves $pillar when a dismissed $family row is set aside ($ruleId)',
    ({ family, ruleId, pillar }) => {
      const results = [row(ruleId, family, 'error')];
      expect(rescore(stored(pillar, 0), results).score).toBe(0);
      expect(rescore(stored(pillar, 0), results, [ruleId]).score).toBe(100);
    },
  );

  it('resolves a row by its rule, not its family, when the two disagree', () => {
    // Family `Orchestration` is not a key of the table at all — it is spelled `Connected agents` —
    // while the rule itself declares Skills. Resolving by family dropped the row from both pillars.
    const results = [row('STD-PATTERN-MISSING-TRIGGERS', 'Orchestration', 'error')];
    expect(rescore(stored('Skills', 0), results, ['STD-PATTERN-MISSING-TRIGGERS']).score).toBe(100);
    expect(rescore(stored('Orchestration', 0), results, ['STD-PATTERN-MISSING-TRIGGERS']).score).toBe(0);
  });

  /**
   * Five criteria render under family `Instructions` but are registered elsewhere. The live
   * `computePillarBreakdown` already resolved them through the registry, so until now the live
   * score and the rescore disagreed about where these rows belonged.
   */
  const SPLIT_INSTRUCTION_ROWS: ReadonlyArray<{ ruleId: string; pillar: PillarName }> = [
    { ruleId: 'citations-and-sources', pillar: 'Knowledge' },
    { ruleId: 'link-safety',           pillar: 'Knowledge' },
    { ruleId: 'accuracy-quality',      pillar: 'Knowledge' },
    { ruleId: 'tool-routing-hints',    pillar: 'Orchestration' },
    { ruleId: 'escalation-guidance',   pillar: 'Orchestration' },
  ];

  it.each(SPLIT_INSTRUCTION_ROWS)(
    'credits $ruleId to $pillar, where the live score counts it, not to Instructions',
    ({ ruleId, pillar }) => {
      const results = [row(ruleId, 'Instructions', 'error')];
      expect(rescore(stored(pillar, 0), results, [ruleId]).score).toBe(100);
      expect(rescore(stored('Instructions', 0), results, [ruleId]).score).toBe(0);
    },
  );

  it('still resolves a row whose rule no registry holds, by family', () => {
    const results = [row('retired-id-no-registry-holds', 'Instructions', 'error')];
    expect(rescore(stored('Instructions', 0), results, ['retired-id-no-registry-holds']).score).toBe(100);
  });

  describe('the Evaluation gate', () => {
    it('returns the pillar whole when the row a Standard review actually renders is dismissed', () => {
      // `local-pattern-8` ("Inadequate Test Cases") is the only Evaluation row a Standard review
      // persists. Its dismissal used to be read through `setDismissed`, which credited EVL-01 — a
      // rule that already passes whenever the pillar scored above 0, so it forgave nothing.
      const results = [row('local-pattern-8', 'Evaluation', 'error')];
      expect(rescore(stored('Evaluation', 62), results).score).toBeLessThan(100);
      expect(rescore(stored('Evaluation', 62), results, ['local-pattern-8']).score).toBe(100);
    });

    it('returns the pillar whole when the registered gate itself is dismissed', () => {
      expect(rescore(stored('Evaluation', 62), [], ['EVL-01']).score).toBe(100);
    });

    it('ignores a carried-forward dismissal once the gate row passes', () => {
      // The defect this pins: a dismissal outlives the failure it answered. `carryForwardDismissals`
      // keeps any key the new review still renders, and a rule that now *passes* still renders — so
      // a maker who set this row aside when it failed, then actually added the test cases, came back
      // to a pillar minted at 100. Forgiving a rule the agent now earns on its own merits is worth
      // ~11 composite points on this 30-weight pinned pillar, awarded for having fixed the problem.
      // Asserted against the undismissed baseline rather than an absolute number: with empty
      // coverage the shim rebuilds the pillar at 35 + 40×1, so the figure here is a fixture
      // artefact. "The dismissal changed nothing" is the invariant, and it is artefact-proof.
      const passing = [row('local-pattern-8', 'Evaluation', 'passed')];
      const untouched = rescore(stored('Evaluation', 62), passing).score;
      expect(rescore(stored('Evaluation', 62), passing, ['local-pattern-8']).score).toBe(untouched);
      expect(untouched).toBeLessThan(100);

      // The same dismissal must still be honoured while the row is genuinely failing.
      const failing = [row('local-pattern-8', 'Evaluation', 'error')];
      expect(rescore(stored('Evaluation', 62), failing, ['local-pattern-8']).score).toBe(100);
    });

    it('reads the gate row when its key is not its rule id', () => {
      // Outcomes are deduplicated by `key` while the gate is looked up by id. Those vocabularies
      // differ for a per-component rule (`id:componentId`) and for standard rows saved as
      // `standard:<id>:agent`; a miss would read as "did not pass" and forgive the pillar wrongly.
      const keyed: RuleEvaluationResult = {
        key: 'standard:local-pattern-8:agent', ruleId: 'local-pattern-8',
        family: 'Evaluation', status: 'passed',
      };
      const untouched = rescore(stored('Evaluation', 62), [keyed]).score;
      expect(rescore(stored('Evaluation', 62), [keyed], ['local-pattern-8']).score).toBe(untouched);
      expect(untouched).toBeLessThan(100);
    });

    it('credits only its own slice when a sub-rule is dismissed below a passing gate', () => {
      // The user's rule: forgiving multi-turn coverage adds multi-turn coverage and nothing else.
      // Measured as a delta so the assertion holds whatever EVL-02's coverage ratio contributes.
      const base = rescore(stored('Evaluation', 1), []).score as number;
      const multiTurn = rescore(stored('Evaluation', 1), [], ['EVL-05']).score as number;
      const expected = rescore(stored('Evaluation', 1), [], ['EVL-04']).score as number;

      expect(multiTurn - base).toBe(15);
      expect(expected - base).toBe(10);
      expect(multiTurn).toBeLessThan(100);
    });
  });

  it('leaves the rule-credit pillars exactly as stored when nothing is dismissed', () => {
    // `AnalysisPanel` never calls the rescorer without dismissals, so this bounds the blast radius:
    // the resolver change cannot move a score on a review nobody has touched. Evaluation is left
    // out deliberately — it is not rule credit, and its shim rebuilds the pillar from recovered
    // signals on every call, so it is pinned by the gate tests above rather than here.
    const pillars = [stored('Tools', 42), stored('Instructions', 29), stored('Skills', 67)];
    const ruleResults = RENDERED_FAMILIES.map(r => row(r.ruleId, r.family, 'error'));
    expect(rescorePillars({ pillars, ruleResults, coverage: { covered: 0, total: 0 } })).toEqual(pillars);
  });

  it('leaves a withheld pillar withheld even when one of its rows is dismissed', () => {
    const results = [row('STD-TOL-ROUTING-DESCRIPTION', 'Architecture', 'error')];
    expect(rescore(stored('Tools', null), results, ['STD-TOL-ROUTING-DESCRIPTION']).score).toBeNull();
  });

  it('cannot credit a row the scorer never admits', () => {
    // `scoreLegacyDeterministicRules` drops `failed`, `not-applicable` and `info` before dismissal
    // credit is applied, so there is no eligible row left to forgive. Pinned because the opposite —
    // crediting a check that could not run — is the one change here that would inflate a score for
    // a rule nobody measured, and it would look like a reasonable generalisation to a later reader.
    for (const status of ['failed', 'not-applicable', 'info'] as const) {
      const results = [row('STD-TOL-ROUTING-DESCRIPTION', 'Architecture', status)];
      expect(rescore(stored('Tools', 0), results, ['STD-TOL-ROUTING-DESCRIPTION']).score).toBe(0);
    }
  });

  it('leaves an inapplicable pillar alone', () => {
    const pillar: PillarBreakdown =
      { pillar: 'Tools', weight: PILLAR_WEIGHTS.Tools, applicable: false, score: null, complete: true };
    const results = [row('STD-TOL-ROUTING-DESCRIPTION', 'Architecture', 'error')];
    expect(rescore(pillar, results, ['STD-TOL-ROUTING-DESCRIPTION'])).toEqual(pillar);
  });

  it('never lowers a pillar below the score the review stored', () => {
    // A stored review need not carry a row for every rule it scored, and an absent row reads as
    // "not passed" — so the floor is what keeps an incomplete `ruleResults` from inventing a drop.
    const results = [row('STD-PATTERN-MODEL-NAME', 'Model Naming', 'error')];
    expect(rescore(stored('Skills', 67), results).score).toBe(67);
  });

  it('rolls the credited pillars up into the headline', () => {
    const pillars = [stored('Tools', 0), stored('Skills', 0)];
    const ruleResults = [
      row('STD-TOL-ROUTING-DESCRIPTION', 'Architecture', 'error'),
      row('STD-PATTERN-MODEL-NAME', 'Model Naming', 'error'),
    ];
    const coverage = { covered: 0, total: 0 };
    // Evaluation is pinned at 30 points of the composite whether or not it is present, so the
    // remaining pillars share the other 70: 12/(12+15) of 70 is the 31 a fully credited Tools buys.
    expect(rescoreGroundedScore({ pillars, ruleResults, coverage })).toBe(0);
    expect(rescoreGroundedScore({
      pillars, ruleResults, coverage, dismissed: ['STD-TOL-ROUTING-DESCRIPTION'],
    })).toBe(31);
  });
});
