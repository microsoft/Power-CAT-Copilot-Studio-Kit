/**
 * Maps workflow job progress onto the review's existing progress contract
 * (spec 014 §5.5.3).
 *
 * The workflow cannot maintain a counter itself -- appending to a shared
 * variable inside a parallel loop is a lost update -- so it writes a
 * "last completed" ping instead. The accurate count comes from the client
 * counting child rows, which each iteration inserts independently.
 */
import type { SkillReviewProgress } from '../../contracts/SkillBundle.js';

export interface WorkflowJobProgress {
  phase: 'submitting' | 'queued' | 'running' | 'complete';
  message: string;
  componentCount: number;
  completedComponents?: number;
  lastCompleted?: string;
}

/** Percent shown for each workflow phase. Monotonic, never decreasing. */
const PHASE_PERCENT: Record<WorkflowJobProgress['phase'], number> = {
  submitting: 10,
  queued: 15,
  running: 40,
  complete: 85,
};

/** The running phase spans this band; component progress interpolates within it. */
const RUNNING_BAND = { from: 15, to: 85 } as const;

/** Stage mapped onto the existing review stage vocabulary. */
const PHASE_STAGE: Record<WorkflowJobProgress['phase'], SkillReviewProgress['stage']> = {
  submitting: 'loading',
  queued: 'loading',
  running: 'standard-ai',
  complete: 'standard-ai',
};

/**
 * Converts a workflow phase into a `SkillReviewProgress` the existing
 * `CopilotReviewProgress` component renders unchanged.
 *
 * While the workflow runs, the percentage is derived from the child-row count
 * rather than the phase, so the bar tracks real work. Without a count it falls
 * back to the phase constant -- indeterminate, but never wrong.
 *
 * @param progress - Phase reported by the workflow provider.
 * @param currentMaxPercent - Highest percent already shown, so the bar never
 *   moves backwards when phases interleave with client-side stages.
 */
export function toSkillReviewProgress(
  progress: WorkflowJobProgress,
  currentMaxPercent = 0,
): SkillReviewProgress {
  const completed = progress.completedComponents;
  const total = progress.componentCount;
  const hasCount =
    progress.phase === 'running' && completed !== undefined && total > 0;

  const percent = hasCount
    ? RUNNING_BAND.from +
      Math.round((Math.min(completed, total) / total) * (RUNNING_BAND.to - RUNNING_BAND.from))
    : PHASE_PERCENT[progress.phase];

  // "components" reads as "all agent components", but this counter tracks only
  // the per-skill AI loop. Tools, knowledge and connected agents are covered by
  // the deterministic rules and as context inside each skill pass, so naming
  // skills here stops the number from understating what actually ran.
  //
  // The name of the skill that just finished is already carried on the liveness
  // ping, so showing it costs nothing and turns an abstract counter into
  // something the maker can recognise.
  const message = hasCount
    ? withSkillName(
      `Reviewed ${Math.min(completed, total)} of ${total} ${total === 1 ? 'skill' : 'skills'}`,
      progress,
    )
    : withLastCompleted(progress);

  return {
    stage: PHASE_STAGE[progress.phase],
    percent: Math.max(currentMaxPercent, percent),
    message,
    completedUnits: hasCount ? Math.min(completed, total) : 0,
    totalUnits: total,
    partialFailures: 0,
  };
}

/** Falls back to the liveness ping when no component count is available. */
function withLastCompleted(progress: WorkflowJobProgress): string {
  const lastCompleted = formatLastCompleted(progress.lastCompleted);
  return lastCompleted ? `${progress.message} · ${lastCompleted}` : progress.message;
}

/**
 * Append the name of the skill that just finished to a counted message.
 *
 * The flow writes the ping as "Reviewed <skill-name>" (verified against live
 * rows), so the leading verb is stripped to avoid "Reviewed 2 of 4 skills ·
 * Reviewed display-audit". The strip is conditional: the column is free text
 * that races between parallel iterations, so anything not matching the expected
 * shape is shown unchanged rather than mangled.
 */
function withSkillName(counted: string, progress: WorkflowJobProgress): string {
  const ping = formatLastCompleted(progress.lastCompleted);
  if (!ping) return counted;
  const name = ping.replace(/^reviewed\s+/i, '').trim();
  return name ? `${counted} · ${name}` : counted;
}

/**
 * Normalizes the workflow's liveness ping for display.
 *
 * The flow writes free text and the value races between parallel iterations —
 * any value is a valid "recently finished" signal, so this only trims and caps
 * it rather than trying to interpret it.
 */
export function formatLastCompleted(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}
