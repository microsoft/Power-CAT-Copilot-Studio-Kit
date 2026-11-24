/**
 * How one artifact review becomes a row in the shared `cat_agentreviews` table.
 *
 * Split out of `artifactReviewStore` so a host without the generated Dataverse client can still
 * write a review in exactly this shape. The store owns the requests; this owns the mapping, and
 * keeping them apart is what stops a second host from hand-writing `cat_agenttype`, the status
 * codes and the score column and then drifting the first time one of them changes here.
 *
 * Pure. No Dataverse client, no host state.
 */

import { AGENT_TYPE } from '../../declarative-agent/contracts/constants';
import type { ArtifactReviewResult, TargetRuntime } from '../contracts/ArtifactReview';
import { ARTIFACT_EVALUATOR_VERSION, isAssessedStatus } from '../contracts/ArtifactReview';
import { overallScoreOf } from './artifactScore';

/**
 * Identity of a review.
 *
 * The same bytes judged against a different set of runtimes is a different
 * answer, so the runtime selection is part of the key. Sorting makes the order
 * the user ticked the boxes irrelevant.
 */
export function artifactReviewKey(hash: string, runtimes: readonly TargetRuntime[]): string {
  return `v${ARTIFACT_EVALUATOR_VERSION}:${hash}:${[...runtimes].sort().join(',')}`;
}

/** Identity of a completed review. */
export function keyForResult(result: ArtifactReviewResult): string {
  return artifactReviewKey(result.artifactHash, result.selectedRuntimes);
}

/**
 * `cat_reviewstatus` option-set codes, shared with the Copilot Studio and M365
 * tabs. Defined by the existing Dataverse choice column, so no schema change is
 * needed to store a running review.
 */
export const REVIEW_STATUS_CODE: Record<ArtifactReviewResult['status'], number> = {
  complete: 335350000,
  partial: 335350000,
  'in-progress': 335350001,
  failed: 335350002,
  // Never written: `isStorable` rejects it. Present so the map stays total.
  cancelled: 335350002,
};

/**
 * Build the flat Dataverse columns for one review.
 *
 * Separate from `saveArtifactReview` because the sweep writes the same
 * shape to a row whose id it already knows, and should not have to look that id
 * up a second time to reuse this mapping.
 */
export function buildReviewRecord(result: ArtifactReviewResult, key: string) {
  // A row that has not been assessed has no score and no final finding count.
  // Writing 0 would be read as "scored zero", which is a verdict rather than
  // the absence of one, so the flat columns are cleared instead.
  //
  // Cleared with `null`, never `''`. Both columns are whole numbers in
  // Dataverse, and an empty string is not one, so it rejects the entire write.
  // That is what made reserving invisible: every reserved row failed to save,
  // and the review appeared only once it finished and had real numbers to send.
  const assessed = isAssessedStatus(result.status);

  return {
    cat_name: `${result.artifactName} - ${result.reviewedAt.split('T')[0]}`,
    cat_componentidunique: key,
    cat_agentname: result.artifactName,
    cat_agenttype: AGENT_TYPE.SKILL_OR_AUTOMATION,
    cat_sourcetype: 'upload',
    cat_overallscore: assessed ? String(overallScoreOf(result)) : null,
    cat_totalissues: assessed ? String(result.findings.length) : null,
    cat_reviewdate: result.reviewedAt,
    cat_reviewstatus: REVIEW_STATUS_CODE[result.status],
    cat_reviewresultjson: JSON.stringify(result),
  } satisfies Partial<Record<string, unknown>>;
}
