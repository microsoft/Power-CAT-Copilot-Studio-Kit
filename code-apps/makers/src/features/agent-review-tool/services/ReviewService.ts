import { readStandardReviewMetadata, readStoredScore } from '../utils/standardReviewStorage';

/**
 * ReviewService
 *
 * Wraps Cat_agentreviewsesService with business logic for managing review records.
 * Implements IReviewService interface from ServiceContracts.ts
 *
 * Key features:
 * - CRUD operations for review results
 * - Deduplication logic using cat_componentidunique
 * - File uploads for JSON and PDF (using Dataverse Web API)
 * - Dashboard statistics calculation
 */

import { Cat_agentreviewsesService } from '../../../generated/services/Cat_agentreviewsesService';
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import type { Cat_agentreviewsesBase, Cat_agentreviewses } from '../../../generated/models/Cat_agentreviewsesModel';
import type {
  ReviewResult,
  ReviewGridRow,
  DashboardStats,
  BotMetadata,
  PersistedCopilotReviewPayload,
  ReviewHistorySubject,
  ReviewKind,
  ReviewScoreState,
  ReviewAgentMapTarget,
} from '../contracts/ReviewResult';
import type { IReviewService } from '../contracts/ServiceContracts';
import type { LocalStageAOutput } from '../contracts/StageOutputs';
import { deriveReviewFailure, serializeReviewRecord } from './reviewRecordSerializer';
import type {
  StandardReviewCandidateNormalization,
  StandardReviewValidationDiagnostics,
  StandardReviewWorkflowProvenance,
  RejectedStandardReviewCandidate,
} from '../contracts/StandardReviewWorkflow';
import type {
  StandardReviewAssessmentIdentity,
  StandardReviewComparableBaseline,
  StandardReviewConsistencyResult,
} from '../contracts/StandardReviewConsistency';
import { parsePersistedCopilotPayload } from '../agents-experience/utils/persistedCopilotReviewGuard';
import { getCopilotReviewCompletion } from '../agents-experience/services/copilotReviewCompletion';
import {
  getReviewFreshness,
  selectLatestReviews,
  sortReviewsNewestFirst,
} from '../utils/reviewHistory';
import {
  parseStandardReviewAssessmentIdentity,
  parseStandardReviewConsistencyResult,
} from '../utils/standardReviewConsistency';

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function isRejectedCandidate(value: unknown): value is RejectedStandardReviewCandidate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.unitId === 'string'
    && (row.ruleId === undefined || typeof row.ruleId === 'string')
    && typeof row.reason === 'string'
    && (row.outcomeImpact === 'incomplete' || row.outcomeImpact === 'omitted');
}

function isCandidateNormalization(value: unknown): value is StandardReviewCandidateNormalization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.unitId === 'string'
    && (row.ruleId === undefined || typeof row.ruleId === 'string')
    && row.field === 'findingTitle'
    && typeof row.originalLength === 'number'
    && Number.isInteger(row.originalLength)
    && row.originalLength >= 0
    && typeof row.normalizedLength === 'number'
    && Number.isInteger(row.normalizedLength)
    && row.normalizedLength >= 0
    && row.normalizedLength <= row.originalLength
    && typeof row.reason === 'string';
}

function parseValidationDiagnostics(
  value: unknown,
): StandardReviewValidationDiagnostics | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.rejectedCandidates) || !Array.isArray(row.normalizations)) {
    return undefined;
  }

  const rejectedCandidates = row.rejectedCandidates.filter(isRejectedCandidate);
  const normalizations = row.normalizations.filter(isCandidateNormalization);
  if (rejectedCandidates.length !== row.rejectedCandidates.length
    || normalizations.length !== row.normalizations.length) {
    return undefined;
  }

  return { rejectedCandidates, normalizations };
}

function parseWorkflowProvenance(
  value: unknown,
): StandardReviewWorkflowProvenance | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.jobId !== 'string'
    || typeof row.correlationId !== 'string'
    || typeof row.reviewPolicyVersion !== 'string'
    || typeof row.retrievedAt !== 'string'
    || typeof row.rejectedCandidateCount !== 'number'
    || !Array.isArray(row.units)) return undefined;
  const units = row.units.filter((item): item is StandardReviewWorkflowProvenance['units'][number] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const unit = item as Record<string, unknown>;
    return typeof unit.componentIndex === 'number'
      && typeof unit.unitId === 'string'
      && (unit.status === 'succeeded' || unit.status === 'missing')
      && typeof unit.findingCount === 'number'
      && typeof unit.notAssessedCount === 'number';
  });
  if (units.length !== row.units.length) return undefined;

  const validationDiagnostics = parseValidationDiagnostics(row.validationDiagnostics);
  return {
    jobId: row.jobId,
    correlationId: row.correlationId,
    reviewPolicyVersion: row.reviewPolicyVersion,
    retrievedAt: row.retrievedAt,
    rejectedCandidateCount: row.rejectedCandidateCount,
    units,
    ...(validationDiagnostics ? { validationDiagnostics } : {}),
  };
}

function parseConnectedAgentTargets(value: unknown): ReviewAgentMapTarget[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const targets = value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.schemaName !== 'string' || !row.schemaName.trim()
      || typeof row.name !== 'string' || !row.name.trim()) return [];
    return [{
      schemaName: row.schemaName,
      name: row.name,
      ...(typeof row.iconBase64 === 'string' && row.iconBase64.trim()
        ? { iconBase64: row.iconBase64 }
        : {}),
    }];
  });
  return targets.length > 0 ? targets : undefined;
}

/**
 * Harness of a saved review when the review row states it (issue 947).
 * The View action routes by this value, so an old review still opens after the agent harness changes.
 */
function savedReviewHarness(review: ReviewResult | undefined): ReviewKind | undefined {
  if (!review) return undefined;
  return review.reviewKind ?? (review.agentsExperience ? 'copilot' : undefined);
}

/**
 * Extended detail fields returned by getReviewDetails.
 * Includes standard stage outputs and, when present, the Microsoft Copilot harness payload.
 */
export interface ReviewDetails {
  reviewId?: string;
  botId?: string;
  stageAOutput?: string;
  stageBOutput?: string;
  stageCOutput?: string;
  patternSummary?: string;
  complianceSummary?: string;
  agentInstructions?: string;
  /** Deserialized Microsoft Copilot harness persisted payload (Task 11 view-only reopening). */
  agentsExperience?: PersistedCopilotReviewPayload;
  /** Connected target identities and logos retained from an uploaded solution. */
  connectedAgentTargets?: ReviewAgentMapTarget[];
  /** Reviewed agent logo retained in the immutable result JSON. */
  iconBase64?: string;
  /** Display name of the reviewer (from Dataverse ownerid lookup). */
  reviewedBy?: string;
  /** Review date ISO string from Dataverse. */
  reviewedOn?: Date;
  /** Duration in milliseconds (if stored in the JSON blob). */
  durationMs?: number;
  /** Bot name from the Dataverse record. */
  botName?: string;
  /** Bot component unique ID from the Dataverse record (for re-run from view mode). */
  componentIdUnique?: string;
  /** Environment URL used by the original review. */
  sourceEnvironment?: string;
  /** Bot publication captured when the review was run. */
  agentVersion?: string;
  /** Persisted review experience, absent on legacy records. */
  reviewKind?: ReviewKind;
  overallScore?: number;
  overallScoreApplicable?: boolean;
  scoreState?: ReviewScoreState;
  patternScore?: number;
  instructionScore?: number;
  patternScoreApplicable?: boolean;
  instructionScoreApplicable?: boolean;
  assessmentPolicyVersion?: string;
  /** The composite breakdown, so a reopened review explains itself by pillar rather than by the
   * superseded pattern/instruction split. Absent on reviews saved before the shared scorer. */
  scorePillars?: ReviewResult['scorePillars'];
  scoreStatus?: ReviewResult['scoreStatus'];
  ruleResults?: ReviewResult['ruleResults'];
  workflowProvenance?: StandardReviewWorkflowProvenance;
  assessmentIdentity?: StandardReviewAssessmentIdentity;
  consistency?: StandardReviewConsistencyResult;
  mediumSeverityCount?: number;
  lowSeverityCount?: number;
  highSeverityCount?: number;
  totalIssueCount?: number;
  hasReviewData?: boolean;
  status?: ReviewResult['status'];
  errorMessage?: string;
}

/**
 * How many of an agent's standard reviews the baseline search will open before giving up.
 *
 * The search reads each candidate's full `cat_reviewresultjson` one row at a time, and the history
 * query is unbounded, so without a cap the cost is the agent's whole review history. That is not a
 * rare path: every rule, weight or severity change moves `policyHash`, so the *first* review of
 * every agent after such a deploy finds no comparable row and would walk the lot before returning
 * nothing. A baseline is only useful if it is recent — a comparison against a review twenty runs
 * back describes an agent that no longer exists — so stopping early costs nothing real.
 */
export const BASELINE_SEARCH_LIMIT = 10;

/**
 * ReviewService implementation
 */
export class ReviewService implements IReviewService {
  /**
   * Get all reviews owned by the current user.
   *
   * Fetches without a botId filter — Dataverse User-level (Basic) read
   * scopes the result to records owned by the calling user automatically.
   * This covers both Dataverse-sourced and ZIP-sourced reviews.
   *
   * @returns Array of all review results for the current user
   */
  async getAllReviews(orgUrl?: string | null): Promise<ReviewResult[]> {
    try {
      // Normalize the environment key — matches what is written at save time.
      // Legacy rows with a blank/null source environment belong to the current
      // environment only; including them while another environment is selected
      // can attach the wrong saved review to a live agent row when bot IDs are
      // stable across environments.
      const envKey = orgUrl?.trim() ?? '';
      const envFilter = envKey
        ? `(cat_sourceenvironment eq '${escapeODataString(envKey)}' or cat_sourceenvironment eq 'zip')`
        : `(cat_sourceenvironment eq '' or cat_sourceenvironment eq null or cat_sourceenvironment eq 'zip')`;
      const typeFilter = `(cat_agenttype eq 1 or cat_agenttype eq null)`;
      const filter = `${typeFilter} and ${envFilter}`;
      // Reviews written by the Architecture Review Tool carry a snapshot lookup. They are real
      // reviews of the same agent, but they belong to that snapshot's timeline, not this dashboard's:
      // included here they would win "latest review" for the agent and replace the maker's own result
      // with one they never ran. They remain visible in the agent's review history.
      //
      // `cat_resultid` ships with the Architecture Review solution, not with this one, so the column
      // is absent wherever only the Kit is installed. Asking for it there is a request error, not an
      // empty result, which is why the unfiltered query stays as the fallback rather than the filter
      // being applied unconditionally.
      const snapshotFilter = `${filter} and _cat_resultid_value eq null`;

      const select = ['cat_agentreviewsid', 'cat_botid', 'cat_botname', 'cat_componentidunique', 'cat_overallscore', 'cat_patternscore', 'cat_instructionscore', 'cat_totalissues', 'cat_highseverityissues', 'cat_reviewdate', 'cat_reviewstatus', 'cat_reviewresultjson', 'cat_reviewpdfreport_name', 'cat_sourceenvironment', 'cat_agentversion', 'cat_sourcetype', 'createdon', '_ownerid_value'];
      const orderBy = ['cat_reviewdate desc', 'createdon desc', 'cat_agentreviewsid desc'];

      let result = await Cat_agentreviewsesService.getAll({ filter: snapshotFilter, select, orderBy });
      if (!result.success) {
        result = await Cat_agentreviewsesService.getAll({ filter, select, orderBy });
      }

      if (!result.success || !result.data) {
        console.error('Failed to fetch reviews:', result.error);
        return [];
      }

      return result.data.map((review) => this.mapReviewRecord(review));
    } catch (error) {
      console.error('Error fetching reviews:', error);
      return [];
    }
  }

  /**
   * Gets completed-review history and saved incomplete Copilot snapshots.
   *
   * The projection intentionally excludes `cat_reviewresultjson`; the selected
   * payload is loaded later by `getReviewDetails`.
   *
   * When sourceEnvironment is empty and no specific subject context exists,
   * searches across all environments to support opening reviews from direct links
   * that may lack the orgUrl parameter.
   */
  async getReviewHistory(
    subject: ReviewHistorySubject,
  ): Promise<ReviewResult[]> {
    const sourceEnvironment = subject.sourceEnvironment ?? '';
    const subjectFilter = sourceEnvironment === 'zip'
      ? `cat_componentidunique eq '${escapeODataString(subject.componentIdUnique || subject.botId)}' and cat_sourceenvironment eq 'zip'`
      : `cat_botid eq '${escapeODataString(subject.botId)}'`;

    // Environment filter: when sourceEnvironment is empty (no orgUrl provided),
    // include reviews from all environments to support direct links without environment context
    const environmentFilter = sourceEnvironment === 'zip'
      ? ''
      : sourceEnvironment
        ? ` and cat_sourceenvironment eq '${escapeODataString(sourceEnvironment)}'`
        : '';  // Empty sourceEnvironment means search ALL environments, not just current
    const filter =
      `(cat_agenttype eq 1 or cat_agenttype eq null) and ` +
      `(cat_reviewstatus eq 335350000 or ` +
      `(cat_reviewstatus eq 335350002 and cat_sourcetype eq 'copilot' and cat_reviewresultjson ne null)) ` +
      `and ${subjectFilter}${environmentFilter}`;

    const result = await Cat_agentreviewsesService.getAll({
      filter,
      select: [
        'cat_agentreviewsid',
        'cat_botid',
        'cat_botname',
        'cat_componentidunique',
        'cat_overallscore',
        'cat_patternscore',
        'cat_instructionscore',
        'cat_totalissues',
        'cat_highseverityissues',
        'cat_reviewdate',
        'cat_reviewstatus',
        'cat_sourceenvironment',
        'cat_agentversion',
        'cat_sourcetype',
        'createdon',
        '_ownerid_value',
      ],
      orderBy: ['cat_reviewdate desc', 'createdon desc', 'cat_agentreviewsid desc'],
    });

    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Unable to load review history.');
    }

    return sortReviewsNewestFirst(
      result.data.map((review) => this.mapReviewRecord(review, false)),
    );
  }

  /**
   * Load the newest completed Standard review that used the requested scoring policy.
   *
   * A row that cannot be read is skipped, never raised. This runs *after* the agent has already
   * been reviewed, so throwing here would discard a completed, credit-bearing review to report a
   * problem with an older one — the audit destroying the thing it exists to describe. The worst a
   * skip can cost is the comparison against that row.
   *
   * Skipping is also the normal path rather than an error path, because ART and the Architecture
   * Review Center write standard reviews into the same table from independently deployed apps. A
   * row written by whichever app is a deploy behind is expected to be unreadable here, and the
   * next review of that agent simply has no baseline until both sides agree again.
   *
   * The search opens at most {@link BASELINE_SEARCH_LIMIT} standard rows, because each one costs a
   * full result-JSON fetch and the rows most likely to be skipped are exactly the ones a policy
   * change just invalidated — all of them.
   */
  async getLatestComparableStandardReview(
    subject: ReviewHistorySubject,
    policyVersion: string,
    policyHash?: string,
  ): Promise<StandardReviewComparableBaseline | undefined> {
    const history = await this.getReviewHistory(subject);
    let opened = 0;
    for (const entry of history) {
      if (entry.reviewKind !== 'standard' || !entry.reviewId) continue;
      if (opened >= BASELINE_SEARCH_LIMIT) break;
      opened += 1;
      const details = await this.getReviewDetails(entry.reviewId);
      if (details.assessmentPolicyVersion !== policyVersion) continue;
      if (!details.assessmentIdentity) continue;
      // The policy version says which rubric graded the row; the hash says whether that rubric has
      // since changed underneath the version. Checking it here keeps an incomparable row out of
      // the caller's hands, so the strict equality assertion in `reconcileStandardReviewConsistency`
      // stays a genuine programming-error check rather than a reachable crash.
      if (policyHash && details.assessmentIdentity.policyHash !== policyHash) continue;
      if (!details.stageBOutput || !details.stageCOutput) continue;
      let patterns: StandardReviewComparableBaseline['patterns'];
      let instructions: StandardReviewComparableBaseline['instructions'];
      try {
        patterns = JSON.parse(details.stageBOutput) as StandardReviewComparableBaseline['patterns'];
        instructions = JSON.parse(details.stageCOutput) as StandardReviewComparableBaseline['instructions'];
      } catch {
        continue;
      }
      if (!Array.isArray(patterns?.Patterns)
        || !Array.isArray(instructions?.issues)) {
        continue;
      }
      return {
        reviewId: entry.reviewId,
        identity: details.assessmentIdentity,
        patterns,
        instructions,
        // A score the baseline withheld stays withheld. Reading it as `0` would make the next
        // review's delta report a recovery from a failure that never happened. The stored column
        // cannot carry that distinction — `Number(cat_overallscore || 0)` turns an empty column
        // into a measured zero — so the companion `*Applicable` flags are the only honest source.
        scores: {
          overallScore: details.overallScoreApplicable === false ? null : details.overallScore ?? null,
          patternScore: details.patternScoreApplicable === false ? null : details.patternScore ?? null,
          instructionScore: details.instructionScoreApplicable === false ? null : details.instructionScore ?? null,
        },
      };
    }
    return undefined;
  }

  /**
   * Get existing reviews for specified bot IDs.
   * Kept for backward compatibility — prefer getAllReviews() for dashboard use.
   *
   * @param botIds - Array of bot IDs to fetch reviews for
   * @returns Array of review results
   */
  async getExistingReviews(botIds: string[]): Promise<ReviewResult[]> {
    if (botIds.length === 0) {
      return [];
    }

    try {
      const botIdFilters = botIds.map((id) => `cat_botid eq '${id}'`).join(' or ');

      const result = await Cat_agentreviewsesService.getAll({
        filter: botIdFilters,
        select: ['cat_agentreviewsid', 'cat_botid', 'cat_botname', 'cat_componentidunique', 'cat_overallscore', 'cat_patternscore', 'cat_instructionscore', 'cat_totalissues', 'cat_highseverityissues', 'cat_reviewdate', 'cat_reviewstatus', 'cat_reviewresultjson', 'cat_reviewpdfreport_name'],
        orderBy: ['cat_reviewdate desc'],
      });

      if (!result.success || !result.data) {
        console.error('Failed to fetch reviews:', result.error);
        return [];
      }

      return result.data.map((review) => this.mapReviewRecord(review));
    } catch (error) {
      console.error('Error fetching reviews:', error);
      return [];
    }
  }

  /**
   * Maps a Dataverse cat_agentreviews record to ReviewResult.
   */
  private mapReviewRecord(
    review: Cat_agentreviewses,
    includePayloadMetadata = true,
  ): ReviewResult {
    const raw = review as unknown as Record<string, unknown>;
    const jsonText = includePayloadMetadata
      ? raw['cat_reviewresultjson'] as string | undefined
      : undefined;
    const hasReviewData =
      !!jsonText || !!(raw['cat_reviewpdfreport_name'] as string | undefined);

    // Extract iconBase64 from the JSON blob if present (persisted for ZIP-sourced bots)
    let iconBase64: string | undefined;
    let agentsExperience: PersistedCopilotReviewPayload | undefined;
    let storedErrorMessage: string | undefined;
    let connectedAgentTargets: ReviewAgentMapTarget[] | undefined;
    let workflowProvenance: StandardReviewWorkflowProvenance | undefined;
    let standardMetadata: ReturnType<typeof readStandardReviewMetadata> = {};
    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        iconBase64 = parsed['iconBase64'] as string | undefined;
        connectedAgentTargets = parseConnectedAgentTargets(parsed['connectedAgentTargets']);
        agentsExperience = parsePersistedCopilotPayload(parsed['agentsExperience']);
        storedErrorMessage = typeof parsed.errorMessage === 'string' ? parsed.errorMessage : undefined;
        workflowProvenance = parseWorkflowProvenance(parsed['workflowProvenance']);
        standardMetadata = readStandardReviewMetadata(parsed);
      } catch {
        // Ignore malformed legacy JSON; the row remains viewable as standard.
      }
    }

    // Extract reviewer display name from OData formatted value annotation on the ownerid lookup
    const reviewedBy = raw['_ownerid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined;
    const sourceType = raw['cat_sourcetype'];
    const reviewKind: ReviewKind | undefined =
      sourceType === 'standard' || sourceType === 'copilot'
        ? sourceType
        : agentsExperience
          ? 'copilot'
          : undefined;
    const hasStoredScore = readStoredScore(review.cat_overallscore) !== undefined;
    const scoreState: ReviewScoreState = reviewKind === 'copilot' && !hasStoredScore
      ? 'not-applicable'
      : !hasStoredScore || (reviewKind === 'standard' && standardMetadata.overallScoreApplicable === false)
        ? 'not-assessed'
      : reviewKind
        ? 'measured'
        : 'legacy-unknown';
    const overallScoreApplicable = agentsExperience
      ? agentsExperience.score.grounded !== null
      : standardMetadata.overallScoreApplicable === false || !hasStoredScore
        ? false
        : scoreState === 'measured'
          ? true
          : undefined;

    const completion = agentsExperience ? getCopilotReviewCompletion(agentsExperience) : undefined;
    return {
      reviewId: review.cat_agentreviewsid,
      botId: review.cat_botid || '',
      botName: review.cat_botname || '',
      componentIdUnique: review.cat_componentidunique || '',
      overallScore: Number(review.cat_overallscore || 0),
      overallScoreApplicable,
      scoreState,
      patternScore: Number(review.cat_patternscore || 0),
      instructionScore: Number(review.cat_instructionscore || 0),
      patternScoreApplicable: standardMetadata.patternScoreApplicable
        ?? (readStoredScore(review.cat_patternscore) === undefined ? false : undefined),
      instructionScoreApplicable: standardMetadata.instructionScoreApplicable
        ?? (readStoredScore(review.cat_instructionscore) === undefined ? false : undefined),
      assessmentPolicyVersion: standardMetadata.assessmentPolicyVersion,
      scorePillars: standardMetadata.scorePillars,
      scoreStatus: standardMetadata.scoreStatus,
      ruleResults: standardMetadata.ruleResults,
      workflowProvenance,
      highSeverityCount: Number(review.cat_highseverityissues || 0),
      mediumSeverityCount: standardMetadata.mediumSeverityCount ?? 0,
      lowSeverityCount: standardMetadata.lowSeverityCount ?? 0,
      totalIssueCount: Number(review.cat_totalissues || 0),
      reviewedOn: review.cat_reviewdate
        ? new Date(review.cat_reviewdate)
        : new Date(NaN),
      createdOn: review.createdon ? new Date(review.createdon) : undefined,
      agentVersion: review.cat_agentversion || undefined,
      reviewKind,
      durationMs: 0,
      hasReviewData,
      iconBase64,
      connectedAgentTargets,
      agentsExperience,
      reviewedBy,
      sourceEnvironment: (raw['cat_sourceenvironment'] as string | undefined) ?? '',
      status: completion?.status === 'failed' ? 'failed' : this.mapReviewStatus(review.cat_reviewstatus),
      errorMessage: storedErrorMessage ?? completion?.errorMessage,
    };
  }

  /**
   * Save a review result to Dataverse
   *
   * Completed reviews are immutable snapshots. Every successful review creates
   * a new row so earlier results remain available in version history.
   *
   * @param review - Review result to save
   * @returns Saved review result with reviewId
   */
  async saveReviewResult(review: ReviewResult): Promise<ReviewResult> {
    try {
      const reviewKind = review.reviewKind
        ?? (review.agentsExperience ? 'copilot' : 'standard');
      const recordData = serializeReviewRecord(review);
      const { failed, errorMessage } = deriveReviewFailure(review);

      // ownerid, owneridtype, and statecode are auto-populated by Dataverse
      const createResult = await Cat_agentreviewsesService.create(
        recordData as Omit<Cat_agentreviewsesBase, 'cat_agentreviewsid'>
      );

      if (!createResult.success || !createResult.data) {
        throw new Error(`Failed to create review: ${createResult.error?.message}`);
      }

      return {
        ...review,
        reviewId: createResult.data.cat_agentreviewsid,
        reviewKind,
        ...(failed ? { status: 'failed' as const, errorMessage } : {}),
      };
    } catch (error) {
      console.error('Error saving review result:', error);
      throw error;
    }
  }

  /**
   * Fetch full review details including stage outputs from cat_reviewresultjson.
   *
   * Returns standard stage outputs and, when present, the persisted
   * Microsoft Copilot harness `agentsExperience` payload for view-only reopening.
   *
   * @param reviewId - Review record ID
   * @returns Partial review detail fields
   */
  async getReviewDetails(reviewId: string): Promise<ReviewDetails> {
    try {
      const result = await Cat_agentreviewsesService.get(reviewId, {
        select: [
          'cat_agentreviewsid', 'cat_reviewresultjson', 'cat_reviewpdfreport_name',
          'cat_botid', 'cat_botname', 'cat_overallscore', 'cat_patternscore',
          'cat_instructionscore', 'cat_totalissues', 'cat_highseverityissues',
          'cat_reviewdate', 'cat_reviewstatus', '_ownerid_value', 'cat_componentidunique',
          'cat_sourceenvironment',
          'cat_agentversion', 'cat_sourcetype',
        ],
      });
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'The saved review details could not be read.');
      }

      const raw = result.data as unknown as Record<string, unknown>;

      // Primary: read from memo field cat_reviewresultjson
      let jsonText = raw['cat_reviewresultjson'] as string | undefined;

      // Backward compat: if memo field is empty, try downloading from legacy file column
      if (!jsonText && raw['cat_reviewpdfreport_name']) {
        const fileResult = await MicrosoftDataverseService.GetEntityFileImageFieldContentWithOrganization(
          '',
          'current',
          'cat_agentreviewses',
          reviewId,
          'cat_reviewresultfile'
        );
        if (fileResult.success && fileResult.data) {
          const { decodeConnectorFileContent } = await import(
            '../agents-experience/services/skill/SkillBundleService'
          );
          jsonText = new TextDecoder().decode(
            decodeConnectorFileContent(fileResult.data as unknown),
          );
        } else {
          throw new Error('The saved review details file could not be read.');
        }
      }

      // Extract metadata available on the record itself
      const reviewedBy = raw['_ownerid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined;
      const botId = result.data.cat_botid ?? undefined;
      const botName = result.data.cat_botname ?? undefined;
      const reviewedOn = result.data.cat_reviewdate
        ? new Date(result.data.cat_reviewdate)
        : undefined;
      const componentIdUnique = result.data.cat_componentidunique ?? undefined;
      const sourceEnvironment = (raw['cat_sourceenvironment'] as string | undefined) ?? '';
      const agentVersion = result.data.cat_agentversion ?? undefined;
      const sourceType = raw['cat_sourcetype'];
      const reviewKind: ReviewKind | undefined =
        sourceType === 'standard' || sourceType === 'copilot'
          ? sourceType
          : undefined;
      const hasStoredScore = readStoredScore(result.data.cat_overallscore) !== undefined;
      const scoreState: ReviewScoreState = reviewKind === 'copilot' && !hasStoredScore
        ? 'not-applicable'
        : !hasStoredScore
          ? 'not-assessed'
        : reviewKind
          ? 'measured'
          : 'legacy-unknown';
      const hasReviewData = Boolean(jsonText || raw['cat_reviewpdfreport_name']);
      const parsedStatus = this.mapReviewStatus(result.data.cat_reviewstatus);

      if (!jsonText) {
        return {
          reviewId,
          botId,
          reviewedBy,
          botName,
          overallScore: Number(result.data.cat_overallscore || 0),
          overallScoreApplicable: !hasStoredScore
            ? false
            : scoreState === 'measured'
              ? true
              : undefined,
          scoreState,
          patternScore: Number(result.data.cat_patternscore || 0),
          instructionScore: Number(result.data.cat_instructionscore || 0),
          patternScoreApplicable: readStoredScore(result.data.cat_patternscore) === undefined ? false : undefined,
          instructionScoreApplicable: readStoredScore(result.data.cat_instructionscore) === undefined ? false : undefined,
          highSeverityCount: Number(result.data.cat_highseverityissues || 0),
          totalIssueCount: Number(result.data.cat_totalissues || 0),
          hasReviewData,
          reviewedOn,
          componentIdUnique,
          sourceEnvironment,
          agentVersion,
          reviewKind,
          status: parsedStatus,
        };
      }

      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      const iconBase64 = typeof parsed.iconBase64 === 'string'
        ? parsed.iconBase64
        : undefined;
      const connectedAgentTargets = parseConnectedAgentTargets(parsed.connectedAgentTargets);
      const standardMetadata = readStandardReviewMetadata(parsed);
      const stageA = parsed.stageA as LocalStageAOutput | undefined;
      const patternEval = parsed.patternEvaluation as { Patterns?: unknown[]; Summary?: string } | undefined;
      const instrEval = parsed.instructionEvaluation as { compliancePercentage?: number; issues?: unknown[]; summary?: string } | undefined;
      const agentsExperience = parsePersistedCopilotPayload(parsed.agentsExperience);
      const completion = agentsExperience ? getCopilotReviewCompletion(agentsExperience) : undefined;
      const workflowProvenance = parseWorkflowProvenance(parsed.workflowProvenance);
      const assessmentIdentity = parseStandardReviewAssessmentIdentity(parsed.assessmentIdentity);
      const consistency = parseStandardReviewConsistencyResult(parsed.consistency);
      const overallScoreApplicable = agentsExperience
        ? agentsExperience.score.grounded !== null
        : standardMetadata.overallScoreApplicable === false || !hasStoredScore
          ? false
          : scoreState === 'measured'
            ? true
            : undefined;

      return {
        reviewId,
        botId,
        stageAOutput: stageA ? JSON.stringify(stageA) : undefined,
        stageBOutput: patternEval ? JSON.stringify(patternEval) : undefined,
        stageCOutput: instrEval ? JSON.stringify(instrEval) : undefined,
        patternSummary: patternEval?.Summary,
        complianceSummary: instrEval?.summary,
        agentInstructions: (parsed.agentInstructions as string | undefined)
          ?? stageA?.agentInstructions
          ?? '',
        agentsExperience,
        iconBase64,
        connectedAgentTargets,
        reviewedBy,
        botName,
        overallScore: Number(result.data.cat_overallscore || 0),
        overallScoreApplicable,
        scoreState: reviewKind === 'standard' && overallScoreApplicable === false ? 'not-assessed' : scoreState,
        patternScore: Number(result.data.cat_patternscore || 0),
        instructionScore: Number(result.data.cat_instructionscore || 0),
        patternScoreApplicable: standardMetadata.patternScoreApplicable
          ?? (readStoredScore(result.data.cat_patternscore) === undefined ? false : undefined),
        instructionScoreApplicable: standardMetadata.instructionScoreApplicable
          ?? (readStoredScore(result.data.cat_instructionscore) === undefined ? false : undefined),
        assessmentPolicyVersion: standardMetadata.assessmentPolicyVersion,
        scorePillars: standardMetadata.scorePillars,
        scoreStatus: standardMetadata.scoreStatus,
        ruleResults: standardMetadata.ruleResults,
        workflowProvenance,
        assessmentIdentity,
        consistency,
        mediumSeverityCount: standardMetadata.mediumSeverityCount,
        lowSeverityCount: standardMetadata.lowSeverityCount,
        highSeverityCount: Number(result.data.cat_highseverityissues || 0),
        totalIssueCount: Number(result.data.cat_totalissues || 0),
        hasReviewData,
        reviewedOn,
        componentIdUnique,
        sourceEnvironment,
        agentVersion,
        reviewKind: reviewKind
          ?? (agentsExperience ? 'copilot' : 'standard'),
        durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : undefined,
        status: completion?.status === 'failed' ? 'failed' : parsedStatus,
        errorMessage: typeof parsed.errorMessage === 'string'
          ? parsed.errorMessage
          : completion?.errorMessage,
      };
    } catch (error) {
      console.error('Error fetching review details:', error);
      throw error;
    }
  }

  /**
   * Delete a review by ID
   *
   * @param reviewId - Review record ID to delete
   */
  async deleteReview(reviewId: string): Promise<void> {
    try {
      await Cat_agentreviewsesService.delete(reviewId);
    } catch (error) {
      console.error('Error deleting review:', error);
      throw error;
    }
  }

  /**
   * Get review grid rows for dashboard display.
   *
   * Joins bot and review data. Bots with Dataverse records are shown first.
   * Reviews with no matching Dataverse bot (orphan reviews — e.g. ZIP-sourced)
   * are appended as additional rows so they appear permanently in the grid.
   *
   * @param bots - All active Dataverse bots
   * @param reviews - All reviews (Dataverse + ZIP sourced)
   * @returns Grid-ready rows
   */
  getReviewGridRows(
    bots: BotMetadata[],
    reviews: ReviewResult[]
  ): ReviewGridRow[] {
    const latestReviews = selectLatestReviews(reviews);

    // Map live reviews by botId for fast lookup
    const reviewMap = new Map<string, ReviewResult>();
    for (const review of latestReviews) {
      if (review.sourceEnvironment !== 'zip' && !reviewMap.has(review.botId)) {
        reviewMap.set(review.botId, review);
      }
    }

    // Track which botIds are covered by Dataverse bots
    const dataverseBotIds = new Set(bots.map((b) => b.botId));

    // Rows for Dataverse bots (with or without a review)
    const botRows: ReviewGridRow[] = bots.map((bot) => {
      const review = reviewMap.get(bot.botId);
      return {
        botId: bot.botId,
        botName: bot.name,
        overallScore: review?.overallScore ?? 0,
        overallScoreApplicable: review?.overallScoreApplicable,
        totalIssueCount: review?.totalIssueCount || 0,
        highSeverityCount: review?.highSeverityCount || 0,
        reviewedOn: review?.reviewedOn,
        status: review ? 'completed' : 'not-reviewed',
        iconBase64: bot.iconBase64,
        hasReviewData: review?.hasReviewData ?? false,
        reviewedBy: review?.reviewedBy,
        harness: bot.harness,
        reviewHarness: savedReviewHarness(review),
        reviewId: review?.reviewId,
        freshness: review
          ? getReviewFreshness(
              review.agentVersion,
              bot.publishedOn,
              review.sourceEnvironment,
            )
          : undefined,
      };
    });

    // Orphan rows: reviews whose botId has no matching Dataverse bot (ZIP-sourced)
    const orphanRows: ReviewGridRow[] = [];
    for (const review of latestReviews) {
      if (!dataverseBotIds.has(review.botId) && review.botId) {
        // Use componentIdUnique as botId so the View dialog lookup works
        orphanRows.push({
          botId: review.botId,
          botName: review.botName,
          overallScore: review.overallScore,
          overallScoreApplicable: review.overallScoreApplicable,
          totalIssueCount: review.totalIssueCount,
          highSeverityCount: review.highSeverityCount,
          reviewedOn: review.reviewedOn,
          status: 'completed',
          iconBase64: review.iconBase64,
          hasReviewData: review.hasReviewData ?? false,
          reviewedBy: review.reviewedBy,
          harness: review.agentsExperience ? 'copilot' : 'standard',
          reviewHarness: savedReviewHarness(review),
          isZipSource: true,
          reviewId: review.reviewId,
          freshness: getReviewFreshness(
            review.agentVersion,
            undefined,
            review.sourceEnvironment,
          ),
        });
      }
    }

    return [...botRows, ...orphanRows];
  }

  /**
   * Calculate dashboard statistics
   *
   * @param bots - All active bots
   * @param reviews - All existing reviews
   * @returns Aggregated stats
   */
  calculateDashboardStats(
    bots: BotMetadata[],
    reviews: ReviewResult[]
  ): DashboardStats {
    const uniqueReviews = selectLatestReviews(reviews);

    // Count unique bot IDs across Dataverse bots + orphan ZIP reviews
    const dataverseBotIds = new Set(bots.map((b) => b.botId));
    const zipOnlyBotIds = new Set(uniqueReviews.filter((r) => !dataverseBotIds.has(r.botId) && r.botId).map((r) => r.botId));
    const totalBots = bots.length + zipOnlyBotIds.size;
    const reviewedBots = uniqueReviews.length;
    const reviewedPercentage =
      totalBots > 0 ? Math.round((reviewedBots / totalBots) * 100) : 0;

    // Calculate average score across unique (most recent) reviews
    const scoredReviews = uniqueReviews.filter((review) =>
      review.overallScoreApplicable === true
      || (review.overallScoreApplicable !== false && review.scoreState === 'measured'));
    const totalScore = scoredReviews.reduce((sum, r) => sum + r.overallScore, 0);
    const averageScore =
      scoredReviews.length > 0 ? Math.round(totalScore / scoredReviews.length) : 0;

    // Calculate total issues across unique (most recent) reviews
    const totalIssues = uniqueReviews.reduce((sum, r) => sum + r.totalIssueCount, 0);
    const highSeverityIssues = uniqueReviews.reduce(
      (sum, r) => sum + r.highSeverityCount,
      0
    );

    return {
      totalBots,
      reviewedBots,
      reviewedPercentage,
      averageScore,
      scoredReviews: scoredReviews.length,
      totalIssues,
      highSeverityIssues,
    };
  }

  /**
   * Map review status enum to type
   *
   * @param status - Dataverse status code
   * @returns Typed status
   */
  private mapReviewStatus(
    status: number | undefined
  ): 'completed' | 'failed' | 'in-progress' {
    switch (status) {
      case 335350000:
        return 'completed';
      case 335350001:
        return 'in-progress';
      case 335350002:
        return 'failed';
      default:
        return 'completed';
    }
  }
}

// Export singleton instance
export const reviewService = new ReviewService();
