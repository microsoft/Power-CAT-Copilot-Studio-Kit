import type { PersistedResourceManifest, PersistedSkillBundleReview } from '../../../contracts/ReviewResult';
import type { QualifiedSkillScore, ResourceAnalysisStatus, SkillReviewMode } from '../../contracts/SkillBundle';
import type { DeepSkillBundleEvaluation, StandardSkillBundleEvaluation } from '../../contracts/SkillEvaluation';
import { WORKFLOW_SERVED_MODEL_ID } from '../ai-providers/reviewAiPortCore';

type ReviewResource = Pick<PersistedResourceManifest, 'path' | 'analysisStatus' | 'riskLevel' | 'readiness'> & {
  originalPath?: string;
  chunksTotal?: number;
};

function samePath(resource: ReviewResource, path: string): boolean {
  const key = path.replace(/\\/g, '/').toLowerCase();
  return [resource.path, resource.originalPath].some(candidate =>
    candidate?.replace(/\\/g, '/').toLowerCase() === key,
  );
}

function unassessedStatus(status: ResourceAnalysisStatus): ResourceAnalysisStatus {
  return status === 'completed' || status === 'partial' ? 'queued' : status;
}

/** Resolve assessment state without treating file loading as completed AI review. */
export function getResourceReviewAssessment(
  resource: ReviewResource,
  mode: SkillReviewMode,
  standard?: StandardSkillBundleEvaluation,
  deep?: DeepSkillBundleEvaluation,
  wholeSkillOnly = false,
) {
  const evaluations = mode === 'deep'
    ? deep?.resources ?? standard?.resources
    : standard?.resources;
  const evaluation = evaluations?.find(result => samePath(resource, result.resourcePath));

  if (evaluation) {
    const unassessed = !['complete', 'partial'].includes(evaluation.status);
    return {
      analysisStatus: evaluation.status === 'complete' ? 'completed' as const : evaluation.status,
      riskLevel: evaluation.status !== 'complete' && evaluation.riskLevel === 'none'
        ? undefined : evaluation.riskLevel,
      readiness: unassessed || (evaluation.status !== 'complete' && evaluation.readiness === 'ready')
        ? 'unknown' as const : evaluation.readiness,
      totalChunks: evaluation.totalChunks,
      analyzedChunks: evaluation.analyzedChunks,
    };
  }

  let analysisStatus = resource.analysisStatus;
  if (wholeSkillOnly || mode === 'deep' || evaluations !== undefined) {
    analysisStatus = unassessedStatus(analysisStatus);
  } else if (standard) {
    const unavailable = ['failed', 'skipped', 'oversized', 'cancelled'].includes(analysisStatus);
    if (!unavailable) {
      analysisStatus = standard.unreviewedResources.some(result => samePath(resource, result.resourcePath))
        ? 'skipped'
        : standard.status === 'complete' ? 'completed' : 'partial';
    }
  }

  return {
    analysisStatus,
    riskLevel: analysisStatus === 'completed' || analysisStatus === 'partial'
      ? resource.riskLevel : undefined,
    readiness: analysisStatus === 'completed' || analysisStatus === 'partial'
      ? resource.readiness : 'unknown' as const,
    totalChunks: resource.chunksTotal ?? 0,
    analyzedChunks: 0,
  };
}

/** Count actual complete, incomplete and failed resource assessments and chunks. */
export function computeResourceReviewCoverage(
  resources: readonly ReviewResource[],
  mode: SkillReviewMode,
  standard?: StandardSkillBundleEvaluation,
  deep?: DeepSkillBundleEvaluation,
  wholeSkillOnly = false,
): PersistedSkillBundleReview['coverage'] {
  const assessments = resources.map(resource =>
    getResourceReviewAssessment(resource, mode, standard, deep, wholeSkillOnly));
  const count = (status: ResourceAnalysisStatus) =>
    assessments.filter(assessment => assessment.analysisStatus === status).length;

  return {
    resourcesTotal: resources.length,
    resourcesReviewed: count('completed'),
    resourcesPartial: count('partial'),
    resourcesFailed: count('failed'),
    resourcesSkipped: count('skipped'),
    resourcesOversized: count('oversized'),
    resourcesCancelled: count('cancelled'),
    chunksTotal: assessments.reduce((total, assessment) => total + assessment.totalChunks, 0),
    chunksReviewed: assessments.reduce((total, assessment) => total + assessment.analyzedChunks, 0),
  };
}

/** Qualify resource scores by actual coverage; readiness requires every file check. */
export function qualifyResourceScore(
  score: QualifiedSkillScore,
  resourcesTotal: number,
  resourcesReviewed: number,
  requiresCompleteCoverage = false,
): QualifiedSkillScore {
  if (resourcesTotal === 0) return { ...score };
  const coveragePercent = Math.round(resourcesReviewed / resourcesTotal * 100);
  if (resourcesReviewed === 0) {
    return {
      value: null,
      status: 'unavailable',
      coveragePercent: 0,
      note: 'No supporting files were fully assessed.',
    };
  }
  if (resourcesReviewed < resourcesTotal) {
    return {
      ...score,
      value: requiresCompleteCoverage ? null : score.value,
      status: score.status === 'unavailable' ? 'unavailable' : 'partial',
      coveragePercent,
      note: `${resourcesReviewed}/${resourcesTotal} supporting files were fully assessed.`,
    };
  }
  return { ...score, coveragePercent };
}

/** Correct contradictory historical labels for display without changing stored data. */
export function reconcilePersistedResourceReview(
  review: PersistedSkillBundleReview,
): PersistedSkillBundleReview {
  const wholeSkillOnly = review.mode === 'standard'
    && review.promptVersions?.standard === WORKFLOW_SERVED_MODEL_ID;
  const coverage = computeResourceReviewCoverage(
    review.manifest, review.mode, review.standard, review.deep, wholeSkillOnly,
  );
  return {
    ...review,
    status: !wholeSkillOnly && review.status === 'complete' && coverage.resourcesReviewed < coverage.resourcesTotal
      ? 'partial' : review.status,
    manifest: review.manifest.map(resource => {
      const assessment = getResourceReviewAssessment(
        resource, review.mode, review.standard, review.deep, wholeSkillOnly,
      );
      return {
        ...resource,
        analysisStatus: assessment.analysisStatus,
        riskLevel: assessment.riskLevel,
        readiness: assessment.readiness,
      };
    }),
    coverage,
    scores: {
      ...review.scores,
      safety: qualifyResourceScore(review.scores.safety, coverage.resourcesTotal, coverage.resourcesReviewed),
      readiness: qualifyResourceScore(review.scores.readiness, coverage.resourcesTotal, coverage.resourcesReviewed, true),
    },
  };
}
