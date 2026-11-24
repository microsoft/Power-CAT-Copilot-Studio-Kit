import type { Cat_agentreviewsesBase } from '../../../generated/models/Cat_agentreviewsesModel';
import type { ReviewResult } from '../contracts/ReviewResult';
import { getCopilotReviewCompletion } from '../agents-experience/services/copilotReviewCompletion';

/**
 * A copilot run that did not finish is both persisted and returned as Failed, so the caller's
 * in-memory result agrees with the row that was written.
 */
export function deriveReviewFailure(review: ReviewResult): { failed: boolean; errorMessage?: string } {
  const reviewKind = review.reviewKind ?? (review.agentsExperience ? 'copilot' : 'standard');
  const completion = reviewKind === 'copilot' && review.agentsExperience
    ? getCopilotReviewCompletion(review.agentsExperience)
    : undefined;
  return {
    failed: reviewKind === 'copilot'
      && (review.status === 'failed' || completion?.status === 'failed'),
    errorMessage: review.errorMessage ?? completion?.errorMessage,
  };
}

/** Serialize the existing immutable review-row contract independently of its persistence transport. */
export function serializeReviewRecord(review: ReviewResult, now = new Date()): Partial<Cat_agentreviewsesBase> {
  const reviewKind = review.reviewKind ?? (review.agentsExperience ? 'copilot' : 'standard');
  // A run that did not finish is stored as Failed, so history never presents it as a completed
  // review carrying a score the run never measured.
  const { failed, errorMessage } = deriveReviewFailure(review);
  const hasDetailedResult = !!review.stageBOutput || !!review.stageCOutput || !!review.agentsExperience
    || !!review.workflowProvenance || !!review.assessmentIdentity || !!review.consistency
    || !!review.iconBase64 || !!review.connectedAgentTargets?.length
    // A deterministic-only review — one saved because the AI workflow was unreachable — carries no
    // stage B, no workflow provenance and no copilot payload. Its pillars are the only detail it
    // has, so without this the rail would be scored and then dropped, reading back on reopen as
    // "no pillars applied" rather than "the pillars that could be measured".
    || !!review.scorePillars?.length || !!review.ruleResults?.length || !!review.scoreStatus
    || (failed && !!errorMessage);
  const reviewResultJson = hasDetailedResult ? JSON.stringify({
    botId: review.botId, botName: review.botName, iconBase64: review.iconBase64 ?? undefined,
    connectedAgentTargets: review.connectedAgentTargets ?? undefined,
    stageA: review.stageAOutput ? JSON.parse(review.stageAOutput) : undefined,
    patternEvaluation: review.stageBOutput ? JSON.parse(review.stageBOutput) : undefined,
    instructionEvaluation: review.stageCOutput ? JSON.parse(review.stageCOutput) : undefined,
    agentInstructions: review.agentInstructions ?? '', agentsExperience: review.agentsExperience ?? undefined,
    workflowProvenance: review.workflowProvenance ?? undefined,
    assessmentIdentity: review.assessmentIdentity ?? undefined,
    consistency: review.consistency ?? undefined,
    overallScore: review.overallScore, overallScoreApplicable: review.overallScoreApplicable,
    patternScoreApplicable: review.patternScoreApplicable,
    instructionScoreApplicable: review.instructionScoreApplicable,
    assessmentPolicyVersion: review.assessmentPolicyVersion,
    scorePillars: review.scorePillars ?? undefined,
    scoreStatus: review.scoreStatus ?? undefined,
    ruleResults: review.ruleResults ?? undefined,
    mediumSeverityCount: review.mediumSeverityCount, lowSeverityCount: review.lowSeverityCount,
    durationMs: review.durationMs, agentVersion: review.agentVersion,
    ...(failed ? { errorMessage } : {}),
    timestamp: review.reviewedOn.toISOString(),
  }) : undefined;
  return {
    cat_agenttype: 1, cat_botid: review.botId, cat_botname: review.botName,
    cat_componentidunique: review.componentIdUnique,
    cat_name: `${review.botName} - ${now.toISOString().split('T')[0]}`,
    ...(review.overallScoreApplicable === false ? {} : { cat_overallscore: String(review.overallScore) }),
    // A score the run could not assess is left unwritten rather than stored as 0, which would read
    // back as a measured failure instead of an absent measurement.
    ...(review.patternScoreApplicable === false ? {} : { cat_patternscore: String(review.patternScore) }),
    ...(review.instructionScoreApplicable === false
      ? {} : { cat_instructionscore: String(review.instructionScore) }),
    cat_totalissues: String(review.totalIssueCount), cat_highseverityissues: String(review.highSeverityCount),
    cat_reviewdate: review.reviewedOn.toISOString(),
    cat_reviewstatus: failed ? 335350002 : 335350000,
    cat_sourceenvironment: review.sourceEnvironment ?? '', cat_sourcetype: reviewKind,
    ...(review.agentVersion ? { cat_agentversion: review.agentVersion } : {}),
    ...(reviewResultJson ? { cat_reviewresultjson: reviewResultJson } : {}),
  };
}
