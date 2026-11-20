/**
 * useStandardReview — loads one Standard review by bot id, for the review page.
 *
 * Mirrors the two-step load the dialog performs in `Dashboard`: the list query
 * supplies the record, then `useReviewDetails` fetches the stage outputs the
 * grids and finding panels are built from.
 *
 * Both queries reuse the existing keys, so a page opened straight after a
 * completed run renders immediately from cache — no spinner flash — while a
 * background refetch runs. The refetch does fire: `useReviewMutation`
 * invalidates both keys on completion, and an invalidated query refetches on
 * the next observer mount regardless of `staleTime`.
 */

import { useMemo } from 'react';
import type { ReviewResult } from '../contracts/ReviewResult';
import { useReviewDetails } from './useReviewDetails';
import { composeReviewResult } from '../utils/composeReviewResult';
import { useReviewHistory } from './useReviewHistory';
import type { ReviewDetails } from '../services/ReviewService';

export interface UseStandardReviewResult {
  review: ReviewResult | null;
  /** The list query is still resolving, so no record is known yet. */
  isLoading: boolean;
  /** The record is known and its stage outputs are still arriving. */
  isLoadingDetails: boolean;
  isError: boolean;
  error: string | null;
  /** Loaded successfully, but no review exists for this bot. */
  notFound: boolean;
}

function buildReviewFromDetails(
  details: ReviewDetails | undefined,
  routeBotId: string | undefined,
  reviewId: string | null | undefined,
  orgUrl?: string | null,
  sourceEnvironment?: string | null,
): ReviewResult | null {
  if (!details || !reviewId || !routeBotId) return null;
  const hasIdentity = Boolean(details.botId || details.botName || details.componentIdUnique);
  if (!hasIdentity) return null;

  return {
    reviewId: details.reviewId ?? reviewId,
    botId: details.botId ?? routeBotId,
    botName: details.botName ?? 'Unknown agent',
    componentIdUnique: details.componentIdUnique ?? '',
    overallScore: details.overallScore ?? 0,
    overallScoreApplicable: details.overallScoreApplicable,
    scoreState: details.scoreState,
    patternScore: details.patternScore ?? 0,
    instructionScore: details.instructionScore ?? 0,
    patternScoreApplicable: details.patternScoreApplicable,
    instructionScoreApplicable: details.instructionScoreApplicable,
    assessmentPolicyVersion: details.assessmentPolicyVersion,
    workflowProvenance: details.workflowProvenance,
    highSeverityCount: details.highSeverityCount ?? 0,
    mediumSeverityCount: details.mediumSeverityCount ?? 0,
    lowSeverityCount: details.lowSeverityCount ?? 0,
    totalIssueCount: details.totalIssueCount ?? 0,
    reviewedOn: details.reviewedOn ?? new Date(NaN),
    agentVersion: details.agentVersion,
    reviewKind: details.reviewKind,
    durationMs: details.durationMs ?? 0,
    stageAOutput: details.stageAOutput,
    stageBOutput: details.stageBOutput,
    stageCOutput: details.stageCOutput,
    patternSummary: details.patternSummary,
    complianceSummary: details.complianceSummary,
    agentInstructions: details.agentInstructions,
    reviewedBy: details.reviewedBy,
    sourceEnvironment: details.sourceEnvironment ?? sourceEnvironment ?? orgUrl ?? '',
    status: details.status ?? 'completed',
    hasReviewData: details.hasReviewData ?? Boolean(
      details.stageAOutput || details.stageBOutput || details.stageCOutput,
    ),
    agentsExperience: details.agentsExperience,
    iconBase64: details.iconBase64,
    connectedAgentTargets: details.connectedAgentTargets,
  };
}

export function useStandardReview(
  botId: string | undefined,
  reviewId?: string | null,
  orgUrl?: string | null,
  sourceEnvironment?: string | null,
): UseStandardReviewResult {
  const subject = botId
    ? {
        botId,
        componentIdUnique: sourceEnvironment === 'zip' ? botId : undefined,
        sourceEnvironment: sourceEnvironment ?? orgUrl ?? '',
      }
    : null;
  const list = useReviewHistory(subject);

  const baseReview = botId
    ? reviewId
      ? list.data?.find((review) => review.reviewId === reviewId) ?? null
      : list.data?.[0] ?? null
    : null;

  const detailReviewId = reviewId ?? baseReview?.reviewId ?? null;
  const { data: details, isLoading: isLoadingDetails, isError: isDetailsError, error: detailsError } = useReviewDetails(detailReviewId);
  const directReview = useMemo(
    () => buildReviewFromDetails(details, botId, reviewId, orgUrl, sourceEnvironment),
    [botId, details, orgUrl, reviewId, sourceEnvironment],
  );
  const resolvedBaseReview = baseReview ?? directReview;

  /**
   * Memoised, as `Dashboard` does for the dialog. A fresh object each render
   * would give the page's `useMemo(…, [review])` a new identity every time,
   * re-parsing all three stage-output blobs on every tab switch, Prev/Next
   * step and toggle.
   */
  const review = useMemo(
    () => composeReviewResult(resolvedBaseReview, details),
    [resolvedBaseReview, details],
  );

  return {
    review,
    isLoading: list.isLoading || Boolean(reviewId && !baseReview && isLoadingDetails),
    isLoadingDetails: Boolean(resolvedBaseReview) && isLoadingDetails,
    isError: list.isError || isDetailsError,
    error: list.error instanceof Error ? list.error.message
      : detailsError instanceof Error ? detailsError.message
      : list.isError || isDetailsError ? 'Review data could not be loaded.' : null,
    notFound: Boolean(botId) && list.isSuccess && !isDetailsError && !resolvedBaseReview && !isLoadingDetails,
  };
}
