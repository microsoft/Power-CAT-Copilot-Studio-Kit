import type { StepExecution } from '../contracts/transcript';
import type { FlowRunCandidate } from '../services/flow-run-service';
import { normalizeTimestampMs } from './transcript/timestamp';

function finiteTimestamp(value: unknown): number | undefined {
  const result = normalizeTimestampMs(value);
  return result !== undefined && Number.isFinite(new Date(result).getTime()) ? result : undefined;
}

/** Rank evidence, never turn a nearest timestamp into a guaranteed invocation-ID match. */
export function rankFlowRunCandidates(
  candidates: readonly FlowRunCandidate[],
  execution: StepExecution | undefined,
): FlowRunCandidate[] {
  const finish = finiteTimestamp(execution?.finishedAt);
  const start = finiteTimestamp(execution?.triggeredAt);
  if (finish === undefined || start === undefined || finish < start) return [...candidates];

  const evidence = (run: FlowRunCandidate): number[] => {
    const runStart = finiteTimestamp(run.startTime);
    const duration = typeof run.durationMs === 'number' && Number.isFinite(run.durationMs) && run.durationMs >= 0
      ? run.durationMs : undefined;
    const runEnd = finiteTimestamp(run.endTime)
      ?? (runStart !== undefined && duration !== undefined ? runStart + duration : undefined);
    // Dataverse timestamps may be rounded to whole seconds. Differences within
    // that precision are ties, not evidence that one subsecond run is correct.
    const endDistance = runEnd === undefined ? Infinity : Math.max(0, Math.abs(runEnd - finish) - 1000);
    const excessDuration = duration === undefined ? 0 : Math.max(0, duration - (finish - start) - 2000);
    return [run.conversationMatched ? 0 : 1, endDistance, excessDuration];
  };
  const scores = new Map(candidates.map(run => [run, evidence(run)]));
  return [...candidates].sort((a, b) => {
    const left = scores.get(a)!;
    const right = scores.get(b)!;
    for (let index = 0; index < left.length; index++) {
      if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
    }
    return 0;
  });
}
