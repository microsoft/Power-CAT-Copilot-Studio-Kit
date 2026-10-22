/**
 * Map Copilot-review progress onto the shared stepper's stage list.
 *
 * The Copilot review reported progress as a single thin bar while every other
 * review in the product used `ReviewProgressDialog` -- a modal with one row per
 * phase, each showing a spinner, a tick or a pending circle. Re-running from a
 * saved Copilot review therefore looked like a different product.
 *
 * The two backends report progress differently: the standard pipeline emits a
 * list of stages, the Copilot pipeline emits the *current* stage only. Deriving
 * the list here lets the Copilot review reuse the existing dialog unchanged,
 * rather than growing a second progress component that would drift from it.
 */
import type { SkillReviewProgress } from '../../core/index.js';
import type { ProgressStage } from '../contracts.js';

/**
 * Stages a Copilot Studio workflow serves, by index into {@link PHASES}.
 *
 * `Evaluating skills` is unconditional under the workflow backend: the port
 * overrides `invokeStandardSkillBundleEvaluator` outright.
 *
 * `Analysing resources` is the normal path rather than a guarantee. The agent
 * node analyses every resource in the same call that produced the evaluation,
 * so the local chunk-then-synthesise cascade is skipped. It falls back to AI
 * Builder only when the workflow returned no resources — an environment whose
 * workflow predates that node, or one where it failed. That fallback is the
 * degraded case, not the shipped configuration.
 */
const WORKFLOW_SERVED_PHASES = new Set([3, 4]);

/** The Copilot pipeline's stages, in the order they run. */
const STAGE_ORDER: SkillReviewProgress['stage'][] = [
  'loading',
  'downloading',
  'deterministic-scan',
  'standard-ai',
  'deep-resource-ai',
  'file-synthesis',
  'bundle-synthesis',
  'persisting',
  'complete',
];

/**
 * Position of a stage in the run order; -1 when unknown.
 *
 * Exported so the caller can hold progress monotonic. Stages arrive out of
 * order in normal operation: bundles are reviewed concurrently, so one can
 * report `downloading` while another is already at `standard-ai`, and the
 * workflow's own submit phase maps back to `loading`. Rendering whichever
 * arrived last made the stepper walk backwards.
 */
export function stageRank(stage: SkillReviewProgress['stage']): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * User-facing phases.
 *
 * The nine internal stages collapse to six rows: the three deep stages are one
 * phase to a maker ("analysing the files"), and splitting them would show rows
 * that never light up for a skill with no resources.
 */
const PHASES: Array<{ label: string; stages: SkillReviewProgress['stage'][] }> = [
  { label: 'Loading configuration', stages: ['loading'] },
  { label: 'Downloading skill files', stages: ['downloading'] },
  { label: 'Running deterministic checks', stages: ['deterministic-scan'] },
  { label: 'Evaluating skills', stages: ['standard-ai'] },
  {
    label: 'Analysing resources',
    stages: ['deep-resource-ai', 'file-synthesis', 'bundle-synthesis'],
  },
  { label: 'Saving results', stages: ['persisting', 'complete'] },
];

/**
 * Build the stage list for {@link ReviewProgressDialog}.
 *
 * @param progress - Latest Copilot progress, or null before the first report.
 * @param failed - True when the review has errored, so the active row shows the
 *   error state instead of a spinner that would never resolve.
 * @returns One entry per phase, in run order.
 */
export function copilotProgressToStages(
  progress: SkillReviewProgress | null,
  failed = false,
  workflowBacked = false,
): ProgressStage[] {
  const currentIndex = progress ? STAGE_ORDER.indexOf(progress.stage) : -1;
  const activePhase = progress
    ? PHASES.findIndex(phase => phase.stages.includes(progress.stage))
    : -1;

  return PHASES.map((phase, index) => {
    // Compare on run order, not phase index: a stage the pipeline skipped (a
    // skill with no resources never enters the deep stages) must still settle
    // as completed rather than spin forever.
    const lastStageOfPhase = phase.stages[phase.stages.length - 1];
    const phaseEndIndex = STAGE_ORDER.indexOf(lastStageOfPhase);

    let status: ProgressStage['status'];
    if (activePhase === index) status = failed ? 'error' : 'active';
    else if (currentIndex > phaseEndIndex) status = 'completed';
    else status = 'pending';

    // Once the run reaches 'complete', every phase is done.
    if (progress?.stage === 'complete' && !failed && index < PHASES.length - 1) {
      status = 'completed';
    }

    return {
      stageName: phase.label,
      progress: progress?.percent ?? 0,
      status,
      detail: activePhase === index ? copilotStageDetail(progress) : undefined,
      attribution:
        workflowBacked && WORKFLOW_SERVED_PHASES.has(index)
          ? ('workflow-agent' as const)
          : undefined,
    };
  });
}

/**
 * One line of live detail for the active phase.
 *
 * The workflow backend can sit in a single stage for minutes, so the phase name
 * alone cannot distinguish working from stuck. The unit counter is what moves.
 */
export function copilotStageDetail(progress: SkillReviewProgress | null): string | undefined {
  if (!progress) return undefined;

  const parts: string[] = [];
  if (progress.message) parts.push(progress.message);

  // The workflow phrases its own message as "Reviewed 2 of 4 skills", which is
  // the same pair of numbers the unit counter would print. Appending it gave
  // "Reviewed 0 of 4 skills · 0 / 4 units" -- the same fact twice.
  const messageAlreadyCounts =
    progress.totalUnits > 0 && new RegExp(`\\bof ${progress.totalUnits}\\b`).test(progress.message);

  if (progress.totalUnits > 0 && !messageAlreadyCounts) {
    parts.push(`${progress.completedUnits} / ${progress.totalUnits} units`);
  }
  if (progress.resourcePath) parts.push(progress.resourcePath);
  else if (progress.skillName) parts.push(progress.skillName);
  if (progress.partialFailures > 0) {
    const n = progress.partialFailures;
    parts.push(`${n} ${n === 1 ? 'failure' : 'failures'}`);
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}
