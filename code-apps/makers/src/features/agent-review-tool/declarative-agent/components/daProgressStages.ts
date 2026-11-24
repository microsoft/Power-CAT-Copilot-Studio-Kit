/**
 * Maps Declarative Agent review progress onto the shared `ProgressStage[]`
 * shape, so the DA review renders the same `ReviewProgressDialog` as the
 * Standard, Copilot, and artifact reviews.
 *
 * Only the AI evaluation can reach the durable workflow, where an Agent node
 * scores each rule. The other stages run in the browser, and the custom-skill
 * stage uses the prompt backend. Marking any of those would misdescribe where
 * the work happens.
 */
import type { ProgressStage } from '../../hooks/useReviewMutation';
import type {
  DAReviewExecutionInput,
  DAReviewProgress,
} from '../hooks/useDAReviewMutation';

type Stage = DAReviewProgress['stage'];

/**
 * Ordered rows. Each percent is where the bar stays while that stage runs.
 *
 * The AI evaluation takes most of the run, so its percent stays below half.
 * A higher value would tell the reader that most of the wait is over when it
 * has only started.
 */
const STAGE_ORDER: ReadonlyArray<{ stage: Stage; label: string; percent: number }> = [
  { stage: 'parsing', label: 'Preparing manifest', percent: 5 },
  { stage: 'health-check', label: 'Checking health', percent: 15 },
  { stage: 'skill-evaluation', label: 'Evaluating custom skills', percent: 25 },
  { stage: 'ai-evaluation', label: 'Running AI evaluation', percent: 40 },
  { stage: 'saving', label: 'Saving results', percent: 90 },
  { stage: 'complete', label: 'Complete', percent: 100 },
];

/**
 * The only stage the durable workflow serves.
 *
 * Exported so the attribution test asserts the same value the adapter uses.
 */
export const DA_WORKFLOW_SERVED_STAGE: Stage = 'ai-evaluation';

export interface DAProgressStageOptions {
  /** True when the AI evaluation runs on the durable Agent node workflow. */
  workflowBacked: boolean;
  /** True when the run evaluates, or already evaluated, custom skills. */
  hasCustomSkills: boolean;
  /** True when the review stopped on an error at the current stage. */
  failed?: boolean;
}

/**
 * Builds the dialog rows for the current DA review progress.
 *
 * @param progress - Latest progress, or null before the run reports any.
 * @param options - Backend, custom-skill, and failure state of the run.
 * @returns One row per stage of this run, starting at zero before progress exists.
 */
export function buildDAProgressStages(
  progress: DAReviewProgress | null,
  { workflowBacked, hasCustomSkills, failed = false }: DAProgressStageOptions,
): ProgressStage[] {
  // A run without custom skills never enters that stage. Its row would stay
  // "not started" and then change to a tick for work that did not occur.
  const rows = STAGE_ORDER.filter((entry) =>
    entry.stage !== 'skill-evaluation'
    || hasCustomSkills
    || progress?.stage === 'skill-evaluation');
  const index = Math.max(
    rows.findIndex((entry) => entry.stage === (progress?.stage ?? 'parsing')),
    0,
  );

  return rows.map((entry, i) => {
    let status: ProgressStage['status'];
    if (i < index) status = 'completed';
    else if (i > index) status = 'pending';
    else if (failed) status = 'error';
    else status = entry.stage === 'complete' ? 'completed' : 'active';

    return {
      stageName: entry.label,
      progress: !progress && i === 0 ? 0 : entry.percent,
      status,
      // Only the running row carries the live label. On any other row the
      // label would describe a different step.
      detail: status === 'active' ? progress?.label : undefined,
      ...(workflowBacked && entry.stage === DA_WORKFLOW_SERVED_STAGE
        ? { attribution: 'workflow-agent' as const }
        : {}),
    };
  });
}

/**
 * True when the AI evaluation of this run is served by the durable workflow.
 *
 * Mirrors `executeDAReviewPipeline`: a prepared request, or package evidence
 * to build one from, sends the evaluation to the workflow job. Without either,
 * the pipeline uses the older prompt evaluation, which no Agent node serves.
 */
export function isDAReviewWorkflowBacked(
  input: Pick<DAReviewExecutionInput, 'workflowRequest' | 'packageEvidence'>,
): boolean {
  return Boolean(input.workflowRequest || input.packageEvidence);
}

/**
 * True when the run shows a custom-skill row: the pipeline evaluates the
 * uploaded skills, or a resumed run already holds their results.
 */
export function hasDACustomSkillStage(
  input: Pick<DAReviewExecutionInput, 'skillBundles' | 'customSkillReviews'>,
): boolean {
  return Boolean(input.skillBundles?.length || input.customSkillReviews?.length);
}
