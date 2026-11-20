/**
 * Rules a reviewer has deliberately set aside ("Ignore this rule").
 *
 * A review is a general rubric applied to a particular agent, and a general rubric is sometimes
 * wrong about a particular agent. A skill with no negative scope may be the only skill in the
 * harness, so there is nothing for it to defer to; a preview tool may be exactly what this agent is
 * meant to exercise. Without a way to say so the reviewer's only options are to accept a score they
 * disagree with or stop using the tool, and the second is what actually happens.
 *
 * Setting a rule aside returns the credit that rule controls and renders it as a pass the reader can
 * see was overridden — never as a silent deletion. The row stays in the list, which is the whole
 * point: a dismissal is a recorded judgement, not a way to make something disappear.
 *
 * Dismissals are keyed on the rule *instance*, not the rule. `SKL-13` firing across four skills is
 * four instances, and a reviewer who has decided it is fine for one of them has said nothing about
 * the other three.
 */

import type { RuleEvaluationResult } from '../contracts/Findings';

/** One rule instance the reviewer has set aside. */
export interface RuleDismissal {
  /**
   * The instance this applies to, matching {@link RuleEvaluationResult.key}: `EVL-05` for a rule
   * that runs once per agent, `SKL-13:agent.skill.audit` for one that runs per component.
   */
  key: string;
  /** Kept beside the key so a stored dismissal is readable without parsing the key apart. */
  ruleId: string;
  /**
   * Why, in the reviewer's words. Optional deliberately — a required reason is a reason box with
   * "n/a" typed into it, which is worse than an honest blank because it looks like documentation.
   */
  reason?: string;
  /** ISO 8601. */
  dismissedOn: string;
  /** Who set it aside, when the host knows who that is. */
  dismissedBy?: string;
}

/** The instance key for a rule that runs once per agent. */
export function ruleKey(ruleId: string): string {
  return ruleId;
}

/** The instance key for a rule that runs per component, matching the analyzers' own convention. */
export function componentRuleKey(ruleId: string, componentId: string): string {
  return `${ruleId}:${componentId}`;
}

/**
 * Normalise whatever the caller holds into a set of keys.
 *
 * Callers variously have the full records (the editing surface), a bare key list (a saved review)
 * or nothing at all (every review written before this existed). Accepting all three keeps the
 * `dismissed` parameter optional everywhere it is threaded through scoring.
 */
export function dismissedKeys(
  dismissed?: ReadonlySet<string> | readonly string[] | readonly RuleDismissal[],
): ReadonlySet<string> {
  if (!dismissed) return EMPTY;
  if (dismissed instanceof Set) return dismissed;
  const list = dismissed as readonly (string | RuleDismissal)[];
  return new Set(list.map(d => (typeof d === 'string' ? d : d.key)));
}

const EMPTY: ReadonlySet<string> = new Set<string>();

/** True when this outcome has been set aside. */
export function isDismissed(result: RuleEvaluationResult, dismissed: ReadonlySet<string>): boolean {
  return dismissed.has(result.key);
}

/**
 * Carry a previous snapshot's dismissals into a new review.
 *
 * A dismissal is a judgement about the agent, not about one run of the review, so re-reviewing an
 * agent must not silently reinstate everything the reviewer already dealt with — that turns every
 * re-review into the same triage session and is the fastest way to make the feature useless.
 *
 * Only keys the new review actually produced are carried. A rule that no longer fires, or a skill
 * that has been deleted, leaves a dismissal with nothing to attach to; keeping it would quietly
 * re-apply months later if a component of the same name reappeared.
 */
export function carryForwardDismissals(
  previous: readonly RuleDismissal[],
  // Only the key is read, so a caller holding the stored payload rather than the typed results —
  // the persistence layer, which sees a harness union — can pass what it has.
  currentResults: readonly { key: string }[],
): RuleDismissal[] {
  const live = new Set(currentResults.map(r => r.key));
  return previous.filter(d => live.has(d.key));
}

/** Add or replace a dismissal, so re-ignoring an already-ignored rule updates it rather than duplicating it. */
export function withDismissal(
  existing: readonly RuleDismissal[],
  dismissal: RuleDismissal,
): RuleDismissal[] {
  return [...existing.filter(d => d.key !== dismissal.key), dismissal];
}

/** Remove a dismissal — the "Include this rule" path. */
export function withoutDismissal(existing: readonly RuleDismissal[], key: string): RuleDismissal[] {
  return existing.filter(d => d.key !== key);
}

/**
 * Read dismissals back out of wherever the host stored them.
 *
 * Deliberately forgiving. A stored value that cannot be understood is read as "none set aside",
 * because the alternative is throwing while opening a review — losing the whole review over an
 * optional feature. A row with no key is meaningless and is dropped; everything else is defaulted.
 */
export function parseDismissals(raw: string | null | undefined): RuleDismissal[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: RuleDismissal[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const d = entry as Partial<RuleDismissal>;
    if (typeof d.key !== 'string' || !d.key) continue;
    out.push({
      key: d.key,
      // A key always begins with its rule id, so an older or hand-edited record can still be read.
      ruleId: typeof d.ruleId === 'string' && d.ruleId ? d.ruleId : d.key.split(':')[0],
      ...(typeof d.reason === 'string' && d.reason ? { reason: d.reason } : {}),
      dismissedOn: typeof d.dismissedOn === 'string' ? d.dismissedOn : '',
      ...(typeof d.dismissedBy === 'string' && d.dismissedBy ? { dismissedBy: d.dismissedBy } : {}),
    });
  }
  return out;
}

/**
 * The stored form. Empty writes `null` rather than `"[]"` so clearing the last dismissal leaves the
 * column genuinely empty, and a reader cannot tell "never used" from "used and undone".
 */
export function serializeDismissals(dismissals: readonly RuleDismissal[]): string | null {
  return dismissals.length ? JSON.stringify(dismissals) : null;
}
