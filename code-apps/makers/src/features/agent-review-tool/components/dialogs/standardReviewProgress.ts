import type { ProgressStage } from '../../hooks/useReviewMutation';

export const STANDARD_REVIEW_STAGES = [
  { stageName: 'Initializing', progress: 0 },
  { stageName: 'Parsing Configuration', progress: 10 },
  { stageName: 'Evaluating Patterns', progress: 30 },
  { stageName: 'Checking Compliance', progress: 60 },
  { stageName: 'Saving Results', progress: 85 },
  { stageName: 'Complete', progress: 100 },
] as const;

/** Supplies the Standard dialog rows until the pipeline reports progress. */
export function initialStandardReviewStages(hasError = false): ProgressStage[] {
  return STANDARD_REVIEW_STAGES.map((stage, index) => ({
    ...stage,
    status: index === 0 ? (hasError ? 'error' : 'active') : 'pending',
    ...(index === 2 || index === 3 ? { attribution: 'workflow-agent' as const } : {}),
  }));
}
