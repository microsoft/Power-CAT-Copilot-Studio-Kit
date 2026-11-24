import { describe, expect, it } from 'vitest';
import { buildChecksView } from '../components/checksModel';
import type { RuleEvaluationResult } from '../contracts/Findings';
import type { FindingView } from '../components/viewTypes';

const rule = (
  ruleId: string,
  family: string,
  status: RuleEvaluationResult['status'],
  key = ruleId,
): RuleEvaluationResult => ({ key, ruleId, family, status });

const finding = (id: string, family: string): FindingView =>
  ({
    id, family, sev: 'warning', provenance: 'deterministic', ai: false,
    title: `${id} title`, sub: '', fact: '', why: '', fix: '',
    dimension: 'quality', refTitle: '', refUrl: '', source: 'Microsoft Learn', how: '',
    fixSteps: [], references: [],
  }) as unknown as FindingView;

describe('buildChecksView', () => {
  it('reports recorded: false when no rule outcomes were persisted', () => {
    // Legacy reviews must not render as "everything failed" or "nothing checked".
    const v = buildChecksView(undefined, []);
    expect(v.recorded).toBe(false);
    expect(v.groups).toEqual([]);
    expect(v.totals.evaluated).toBe(0);
  });

  it('reports recorded: false for an empty array, not an empty checklist', () => {
    expect(buildChecksView([], []).recorded).toBe(false);
  });

  it('includes passed rules — the whole point of the view', () => {
    const v = buildChecksView(
      [rule('INS-01', 'Instructions', 'passed'), rule('EVL-01', 'Evaluation', 'warning')],
      [finding('EVL-01', 'Evaluation')],
    );
    expect(v.recorded).toBe(true);
    const ids = v.groups.flatMap(g => g.rows.map(r => r.ruleId));
    expect(ids).toContain('INS-01');
    expect(v.totals.passed).toBe(1);
    expect(v.totals.warning).toBe(1);
    expect(v.totals.evaluated).toBe(2);
  });

  it('keeps not-applicable distinct from passed', () => {
    // A rule that could not apply has not cleared the agent — conflating the two
    // is the exact misreading this view exists to prevent.
    const v = buildChecksView([rule('SKL-11', 'Skills', 'not-applicable')], []);
    expect(v.totals.notApplicable).toBe(1);
    expect(v.totals.passed).toBe(0);
    expect(v.groups[0].rows[0].status).toBe('not-applicable');
  });

  it('keeps failed distinct from passed', () => {
    const v = buildChecksView([rule('TOL-02', 'Tools', 'failed')], []);
    expect(v.totals.failed).toBe(1);
    expect(v.totals.passed).toBe(0);
  });

  it('attaches findings to the rule that produced them', () => {
    const v = buildChecksView(
      [rule('TOL-02', 'Tools', 'warning'), rule('TOL-03', 'Tools', 'passed')],
      [finding('TOL-02', 'Tools')],
    );
    const rows = v.groups[0].rows;
    expect(rows.find(r => r.ruleId === 'TOL-02')?.findings).toHaveLength(1);
    expect(rows.find(r => r.ruleId === 'TOL-03')?.findings).toHaveLength(0);
  });

  it('never attaches findings to a passed row that shares a rule id', () => {
    // Per-skill rules repeat a ruleId across instances; a passing instance must
    // not borrow a failing sibling's evidence.
    const v = buildChecksView(
      [rule('SKL-01', 'Skills', 'error', 'SKL-01:a'), rule('SKL-01', 'Skills', 'passed', 'SKL-01:b')],
      [finding('SKL-01', 'Skills')],
    );
    const rows = v.groups[0].rows;
    expect(rows.find(r => r.key === 'SKL-01:a')?.findings).toHaveLength(1);
    expect(rows.find(r => r.key === 'SKL-01:b')?.findings).toHaveLength(0);
  });

  it('orders groups worst-first so clean families sink', () => {
    const v = buildChecksView(
      [
        rule('MDL-01', 'Model', 'passed'),
        rule('TOL-04', 'Tools', 'error'),
        rule('EVL-01', 'Evaluation', 'warning'),
      ],
      [],
    );
    expect(v.groups.map(g => g.family)).toEqual(['Tools', 'Evaluation', 'Model']);
  });

  it('orders rows worst-first within a family', () => {
    const v = buildChecksView(
      [
        rule('TOL-03', 'Tools', 'passed'),
        rule('TOL-04', 'Tools', 'error'),
        rule('TOL-02', 'Tools', 'warning'),
      ],
      [],
    );
    expect(v.groups[0].rows.map(r => r.status)).toEqual(['error', 'warning', 'passed']);
  });

  it('counts per family independently', () => {
    const v = buildChecksView(
      [
        rule('TOL-03', 'Tools', 'passed'),
        rule('TOL-02', 'Tools', 'warning'),
        rule('INS-01', 'Instructions', 'passed'),
      ],
      [],
    );
    const tools = v.groups.find(g => g.family === 'Tools')!;
    const instructions = v.groups.find(g => g.family === 'Instructions')!;
    expect(tools.counts).toMatchObject({ passed: 1, warning: 1 });
    expect(instructions.counts).toMatchObject({ passed: 1, warning: 0 });
  });

  it('totals every status bucket', () => {
    const v = buildChecksView(
      [
        rule('A-01', 'F', 'passed'), rule('A-02', 'F', 'info'), rule('A-03', 'F', 'warning'),
        rule('A-04', 'F', 'error'), rule('A-05', 'F', 'not-applicable'), rule('A-06', 'F', 'failed'),
      ],
      [],
    );
    expect(v.totals).toEqual({
      passed: 1, info: 1, warning: 1, error: 1, notApplicable: 1, failed: 1,
      recorded: 0, evaluated: 6,
    });
  });

  it('gives each per-component instance only the findings for its own component', () => {
    // Observed: four skills each produced an SKL-14 instance, the view matched
    // findings by rule id alone, and every row rendered the first skill's
    // title -- so three of the four named the wrong skill.
    const results: RuleEvaluationResult[] = [
      { key: 'SKL-14:a', ruleId: 'SKL-14', family: 'Skills', status: 'warning', subject: 'display-audit', subjectId: 'id-a' },
      { key: 'SKL-14:b', ruleId: 'SKL-14', family: 'Skills', status: 'warning', subject: 'price-check', subjectId: 'id-b' },
    ];
    const findings = [
      { ...finding('SKL-14', 'Skills'), title: 'Skill "display-audit" has no examples', componentIdUnique: 'id-a' },
      { ...finding('SKL-14', 'Skills'), title: 'Skill "price-check" has no examples', componentIdUnique: 'id-b' },
    ] as unknown as FindingView[];

    const rows = buildChecksView(results, findings).groups.flatMap(g => g.rows);
    const a = rows.find(r => r.key === 'SKL-14:a');
    const b = rows.find(r => r.key === 'SKL-14:b');
    expect(a?.findings).toHaveLength(1);
    expect(a?.findings[0].title).toContain('display-audit');
    expect(b?.findings).toHaveLength(1);
    expect(b?.findings[0].title).toContain('price-check');
    expect(a?.subject).toBe('display-audit');
    expect(b?.subject).toBe('price-check');
  });

  it('does not attach a finding whose component was never identified', () => {
    // No componentIdUnique means no claim of ownership. Guessing from the title
    // is exactly the fuzzy matching this view must not do.
    const results: RuleEvaluationResult[] = [
      { key: 'SKL-14:a', ruleId: 'SKL-14', family: 'Skills', status: 'warning', subject: 'display-audit', subjectId: 'id-a' },
    ];
    const findings = [
      { ...finding('SKL-14', 'Skills'), title: 'Skill "display-audit" has no examples' },
    ] as unknown as FindingView[];
    const row = buildChecksView(results, findings).groups.flatMap(g => g.rows)[0];
    expect(row.findings).toHaveLength(0);
  });

  it('still matches by rule id when an instance names no subject', () => {
    // Engine-level rules have exactly one instance, so the rule id is enough.
    const v = buildChecksView(
      [rule('EVL-01', 'Evaluation', 'warning')],
      [finding('EVL-01', 'Evaluation')],
    );
    const row = v.groups.flatMap(g => g.rows)[0];
    expect(row.findings).toHaveLength(1);
  });

  it('repairs a review saved before instances carried their subject', () => {
    // The instance key is `${ruleId}:${schemaname}`, so an old payload already
    // holds enough to resolve the component. Without this, every saved review
    // would need re-running to show the right skill.
    const results: RuleEvaluationResult[] = [
      { key: 'SKL-14:cat_skill.display_audit', ruleId: 'SKL-14', family: 'Skills', status: 'warning' },
      { key: 'SKL-14:cat_skill.price_check', ruleId: 'SKL-14', family: 'Skills', status: 'warning' },
    ];
    const findings = [
      { ...finding('SKL-14', 'Skills'), title: 'Skill "display-audit" has no examples', componentIdUnique: 'id-a' },
      { ...finding('SKL-14', 'Skills'), title: 'Skill "price-check" has no examples', componentIdUnique: 'id-b' },
    ] as unknown as FindingView[];
    const subjects = new Map([
      ['cat_skill.display_audit', { name: 'display-audit', componentIdUnique: 'id-a' }],
      ['cat_skill.price_check', { name: 'price-check', componentIdUnique: 'id-b' }],
    ]);

    const rows = buildChecksView(results, findings, subjects).groups.flatMap(g => g.rows);
    const a = rows.find(r => r.key === 'SKL-14:cat_skill.display_audit');
    const b = rows.find(r => r.key === 'SKL-14:cat_skill.price_check');
    expect(a?.subject).toBe('display-audit');
    expect(a?.findings[0].title).toContain('display-audit');
    expect(b?.subject).toBe('price-check');
    expect(b?.findings[0].title).toContain('price-check');
  });

  it('leaves an engine-level instance alone when a subject map is supplied', () => {
    // key === ruleId means there is no schema name to look up, so the lookup
    // must not fire and turn a single-instance rule into a subjectless miss.
    const v = buildChecksView(
      [rule('EVL-01', 'Evaluation', 'warning')],
      [finding('EVL-01', 'Evaluation')],
      new Map([['whatever', { name: 'nope', componentIdUnique: 'id-x' }]]),
    );
    const row = v.groups.flatMap(g => g.rows)[0];
    expect(row.subject).toBeUndefined();
    expect(row.findings).toHaveLength(1);
  });

  it('counts a record apart from the checks, so the ratio is reachable', () => {
    // LCY-01/02 and the other inventory rules always emit an info finding, so
    // they could never be "passed". Left in the denominator they put a ceiling
    // on checks-passed that no agent could reach.
    const results: RuleEvaluationResult[] = [
      { key: 'LCY-01', ruleId: 'LCY-01', family: 'Lifecycle', status: 'info', kind: 'record' },
      { key: 'MDL-01', ruleId: 'MDL-01', family: 'Model', status: 'info', kind: 'record' },
      { key: 'INS-01', ruleId: 'INS-01', family: 'Instructions', status: 'passed', kind: 'check' },
    ];
    const v = buildChecksView(results, []);
    expect(v.totals.evaluated).toBe(1);
    expect(v.totals.recorded).toBe(2);
    expect(v.totals.info).toBe(0);
    // The single real check passed, so the ratio is a reachable 1 of 1.
    expect(v.totals.passed).toBe(v.totals.evaluated);
  });

  it('treats a record as a record even when it returned no finding', () => {
    // EVL-03 returns null when no graders are configured, which the engine
    // scores as "passed". It is still not a check, so it must not pad the
    // numerator either.
    const v = buildChecksView(
      [{ key: 'EVL-03', ruleId: 'EVL-03', family: 'Evaluation', status: 'passed', kind: 'record' }],
      [],
    );
    expect(v.totals.passed).toBe(0);
    expect(v.totals.evaluated).toBe(0);
    expect(v.totals.recorded).toBe(1);
  });

  it('classifies records on a review saved before rules declared their kind', () => {
    // No kind on the persisted outcome, so the id decides. Without this every
    // saved review would keep the unreachable denominator until re-run.
    const v = buildChecksView(
      [
        { key: 'TOL-01', ruleId: 'TOL-01', family: 'Tools', status: 'info' },
        { key: 'TOL-02', ruleId: 'TOL-02', family: 'Tools', status: 'warning' },
      ],
      [],
    );
    expect(v.totals.recorded).toBe(1);
    expect(v.totals.evaluated).toBe(1);
    expect(v.totals.warning).toBe(1);
  });
});
