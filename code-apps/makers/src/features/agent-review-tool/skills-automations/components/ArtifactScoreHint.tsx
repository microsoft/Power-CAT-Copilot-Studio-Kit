import type { ArtifactReviewResult } from '../contracts/ArtifactReview';
import {
  RUBRIC_DIMENSION_LABELS,
  RUBRIC_DIMENSION_WEIGHTS,
} from '../contracts/ArtifactReview';
import {
  FINDING_SCORE_PENALTY,
} from '../services/artifactReviewService';
import { effectiveWeights } from '../services/artifactScore';
import { ScoreHint } from '../../shared/review-shell/ScoreHint';

export interface ArtifactScoreHintProps {
  result: ArtifactReviewResult;
}

/** Explains the artifact score and shows the effective calculation for this review. */
export function ArtifactScoreHint({ result }: ArtifactScoreHintProps) {
  const weights = effectiveWeights(result);

  return (
    <ScoreHint
      basis={
        <>
          AI-assisted writing dimensions use the evaluator&apos;s assessment. Deterministic dimensions
          start at 5, and findings subtract{' '}
          {FINDING_SCORE_PENALTY.critical} for Critical, {FINDING_SCORE_PENALTY.high} for High,{' '}
          {FINDING_SCORE_PENALTY.medium} for Medium, and {FINDING_SCORE_PENALTY.low} for Low
          severity. Info findings subtract nothing.
        </>
      }
      caveat="Each dimension score becomes a percentage and is combined by the effective weights below. These weights are this tool's own; Microsoft publishes no weights. The score measures writing and packaging, not whether the task is good. This review is authoring guidance, not Microsoft certification or approval."
      redistribution="A dimension that could not be assessed is excluded, and its weight is shared across the assessed dimensions."
      breakdownLabel="Artifact score breakdown"
      breakdown={result.dimensions.filter((dimension) => dimension.id !== 'portability').map((dimension) => ({
        key: dimension.id,
        label: RUBRIC_DIMENSION_LABELS[dimension.id],
        weight:
          dimension.score === null
            ? undefined
            : Math.round(weights.get(dimension.id) ?? RUBRIC_DIMENSION_WEIGHTS[dimension.id]),
        value:
          dimension.score === null
            ? 'not assessed'
            : `${Math.round((dimension.score / 5) * 100)}% · ${dimension.score}/5`,
      }))}
    />
  );
}
