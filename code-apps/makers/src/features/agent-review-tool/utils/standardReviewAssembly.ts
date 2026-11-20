/**
 * standardReviewAssembly
 *
 * Turns a Stage A snapshot plus a completed workflow evaluation into the `ReviewResult` a standard
 * review is stored and displayed as.
 *
 * This is the whole of the standard rubric that sits *after* the workflow: which deterministic
 * patterns join the AI ones, how the two scores are derived and declared applicable, how findings
 * are counted by severity, and how each stage is summarized. It is pure, and it is deliberately not
 * in `useReviewMutation` — a second host runs the same review against its own job rows, and a copy
 * of this arithmetic living beside that host is exactly how two tools start disagreeing about the
 * same agent.
 */
import type { ReviewAgentMapTarget, ReviewResult } from '../contracts/ReviewResult';
import type {
  InstructionEvaluation, LocalStageAOutput, Pattern, PatternEvaluation,
} from '../contracts/StageOutputs';
import type { StandardReviewWorkflowProvenance } from '../contracts/StandardReviewWorkflow';
import type {
  StandardReviewAssessmentIdentity,
  StandardReviewComparableBaseline, StandardReviewConsistencyResult,
} from '../contracts/StandardReviewConsistency';
import { reconcileStandardReviewConsistency } from './standardReviewConsistency';
import type { StandardReviewWorkflowEvaluation } from './standardReviewWorkflowProjection';
import { calculateAssessedScores } from './scoreCalculator';
import { standardCompositeScore } from '../agents-experience/services/standardCompositeScore';
import {
  countReviewFindings, describeAssessmentSummary, summarizePatternAssessments,
  summarizeInstructionAssessments, STANDARD_REVIEW_POLICY_VERSION,
} from './reviewAssessment';

/** A completed workflow run: the projected evaluation plus where it came from. */
export interface StandardReviewWorkflowOutcome extends StandardReviewWorkflowEvaluation {
  workflowProvenance: StandardReviewWorkflowProvenance;
}

/** Who was reviewed. Everything here is carried through to the stored row unchanged. */
export interface StandardReviewIdentity {
  botId: string;
  botName: string;
  componentIdUnique: string;
  iconBase64?: string;
  sourceEnvironment: string;
  agentVersion?: string;
  /** Connected-agent map targets, resolved by the caller against the parsed bot list. */
  connectedAgentTargets?: ReviewAgentMapTarget[];
  /**
   * Content hash of the rule inputs, used to tell a real agent change apart from an evaluator
   * changing its mind. Built by the caller because hashing is asynchronous.
   */
  assessmentIdentity?: StandardReviewAssessmentIdentity;
}

/** Everything the assembly needs that is neither the agent nor the workflow run. */
export interface StandardReviewAssemblyOptions {
  /** Completion time; injectable so a test is not clock-dependent. */
  reviewedOn?: Date;
  /**
   * The last comparable review, when one exists. Supplied by the caller because fetching it is
   * asynchronous and this function is not; given one, the audit runs here so that it lands
   * between the pattern merge and the scoring.
   */
  consistencyBaseline?: StandardReviewComparableBaseline;
}

/**
 * Replace every own property of `target` with the snapshot's, in place.
 *
 * A rollback here cannot reassign the objects — the caller holds the same references and the
 * assembly's whole contract is that it mutates them — so it has to restore their contents.
 */
function restoreInPlace(target: Record<string, unknown>, snapshot: Record<string, unknown>): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, snapshot);
}

/**
 * Run the consistency audit, dropping the comparison rather than the review if it cannot complete.
 *
 * The audit overrules a verdict by writing the baseline's decision back over the current one, in
 * place and one rule at a time, so a throw part-way through would leave the two stage outputs
 * half-reconciled and the scoring below would read that mixture. Both are snapshotted first and
 * restored on failure, which makes the degraded path identical to having had no baseline at all —
 * the state this same review would have been in a moment before the first baseline was ever saved.
 *
 * `JSON` is the right clone rather than `structuredClone`: these objects reach storage through
 * exactly this round trip, so anything it could not carry is already absent by construction.
 */
function reconcileConsistencyOrDrop(
  patterns: PatternEvaluation,
  instructions: InstructionEvaluation,
  currentIdentity: StandardReviewAssessmentIdentity | undefined,
  baseline: StandardReviewComparableBaseline | undefined,
): StandardReviewConsistencyResult | undefined {
  if (!baseline || !currentIdentity) return undefined;
  const patternsSnapshot = JSON.parse(JSON.stringify(patterns)) as Record<string, unknown>;
  const instructionsSnapshot = JSON.parse(JSON.stringify(instructions)) as Record<string, unknown>;
  try {
    return reconcileStandardReviewConsistency({
      currentIdentity,
      currentPatterns: patterns,
      currentInstructions: instructions,
      baseline,
    });
  } catch (error) {
    restoreInPlace(patterns as unknown as Record<string, unknown>, patternsSnapshot);
    restoreInPlace(instructions as unknown as Record<string, unknown>, instructionsSnapshot);
    console.warn(
      '[StandardReview] Consistency audit skipped; this review is complete and unaffected.',
      error,
    );
    return undefined;
  }
}

/**
 * Build the stored review from a finished workflow run.
 *
 * The evaluation's two stage outputs are mutated in place, as the original inline version did: the
 * same objects are serialized into the result, so rewriting them and then stringifying is what
 * puts the reconciled patterns and assessed scores into storage.
 *
 * @param stageAOutput - The deterministic snapshot the workflow was given.
 * @param workflow - The projected workflow evaluation and its provenance.
 * @param identity - The agent under review.
 * @param durationMs - How long the whole review took, measured by the caller.
 * @param options - Completion time and the consistency baseline, both caller-supplied.
 */
export function assembleStandardReviewResult(
  stageAOutput: LocalStageAOutput,
  workflow: StandardReviewWorkflowOutcome,
  identity: StandardReviewIdentity,
  durationMs: number,
  options: StandardReviewAssemblyOptions = {},
): ReviewResult {
  const { reviewedOn = new Date(), consistencyBaseline } = options;
  const stageBOutput = workflow.patternEvaluation;
  const stageCOutput = workflow.instructionEvaluation;

  // The deterministic Stage A rules belong in Stage B's list and in the same denominator, or the
  // score would ignore the checks this tool is most confident about.
  const localAsPatterns: Pattern[] = stageAOutput.localPatterns.map((lp) => ({
    PatternId: lp.patternId,
    PatternName: lp.patternName,
    PatternDescription: lp.description,
    Description: lp.description,
    Recommendation: lp.recommendation,
    Status: lp.status,
    AssessmentStatus: lp.assessmentStatus,
    AssessmentReason: lp.assessmentReason,
    EvidenceKind: lp.evidenceKind,
    Topics: lp.affectedItems ?? lp.topics.map((t) => ({ item: t })),
    Category: lp.category,
    Severity: lp.severity,
  }));
  if (!Array.isArray(stageBOutput.Patterns)) {
    throw new Error('No readable pattern assessment was returned.');
  }
  const localNames = new Set(localAsPatterns.map(p => p.PatternName));
  stageBOutput.Patterns = [
    ...stageBOutput.Patterns.filter(p => !localNames.has(p.PatternName)),
    ...localAsPatterns,
  ];

  stageBOutput.policyVersion = STANDARD_REVIEW_POLICY_VERSION;
  stageCOutput.policyVersion = STANDARD_REVIEW_POLICY_VERSION;

  // The consistency audit sits here, and the position is load-bearing in both directions.
  // `collectOutcomes` walks `stageBOutput.Patterns`, so it must run *after* the merge above or
  // every deterministic `local-pattern-*` rule reads as absent and the whole review looks changed.
  // It must also run *before* the scoring below, because an evaluator that changed its mind about
  // a rule whose input is unchanged is overruled: the audit restores the baseline verdict onto
  // these same outcome objects, and the scores are then taken from the restored set.
  //
  // The overrule covers a *changed verdict* only. A rule the evaluator previously decided and has
  // now gone quiet on comes back `not-assessed`, which is not a completed outcome, so it is left
  // standing and still moves the score on an otherwise unchanged agent. Widening that is a change
  // to the audit's semantics rather than to this call site.
  //
  // It is wrapped because the audit must never destroy the review it describes. The fetch-side
  // `policyHash` gate makes the two policy assertions unreachable, but the audit also asserts that
  // a rule carrying an outcome carries an input hash — and the two sets have different provenance.
  // Hash keys come from the corpus the agent's current shape produces; outcome keys come from the
  // saved verdicts. An agent that gains or loses a whole population between reviews can therefore
  // present an outcome with no matching hash under an identical policy, and that throw would land
  // *after* the credit-bearing workflow run, failing a completed review to report a problem with
  // an older one. Losing the comparison is the correct price; losing the review is not.
  const consistency = reconcileConsistencyOrDrop(
    stageBOutput, stageCOutput, identity.assessmentIdentity, consistencyBaseline,
  );

  // Scores are calculated only after the merged results carry their assessment policy.
  const scores = calculateAssessedScores({
    patternEvaluation: stageBOutput,
    instructionEvaluation: stageCOutput,
  });
  // The headline is the six-pillar composite, graded off the rule registry by the same scorer the
  // copilot harness uses. `scores` still produces the pattern and instruction sub-scores the
  // existing tabs read; it no longer decides the overall number, which is what made a standard
  // agent's score incomparable with a copilot agent's.
  const composite = standardCompositeScore(
    stageAOutput, stageAOutput.evaluationEvidence, stageBOutput, stageCOutput,
  );
  const { highSeverityCount, mediumSeverityCount, lowSeverityCount, totalIssueCount } =
    countReviewFindings(stageBOutput.Patterns, stageCOutput);
  stageBOutput.originalSummary ??= stageBOutput.Summary;
  stageCOutput.originalSummary ??= stageCOutput.summary;
  stageBOutput.Summary = describeAssessmentSummary(
    summarizePatternAssessments(stageBOutput.Patterns), 'pattern categories');
  stageCOutput.summary = describeAssessmentSummary(
    summarizeInstructionAssessments(stageCOutput), 'instruction criteria');
  stageBOutput.scoreAvailable = scores.patternScore !== null;
  stageCOutput.scoreAvailable = scores.instructionScore !== null;
  stageBOutput.PatternCompliancePercentage = scores.patternScore ?? undefined;
  stageCOutput.compliancePercentage = scores.instructionScore ?? 0;
  stageCOutput.compliance = scores.instructionScore === null
    ? undefined
    : scores.instructionScore >= 60;

  const overallScore = composite.composite ?? 0;
  const patternScore = scores.patternScore ?? 0;
  const instructionScore = scores.instructionScore ?? 0;
  if (consistency && consistencyBaseline) {
    // The delta reports the six-pillar composite the UI shows, not the legacy 50/50 blend.
    //
    // A withheld score is carried through as `null` rather than as the `0` the persisted fields
    // above use. Those fields have `*ScoreApplicable` flags beside them to say which zeros are
    // real; a delta has no such companion, so substituting `0` here would be indistinguishable
    // from a measured zero and would publish a swing the agent never made — a phantom collapse
    // when the current score is withheld, and a phantom recovery when the baseline's was.
    const difference = (current: number | null, previous: number | null) =>
      current === null || previous === null ? null : current - previous;
    const current = {
      overallScore: composite.composite,
      patternScore: scores.patternScore,
      instructionScore: scores.instructionScore,
    };
    consistency.scoreDelta = {
      previous: consistencyBaseline.scores,
      current,
      overall: difference(current.overallScore, consistencyBaseline.scores.overallScore),
      pattern: difference(current.patternScore, consistencyBaseline.scores.patternScore),
      instruction: difference(
        current.instructionScore, consistencyBaseline.scores.instructionScore),
    };
  }

  return {
    botId: identity.botId,
    componentIdUnique: identity.componentIdUnique,
    botName: identity.botName,
    iconBase64: identity.iconBase64,
    connectedAgentTargets: identity.connectedAgentTargets,
    assessmentIdentity: identity.assessmentIdentity,
    consistency,
    sourceEnvironment: identity.sourceEnvironment,
    agentVersion: identity.agentVersion,
    reviewKind: 'standard',
    overallScore,
    patternScore,
    instructionScore,
    overallScoreApplicable: composite.composite !== null,
    patternScoreApplicable: scores.patternScore !== null,
    instructionScoreApplicable: scores.instructionScore !== null,
    scorePillars: composite.pillars,
    scoreStatus: composite.status,
    ruleResults: composite.ruleResults,
    assessmentPolicyVersion: STANDARD_REVIEW_POLICY_VERSION,
    workflowProvenance: workflow.workflowProvenance,
    highSeverityCount,
    mediumSeverityCount,
    lowSeverityCount,
    totalIssueCount,
    patternTotalCount: stageBOutput.Patterns.length,
    reviewedOn,
    durationMs,
    // `evaluationEvidence` is transport from the component read to the scorer above, not part of
    // the snapshot contract: dropping it here keeps the persisted Stage A payload byte-identical
    // to what every existing reader already parses.
    stageAOutput: JSON.stringify({ ...stageAOutput, evaluationEvidence: undefined }),
    stageBOutput: JSON.stringify(stageBOutput),
    stageCOutput: JSON.stringify(stageCOutput),
    patternSummary: stageBOutput.Summary,
    complianceSummary: stageCOutput.summary,
    agentInstructions: stageAOutput.agentInstructions || '',
    status: 'completed',
  };
}
