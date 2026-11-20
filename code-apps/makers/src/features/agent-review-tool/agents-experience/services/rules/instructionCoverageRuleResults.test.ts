/**
 * The scoring rows for the six rules the instruction-coverage node owns.
 *
 * Two claims are under test, and the second is the one that matters when the
 * backend is down:
 *
 *   1. Each row's status is a projection of the rule's own verdict — the
 *      adapter decides nothing.
 *   2. A classifier that did not run can never mint a pass. Every bad path
 *      reports `failed`, which is the persisted spelling of "could not run",
 *      and `scoreLegacyDeterministicRules` drops it from *both* sides of the
 *      ratio. So an unreachable, unprovisioned or cancelled AI workflow leaves
 *      the deterministic score and its dismissals exactly as they were.
 *
 * Claim 2 is asserted against a *favourable* input — a complete-looking element
 * list and a named capability — so the test fails if the stage status is ever
 * ignored in favour of the data beside it.
 */
import { describe, expect, it } from 'vitest';
import type { InstructionCoverageElement } from '../../contracts/AiCoverage';
import type { RuleEvaluationResult } from '../../contracts/Findings';
import type { InstructionCoverageAssessment } from '../../../review-core/rules/skill-coverage.rules';
import { instructionCoverageRuleResults } from './skillCoverageAdapters';
import { dismissedKeys } from '../dismissals';
import { scoreLegacyDeterministicRules } from '../scoring';

const ELEMENT_KEYS = ['role', 'tone', 'boundaries', 'ambiguity', 'escalation'] as const;

/** The six ids, in the order `INSTRUCTION_COVERAGE_RULES` declares them plus INS-07. */
const ALL_IDS = ['INS-02', 'INS-03', 'INS-04', 'INS-05', 'INS-06', 'INS-07'];

const element = (
  key: InstructionCoverageElement['key'], present: boolean,
): InstructionCoverageElement => ({
  key, present, evidence: present ? `verbatim quote covering ${key}` : '',
});

const allPresent = ELEMENT_KEYS.map(key => element(key, true));

const complete = (
  elements: readonly InstructionCoverageElement[],
): InstructionCoverageAssessment => ({ status: { state: 'complete' }, elements });

const statusOf = (rows: RuleEvaluationResult[], ruleId: string) =>
  rows.find(row => row.ruleId === ruleId)?.status;

const row = (ruleId: string, status: RuleEvaluationResult['status']): RuleEvaluationResult =>
  ({ key: ruleId, ruleId, family: 'Instructions', status, kind: 'check' });

const dismissal = (key: string) => ({ key, ruleId: key, dismissedOn: '2026-01-01T00:00:00.000Z' });

describe('instructionCoverageRuleResults', () => {
  it('emits exactly the six ids the coverage node owns, once each', () => {
    const rows = instructionCoverageRuleResults(complete(allPresent), false);
    expect(rows.map(r => r.ruleId).sort()).toEqual(ALL_IDS);
  });

  it('keys every row on the bare rule id, which is what a dismissal matches on', () => {
    // `dedupeRuleResults` keys by `key` and dismissal credit is `dismissed.has(key)`.
    // A decorated key here would render the rows undismissable without failing anything.
    const rows = instructionCoverageRuleResults(complete(allPresent), false);
    expect(rows.every(r => r.key === r.ruleId)).toBe(true);
  });

  it('marks every row a check, so INS-02 is not read as a record and dropped', () => {
    // `RECORD_RULE_IDS` lists `INS-02` for the retired `info` rule, and
    // `isRecordResult` consults it whenever `kind` is absent. A `kind`-less row
    // would therefore leave the scoring population entirely — scoring five of the
    // six rules while reporting all six, with nothing failing to say so.
    const rows = instructionCoverageRuleResults(complete(allPresent), false);
    expect(rows.every(r => r.kind === 'check')).toBe(true);
    expect(scoreLegacyDeterministicRules([...rows, row('INS-01', 'error')]).score)
      .toBe(scoreLegacyDeterministicRules([
        ...rows.map(r => ({ ...r, ruleId: `${r.ruleId}-not-a-record` })), row('INS-01', 'error'),
      ]).score);
  });

  it('passes all six when the classifier found every element and named nothing', () => {
    const rows = instructionCoverageRuleResults(complete(allPresent), false);
    expect(rows.map(r => r.status)).toEqual(Array(6).fill('passed'));
  });

  it('warns on the one element the classifier found absent and passes the rest', () => {
    const elements = ELEMENT_KEYS.map(key => element(key, key !== 'tone'));
    const rows = instructionCoverageRuleResults(complete(elements), false);
    // INS-03 is `tone`, and the element rules are medium severity.
    expect(statusOf(rows, 'INS-03')).toBe('warning');
    expect(rows.filter(r => r.status === 'passed')).toHaveLength(5);
  });

  it('errors on INS-07 when the node named a capability the agent does not have', () => {
    const rows = instructionCoverageRuleResults(complete(allPresent), true);
    // INS-07 is high severity, so its failure is an error rather than a warning.
    expect(statusOf(rows, 'INS-07')).toBe('error');
    expect(rows.filter(r => r.status === 'passed')).toHaveLength(5);
  });

  it('refuses to pass INS-07 when no stage judged it, even on a complete run', () => {
    // `undefined` is how the AI Builder prompt path says it returns coverage
    // elements and nothing else. Reading that silence as the pass would credit a
    // high-severity rule no backend ever evaluated — the exact fabricated pass
    // this seam exists to prevent.
    const rows = instructionCoverageRuleResults(complete(allPresent), undefined);
    expect(statusOf(rows, 'INS-07')).toBe('failed');
    // The five elements did arrive, so they are unaffected.
    expect(rows.filter(r => r.status === 'passed')).toHaveLength(5);
  });

  it('reports could-not-run for an element the classifier never returned', () => {
    // An element dropped by the validator as malformed, duplicated or fabricated is
    // absent from `elements`. Building rows from `elements` would omit it instead,
    // and an omitted row reads as a pass to the UI.
    const elements = ELEMENT_KEYS.filter(key => key !== 'escalation').map(key => element(key, true));
    const rows = instructionCoverageRuleResults(complete(elements), false);
    expect(statusOf(rows, 'INS-06')).toBe('failed');
    expect(rows).toHaveLength(6);
  });

  it('reports all six as not-applicable when the agent has no instructions', () => {
    const rows = instructionCoverageRuleResults(
      { status: { state: 'not-applicable' }, elements: [] }, false);
    expect(rows.map(r => r.status)).toEqual(Array(6).fill('not-applicable'));
  });
});

describe('instructionCoverageRuleResults when the AI workflow did not run', () => {
  // Exactly the statuses `CopilotReviewService` sets when the review is cancelled,
  // the model is unprovisioned, the workflow returned nothing, or the call threw.
  const DEAD_STATES = ['cancelled', 'unavailable', 'failed'] as const;

  for (const state of DEAD_STATES) {
    it(`reports every rule as could-not-run, never passed (${state})`, () => {
      const rows = instructionCoverageRuleResults({ status: { state }, elements: [] }, false);
      expect(rows).toHaveLength(6);
      expect(rows.map(r => r.status)).toEqual(Array(6).fill('failed'));
    });

    it(`ignores leftover element data and still refuses to pass (${state})`, () => {
      // The decisive case. Fed a full element list and a named capability — the most
      // favourable input there is — a stage that did not run must still establish
      // nothing. This is the "absent means passed" hazard, asserted dead.
      const rows = instructionCoverageRuleResults({ status: { state }, elements: allPresent }, true);
      expect(rows.some(r => r.status === 'passed')).toBe(false);
      expect(rows.map(r => r.status)).toEqual(Array(6).fill('failed'));
    });
  }
});

describe('scoring with the AI workflow unreachable', () => {
  const aiDown = instructionCoverageRuleResults(
    { status: { state: 'unavailable' }, elements: [] }, false);
  const deterministic = [row('INS-01', 'error'), row('TOL-01', 'passed')];
  const rows = [...deterministic, ...aiDown];

  it('leaves the deterministic score untouched', () => {
    // Six could-not-run rows in the population must not move a thing: not the
    // numerator, not the denominator.
    expect(scoreLegacyDeterministicRules(rows).score)
      .toBe(scoreLegacyDeterministicRules(deterministic).score);
    expect(scoreLegacyDeterministicRules(rows).score).toBe(50);
  });

  it('still credits a dismissed deterministic rule', () => {
    // The user's requirement stated as arithmetic: with the workflow down, setting a
    // deterministic finding aside behaves exactly as it did before the AI rules existed.
    const dismissed = dismissedKeys([dismissal('INS-01')]);
    expect(scoreLegacyDeterministicRules(rows, dismissed).score).toBe(100);
    expect(scoreLegacyDeterministicRules(rows, dismissed).score)
      .toBe(scoreLegacyDeterministicRules(deterministic, dismissed).score);
  });

  it('gains nothing from dismissing a rule that could not run', () => {
    // A could-not-run row is outside the ratio, so a dismissal cannot buy credit for it.
    const dismissed = dismissedKeys([dismissal('INS-03')]);
    expect(scoreLegacyDeterministicRules(rows, dismissed).score)
      .toBe(scoreLegacyDeterministicRules(rows).score);
  });
});

describe('scoring with the AI workflow healthy', () => {
  const elements = ELEMENT_KEYS.map(key => element(key, key !== 'tone'));
  const rows = instructionCoverageRuleResults(complete(elements), false);

  it('lets a failing AI rule lower the score', () => {
    expect(scoreLegacyDeterministicRules(rows).score).toBeLessThan(100);
  });

  it('credits a dismissed AI rule in full, like any other rule', () => {
    // This is the whole point of the wire: before it, INS-03 produced a finding and
    // no row, so dismissing it moved nothing at all.
    const dismissed = dismissedKeys([dismissal('INS-03')]);
    expect(scoreLegacyDeterministicRules(rows, dismissed).score).toBe(100);
  });
});
