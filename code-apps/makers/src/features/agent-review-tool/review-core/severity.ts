/**
 * One severity vocabulary for rules, and the credit each severity carries.
 *
 * Three unions previously said the same thing in three places — ART's
 * `UnifiedSeverity`, ARC2's `AiReviewSeverity`, and the `'error' | 'warning'`
 * spelling used by the older rule definitions. They are collapsed here.
 *
 * A fourth vocabulary is deliberately *not* collapsed: the standalone-skill
 * artifact scanners grade findings on five levels and deduct by level. That is a
 * different scoring strategy, not a different spelling of this one, and D-13/D-5
 * keep the two skill paths separate — so it is declared below under its own name
 * rather than being flattened into three levels it never had.
 */

/** Rule severity. `info` records a fact and never moves a score. */
export type Severity = 'high' | 'medium' | 'info';

export const SEVERITIES: readonly Severity[] = Object.freeze(['high', 'medium', 'info'] as const);

/**
 * How much of a rule's nominal weight a failure at this severity withholds.
 *
 * A medium failure is a half-credit, not a pass: the rubric found something worth
 * changing but not something that breaks the agent. `info` is zero-weight by
 * construction, which is what makes "surface the fact without punishing it"
 * expressible rather than a special case inside the scorer.
 */
export const SEVERITY_WEIGHT: Readonly<Record<Severity, number>> = Object.freeze({
  high: 1,
  medium: 0.5,
  info: 0,
});

/**
 * How much of its weight a rule still earns when it fails at this severity.
 *
 * The inverse of {@link SEVERITY_WEIGHT}, and the form the scorer actually uses:
 * a failing `high` rule earns nothing, a failing `medium` earns half. This is the
 * existing `CREDIT` table in `agents-experience/services/scoring.ts`
 * (`{ passed: 1, warning: 0.5, error: 0 }`) stated once, in the severity
 * vocabulary that owns it, instead of inside a scorer.
 *
 * `info` returns 1 for completeness only. An `info` rule is excluded from both
 * sides of the ratio, so its credit is never read — a fact cannot be satisfied
 * or missed, and leaving one in would be a guaranteed full-credit row diluting
 * every real result beside it.
 */
export function severityCredit(severity: Severity): number {
  return 1 - SEVERITY_WEIGHT[severity];
}

/** The spelling used by the older rule definitions, kept only to translate them. */
export type LegacyRuleSeverity = 'error' | 'warning' | 'info';

export const SEVERITY_FROM_LEGACY: Readonly<Record<LegacyRuleSeverity, Severity>> = Object.freeze({
  error: 'high',
  warning: 'medium',
  info: 'info',
});

/** The inverse, for adapters that still publish the older spelling. */
export const SEVERITY_TO_LEGACY: Readonly<Record<Severity, LegacyRuleSeverity>> = Object.freeze({
  high: 'error',
  medium: 'warning',
  info: 'info',
});

/**
 * The standalone-skill artifact vocabulary. Not a superset of {@link Severity} —
 * a different scorer reads it, and `toBundleScores` averages only what was
 * actually assessed instead of deducting from a starting 100.
 */
export type ArtifactFindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const ARTIFACT_FINDING_SEVERITIES: readonly ArtifactFindingSeverity[] =
  Object.freeze(['critical', 'high', 'medium', 'low', 'info'] as const);

export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}
