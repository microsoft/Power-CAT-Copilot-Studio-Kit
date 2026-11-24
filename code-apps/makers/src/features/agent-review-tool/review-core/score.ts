/**
 * The pillar formula, written once.
 *
 *     pillarScore = 100 × Σ(weight × credit) / Σ(weight)
 *
 * Every pillar is scored this way, including Evaluation. Before this, Evaluation
 * was a hard-coded expression — `0.35 + 0.4 * coverage + 0.15 * multiTurn + 0.1 *
 * expectedOk` — duplicated in two places, and the other five pillars were a
 * separate unweighted pass ratio. They are the same calculation: with every
 * weight defaulting to 1 this reduces exactly to `100 * credit / eligible.length`,
 * which is what `scoreLegacyDeterministicRules` computes today.
 *
 * Nothing here knows what a pillar *means*, which agent is being scored, or how
 * the number is displayed. It takes outcomes and returns a number.
 */

import { creditFor, weightOf, type Rule, type RuleOutcome } from './rule';

/** One rule and what it concluded about this subject. */
export interface ScoredRule {
  readonly rule: Rule<never>;
  readonly outcome: RuleOutcome;
  /**
   * Identifies this result for dismissal. Defaults to the rule id; a rule that
   * runs once per skill needs something finer, which is why it is not derived.
   */
  readonly key?: string;
}

export interface PillarScore {
  /** 0..100, or `null` when nothing in this pillar could be measured. */
  readonly score: number | null;
  /** False when any rule could not run, so the number is known to be partial. */
  readonly complete: boolean;
  /** Rules that counted — the denominator, for explaining the number. */
  readonly measured: number;
  /** Set when a gate rule failed and forced the pillar to zero. */
  readonly gatedBy?: string;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Score one pillar.
 *
 * A dismissed rule earns full credit rather than being dropped: the reviewer has
 * judged the rubric wrong about this agent, which is a decision the score should
 * honour, and the row stays visible as an override instead of disappearing.
 *
 * A failed gate returns 0 for the whole pillar. A *dismissed* gate returns 100,
 * because every other rule in the pillar presupposes the gate's condition — with
 * no evaluation set there is no coverage, no multi-turn case and no expected
 * response to judge — so once the reviewer has accepted the absence, nothing
 * measurable is left to subtract. This is exactly what `evaluationCoverageScore`
 * did: `if (!hasSet) return setDismissed ? 100 : 0`.
 */
export function scorePillar(
  entries: readonly ScoredRule[],
  dismissed: ReadonlySet<string> = new Set(),
): PillarScore {
  const isDismissed = (e: ScoredRule): boolean => dismissed.has(e.key ?? e.rule.id);
  const complete = !entries.some(e => e.outcome.outcome === 'could-not-run');

  const gate = entries.find(e => e.rule.gate === true && e.outcome.outcome === 'fail');
  if (gate) {
    return isDismissed(gate)
      ? { score: 100, complete, measured: 1 }
      : { score: 0, complete, measured: 0, gatedBy: gate.rule.id };
  }

  let numerator = 0;
  let denominator = 0;
  let measured = 0;
  for (const entry of entries) {
    const earned = creditFor(entry.rule, entry.outcome);
    if (earned === null) continue;
    const credit = isDismissed(entry) ? 1 : earned;
    const weight = weightOf(entry.rule);
    numerator += weight * credit;
    denominator += weight;
    measured += 1;
  }

  if (denominator === 0) return { score: null, complete, measured: 0 };
  return { score: clamp(Math.round((100 * numerator) / denominator)), complete, measured };
}
