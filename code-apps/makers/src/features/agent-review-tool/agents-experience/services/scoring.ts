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
 * the reviewer but do not move the deterministic pillar ratio), and only a Fail
 * reduces a pillar — see {@link CREDIT}.
 */
import type { GroundedFinding, RuleEvaluationResult, RuleEvaluationStatus } from '../contracts/Findings';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel';
import type { CoverageBasis } from './EvaluationCoverageService';
import { isRecordResult } from './rules/recordRules';
import { dismissedKeys, type RuleDismissal } from './dismissals';
import { ruleById, RULES } from '../../review-core/registry';
import type { Population } from '../../review-core/rule';
import {
  AGENT_PILLAR_WEIGHTS,
  LEGACY_PILLAR_NAME,
  UNCONDITIONAL_AGENT_PILLARS,
  type AgentPillar,
  type LegacyPillarName,
} from '../../review-core/pillars';
import { evaluationRules, type EvaluationContext } from '../../review-core/rules/evaluation.rules';
import {
  distinctGraders,
  formatGrader,
  evaluationGraderRequiresExpectedResponse,
} from './graders';
import { scorePillar } from '../../review-core/score';
import { couldNotRun, type Rule } from '../../review-core/rule';

/** ART's persisted spelling of a pillar. The identity is {@link AgentPillar}; this is its label. */
export type PillarName = LegacyPillarName;

/**
 * Pillar weights (spec 013 §6), keyed by ART's persisted Title-case name.
 *
 * Derived from the one table in `review-core/pillars.ts` rather than restated, so
 * ART and ARC2 cannot drift apart by a point. Model and Lifecycle families are
 * facts only and unscored.
 */
export const PILLAR_WEIGHTS: Record<PillarName, number> = Object.fromEntries(
  (Object.entries(AGENT_PILLAR_WEIGHTS) as [AgentPillar, number][])
    .map(([pillar, weight]) => [LEGACY_PILLAR_NAME[pillar], weight]),
) as Record<PillarName, number>;

/**
 * Maps a rule/finding family to its scored pillar. Families absent here (Model, Lifecycle) are unscored.
 *
 * Exported for `pillar-source-equivalence.test.ts`, which proves this table and the
 * registered rules answer "which pillar does this score in?" identically. A rule's
 * family is stated at its adapter call site and deliberately *not* re-derived from
 * its pillar (`copilotRuleDefinition.ts:55`), so the two can disagree and only a
 * test can tell us they do not.
 */
export const FAMILY_TO_PILLAR: Record<string, PillarName> = {
  Instructions: 'Instructions',
  Evaluation: 'Evaluation',
  Skills: 'Skills',
  Tools: 'Tools',
  Knowledge: 'Knowledge',
  'Connected agents': 'Orchestration',
};

/**
 * The pillar a result row scores in, preferring the rule's own declaration.
 *
 * `family` is a second, parallel answer to the same question, stated by hand at each adapter
 * call site and deliberately never re-derived (`copilotRuleDefinition.ts:55`). The registry is
 * the authority this refactor consolidates on, so it wins — but only where it can answer:
 *
 * - **An unregistered id** — a rule not yet migrated, or an id read back from a saved review —
 *   falls back to `family`.
 * - **A rule registered under a *skill dimension*** (`safety-evidence`, `packaging-quality`, and
 *   the rest) has no agent-pillar spelling at all. Those ids reach this scorer as `Skills` rows,
 *   so resolving them through the registry would drop them out of the Skills denominator and
 *   silently raise or lower that pillar.
 * - **A rule declaring a *per-harness* pillar map** (D-14) cannot be resolved from a row at all:
 *   `RuleEvaluationResult` carries no harness, only `key`, `ruleId` and `family`. Such a rule is
 *   by construction a shared skill rule, whose rows arrive here with family `Skills` and whose
 *   agent-side spelling is therefore `Skills` either way, so the fallback gives the same answer
 *   the map would.
 *
 * The fallback is therefore on the *resolved pillar*, not on whether the rule exists — resolving
 * on existence alone loses the last two cases without an error anywhere. What remains is a change
 * in exactly one direction: a row whose family is unmapped, but whose rule names a real agent
 * pillar, now scores where the rule says it does. `pillar-source-equivalence.test.ts` pins that
 * change set, which is why this is exported.
 */
export function pillarForResult(result: RuleEvaluationResult): PillarName | undefined {
  const declared = ruleById(result.ruleId)?.pillar;
  const fromRegistry = typeof declared === 'string' && Object.hasOwn(LEGACY_PILLAR_NAME, declared)
    ? LEGACY_PILLAR_NAME[declared as AgentPillar]
    : undefined;
  return fromRegistry ?? FAMILY_TO_PILLAR[result.family];
}

export interface GroundedScoreInput {
  model: AgentsExperienceModel;
  findings: GroundedFinding[];
  /**
   * One explicit outcome per evaluated rule instance (Task 3 — score v2):
   * engine-level rules (one instance each) merged with per-skill L0 rule
   * instances. Scoring never infers credit from counting findings.
   */
  ruleResults: RuleEvaluationResult[];
  coverage: {
    covered: number;
    total: number;
    basis?: CoverageBasis;
    /**
     * Ids of the capabilities counted as uncovered, so a per-capability dismissal
     * (`EVL-02:<id>`) can credit the one the reviewer set aside without crediting the rest.
     */
    uncoveredIds?: readonly string[];
  };
  /**
   * Rule instances the reviewer set aside, as {@link RuleEvaluationResult.key}.
   *
   * Optional throughout: every review saved before this existed has none, and must keep scoring
   * exactly as it did then.
   */
  dismissed?: ReadonlySet<string> | readonly string[] | readonly RuleDismissal[];
}

export interface PillarBreakdown {
  pillar: PillarName;
  weight: number;
  applicable: boolean;
  score: number | null;
  /** False when any deduplicated rule instance for this pillar could not be evaluated (execution failure). */
  complete: boolean;
}

/**
 * Deterministic credit for a rule instance's status.
 *
 * "Needs attention" is a partial result: the rubric found something worth changing but not a
 * defect, so it earns half credit — enough that an agent full of them cannot score as though it
 * were clean, and little enough that it is not punished like a failure. This is ART's own value
 * and is deliberately shared, so a score means the same thing in both tools.
 *
 * `not-applicable` and `failed` are excluded from the denominator entirely.
 *
 * `info` has no entry because an informational outcome is not scored at all — neither numerator nor
 * denominator. It states a fact, and a fact cannot be satisfied or missed. Leaving it in is not
 * neutral: it would be a guaranteed full-credit row diluting every real result in its pillar, so
 * one Fail beside one fact would score 50 instead of 0.
 */
const CREDIT: Record<'passed' | 'warning' | 'error', number> = {
  passed: 1, warning: 0.5, error: 0,
};

/**
 * What one rule-result status earns, or `null` when it takes no part in a score.
 *
 * Exported so a caller that has to show its working — the AI review discloses an earned and a
 * possible weight per row — reads this table instead of restating `1 / 0.5 / 0` next to it. A
 * restatement is how the two halves of a review came to disagree: the numbers look the same until
 * one of them is edited, and nothing fails when they drift. `null` is deliberately distinct from
 * `0`: a high-severity failure earns zero out of a possible one, whereas an informational row has
 * no possible weight at all, and collapsing the two puts facts into the denominator.
 */
export function ruleResultCredit(status: RuleEvaluationStatus): number | null {
  return status === 'passed' || status === 'warning' || status === 'error' ? CREDIT[status] : null;
}

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
    passed: statuses.filter(s => s === 'passed').length,
    evaluated: statuses.filter(s => s !== 'not-applicable' && s !== 'failed' && s !== 'info').length,
    hasFailed: statuses.some(s => s === 'failed') || results.some(r => r.incomplete),
  };
}

/**
 * Whether each population the rules can declare is present on this subject.
 *
 * `configuration` is pinned to false on purpose. Every agent has settings, so treating it
 * as present would make every pillar holding a configuration-reading rule applicable for
 * every agent — `LCY-01` alone would have given a delegation-free agent a full
 * Orchestration pillar. A population admits a pillar only when the maker built something.
 */
const POPULATION_PRESENT: Record<Population, (model: AgentsExperienceModel) => boolean> = {
  instructions: m => m.agentSettings.instructions.trim().length > 0,
  tools: m => m.tools.length > 0,
  skills: m => m.skills.length > 0,
  topics: m => (m.topics?.length ?? 0) > 0,
  knowledge: m => m.knowledge.length > 0,
  connectedAgents: m => m.connectedAgents.length > 0,
  childAgents: m => (m.childAgents?.length ?? 0) > 0,
  evaluation: m =>
    m.evaluationSets.length > 0 || m.testCases.length > 0 || m.multiTurnCases.length > 0,
  configuration: () => false,
};

/** Legacy pillar name -> the pillar id rules declare. */
const PILLAR_KEY = Object.fromEntries(
  Object.entries(LEGACY_PILLAR_NAME).map(([pillar, legacy]) => [legacy, pillar]),
) as Record<LegacyPillarName, AgentPillar>;

/** A rule claims a pillar either outright or for one of its harnesses (D-14). */
function claimsPillar(rule: { pillar: unknown }, pillar: AgentPillar): boolean {
  if (typeof rule.pillar === 'string') return rule.pillar === pillar;
  if (rule.pillar && typeof rule.pillar === 'object') {
    return Object.values(rule.pillar as Record<string, string>).includes(pillar);
  }
  return false;
}

/**
 * Whether any rule in this pillar reads something this agent actually has.
 *
 * The population gate asks "does this pillar's own component exist". That is too coarse
 * on its own: `link-safety` and `escalation-guidance` read instruction text, which every
 * agent has, yet they are filed under Knowledge and Orchestration -- so an agent with no
 * knowledge sources had those judgements computed and then silently dropped.
 *
 * Asking instead whether *any* rule in the pillar reads a population that exists keeps a
 * genuinely absent capability out of the score (every Tools rule declares `tools`, so a
 * tool-free agent still has no Tools pillar) while letting a judgement that could be made
 * count. A rule that declares no populations never admits a pillar, and a rule whose own
 * question does not apply still returns `not-applicable`, which `scorePillar` excludes --
 * so a pillar admitted here with nothing to say scores `null` and drops out anyway.
 */
function pillarHasReadableRule(pillar: AgentPillar, model: AgentsExperienceModel): boolean {
  return RULES.some(
    rule =>
      claimsPillar(rule, pillar) &&
      (rule.evidence?.populations ?? []).some(p => POPULATION_PRESENT[p](model)),
  );
}

function pillarApplicable(pillar: PillarName, model: AgentsExperienceModel): boolean {
  const hasInstructions = model.agentSettings.instructions.trim().length > 0;
  // Standard agents delegate through child agents, copilot agents through connected
  // agents, and a standard agent may use both. Orchestration is measurable when either
  // population exists -- keying on `connectedAgents` alone left every child-agent-only
  // agent with an inapplicable pillar and its three rules scoring nowhere.
  const delegationTargets =
    model.connectedAgents.length + (model.childAgents?.length ?? 0);
  const hasReviewableConfiguration =
    hasInstructions ||
    model.skills.length > 0 ||
    model.tools.length > 0 ||
    model.knowledge.length > 0 ||
    delegationTargets > 0;

  const readable = (): boolean => pillarHasReadableRule(PILLAR_KEY[pillar], model);

  switch (pillar) {
    case 'Instructions':
      return hasInstructions;
    case 'Evaluation':
      // Never conditional: an agent that was never evaluated must forfeit the 30 points
      // rather than have them redistributed. See `compositeFromBreakdown`.
      return hasReviewableConfiguration ||
        model.evaluationSets.length > 0 ||
        model.testCases.length > 0 ||
        model.multiTurnCases.length > 0;
    case 'Skills':
      // Standard agents route over topics, copilot agents over skills; one scoring slot.
      return model.skills.length > 0 || (model.topics?.length ?? 0) > 0 || readable();
    case 'Tools':
      return model.tools.length > 0 || readable();
    case 'Knowledge':
      return model.knowledge.length > 0 || readable();
    case 'Orchestration':
      return delegationTargets > 0 || readable();
  }
}

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

export interface EvaluationSignals {
  hasSet: boolean;
  coverageRatio: number;
  multiTurn: boolean;
  expectedOk: boolean;
  /**
   * The reviewer set aside the "no test set" row. Tracked separately from {@link hasSet} because
   * the pillar must still know the agent has nothing to measure — it simply stops charging for it.
   */
  setDismissed?: boolean;
}

/**
 * How much of the agent's capability surface the test set exercises, 0..1.
 *
 * Written once because two callers need it from different starting points:
 * {@link deriveEvaluationSignals} has the parsed model, {@link rescorePillars}
 * has only a stored review. Both have the coverage figures, which is all this
 * needs.
 *
 * Unverifiable coverage scores 0, not 1. The alternative hands full marks to an
 * agent whose coverage nobody could check.
 */
function coverageRatioOf(
  coverage: GroundedScoreInput['coverage'],
  dismissed: ReadonlySet<string>,
): number {
  if (dismissed.has('EVL-02')) return 1;
  if (coverage.basis === 'unverified') return 0;
  if (coverage.total === 0) return 1;
  const alsoCovered = (coverage.uncoveredIds ?? []).filter(id => dismissed.has(`EVL-02:${id}`)).length;
  return Math.min(coverage.total, coverage.covered + alsoCovered) / coverage.total;
}

/**
 * Reconstruct evaluation signals for {@link rescorePillars}, which has a saved review rather than
 * a parsed model. hasSet requires both a test set and at least one case; multiTurn reuses the
 * EVL-05 determination.
 *
 * Each signal absorbs its own dismissal, because this path reduces the pillar to five booleans:
 * there is no rule row whose credit could be flipped, so a set-aside rule has to satisfy the slice
 * it controls instead.
 *
 * `expectedOk` is circular and that is why the live path no longer comes through here: it reads the
 * *output* of a previous EVL-04 evaluation as the *input* to EVL-04. An empty `findings` array —
 * a rescore, or an AI-only review — therefore made EVL-04 pass unconditionally, and a stale EVL-04
 * finding made it fail even after the agent switched to a grader that needs no expected response.
 * {@link computePillarBreakdown} reads the real graders and cases instead.
 */
export function deriveEvaluationSignals(input: GroundedScoreInput): EvaluationSignals {
  const dismissed = dismissedKeys(input.dismissed);
  return {
    hasSet: input.model.evaluationSets.length > 0 && input.model.testCases.length > 0,
    setDismissed: dismissed.has('EVL-01'),
    coverageRatio: coverageRatioOf(input.coverage, dismissed),
    multiTurn: input.model.multiTurnCases.length > 0 || dismissed.has('EVL-05'),
    expectedOk: !input.findings.some(f => f.id === 'EVL-04') || dismissed.has('EVL-04'),
  };
}

/**
 * Run the Evaluation rules over a context and weigh them.
 *
 * This is the only place the Evaluation pillar is scored. The arithmetic itself
 * lives in `review-core/score.ts` and the four coefficients that used to be
 * written inline — 35 / 40 / 15 / 10 — are now declared on EVL-01, EVL-02,
 * EVL-05 and EVL-04. Adding a fifth evaluation rule is a change to
 * `evaluation.rules.ts` alone; nothing here needs to know how many there are.
 */
function scoreEvaluation(
  ctx: EvaluationContext,
  dismissed: ReadonlySet<string>,
  unavailable: ReadonlySet<string> = new Set(),
): number | null {
  return scorePillar(
    evaluationRules.map(r => ({
      rule: r as unknown as Rule<never>,
      outcome: unavailable.has(r.id) ? couldNotRun('Required evaluation evidence was not captured.') : r.check!(ctx),
    })),
    dismissed,
  ).score;
}

/**
 * Evaluation pillar sub-score (0..100) from the recovered signals.
 *
 * **This is the lossy path, and it is now reserved for callers that genuinely
 * have nothing better.** It holds four booleans and a ratio, so it rebuilds a
 * context in which the agent has exactly one set, one case, no graders and a
 * one-capability coverage matrix. The *score* survives that squash, because the
 * four scored rules only ever ask yes/no questions of those counts — but every
 * fact the rules report is fiction: EVL-01 says "evaluation sets: 1" for an
 * agent with nine, EVL-02 says "0.6 of 1 capabilities", and EVL-03 is forced to
 * `not-applicable` because `graders` is always empty.
 *
 * {@link computePillarBreakdown} no longer uses it — it holds the real model and
 * calls {@link evaluationContextFrom} instead. The one remaining caller is
 * {@link rescorePillars}, which reads a *stored* review and has only the
 * recovered signals, which is what this was written for.
 */
export function evaluationCoverageScore(sig: EvaluationSignals): number {
  const dismissed = new Set(sig.setDismissed ? ['EVL-01'] : []);
  return scoreEvaluation({
    evaluationSetCount: sig.hasSet ? 1 : 0,
    testCaseCount: sig.hasSet ? 1 : 0,
    multiTurnCaseCount: sig.multiTurn ? 1 : 0,
    graders: [],
    requiresExpectedResponse: !sig.expectedOk,
    casesMissingExpected: sig.expectedOk ? [] : ['recovered-from-stored-review'],
    coverage: { total: 1, covered: sig.coverageRatio, uncovered: [], basis: 'declared' },
  }, dismissed) ?? 0;
}

/**
 * Build the evaluation rule context from the parsed model — the real capture.
 *
 * The real set, case and multi-turn counts, the real graders, and the real
 * coverage matrix, so every fact the evaluation rules report is the agent's own
 * rather than a placeholder reconstructed from four booleans.
 *
 * Two deliberate divisions of labour:
 *
 * - **Per-capability dismissal is folded into `covered` here**, because that is
 *   where {@link EvaluationContext} says it belongs. A capability the reviewer
 *   set aside is one they have accepted as covered, and EVL-02 must not be able
 *   to tell the difference — it has no dismissal vocabulary of its own.
 * - **Rule-level dismissal is not folded in.** It goes to `scorePillar`, which
 *   credits a set-aside rule directly. The older path instead rewrote the
 *   context until the rule passed — `multiTurnCaseCount: 1` for an agent with
 *   none — which bought the right number at the cost of a fact that was untrue.
 *
 * EVL-03 and EVL-04 read graders from different places, and that is preserved
 * rather than unified: EVL-03 reports the configuration a maker can act on, so
 * it wants `graderDetails` de-duplicated on full settings, while EVL-04 asks the
 * kind-level question "does anything here score against a reference answer".
 */
export function evaluationContextFrom(
  input: GroundedScoreInput,
  dismissed: ReadonlySet<string>,
): EvaluationContext {
  const { model, coverage } = input;
  const uncoveredIds = coverage.uncoveredIds ?? [];
  const stillUncovered = uncoveredIds.filter(id => !dismissed.has(`EVL-02:${id}`));
  const setAside = uncoveredIds.length - stillUncovered.length;

  const requiresExpectedResponse = model.evaluationSets
    .flatMap(s => s.graders)
    .some(evaluationGraderRequiresExpectedResponse);

  return {
    evaluationSetCount: model.evaluationSets.length,
    testCaseCount: model.testCases.length,
    multiTurnCaseCount: model.multiTurnCases.length,
    graders: distinctGraders(model.evaluationSets).map(formatGrader),
    requiresExpectedResponse,
    casesMissingExpected: requiresExpectedResponse
      ? model.testCases
        .filter(c => !c.expected || c.expected.trim().length === 0)
        .map(c => c.schemaname || c.name)
      : [],
    coverage: {
      total: coverage.total,
      covered: Math.min(coverage.total, coverage.covered + setAside),
      uncovered: stillUncovered,
      basis: coverage.basis ?? 'declared',
    },
  };
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
 *
 * Record instances are excluded too, along with any instance that reported
 * `info`. They state configuration rather than judging it, and leaving one in
 * would add a guaranteed full-credit row that dilutes every real result beside
 * it.
 */
function familyRuleScore(
  pillar: PillarName,
  ruleResults: RuleEvaluationResult[],
  dismissed: ReadonlySet<string>,
  pillarOf: (result: RuleEvaluationResult) => PillarName | undefined,
): { score: number | null; complete: boolean } {
  const relevant = ruleResults.filter(r => pillarOf(r) === pillar && !isRecordResult(r));
  return scoreLegacyDeterministicRules(relevant, dismissed);
}

/** Same-rule comparison baseline using existing legacy credit arithmetic, not the historical pillar composite. */
export function scoreLegacyDeterministicRules(
  ruleResults: RuleEvaluationResult[], dismissed: ReadonlySet<string> = new Set(),
): { score: number | null; complete: boolean } {
  const relevant = ruleResults.filter(r => !isRecordResult(r));
  const byKey = dedupeRuleResults(relevant);
  const statuses = [...byKey.values()];
  const hasFailed = statuses.some(s => s === 'failed') || relevant.some(r => r.incomplete);
  const eligible = [...byKey.entries()].filter(
    (e): e is [string, 'passed' | 'warning' | 'error'] =>
      e[1] !== 'not-applicable' && e[1] !== 'failed' && e[1] !== 'info');
  if (eligible.length === 0) return { score: null, complete: !hasFailed };
  // A rule the reviewer set aside earns full credit. They have judged the rubric wrong about this
  // agent, which is a decision the score should honour — the row stays in the list marked as an
  // override so the decision is visible rather than indistinguishable from a genuine pass.
  const credit = eligible.reduce((sum, [key, s]) => sum + (dismissed.has(key) ? 1 : CREDIT[s]), 0);
  return { score: clamp(Math.round((100 * credit) / eligible.length)), complete: !hasFailed };
}

/** Per-pillar score, weight and applicability. */
export function computePillarBreakdown(input: GroundedScoreInput): PillarBreakdown[] {
  const dismissed = dismissedKeys(input.dismissed);
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
      const results = input.ruleResults.filter(result => pillarForResult(result) === pillar);
      const unavailable = new Set(results.filter(result => result.status === 'failed').map(result => result.ruleId));
      // Keep the declared evaluation arithmetic, but never regrade unavailable
      // evidence as though the captured arrays were a complete empty population.
      const score = scoreEvaluation(evaluationContextFrom(input, dismissed), dismissed, unavailable);
      return {
        pillar,
        weight: PILLAR_WEIGHTS[pillar],
        applicable: true,
        score,
        complete: unavailable.size === 0 && !results.some(result => result.incomplete),
      };
    }
    const { score, complete } = familyRuleScore(pillar, input.ruleResults, dismissed, pillarForResult);
    return { pillar, weight: PILLAR_WEIGHTS[pillar], applicable: true, score, complete };
  });
}

/**
 * The pillars that hold their declared weight even when unmeasured, in ART's
 * Title-case spelling. Declared once in `review-core/pillars.ts`, where the
 * reasoning lives, so this scorer and the AI review's composite cannot disagree
 * about which pillar is exempt from renormalization.
 */
const PINNED_PILLARS: readonly PillarName[] =
  UNCONDITIONAL_AGENT_PILLARS.map(pillar => LEGACY_PILLAR_NAME[pillar]);

const PINNED_WEIGHT = PINNED_PILLARS.reduce((sum, p) => sum + PILLAR_WEIGHTS[p], 0);

/** Combined declared weight of every pillar that can legitimately be absent. */
const CONDITIONAL_WEIGHT = (Object.keys(PILLAR_WEIGHTS) as PillarName[])
  .filter(p => !PINNED_PILLARS.includes(p))
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
  return compositeFromBreakdown(computePillarBreakdown(input));
}

/** The weighted roll-up, split out so a re-score of a saved review uses the identical arithmetic. */
function compositeFromBreakdown(breakdown: readonly PillarBreakdown[]): number | null {
  const applicable = breakdown.filter(p => p.applicable && p.score !== null);
  if (applicable.length === 0) return null;

  const pinned = breakdown.filter(p => PINNED_PILLARS.includes(p.pillar) && p.applicable);
  const pinnedScore = PINNED_WEIGHT === 0 ? 0
    : pinned.reduce((s, p) => s + p.weight * (p.score ?? 0), 0) / PINNED_WEIGHT;
  const others = applicable.filter(p => !PINNED_PILLARS.includes(p.pillar));
  const otherWeightSum = others.reduce((s, p) => s + p.weight, 0);

  if (otherWeightSum === 0) return clamp(Math.round(pinnedScore));

  const othersScore = others.reduce((s, p) => s + p.weight * (p.score as number), 0) / otherWeightSum;
  const raw =
    (PINNED_WEIGHT * pinnedScore + CONDITIONAL_WEIGHT * othersScore) /
    (PINNED_WEIGHT + CONDITIONAL_WEIGHT);
  return clamp(Math.round(raw));
}

/** One pillar's actual share of a composite, for a screen that has to show the arithmetic. */
export interface PillarContribution {
  pillar: PillarName;
  /** Percentage of the final composite this pillar carried in this review, 0 when it carried none. */
  effectiveWeight: number;
  score: number | null;
  applicable: boolean;
}

/**
 * The share each pillar actually carried in `compositeFromBreakdown`.
 *
 * Exported so a score explainer reads the arithmetic that ran instead of
 * restating the weight table beside it. That restatement is what left the
 * standard review page claiming a 50/50 pattern/instruction blend for a release
 * after the composite replaced it, with no test able to notice.
 *
 * A pinned pillar keeps its declared share even when it was not applicable —
 * the composite still divides by the full weight — so its row is reported with
 * that reserved weight and a null score rather than being dropped.
 */
export function pillarContributions(breakdown: readonly PillarBreakdown[]): PillarContribution[] {
  const others = breakdown.filter(p =>
    p.applicable && p.score !== null && !PINNED_PILLARS.includes(p.pillar));
  const otherWeightSum = others.reduce((s, p) => s + p.weight, 0);

  return breakdown.map(p => {
    const pinned = PINNED_PILLARS.includes(p.pillar);
    const effectiveWeight = pinned
      ? PINNED_WEIGHT === 0 ? 0
        : otherWeightSum === 0 ? (p.weight / PINNED_WEIGHT) * 100 : p.weight
      : p.applicable && p.score !== null && otherWeightSum > 0
        ? (CONDITIONAL_WEIGHT * p.weight) / otherWeightSum
        : 0;
    return { pillar: p.pillar, effectiveWeight, score: p.score, applicable: p.applicable };
  });
}

/** What a saved review needs to be scored again after a reviewer set rules aside. */
export interface RescoreInput {
  /**
   * The breakdown the review stored.
   *
   * Which pillars applied is taken from here rather than recomputed, because applicability is a
   * fact about the components that were reviewed and those are not being reviewed again. Re-reading
   * the agent to answer "what if this rule did not count" would silently fold in every change made
   * since, and the reviewer would see a number that belongs to neither the old agent nor the new.
   */
  pillars: readonly PillarBreakdown[];
  ruleResults: RuleEvaluationResult[];
  /** Evaluation coverage exactly as the review recorded it. */
  coverage: GroundedScoreInput['coverage'];
  dismissed?: ReadonlySet<string> | readonly string[] | readonly RuleDismissal[];
}

/**
 * The rows whose dismissal forgives the Evaluation pillar outright.
 *
 * `scorePillar` already implements this for a gate it can *see* — a dismissed failing gate returns
 * 100, because every other rule in the pillar presupposes the gate's condition. {@link rescorePillars}
 * cannot see one: it rebuilds the pillar from recovered signals, and in that reconstruction the gate
 * usually passes (an agent with a set and a thin suite scores 62, not 0), so the row the maker was
 * actually shown had no way to forgive anything.
 *
 * EVL-01 is derived rather than written down, so a later gate is picked up without editing this.
 * `local-pattern-8` ("Inadequate Test Cases") has to be named: it is the only Evaluation row a
 * Standard review persists, and it deliberately declares no `gate` of its own — the registry rejects
 * a second gate on the same harness/pillar pair, and adding one would move live `assessStandard`
 * verdicts rather than only rescores.
 *
 * Naming it is a product choice, not a tidy-up: dismissing it returns the whole 30-weight pillar,
 * which forgives the coverage, multi-turn and expected-response slices below it as well. That is
 * the intent — a reviewer who accepts that the suite is adequate has answered the premise those
 * slices rest on — but it is the one row in the system where a single dismissal is worth ~11
 * composite points, so it is conditioned on the row having actually failed.
 */
const EVALUATION_GATE_RULE_IDS: ReadonlySet<string> = new Set<string>([
  ...evaluationRules.filter(rule => rule.gate === true).map(rule => rule.id),
  'local-pattern-8',
]);

/**
 * Score a saved review again with some rules set aside.
 *
 * The screen showing a stored review has its rule outcomes but not the parsed agent model, so
 * {@link computePillarBreakdown} cannot be used directly. Everything it would need, though, is
 * recoverable: the non-Evaluation pillars are nothing but rule credit, and Evaluation's four signals
 * can be read back exactly — `hasSet` from whether the pillar scored at all (the formula's floor
 * with a test set is 35, so only its absence yields 0), and the multi-turn and expected-response
 * slices from the outcomes of the two rules that decide them.
 *
 * This lives here, beside the rubric it re-applies, so a screen can never arrive at its own answer.
 */
export function rescorePillars(input: RescoreInput): PillarBreakdown[] {
  const dismissed = dismissedKeys(input.dismissed);

  /**
   * Rule outcomes are deduplicated by `key`, but the three lookups below are by rule *id*, and the
   * two are not the same vocabulary: a per-component rule keys as `id:componentId` and the standard
   * harness has saved rows keyed `standard:<id>:agent`. Today's rows key on the bare id, so the
   * second map is usually a copy — it exists so a change to key generation cannot silently turn
   * these lookups into permanent misses, which would read as "this rule did not pass" and forgive
   * penalties that were never charged.
   */
  const byKey = dedupeRuleResults(input.ruleResults);
  const byRuleId = dedupeRuleResults(input.ruleResults.map(r => ({ ...r, key: r.ruleId })));
  const statusOf = (id: string) => byKey.get(id) ?? byRuleId.get(id);
  const passed = (id: string) => statusOf(id) === 'passed';

  /**
   * Setting a rule aside can only ever forgive a penalty, so a rescore can raise a pillar and never
   * lower it. That makes the stored score a floor — and the floor is what keeps an incomplete
   * `ruleResults` honest. A stored review need not carry a row for every rule it scored (the
   * standard harness persists no `EVL-*` rows at all), and an absent row reads as "not passed",
   * which would otherwise manufacture a failure for a rule that was measured correctly at save
   * time and silently drop the pillar the moment a reviewer dismisses anything.
   */
  const atLeastStored = (next: number | null, stored: number | null): number | null =>
    next === null ? stored : stored === null ? next : Math.max(next, stored);

  return input.pillars.map(pillar => {
    if (!pillar.applicable) return { ...pillar };

    // A pillar the stored review withheld stays withheld. Rescoring is not re-measuring: the rows
    // in hand are exactly the rows that were already insufficient to produce a number, so letting a
    // dismissal mint one would put an unmeasured pillar back into the denominator at full credit.
    // That is the same fabrication the withheld-pillar handling exists to prevent, and it matters
    // more now that the resolver below reaches rows it used to drop.
    if (pillar.score === null) return { ...pillar };

    if (pillar.pillar === 'Evaluation') {
      // Forgiving the gate returns the pillar whole, because every rule below it presupposes that
      // an evaluation suite exists — once a reviewer has accepted its absence there is nothing left
      // to charge for. `scorePillar` does this for a gate it can see; a rescore has to do it here,
      // because the reconstruction below infers `hasSet` from the stored score and so rebuilds a
      // gate that passes whenever the pillar scored at all.
      //
      // It is deliberately conditioned on the row NOT passing. A dismissal outlives the failure it
      // answered — `carryForwardDismissals` keeps any key the new review still renders, and a rule
      // that now passes still renders — so a maker who dismissed this row when it failed and then
      // actually fixed the agent would otherwise be handed 100 for a rule the agent now earns on
      // its own merits. On a 30-weight pinned pillar that is roughly +11 composite points awarded
      // for having fixed the problem.
      if ([...EVALUATION_GATE_RULE_IDS].some(id => dismissed.has(id) && statusOf(id) !== 'passed')) {
        return { ...pillar, score: 100 };
      }

      // Below the gate each slice is forgiven on its own weight — EVL-02 40, EVL-05 15, EVL-04 10 —
      // so setting aside multi-turn coverage credits multi-turn coverage and nothing else.
      const signals: EvaluationSignals = {
        hasSet: pillar.score > 0,
        coverageRatio: coverageRatioOf(input.coverage, dismissed),
        multiTurn: passed('EVL-05') || dismissed.has('EVL-05'),
        expectedOk: passed('EVL-04') || dismissed.has('EVL-04'),
      };
      return { ...pillar, score: atLeastStored(evaluationCoverageScore(signals), pillar.score) };
    }

    // Resolved through the registry first, exactly as the live {@link computePillarBreakdown} does.
    // The two paths have to agree: a row the live score counted in Knowledge must not be rescored
    // into Instructions, and five instruction criteria — `citations-and-sources`, `link-safety`,
    // `accuracy-quality`, `tool-routing-hints`, `escalation-guidance` — declare exactly that split.
    //
    // This is strictly wider than the family table rather than a trade-off, because
    // `pillarForResult` *contains* the family fallback. Stored rows carrying ids no registry holds —
    // saved before a rule was migrated, or retired since — keep resolving exactly as they did. What
    // changes is the rows whose family is not a key of the table at all: 22 of the 37 a Standard
    // review renders, every Architecture, Input/Output Variables, Model and Orchestration row. They
    // resolved to `undefined`, matched no pillar and left their denominator, so dismissing one of
    // them did nothing rather than moving the score to a visibly wrong number.
    const { score, complete } = familyRuleScore(
      pillar.pillar, input.ruleResults, dismissed, pillarForResult);
    // A pillar the stored review could measure keeps its stored score if the rows cannot produce
    // one — an older review may hold a pillar score without the outcomes that justify it.
    return { ...pillar, score: atLeastStored(score ?? pillar.score, pillar.score), complete };
  });
}

/** The rolled-up number for {@link rescorePillars}. */
export function rescoreGroundedScore(input: RescoreInput): number | null {
  return compositeFromBreakdown(rescorePillars(input));
}

/** Count non-info findings by severity for scoring. */
export function severityCounts(findings: GroundedFinding[]): { warnings: number; errors: number; infos: number } {
  return {
    warnings: findings.filter(f => f.severity === 'warning').length,
    errors: findings.filter(f => f.severity === 'error').length,
    infos: findings.filter(f => f.severity === 'info').length,
  };
}
