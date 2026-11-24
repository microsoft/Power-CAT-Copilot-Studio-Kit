/**
 * How one declarative-agent review becomes a row in the shared `cat_agentreviews` table.
 *
 * Split out of `DAReviewService` so a host without the generated Dataverse client can still write a
 * DA review in exactly this shape. The service owns the requests — the dedupe query, the create and
 * the update — and this owns the mapping. Keeping them apart is what stops a second host from
 * hand-writing `cat_agenttype`, the status code, the score column or the issue count and then
 * drifting the first time one of them changes here.
 *
 * It is the same split, for the same reason, as `artifactReviewRecord` against `artifactReviewStore`
 * on the skills path, and `daReviewJobContract` against `DAReviewJobService` on the job path.
 *
 * Pure. No Dataverse client, no host state.
 */

import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import { AGENT_TYPE } from '../contracts/constants';
import { redactSecrets } from '../../agents-experience/services/skill/resourceScanners';
import { compactPersistedSkillReviewsInPayload } from '../../agents-experience/services/skill/persistedSkillReview';

/** The half of a review that travels inside `cat_reviewresultjson` rather than as a flat column. */
export type DAStoredReviewData = Pick<
  DAReviewRecord,
  | 'manifest'
  | 'manifestHealth'
  | 'evaluation'
  | 'packageValidation'
  | 'evidence'
  | 'workflowProvenance'
  | 'customSkillReviews'
  | 'customSkillOrchestration'
  | 'customSkillIssues'
>;

export const DA_REVIEW_PERSISTENCE_LIMIT = 900_000;

/** `cat_reviewstatus` for a review that ran to completion. The same code the other tabs write. */
export const DA_REVIEW_STATUS_COMPLETED = 335350000;

const SENSITIVE_KEY =
  /(?:authorization|token|secret|password|api[_-]?key|client[_-]?secret|connection[_-]?string)/i;

function sanitizeForPersistence(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'string') return redactSecrets(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const sanitized = Array.isArray(value)
    ? value.map(item => sanitizeForPersistence(item, seen))
    : Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          SENSITIVE_KEY.test(key)
            ? '[REDACTED]'
            : sanitizeForPersistence(child, seen),
        ]),
      );
  seen.delete(value);
  return sanitized;
}

/**
 * The issue count the grid and the stat cards read without opening the JSON blob.
 *
 * Every arm is optional because a review may have run only some of them: a package that carries no
 * skill bundles has no custom-skill reviews, and a review whose workflow was never reached has no
 * evaluation. Each absent arm contributes nothing rather than failing the count.
 */
export function countReviewIssues(data: DAReviewRecord): number {
  const evaluationIssueCount = data.evaluation
    ? [
        data.evaluation.instructionsCriterion,
        data.evaluation.knowledgeCriterion,
        data.evaluation.capabilitiesCriterion,
        data.evaluation.actionsCriterion,
        data.evaluation.conversationStartersCriterion,
        data.evaluation.gracefulErrorHandlingCriterion,
      ].reduce((sum, criterion) => sum + (criterion?.issues.length ?? 0), 0)
    : 0;
  const packageIssueCount = data.packageValidation?.findings.filter(
    (finding) => finding.status === 'Fail' || finding.status === 'Warning',
  ).length ?? 0;
  const customSkillIssueCount = data.customSkillReviews?.reduce(
    (sum, review) => sum + review.findings.length,
    0,
  ) ?? 0;
  const orchestrationIssueCount = data.customSkillOrchestration?.findings.length ?? 0;
  const customSkillPipelineIssueCount = data.customSkillIssues?.filter(
    (issue) => issue.severity !== 'info',
  ).length ?? 0;
  return evaluationIssueCount +
    packageIssueCount +
    customSkillIssueCount +
    orchestrationIssueCount +
    customSkillPipelineIssueCount;
}

/** Serializes the backward-compatible JSON payload stored on the review row. */
export function serializeDAReviewResult(
  data: DAReviewRecord,
  maxChars = DA_REVIEW_PERSISTENCE_LIMIT,
): string {
  const result = sanitizeForPersistence({
    manifest: data.manifest,
    manifestHealth: data.manifestHealth,
    evaluation: data.evaluation,
    packageValidation: data.packageValidation,
    evidence: data.evidence,
    workflowProvenance: data.workflowProvenance,
    customSkillReviews: data.customSkillReviews,
    customSkillOrchestration: data.customSkillOrchestration,
    customSkillIssues: data.customSkillIssues,
  }) as DAStoredReviewData;
  const compactionIssues = compactPersistedSkillReviewsInPayload(
    result,
    result.customSkillReviews ?? [],
    Math.max(0, maxChars - 1_000),
  );
  if (compactionIssues.length > 0) {
    result.customSkillIssues = [
      ...(result.customSkillIssues ?? []),
      ...compactionIssues,
    ];
  }
  const serialized = JSON.stringify(result);
  if (serialized.length > maxChars) {
    throw new Error('Declarative review result exceeds the Dataverse persistence limit');
  }
  return serialized;
}

/** Parses both legacy and current review payloads. */
export function parseDAReviewResult(jsonText: string | undefined): DAStoredReviewData {
  if (!jsonText) return {};
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  return {
    manifest: parsed.manifest as DAReviewRecord['manifest'],
    manifestHealth: parsed.manifestHealth as DAReviewRecord['manifestHealth'],
    evaluation: parsed.evaluation as DAReviewRecord['evaluation'],
    packageValidation: parsed.packageValidation as DAReviewRecord['packageValidation'],
    evidence: parsed.evidence as DAReviewRecord['evidence'],
    workflowProvenance: parsed.workflowProvenance as DAReviewRecord['workflowProvenance'],
    customSkillReviews: parsed.customSkillReviews as DAReviewRecord['customSkillReviews'],
    customSkillOrchestration:
      parsed.customSkillOrchestration as DAReviewRecord['customSkillOrchestration'],
    customSkillIssues: parsed.customSkillIssues as DAReviewRecord['customSkillIssues'],
  };
}

/**
 * Build the flat Dataverse columns for one DA review.
 *
 * `reviewedAt` is a parameter rather than read from the clock inside, so the name and the review
 * date are stamped from one instant: taking "now" twice lets a review started a microsecond before
 * midnight record a date that disagrees with the day in its own name.
 *
 * A withheld score is written as `null`, never `0`. The column is a whole number in Dataverse, so
 * an empty string rejects the entire write, and a zero would be read back as a verdict rather than
 * as the absence of one.
 */
export function buildDAReviewRecord(
  data: DAReviewRecord,
  reviewedAt: string = new Date().toISOString(),
) {
  return {
    cat_name: `${data.agentName} - ${reviewedAt.split('T')[0]}`,
    cat_componentidunique: data.componentIdUnique,
    cat_overallscore: data.overallScore === null ? null : String(data.overallScore),
    cat_totalissues: String(countReviewIssues(data)),
    cat_reviewdate: reviewedAt,
    cat_reviewstatus: DA_REVIEW_STATUS_COMPLETED,
    cat_agentname: data.agentName,
    cat_agentversion: data.agentVersion,
    cat_publishername: data.publisherName,
    cat_sourcetype: data.sourceType,
    cat_agenttype: AGENT_TYPE.M365_DECLARATIVE_AGENT,
    cat_reviewresultjson: serializeDAReviewResult(data),
  } satisfies Partial<Record<string, unknown>>;
}
