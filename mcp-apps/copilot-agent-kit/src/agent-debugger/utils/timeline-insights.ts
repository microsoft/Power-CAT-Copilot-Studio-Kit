import type { ProcessedTurn } from '../contracts/transcript';
import {
  execTimeToMs,
  resolveExecutionTimeString,
  guessStepSubtitle,
} from './step-classification';
import { GENERATIVE_THINKING_TASK_ID } from './transcript/parse-generative-transcript';

/** Step executions that are bookkeeping rather than real, timed work. */
const NON_TIMED_TASK_IDS = new Set([
  'P:CaptureContextTool',
  'P:SendMessageTool',
  GENERATIVE_THINKING_TASK_ID,
]);

function isTimedStep(taskDialogId: string | undefined): boolean {
  return !!taskDialogId && !NON_TIMED_TASK_IDS.has(taskDialogId);
}

/** Duration of a single step execution in milliseconds. */
export function stepDurationMs(exec: {
  executionTime?: string;
  triggeredAt?: string;
  finishedAt?: string;
}): number {
  const resolved = resolveExecutionTimeString(exec);
  if (resolved) {
    const ms = execTimeToMs(resolved);
    if (ms > 0) return ms;
  }
  const start = exec.triggeredAt ? new Date(exec.triggeredAt).getTime() : 0;
  const end = exec.finishedAt ? new Date(exec.finishedAt).getTime() : 0;
  if (start && end && end > start) return end - start;
  return 0;
}

/** Wall-clock duration of an assistant turn, derived from its step executions. */
export function turnDurationMs(turn: ProcessedTurn): number {
  const execs = turn.debugInfo?.stepExecutions ?? [];
  let earliest = Number.POSITIVE_INFINITY;
  let latest = 0;
  for (const exec of execs) {
    if (!isTimedStep(exec.taskDialogId)) continue;
    const start = exec.triggeredAt ? new Date(exec.triggeredAt).getTime() : 0;
    const duration = stepDurationMs(exec);
    const timestampEnd = exec.finishedAt
      ? new Date(exec.finishedAt).getTime()
      : 0;
    const end = Math.max(timestampEnd, start + duration);
    if (start && start < earliest) earliest = start;
    if (end && end > latest) latest = end;
  }
  if (!Number.isFinite(earliest) || latest <= earliest) {
    // Fall back to the sum of step durations when timestamps are missing.
    return execs.reduce(
      (sum, exec) => sum + (isTimedStep(exec.taskDialogId) ? stepDurationMs(exec) : 0),
      0,
    );
  }
  return latest - earliest;
}

/** Distinct component types present across the transcript, in first-seen order. */
export function collectStepTypes(turns: ProcessedTurn[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const turn of turns) {
    for (const exec of turn.debugInfo?.stepExecutions ?? []) {
      if (!isTimedStep(exec.taskDialogId)) continue;
      const type = exec.subtitle || guessStepSubtitle(exec.taskDialogId, exec.type, undefined, exec.observation);
      if (!type || seen.has(type)) continue;
      seen.add(type);
      out.push(type);
    }
  }
  return out;
}

/** Total number of timed steps across the transcript. */
export function countSteps(turns: ProcessedTurn[]): number {
  let count = 0;
  for (const turn of turns) {
    for (const exec of turn.debugInfo?.stepExecutions ?? []) {
      if (isTimedStep(exec.taskDialogId)) count += 1;
    }
  }
  return count;
}
