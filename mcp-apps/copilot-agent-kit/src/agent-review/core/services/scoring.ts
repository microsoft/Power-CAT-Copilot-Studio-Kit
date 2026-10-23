/**
 * Grounded score (spec 013 §6, weighted-pillar model).
 *
 * The score is a weighted composite of capability pillars rather than a flat
 * rule-pass ratio. Instructions applies only when instructions exist.
 * Evaluation remains a baseline pillar for reviewable agents so missing test
 * coverage still costs its declared weight. The rest are conditional and only
 * enter the weighted average when the agent actually uses that capability.
 *
 * Evaluation is worth 30% and is scored on real coverage signal (does a test
 * set with cases exist, are its capabilities exercised, is it multi-turn, are
 * expected responses present) so an un-evaluated agent forfeits the full 30%
 * and cannot exceed ~70% no matter how clean everything else is.
 *
 * That 70% ceiling holds for every agent, not just capability-rich ones:
 * Evaluation keeps a fixed 30-point share and only the conditional pillars'
 * weight is redistributed. See {@link computeGroundedScore}.
 *
 * Info findings surface facts and never count against the score. Non-evaluation
 * pillars are driven by deterministic rules only (AI findings are surfaced to
 * the reviewer but do not move the deterministic pillar ratio).
 */
import type { GroundedFinding, RuleEvaluationResult, RuleEvaluationStatus } from '../contracts/Findings.js';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel.js';

export type PillarName = 'Instructions' | 'Evaluation' | 'Skills' | 'Tools' | 'Knowledge' | 'Orchestration';

/** Pillar weights (spec 013 §6). Model and Lifecycle families are facts only and unscored. */
export const PILLAR_WEIGHTS: Record<PillarName, number> = {
  Evaluation: 30,
  Instructions: 25,
  Skills: 15,
  Tools: 12,
  Knowledge: 8,
  Orchestration: 10,
};

/** Maps a rule/finding family to its scored pillar. Families absent here (Model, Lifecycle) are unscored. */
const FAMILY_TO_PILLAR: Record<string, PillarName> = {
  Instructions: 'Instructions',
  Evaluation: 'Evaluation',
  Skills: 'Skills',
  Tools: 'Tools',
  Knowledge: 'Knowledge',
  'Connected agents': 'Orchestration',
};

export interface GroundedScoreInput {
  model: AgentsExperienceModel;
  findings: GroundedFinding[];
  /**
   * One explicit outcome per evaluated rule instance (Task 3 — score v2):
   * engine-level rules (one instance each) merged with per-skill L0 rule
   * instances. Scoring never infers credit from counting findings.
   */
  ruleResults: RuleEvaluationResult[];
  coverage: { covered: number; total: number };
}

export interface PillarBreakdown {
  pillar: PillarName;
  weight: number;
  applicable: boolean;
  score: number | null;
  /** False when any deduplicated rule instance for this pillar could not be evaluated (execution failure). */
  complete: boolean;
}

/** Deterministic credit for a rule instance's status. `not-applicable`/`failed` are excluded from the denominator entirely. */
const CREDIT: Record<'passed' | 'info' | 'warning' | 'error', number> = {
  passed: 1, info: 1, warning: 0.5, error: 0,
};

/** Dedup rank — lower means "worse"/more dominant when two results share a key. */
const STATUS_RANK: Record<RuleEvaluationStatus, number> = {
  failed: 0, error: 1, warning: 2, 'not-applicable': 3, info: 4, passed: 5,
};

/** Collapse rule results sharing a key to the single worst status (Task 3, monotonic invariant). */
function dedupeRuleResults(results: RuleEvaluationResult[]): Map<string, RuleEvaluationStatus> {
  const byKey = new Map<string, RuleEvaluationStatus>();
  for (const r of results) {
    const existing = byKey.get(r.key);
    if (existing === undefined || STATUS_RANK[r.status] < STATUS_RANK[existing]) {
      byKey.set(r.key, r.status);
    }
  }
  return byKey;
}

/** Summary counters over every merged rule instance, deduplicated by key. */
export function summarizeRuleResults(
  results: RuleEvaluationResult[],
): { passed: number; evaluated: number; hasFailed: boolean } {
  const statuses = [...dedupeRuleResults(results).values()];
  return {
    passed: statuses.filter(s => s === 'passed' || s === 'info').length,
    evaluated: statuses.filter(s => s !== 'not-applicable' && s !== 'failed').length,
    hasFailed: statuses.some(s => s === 'failed'),
  };
}

function pillarApplicable(pillar: PillarName, model: AgentsExperienceModel): boolean {
  const hasInstructions = model.agentSettings.instructions.trim().length > 0;
  const hasReviewableConfiguration =
    hasInstructions ||
    model.skills.length > 0 ||
    model.tools.length > 0 ||
    model.knowledge.length > 0 ||
    model.connectedAgents.length > 0;
  const hasStandardTopics = (model.topics?.length ?? 0) > 0;

  switch (pillar) {
    case 'Instructions':
      return hasInstructions;
    case 'Evaluation':
      return hasReviewableConfiguration || hasStandardTopics ||
        model.evaluationSets.length > 0 ||
        model.testCases.length > 0 ||
        model.multiTurnCases.length > 0;
    case 'Skills':
      return model.skills.length > 0;
    case 'Tools':
      return model.tools.length > 0;
    case 'Knowledge':
      return model.knowledge.length > 0;
    case 'Orchestration':
      return model.connectedAgents.length > 0;
  }
}

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

export interface EvaluationSignals { hasSet: boolean; coverageRatio: number; multiTurn: boolean; expectedOk: boolean }

/**
 * Derive evaluation-coverage signals from the model, findings and coverage.
 * hasSet requires both a test set and at least one case; expectedOk reuses the
 * EVL-04 rule determination; multiTurn reuses the EVL-05 rule determination.
 */
export function deriveEvaluationSignals(input: GroundedScoreInput): EvaluationSignals {
  return {
    hasSet: input.model.evaluationSets.length > 0 && input.model.testCases.length > 0,
    coverageRatio: input.coverage.total === 0 ? 1 : input.coverage.covered / input.coverage.total,
    multiTurn: input.model.multiTurnCases.length > 0,
    expectedOk: !input.findings.some(f => f.id === 'EVL-04'),
  };
}

/**
 * Evaluation pillar sub-score (0..100). Zero when no usable test set exists so
 * an un-evaluated agent forfeits the entire evaluation weight.
 */
export function evaluationCoverageScore(sig: EvaluationSignals): number {
  if (!sig.hasSet) return 0;
  const raw = 0.35 + 0.4 * sig.coverageRatio + 0.15 * (sig.multiTurn ? 1 : 0) + 0.1 * (sig.expectedOk ? 1 : 0);
  return clamp(Math.round(raw * 100));
}

/**
 * Deterministic rule-instance sub-score for a non-evaluation pillar (0..100),
 * plus whether every matching rule instance evaluated cleanly.
 *
 * Scoring never counts findings — a rule fired once or twenty times earns the
 * exact same credit, because credit is computed per deduplicated rule
 * *instance* (`key`), not per finding. `not-applicable` and `failed`
 * instances are excluded from the denominator; a `failed` instance also
 * marks the pillar (and, transitively, the whole review) incomplete.
 */
function familyRuleScore(pillar: PillarName, ruleResults: RuleEvaluationResult[]): { score: number | null; complete: boolean } {
  const relevant = ruleResults.filter(r => FAMILY_TO_PILLAR[r.family] === pillar);
  const byKey = dedupeRuleResults(relevant);
  const statuses = [...byKey.values()];
  const hasFailed = statuses.some(s => s === 'failed');
  const eligible = statuses.filter((s): s is 'passed' | 'info' | 'warning' | 'error' =>
    s !== 'not-applicable' && s !== 'failed');
  if (eligible.length === 0) return { score: null, complete: !hasFailed };
  const credit = eligible.reduce((sum, s) => sum + CREDIT[s], 0);
  return { score: clamp(Math.round((100 * credit) / eligible.length)), complete: !hasFailed };
}

/** Per-pillar score, weight and applicability. */
export function computePillarBreakdown(input: GroundedScoreInput): PillarBreakdown[] {
  return (Object.keys(PILLAR_WEIGHTS) as PillarName[]).map(pillar => {
    const applicable = pillarApplicable(pillar, input.model);
    if (!applicable) {
      return {
        pillar,
        weight: PILLAR_WEIGHTS[pillar],
        applicable: false,
        score: null,
        complete: true,
      };
    }
    if (pillar === 'Evaluation') {
      return {
        pillar,
        weight: PILLAR_WEIGHTS[pillar],
        applicable: true,
        score: evaluationCoverageScore(deriveEvaluationSignals(input)),
        complete: true,
      };
    }
    const { score, complete } = familyRuleScore(pillar, input.ruleResults);
    return { pillar, weight: PILLAR_WEIGHTS[pillar], applicable: true, score, complete };
  });
}

/** Combined declared weight of every pillar except Evaluation. */
const NON_EVALUATION_WEIGHT = (Object.keys(PILLAR_WEIGHTS) as PillarName[])
  .filter(p => p !== 'Evaluation')
  .reduce((sum, p) => sum + PILLAR_WEIGHTS[p], 0);

/**
 * Weighted composite of applicable, measurable pillars, clamped to 0..100.
 *
 * Evaluation holds its declared 30-point share regardless of how many
 * conditional pillars apply; the remaining weight is spread across the
 * applicable non-Evaluation pillars (that produced a real score) in
 * proportion to their declared weights.
 *
 * Renormalizing across *all* applicable pillars (Evaluation included) would let
 * Evaluation's influence grow as capabilities are absent — a bare agent would
 * see it swell from 30/100 to 30/55, capping an otherwise flawless untested
 * agent at 45 instead of the documented 70. That punished simple agents hardest,
 * which inverts the intent.
 */
export function computeGroundedScore(input: GroundedScoreInput): number | null {
  const breakdown = computePillarBreakdown(input);
  const applicable = breakdown.filter(p => p.applicable && p.score !== null);
  if (applicable.length === 0) return null;

  const evaluationScore = breakdown.find(p => p.pillar === 'Evaluation' && p.applicable)?.score ?? 0;
  const others = breakdown.filter(p => p.pillar !== 'Evaluation' && p.applicable && p.score !== null);
  const otherWeightSum = others.reduce((s, p) => s + p.weight, 0);

  if (otherWeightSum === 0) return clamp(Math.round(evaluationScore));

  const othersScore = others.reduce((s, p) => s + p.weight * (p.score as number), 0) / otherWeightSum;
  const raw =
    (PILLAR_WEIGHTS.Evaluation * evaluationScore + NON_EVALUATION_WEIGHT * othersScore) /
    (PILLAR_WEIGHTS.Evaluation + NON_EVALUATION_WEIGHT);
  return clamp(Math.round(raw));
}

/** Count non-info findings by severity for scoring. */
export function severityCounts(findings: GroundedFinding[]): { warnings: number; errors: number; infos: number } {
  return {
    warnings: findings.filter(f => f.severity === 'warning').length,
    errors: findings.filter(f => f.severity === 'error').length,
    infos: findings.filter(f => f.severity === 'info').length,
  };
}
