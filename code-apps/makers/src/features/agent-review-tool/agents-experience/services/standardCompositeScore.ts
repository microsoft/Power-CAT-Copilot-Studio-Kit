/**
 * standardCompositeScore
 *
 * The standard harness' headline score, computed by the same scorer the copilot harness uses.
 *
 * Until this existed a standard agent's overall score was the mean of two numbers produced by a
 * rubric of its own — `calculateAssessedScores`, which weighs severity points — while a copilot
 * agent's came from six weighted pillars graded off the rule registry. The same agent could not be
 * compared across the two, and a rule added to the registry changed one tool's score and not the
 * other's. This assembles the four inputs `computeGroundedScore` needs and calls it, so "one
 * scorer" is literally true rather than a convention.
 *
 * Nothing here decides anything a rule could decide. The pillar weights come from the registry, the
 * pillar of each row comes from the rule that produced it, and the credit arithmetic is
 * `scoring.ts`'s. What this file owns is only the mapping from a finished standard review onto
 * `GroundedScoreInput`.
 *
 * `findings` is deliberately empty. It is read by exactly one thing — the legacy
 * `deriveEvaluationSignals` shim used when re-scoring a saved review that has no model — and the
 * live path reads the model instead. Passing the standard review's patterns here would not add
 * evidence; it would resurrect the circular dependency where EVL-04's previous output decided
 * EVL-04's next input.
 */
import type { InstructionEvaluation, PatternEvaluation } from '../../contracts/StageOutputs';
import type { NormalizedEvaluationEvidence } from '../contracts/EvaluationEvidence';
import type { RuleEvaluationResult } from '../contracts/Findings';
import { LEGACY_PILLAR_NAME, UNCONDITIONAL_AGENT_PILLARS } from '../../review-core';
import { computeCoverage } from './EvaluationCoverageService';
import {
  computeGroundedScore, computePillarBreakdown,
  type GroundedScoreInput, type PillarBreakdown,
} from './scoring';
import {
  standardAgentsExperienceModel, standardCoverageModel, type StandardAgentSource,
} from './standardModelProjection';
import { standardRuleResults } from './standardRuleResults';

/** The composite and everything needed to show how it was reached. */
export interface StandardCompositeScore {
  /** 0-100, or null when no pillar could be measured at all. */
  composite: number | null;
  pillars: PillarBreakdown[];
  ruleResults: RuleEvaluationResult[];
  /**
   * 'partial' when some part of this score rests on evidence that could not be fully read — either
   * a rule instance that failed to evaluate, or evaluation evidence the capture never contained.
   * It qualifies the number; it does not replace it.
   */
  status: 'complete' | 'partial';
}

/**
 * Score a finished standard review.
 *
 * @param source - The Stage A snapshot, or any parsed standard agent.
 * @param evidence - Normalized evaluation evidence. `undefined` means the capture carried none,
 *   which is treated the same as evidence that reports itself unavailable: the agent is still
 *   scored, because a standard agent with no tests is exactly the case the Evaluation pillar exists
 *   to report, but the result is disclosed as partial so the number is never read as a confirmed
 *   absence of tests.
 * @param patternEvaluation - The merged deterministic + workflow pattern assessment.
 * @param instructionEvaluation - The instruction-criteria assessment.
 */
export function standardCompositeScore(
  source: StandardAgentSource,
  evidence?: NormalizedEvaluationEvidence,
  patternEvaluation?: PatternEvaluation,
  instructionEvaluation?: InstructionEvaluation,
): StandardCompositeScore {
  const readable = evidence && evidence.availability !== 'unavailable' ? evidence : undefined;
  const model = standardAgentsExperienceModel(source, readable);
  const coverage = computeCoverage(standardCoverageModel(source, readable));
  const ruleResults = standardRuleResults(patternEvaluation, instructionEvaluation);

  const input: GroundedScoreInput = {
    model,
    findings: [],
    ruleResults,
    coverage: { covered: coverage.covered, total: coverage.total, basis: coverage.basis },
  };

  const pillars = computePillarBreakdown(input);
  const evidenceComplete = readable !== undefined && readable.availability === 'complete';
  const status = pillars.every(pillar => pillar.complete) && evidenceComplete
    ? 'complete' as const
    : 'partial' as const;

  return { composite: compositeOrNull(pillars, input), pillars, ruleResults, status };
}

/**
 * The composite, unless the only pillar left standing is the one that needs no review.
 *
 * Evaluation is the one pillar that holds its full 30 points whether or not anything else was
 * measured (`UNCONDITIONAL_AGENT_PILLARS`), and it is scored from the agent's own components, so it
 * produces a number even when the AI assessment returned nothing usable. When every other pillar
 * comes back without a verdict, `compositeFromBreakdown` has no conditional weight left to
 * renormalize against and simply publishes the Evaluation pillar as the whole score — a standard
 * agent whose workflow returned a bare result would be stamped 0 as though it had been examined and
 * failed, which is the manufactured-score behaviour this refactor exists to remove.
 *
 * "This agent has no tests" is a true statement about one pillar, not a grade for six. So the
 * number is withheld rather than reshaped: the shared arithmetic stays exactly as the copilot
 * harness and the golden tests pin it. `patternScore` and `instructionScore` are still persisted,
 * so whatever the run did observe survives; only the claim to a whole-agent score is dropped.
 *
 * To revert to publishing the Evaluation-only number, return `computeGroundedScore(input)`.
 */
function compositeOrNull(
  pillars: readonly PillarBreakdown[],
  input: GroundedScoreInput,
): number | null {
  const measuredConditional = pillars.some(
    pillar => !PINNED.includes(pillar.pillar) && pillar.applicable && pillar.score !== null,
  );
  return measuredConditional ? computeGroundedScore(input) : null;
}

/**
 * The pillars `compositeFromBreakdown` charges in full whether or not they were measured, read
 * from the same `review-core` declaration that scorer reads so the two cannot drift apart.
 */
const PINNED: readonly string[] = UNCONDITIONAL_AGENT_PILLARS.map(p => LEGACY_PILLAR_NAME[p]);
