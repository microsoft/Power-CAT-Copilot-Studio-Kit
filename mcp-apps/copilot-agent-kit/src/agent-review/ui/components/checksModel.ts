/**
 * Checks view — every rule and what it concluded, including the passes.
 *
 * The review reports findings, so a rule that ran and cleared is invisible. That
 * makes a clean agent indistinguishable from an unreviewed one, and makes a rule
 * that *could not* apply look like a rule that found nothing wrong. The engine
 * already records an explicit outcome per rule for scoring; this module turns
 * that into a display shape.
 *
 * Legacy reviews persisted no rule outcomes. Those produce `recorded: false`
 * rather than an empty checklist — "not recorded" and "nothing passed" are
 * different claims and must not be conflated.
 */
import type { RuleEvaluationResult, RuleEvaluationStatus } from '../../core/index.js';
import type { CheckGroupView, CheckRowView, ChecksView, FindingView } from './viewTypes.js';

const EMPTY_COUNTS = (): CheckGroupView['counts'] => ({
  passed: 0,
  info: 0,
  warning: 0,
  error: 0,
  notApplicable: 0,
  failed: 0,
  recorded: 0,
});

/**
 * Rules that report configuration rather than judging it.
 *
 * The rule now declares this itself, but a review saved before it did carries
 * no kind. Rule ids are stable and these seven are fixed, so resolving them
 * here repairs saved reviews without a re-run -- the same approach used for
 * rule subjects.
 */
const RECORD_RULE_IDS = new Set([
  'LCY-01', 'LCY-02', 'CON-04', 'KNW-01', 'MDL-01', 'EVL-03', 'TOL-01',
]);

const isRecord = (r: RuleEvaluationResult): boolean =>
  r.kind === 'record' || (r.kind === undefined && RECORD_RULE_IDS.has(r.ruleId));

const COUNT_KEY: Record<RuleEvaluationStatus, keyof CheckGroupView['counts']> = {
  passed: 'passed',
  info: 'info',
  warning: 'warning',
  error: 'error',
  'not-applicable': 'notApplicable',
  failed: 'failed',
};

/** Worst status first, so a family with an error sorts above a clean one. */
const STATUS_RANK: Record<RuleEvaluationStatus, number> = {
  error: 0,
  failed: 1,
  warning: 2,
  info: 3,
  passed: 4,
  'not-applicable': 5,
};

/** Rank a family by its worst row, so clean families sink to the bottom. */
function groupRank(rows: CheckRowView[]): number {
  return rows.reduce((worst, r) => Math.min(worst, STATUS_RANK[r.status]), STATUS_RANK['not-applicable']);
}

/**
 * Build the Checks view from the engine's per-rule outcomes.
 *
 * @param ruleResults - One outcome per registered rule. `undefined` for reviews
 *   saved before outcomes were persisted, which yields `recorded: false`.
 * @param findings - Findings already mapped for display, used to attach each
 *   rule's own findings to its row.
 * @returns Grouped checks plus totals. Groups are ordered worst-first.
 */
export function buildChecksView(
  ruleResults: RuleEvaluationResult[] | undefined,
  findings: FindingView[],
  /**
   * Components that a per-instance rule could have evaluated, keyed by schema
   * name.
   *
   * Reviews saved before rule instances carried their subject can still be
   * repaired on read: the instance key is `${ruleId}:${schemaname}`, so the
   * schema name is already in the persisted data and resolves to exactly one
   * component. That is a lookup, not a guess, and it spares every saved review
   * a re-run.
   */
  subjectsBySchemaName?: Map<string, { name: string; componentIdUnique?: string }>,
): ChecksView {
  const totals = { ...EMPTY_COUNTS(), evaluated: 0 };
  if (!ruleResults || ruleResults.length === 0) {
    return { recorded: false, groups: [], totals };
  }

  // A rule id can produce several findings (e.g. one per offending tool).
  const byRuleId = new Map<string, FindingView[]>();
  // Findings that name the component they are about, keyed by rule + component.
  // A rule that runs once per skill produces one row per skill, and matching on
  // the rule id alone handed every one of those rows the same finding -- so all
  // four SKL-14 rows displayed the first skill's title and three were wrong.
  const byRuleAndComponent = new Map<string, FindingView[]>();
  for (const f of findings) {
    const list = byRuleId.get(f.id);
    if (list) list.push(f);
    else byRuleId.set(f.id, [f]);

    if (f.componentIdUnique) {
      const componentKey = `${f.id}|${f.componentIdUnique}`;
      const scoped = byRuleAndComponent.get(componentKey);
      if (scoped) scoped.push(f);
      else byRuleAndComponent.set(componentKey, [f]);
    }
  }

  const groups = new Map<string, CheckRowView[]>();
  for (const r of ruleResults) {
    // A record states a fact and can never fail, so it is counted apart from
    // the checks. Leaving it in made the checks-passed denominator unreachable
    // and put "no action required" rows in the same bucket as real findings.
    const record = isRecord(r);
    if (record) {
      totals.recorded += 1;
    } else {
      totals[COUNT_KEY[r.status]] += 1;
      totals.evaluated += 1;
    }

    // Prefer what the review recorded. Fall back to the schema name embedded in
    // the instance key, which is how a review saved before subjects existed
    // still resolves to the right component.
    const legacy = r.subjectId === undefined && r.key !== r.ruleId
      ? subjectsBySchemaName?.get(r.key.slice(r.key.indexOf(':') + 1))
      : undefined;
    const subject = r.subject ?? legacy?.name;
    const subjectId = r.subjectId ?? legacy?.componentIdUnique;

    const row: CheckRowView = {
      key: r.key,
      ruleId: r.ruleId,
      family: r.family,
      status: r.status,
      subject,
      record,
      // Only a rule that actually fired owns findings; a pass must never borrow
      // another instance's evidence just because it shares a rule id.
      //
      // An instance that names its subject takes only the findings stamped with
      // that same component id -- strict equality, never a match on title text.
      // An instance with no subject is the sole instance of its rule, so the
      // rule id identifies it unambiguously.
      findings: r.status === 'passed' || r.status === 'not-applicable'
        ? []
        : subjectId
          ? (byRuleAndComponent.get(`${r.ruleId}|${subjectId}`) ?? [])
          : (byRuleId.get(r.ruleId) ?? []),
    };
    const existing = groups.get(r.family);
    if (existing) existing.push(row);
    else groups.set(r.family, [row]);
  }

  const out: CheckGroupView[] = [...groups.entries()].map(([family, rows]) => {
    const counts = EMPTY_COUNTS();
    for (const r of rows) {
      if (r.record) counts.recorded += 1;
      else counts[COUNT_KEY[r.status]] += 1;
    }
    rows.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.ruleId.localeCompare(b.ruleId));
    return { family, rows, counts };
  });

  out.sort((a, b) => groupRank(a.rows) - groupRank(b.rows) || a.family.localeCompare(b.family));

  return { recorded: true, groups: out, totals };
}
