import type { SkillReviewProgress } from '../../core/index.js';
import type { ProgressStage, WorkflowProgressActions } from '../contracts.js';

const STANDARD_REVIEW_STAGES = [
  { stageName: 'Initializing', progress: 0 },
  { stageName: 'Parsing Configuration', progress: 10 },
  { stageName: 'Evaluating Patterns', progress: 30 },
  { stageName: 'Checking Compliance', progress: 60 },
  { stageName: 'Saving Results', progress: 85 },
  { stageName: 'Complete', progress: 100 },
] as const;

/**
 * The one stage a workflow serves in this mapping.
 *
 * Every AI stage of the Copilot pipeline collapses onto index 3 here, and the
 * workflow serves the per-skill evaluation among them. The surrounding indices
 * are load, download, the deterministic rules and the save — all local, and
 * marking them would credit the workflow for work it did not do.
 */
const WORKFLOW_SERVED_INDEX = 3;

const COPILOT_STAGE_TO_STANDARD_INDEX: Record<SkillReviewProgress['stage'], number> = {
  loading: 1,
  downloading: 2,
  'deterministic-scan': 2,
  'standard-ai': 3,
  'deep-resource-ai': 3,
  'file-synthesis': 3,
  'bundle-synthesis': 3,
  persisting: 4,
  complete: 5,
};

/**
 * Maps GitHub Copilot harness progress into the standard review stage model.
 *
 * The pipeline runs per skill bundle, so a later bundle re-emits `loading` and
 * `downloading` after an earlier bundle already reached `standard-ai`. Mapped
 * naively the stepper walks backwards — "Evaluating Patterns" reverts to
 * "Parsing Configuration" — which reads as the review restarting.
 *
 * `previousStages` (the stages currently on screen) supplies a floor: the
 * indicator never moves left. Progress within the active stage still moves
 * freely, so genuine per-bundle movement is still visible in the detail line.
 *
 * @param progress - Latest progress event, or null before the run starts.
 * @param hasError - Marks the active stage as failed.
 * @param previousStages - Stages from the prior render; omit on first call.
 */
export function buildCopilotReviewProgressStages(
  progress: SkillReviewProgress | null,
  hasError = false,
  previousStages?: ProgressStage[],
  actions: Pick<WorkflowProgressActions, 'canCancelExecution'> = {
    canCancelExecution: true,
  },
): ProgressStage[] {
  if (!progress) {
    return [];
  }

  const mappedIndex = COPILOT_STAGE_TO_STANDARD_INDEX[progress.stage];
  const activeIndex = Math.max(mappedIndex, reachedIndex(previousStages));
  const isComplete = progress.stage === 'complete';
  const workflowBacked = !actions.canCancelExecution;

  return STANDARD_REVIEW_STAGES.map((stage, index) => {
    let status: ProgressStage['status'] = 'pending';

    if (index < activeIndex) {
      status = 'completed';
    } else if (index === activeIndex) {
      status = hasError ? 'error' : isComplete ? 'completed' : 'active';
    }

    return {
      stageName: stage.stageName,
      progress: index === activeIndex
        ? Math.min(Math.max(progress.percent, 0), 100)
        : stage.progress,
      status,
      // Only the active stage carries live detail. On the workflow backend a
      // single stage can run for minutes, so this line is the only evidence the
      // review is still moving.
      detail: index === activeIndex && !isComplete ? progress.message : undefined,
      ...(workflowBacked && index === WORKFLOW_SERVED_INDEX
        ? { attribution: 'workflow-agent' as const }
        : {}),
    };
  });
}

/** Furthest stage already shown, so the indicator can never move backwards. */
/** Index of the furthest stage a rendered stage list has reached. */
export function reachedIndex(stages: ProgressStage[] | undefined): number {
  if (!stages?.length) return 0;
  let furthest = 0;
  stages.forEach((stage, index) => {
    if (stage.status === 'completed' || stage.status === 'active' || stage.status === 'error') {
      furthest = Math.max(furthest, index);
    }
  });
  return furthest;
}
