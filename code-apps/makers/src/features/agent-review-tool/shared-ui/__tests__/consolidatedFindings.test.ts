import { describe, expect, it } from 'vitest';
import {
  aiStageRow,
  buildConsolidatedView,
  familyOptions,
  isOverridable,
  searchFields,
  type ConsolidatedRow,
  type FindingInput,
  type RuleOutcomeInput,
} from '../consolidatedFindings';

const outcome = (p: Partial<RuleOutcomeInput> & Pick<RuleOutcomeInput, 'ruleId' | 'status'>): RuleOutcomeInput => ({
  key: p.key ?? `${p.ruleId}${p.subjectId ? `:${p.subjectId}` : ''}`,
  family: p.family ?? 'Skills',
  ...p,
});

const finding = (p: Partial<FindingInput> & Pick<FindingInput, 'id' | 'severity'>): FindingInput => ({
  family: 'Skills',
  title: `${p.id} title`,
  fact: 'evidence',
  why: 'because',
  fix: 'do this',
  ai: false,
  ...p,
});

describe('buildConsolidatedView — bucketing', () => {
  it('sorts each status into the bucket its label promises', () => {
    const view = buildConsolidatedView([
      outcome({ ruleId: 'SKL-01', status: 'error' }),
      outcome({ ruleId: 'SKL-02', status: 'warning' }),
      outcome({ ruleId: 'SKL-03', status: 'passed' }),
      outcome({ ruleId: 'SKL-04', status: 'not-applicable' }),
      outcome({ ruleId: 'SKL-05', status: 'failed' }),
    ]);

    expect(view.fail.map(r => r.ruleId)).toEqual(['SKL-01']);
    expect(view.needsAttention.map(r => r.ruleId)).toEqual(['SKL-02']);
    expect(view.pass.map(r => r.ruleId)).toEqual(['SKL-03']);
    expect(view.notAssessed.map(r => r.ruleId)).toEqual(['SKL-04', 'SKL-05']);
  });

  it('routes an informational outcome to agent info, never to pass or fail', () => {
    // Pass means "you can stop thinking about this". A fact is not an achievement, and filing it
    // under Pass is what made rules reporting a genuine gap render green.
    const view = buildConsolidatedView([outcome({ ruleId: 'SKL-07', status: 'info' })]);
    expect(view.agentInfo).toHaveLength(1);
    expect(view.pass).toHaveLength(0);
    expect(view.totals.passed).toBe(0);
    expect(view.totals.fail).toBe(0);
  });

  it('keeps not-assessed rows out of the evaluated denominator', () => {
    // The whole point of the section: a rule that could not run must not make the ratio look worse,
    // and must not quietly count as a pass either.
    const view = buildConsolidatedView([
      outcome({ ruleId: 'SKL-01', status: 'passed' }),
      outcome({ ruleId: 'SKL-04', status: 'not-applicable' }),
      outcome({ ruleId: 'SKL-05', status: 'failed' }),
    ]);
    expect(view.totals.evaluated).toBe(1);
    expect(view.totals.passed).toBe(1);
    expect(view.totals.notAssessed).toBe(2);
  });

  it('routes record rules to agent info, never to pass', () => {
    const view = buildConsolidatedView([
      outcome({ ruleId: 'MDL-01', status: 'info', family: 'Model' }),
      outcome({ ruleId: 'TOL-01', status: 'info', family: 'Tools' }),
    ]);
    expect(view.agentInfo.map(r => r.ruleId)).toEqual(['MDL-01', 'TOL-01']);
    expect(view.pass).toHaveLength(0);
    expect(view.totals.passed).toBe(0);
  });

  it('resolves a legacy record with no kind from its rule id', () => {
    const view = buildConsolidatedView([outcome({ ruleId: 'KNW-01', status: 'info', family: 'Knowledge' })]);
    expect(view.agentInfo).toHaveLength(1);
  });

  it('drops a record that came back clean instead of listing it as a fact', () => {
    // Agent info is for facts worth knowing. A record that found nothing has no fact to report, and
    // showing it would fill the section with rules announcing their own silence.
    const view = buildConsolidatedView([
      outcome({ ruleId: 'MDL-01', status: 'passed', family: 'Model' }),
      outcome({ ruleId: 'TOL-01', status: 'info', family: 'Tools' }),
    ]);
    expect(view.agentInfo.map(r => r.ruleId)).toEqual(['TOL-01']);
    expect(view.pass).toHaveLength(0);
    expect(view.totals.passed).toBe(0);
  });

  it('reports recorded: false for a review saved before outcomes existed', () => {
    const view = buildConsolidatedView(undefined);
    expect(view.recorded).toBe(false);
    expect(view.totals.evaluated).toBe(0);
  });
});

describe('buildConsolidatedView — dismissed rules', () => {
  const view = (results: RuleOutcomeInput[], dismissed: string[]) =>
    buildConsolidatedView(results, [], undefined, undefined, dismissed);

  it('renders a set-aside failure as an override rather than removing it from the list', () => {
    // A dismissal is a recorded judgement, not a delete. The row has to stay visible, and it has to
    // be distinguishable from a rule that genuinely passed.
    const v = view([outcome({ ruleId: 'SKL-13', status: 'error' })], ['SKL-13']);

    expect(v.fail).toHaveLength(0);
    expect(v.pass).toHaveLength(1);
    expect(v.pass[0].tone).toBe('ignored');
    expect(v.pass[0].dismissed).toBe(true);
    expect(v.totals.ignored).toBe(1);
    expect(v.totals.passed).toBe(0);
  });

  it('splits one row in two when only some of its components were set aside', () => {
    const v = view([
      outcome({ ruleId: 'SKL-13', status: 'warning', subject: 'a', subjectId: 'c1' }),
      outcome({ ruleId: 'SKL-13', status: 'warning', subject: 'b', subjectId: 'c2' }),
      outcome({ ruleId: 'SKL-13', status: 'warning', subject: 'c', subjectId: 'c3' }),
    ], ['SKL-13:c1']);

    expect(v.needsAttention).toHaveLength(1);
    expect(v.needsAttention[0].affected.map(a => a.name)).toEqual(['b', 'c']);
    expect(v.pass).toHaveLength(1);
    expect(v.pass[0].affected.map(a => a.name)).toEqual(['a']);
    expect(v.pass[0].dismissed).toBe(true);
  });

  it('carries each instance key so one component can be set aside on its own', () => {
    const v = view([
      outcome({ ruleId: 'SKL-13', status: 'warning', subject: 'a', subjectId: 'c1' }),
      outcome({ ruleId: 'SKL-13', status: 'warning', subject: 'b', subjectId: 'c2' }),
    ], []);

    expect(v.needsAttention[0].instanceKeys).toEqual(['SKL-13:c1', 'SKL-13:c2']);
    expect(v.needsAttention[0].affected.map(a => a.instanceKey)).toEqual(['SKL-13:c1', 'SKL-13:c2']);
  });
});

describe('buildConsolidatedView — grouping', () => {
  it('collapses one rule reaching the same verdict across skills into a single row', () => {
    const view = buildConsolidatedView([
      outcome({ ruleId: 'SKL-09', status: 'error', subject: 'display-audit', subjectId: 'c1' }),
      outcome({ ruleId: 'SKL-09', status: 'error', subject: 'skill-2', subjectId: 'c2' }),
      outcome({ ruleId: 'SKL-09', status: 'error', subject: 'skill-3', subjectId: 'c3' }),
    ]);

    expect(view.fail).toHaveLength(1);
    expect(view.fail[0].affected.map(a => a.name)).toEqual(['display-audit', 'skill-2', 'skill-3']);
  });

  it('keeps the same rule split when the verdicts differ', () => {
    // Four rows named "Skill routing guidance" that all passed is noise; one that failed among
    // three that passed is the entire point of the list.
    const view = buildConsolidatedView([
      outcome({ ruleId: 'SKL-13', status: 'warning', subject: 'a', subjectId: 'c1' }),
      outcome({ ruleId: 'SKL-13', status: 'passed', subject: 'b', subjectId: 'c2' }),
      outcome({ ruleId: 'SKL-13', status: 'passed', subject: 'c', subjectId: 'c3' }),
    ]);

    expect(view.needsAttention).toHaveLength(1);
    expect(view.needsAttention[0].affected.map(a => a.name)).toEqual(['a']);
    expect(view.pass).toHaveLength(1);
    expect(view.pass[0].affected.map(a => a.name)).toEqual(['b', 'c']);
  });
});

describe('buildConsolidatedView — findings as reasoning', () => {
  it('hands a row the finding for its own subject, not the first one for that rule', () => {
    const view = buildConsolidatedView(
      [
        outcome({ ruleId: 'SKL-09', status: 'error', subject: 'a', subjectId: 'c1' }),
        outcome({ ruleId: 'SKL-09', status: 'warning', subject: 'b', subjectId: 'c2' }),
      ],
      [
        finding({ id: 'SKL-09', severity: 'error', title: 'A is broken', componentIdUnique: 'c1' }),
        finding({ id: 'SKL-09', severity: 'warning', title: 'B needs a look', componentIdUnique: 'c2' }),
      ],
    );

    expect(view.fail[0].title).toBe('A is broken');
    expect(view.needsAttention[0].title).toBe('B needs a look');
  });

  it('marks a row as AI-detected when its finding came from the evaluator', () => {
    const view = buildConsolidatedView(
      [outcome({ ruleId: 'SKL-04', status: 'error' })],
      [finding({ id: 'SKL-04', severity: 'error', ai: true })],
    );
    expect(view.fail[0].detection).toBe('ai');
  });

  it('defaults a silent row to static detection', () => {
    const view = buildConsolidatedView([outcome({ ruleId: 'SKL-03', status: 'passed' })]);
    expect(view.pass[0].detection).toBe('static');
  });

  it('gives an AI-only finding its own row so the list stays complete', () => {
    // INS-04/05/06 exist only as findings — no rule outcome is ever recorded for them.
    const view = buildConsolidatedView(
      [outcome({ ruleId: 'INS-01', status: 'passed', family: 'Instructions' })],
      [finding({ id: 'INS-04', severity: 'error', family: 'Instructions', ai: true })],
    );
    expect(view.fail.map(r => r.ruleId)).toEqual(['INS-04']);
  });

  it('does not duplicate a finding that already has a rule row', () => {
    const view = buildConsolidatedView(
      [outcome({ ruleId: 'SKL-04', status: 'error' })],
      [finding({ id: 'SKL-04', severity: 'error' })],
    );
    expect(view.fail).toHaveLength(1);
  });

  it('lets an evaluator error override a deterministic pass — worst wins', () => {
    // SKL-09's scanner only fires when a skill names both a real and a missing capability, so a
    // skill naming nothing but missing ones passes it silently. Showing "Pass" while holding an
    // error inside the row would put the reassuring word on screen and hide the reason it is wrong.
    const view = buildConsolidatedView(
      [outcome({ ruleId: 'SKL-09', status: 'passed' })],
      [finding({ id: 'SKL-09', severity: 'error', ai: true, title: 'Capability is missing' })],
    );

    expect(view.pass).toHaveLength(0);
    expect(view.fail).toHaveLength(1);
    expect(view.fail[0].title).toBe('Capability is missing');
    expect(view.fail[0].detection).toBe('ai');
  });

  it('never lets a finding soften a worse deterministic verdict', () => {
    const view = buildConsolidatedView(
      [outcome({ ruleId: 'SKL-02', status: 'error' })],
      [finding({ id: 'SKL-02', severity: 'info' })],
    );
    expect(view.fail).toHaveLength(1);
  });

  it('keeps every reason on the row, not just the one that named it', () => {
    const view = buildConsolidatedView(
      [outcome({ ruleId: 'SKL-09', status: 'passed' })],
      [
        finding({ id: 'SKL-09', severity: 'info', title: 'a note' }),
        finding({ id: 'SKL-09', severity: 'error', title: 'the real problem' }),
      ],
    );
    expect(view.fail[0].title).toBe('the real problem');
    expect(view.fail[0].evidence).toHaveLength(2);
  });

  it('leaves a not-assessed row alone — a finding cannot make an unrun rule fail', () => {
    const view = buildConsolidatedView(
      [outcome({ ruleId: 'SKL-05', status: 'failed' })],
      [finding({ id: 'SKL-05', severity: 'error' })],
    );
    expect(view.notAssessed).toHaveLength(1);
    expect(view.fail).toHaveLength(0);
  });

  it('names a grouped row after its rule, since one finding cannot describe four skills', () => {
    const view = buildConsolidatedView(
      [
        outcome({ ruleId: 'SKL-02', status: 'warning', subject: 'a', subjectId: 'c1' }),
        outcome({ ruleId: 'SKL-02', status: 'warning', subject: 'b', subjectId: 'c2' }),
      ],
      [finding({ id: 'SKL-02', severity: 'warning', title: 'Skill "a" has a short description' })],
      undefined,
      { 'SKL-02': 'Skill description length' },
    );
    expect(view.needsAttention[0].title).toBe('Skill description length');
  });

  it('drops the quoted component from a grouped title when the rule has no shared label', () => {
    const view = buildConsolidatedView(
      [
        outcome({ ruleId: 'SKL-99', status: 'warning', subject: 'display-audit', subjectId: 'c1' }),
        outcome({ ruleId: 'SKL-99', status: 'warning', subject: 'skill-2', subjectId: 'c2' }),
      ],
      [finding({
        id: 'SKL-99',
        severity: 'warning',
        title: 'Skill "display-audit" has a very short description',
      })],
    );
    expect(view.needsAttention[0].title).toBe('Skill has a very short description');
  });

  it('names a passing rule from the shared labels, since a pass produces no finding', () => {
    const view = buildConsolidatedView([outcome({ ruleId: 'INS-01', status: 'passed' })], []);
    expect(view.pass[0].title).toBe('Instruction completeness');
  });

  it('falls back to the family when a silent rule has no label', () => {
    const view = buildConsolidatedView(
      [outcome({ ruleId: 'ZZZ-01', status: 'passed', family: 'Tools' })],
      [],
    );
    expect(view.pass[0].title).toBe('Tools check');
  });

  it('keeps the specific title when the row covers a single component', () => {
    const view = buildConsolidatedView(
      [outcome({ ruleId: 'SKL-02', status: 'warning', subject: 'display-audit', subjectId: 'c1' })],
      [finding({
        id: 'SKL-02',
        severity: 'warning',
        title: 'Skill "display-audit" has a very short description',
      })],
    );
    expect(view.needsAttention[0].title).toBe('Skill "display-audit" has a very short description');
  });

  it('leaves a record row without a fix, since there is nothing to act on', () => {
    const view = buildConsolidatedView(
      [outcome({ ruleId: 'MDL-01', status: 'info', family: 'Model' })],
      [finding({ id: 'MDL-01', severity: 'info', family: 'Model', fix: 'No action required' })],
    );
    expect(view.agentInfo[0].fix).toBeUndefined();
  });
});

describe('aiStageRow', () => {
  it('produces nothing when the stage completed', () => {
    expect(aiStageRow({ state: 'complete' })).toBeNull();
  });

  it('produces nothing when the review predates the field, rather than claiming success', () => {
    expect(aiStageRow(undefined)).toBeNull();
  });

  it('separates a tooling failure from a rule that did not apply', () => {
    expect(aiStageRow({ state: 'unavailable', reason: 'unprovisioned' })?.tone).toBe('could-not-run');
    expect(aiStageRow({ state: 'not-applicable', reason: 'empty-instructions' })?.tone).toBe('not-applicable');
  });

  /**
   * "Could not run" belongs to this row and to nothing else.
   *
   * A rule the review reached but could not judge was borrowing the same words, so a reader could
   * not tell a rule the model declined to answer from a review whose assessment had broken — and
   * the second one is the only one of the two that means something is wrong with the tooling.
   */
  it('keeps "Could not run" to itself, so an unjudged rule does not borrow it', () => {
    const view = buildConsolidatedView([outcome({ ruleId: 'INS-01', status: 'failed' })]);
    expect(view.notAssessed).toHaveLength(1);
    expect(view.notAssessed[0].tone).toBe('not-assessed');
    expect(aiStageRow({ state: 'unavailable', reason: 'unprovisioned' })?.tone).toBe('could-not-run');
  });

  it('names the reason in words a reader can act on', () => {
    expect(aiStageRow({ state: 'unavailable', reason: 'unprovisioned' })?.note)
      .toContain('the AI model is not provisioned in this environment');
    expect(aiStageRow({ state: 'failed', reason: 'invocation-failed' })?.note)
      .toContain('the model call failed');
  });

  it('falls back to the state when the reason is unrecognised', () => {
    expect(aiStageRow({ state: 'cancelled', reason: 'something-new' })?.note)
      .toContain('the review was cancelled');
  });

  it('is one row, not one per AI rule', () => {
    const view = buildConsolidatedView([], [], { state: 'unavailable', reason: 'unprovisioned' });
    expect(view.notAssessed).toHaveLength(1);
    expect(view.notAssessed[0].key).toBe('ai-stage');
  });
});

describe('filter helpers', () => {
  it('searches the affected component names, which is how a reader looks for a skill', () => {
    const view = buildConsolidatedView([
      outcome({ ruleId: 'SKL-09', status: 'error', subject: 'display-audit', subjectId: 'c1' }),
    ]);
    expect(searchFields(view.fail[0])).toContain('display-audit');
  });

  it('lists each family once, sorted', () => {
    const view = buildConsolidatedView([
      outcome({ ruleId: 'TOL-02', status: 'passed', family: 'Tools' }),
      outcome({ ruleId: 'SKL-02', status: 'passed', family: 'Skills' }),
      outcome({ ruleId: 'SKL-03', status: 'error', family: 'Skills' }),
    ]);
    expect(familyOptions(view)).toEqual(['Skills', 'Tools']);
  });
});

/**
 * The override gate.
 *
 * Both override surfaces ask this one question, and they did not always agree on the answer. The
 * per-component menu tested the verdict; the row-level control tested only whether the row carried
 * instance keys, so it offered "mark as manual pass" on rows that had already passed and on rules
 * that never ran.
 *
 * The failure was silent in the direction that matters. Accepting the offer on a passing row
 * records a dismissal that hands back credit the row was never withholding, so the score moves for
 * a decision the reviewer had no reason to make.
 */
describe('isOverridable', () => {
  const row = (p: Partial<ConsolidatedRow> = {}): ConsolidatedRow => ({
    key: 'SKL-02',
    ruleId: 'SKL-02',
    title: 'Skill description states its scope',
    family: 'Skills',
    tone: 'error',
    bucket: 'fail',
    affected: [],
    instanceKeys: ['SKL-02'],
    ...p,
  });

  it('offers the override on a verdict against the agent', () => {
    expect(isOverridable(row({ tone: 'error' }))).toBe(true);
    expect(isOverridable(row({ tone: 'warning', bucket: 'needs-attention' }))).toBe(true);
  });

  it('offers nothing on a row that already passed', () => {
    expect(isOverridable(row({ tone: 'pass', bucket: 'pass' }))).toBe(false);
  });

  it('offers nothing on a rule that never ran', () => {
    expect(isOverridable(row({ tone: 'not-applicable', bucket: 'not-assessed' }))).toBe(false);
    expect(isOverridable(row({ tone: 'could-not-run', bucket: 'not-assessed' }))).toBe(false);
  });

  it('offers nothing on an informational record', () => {
    expect(isOverridable(row({ tone: 'info', bucket: 'agent-info' }))).toBe(false);
  });

  it('offers nothing when no rule instance stands behind the row', () => {
    expect(isOverridable(row({ instanceKeys: [] }))).toBe(false);
  });

  it('keeps the way back once a decision is recorded', () => {
    expect(isOverridable(row({ tone: 'ignored', bucket: 'pass', dismissed: true }))).toBe(true);
  });

  it('never offers an override on the AI-stage row, which has no key to record against', () => {
    const stage = aiStageRow({ state: 'unavailable', reason: 'unprovisioned' });
    expect(stage?.instanceKeys).toEqual([]);
    expect(isOverridable(stage!)).toBe(false);
  });
});

/**
 * A finding with no rule outcome behind it — the evaluator model's own checks.
 *
 * These used to be unanswerable: they carry no rule instance, so the drawer offered no override and
 * a reviewer who disagreed with the model had nowhere to say so. They now key the decision against
 * their own row key, which returns no score credit because there was never a rule outcome to credit.
 */
describe('buildConsolidatedView - finding-only rows', () => {
  const orphan = (dismissed: string[] = []) =>
    buildConsolidatedView([], [finding({ id: 'EXF-03', severity: 'error' })], undefined, undefined, dismissed);

  it('keys a finding-only row against itself so its verdict can be overruled', () => {
    const v = orphan();
    expect(v.fail).toHaveLength(1);
    expect(v.fail[0].instanceKeys).toEqual([v.fail[0].key]);
    expect(isOverridable(v.fail[0])).toBe(true);
  });

  it('records the override without moving the key it was recorded against', () => {
    // The row key doubles as the dismissal key, so it must not change when the row is set aside -
    // unlike an outcome row, whose group key splits on dismissal because instances share it.
    const key = orphan().fail[0].key;
    const v = orphan([key]);

    expect(v.fail).toHaveLength(0);
    expect(v.pass[0].key).toBe(key);
    expect(v.pass[0].tone).toBe('ignored');
    expect(v.pass[0].dismissed).toBe(true);
    expect(v.totals.ignored).toBe(1);
  });
});
