import type { EvaluationRunVM } from './model-assessment';

/**
 * Where the Copilot Studio evaluations are. The assessment flow writes it as JSON
 * when each MODELCHECK test set starts.
 */
export interface EvaluationProgressVM {
  /** Test cases in each MODELCHECK test set, in run order. */
  setCases: number[];
  /** Test sets that finished. */
  setsDone: number;
  /** When the test set now running started. */
  setStartedOn?: string;
}

/**
 * Copilot Studio reports a test set's results only when the whole set finishes,
 * so progress within the running set is estimated from a pace per test case.
 * This one is used until the agent has a finished assessment to learn from.
 */
export const DEFAULT_MS_PER_CASE = 15_000;
/** Recent finished assessments the agent's pace is learned from. */
const PACE_RUNS = 3;
const MIN_MS_PER_CASE = 2_000;
const MAX_MS_PER_CASE = 120_000;
/** Share of the running test set the estimate covers at a steady pace before it slows down. */
const STEADY_SHARE = 0.8;

export function parseEvaluationProgress(value: string | undefined): EvaluationProgressVM | undefined {
  if (!value) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== 'object') return undefined;
  const { setCases, setsDone, setStartedOn } = raw as Record<string, unknown>;
  if (!Array.isArray(setCases) || setCases.length === 0) return undefined;
  const cases = setCases.map((count) => (typeof count === 'number' && count > 0 ? Math.floor(count) : 0));
  const done = typeof setsDone === 'number' ? Math.min(Math.max(Math.floor(setsDone), 0), cases.length) : 0;
  return {
    setCases: cases,
    setsDone: done,
    ...(typeof setStartedOn === 'string' ? { setStartedOn } : {}),
  };
}

export interface EvaluationProgressSummary {
  /** Share of the evaluations done, weighted by test cases. */
  fraction: number;
  /** e.g. "Test set 2 of 3 · Evaluating 10 test cases". */
  label: string;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * Time per test case in the agent's most recent finished assessments (newest
 * first), start to finish. Agents differ a lot: a standard agent takes seconds
 * per test case, a Microsoft Copilot harness agent about half a minute.
 */
export function estimateMsPerCase(runs: EvaluationRunVM[]): number {
  const paces = runs
    .filter((run) => (run.status ?? '').toLowerCase().replace(/[^a-z]/g, '') === 'completed')
    .map((run) => {
      const cases = sum(run.progress?.setCases ?? []);
      const ms = Date.parse(run.completedOn ?? '') - Date.parse(run.startedOn ?? '');
      return cases > 0 && ms > 0 ? ms / cases : NaN;
    })
    .filter((pace) => Number.isFinite(pace))
    .slice(0, PACE_RUNS);
  if (paces.length === 0) return DEFAULT_MS_PER_CASE;
  return Math.min(Math.max(sum(paces) / paces.length, MIN_MS_PER_CASE), MAX_MS_PER_CASE);
}

/**
 * Share of the running test set done after `x` of its estimated time: steady at
 * first, then slowing, so a set that takes longer than estimated keeps moving
 * without ever filling; the flow's next update does.
 */
function setShare(x: number): number {
  if (x <= STEADY_SHARE) return x;
  const rest = 1 - STEADY_SHARE;
  return 1 - (rest * rest) / (x - STEADY_SHARE + rest);
}

export function evaluationProgress(
  progress: EvaluationProgressVM,
  now: number,
  msPerCase = DEFAULT_MS_PER_CASE,
): EvaluationProgressSummary {
  const { setCases, setsDone } = progress;
  // A set without a case count still moves the bar, as if it had one case.
  const weights = setCases.map((count) => count || 1);
  const current = weights[setsDone] ?? 0;
  const started = Date.parse(progress.setStartedOn ?? '');
  const elapsed = Number.isNaN(started) ? 0 : Math.max(now - started, 0);
  const running = current ? setShare(elapsed / (current * msPerCase)) : 0;
  const fraction = (sum(weights.slice(0, setsDone)) + current * running) / sum(weights);

  const setLabel = `Test set ${Math.min(setsDone + 1, setCases.length)} of ${setCases.length}`;
  const evaluating = setCases[setsDone] ?? 0;
  const label = evaluating > 0
    ? `${setLabel} · Evaluating ${evaluating} test case${evaluating === 1 ? '' : 's'}`
    : setLabel;
  return { fraction, label };
}
