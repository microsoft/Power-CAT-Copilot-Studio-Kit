import {
  isSkippedConcurrentRun,
  runDisplayStatus,
  runNotice,
  type EvaluationRunVM,
  type ModelHistoryVM,
  type TrackedAgentVM,
} from './model-assessment';
import { modelDisplayName } from './model-display';

const norm = (value: string | undefined) =>
  (value ?? '').toLowerCase().replace(/[^a-z]/g, '');

export type ComparisonChange = 'unchanged' | 'changed' | 'regressed' | 'improved';

const hasKitResults = (run: EvaluationRunVM) =>
  norm(run.kit?.status) === 'completed' && Boolean(run.kit?.testRunId) && (run.kit?.total ?? 0) > 0;

/**
 * Whether a run is a stable, completed snapshot with persisted results: Copilot
 * Studio evaluation results, or a finished Kit test run (Kit mode).
 */
export function isComparableRun(
  run: EvaluationRunVM,
  resultRunIds: ReadonlySet<string>,
): boolean {
  if (!['completed', 'completedwitherrors'].includes(norm(run.status))) return false;
  if (resultRunIds.has(run.id.toLowerCase())) return true;
  return hasKitResults(run);
}

/**
 * Whether a run can be offered for comparison: a comparable run that scored at
 * least one test case. A run where every test case errored (for example, the
 * Copilot Studio evaluation limit was reached) has nothing to compare.
 */
export function isScoredRun(
  run: EvaluationRunVM,
  resultRunIds: ReadonlySet<string>,
): boolean {
  return isComparableRun(run, resultRunIds) && (run.pass + run.fail > 0 || hasKitResults(run));
}

/** Deterministic chronological ordering for comparison columns. */
export function compareRunsChronologically(a: EvaluationRunVM, b: EvaluationRunVM): number {
  const time = (run: EvaluationRunVM) =>
    Date.parse(run.completedOn ?? run.startedOn ?? run.createdOn ?? '') || 0;
  return time(a) - time(b) || a.id.localeCompare(b.id);
}

/**
 * The run a comparison opens against: the baseline the flow linked, or, when that
 * link is missing or has nothing to compare, the latest earlier scored run with the
 * same kind of results. The link is missing when the previous run completed with
 * errors before any clean run, was cancelled after handing off to the Kit tests, or
 * when the agent switched between Kit tests and Copilot Studio evaluations.
 */
export function comparisonBaseline(
  run: EvaluationRunVM,
  runs: readonly EvaluationRunVM[],
  resultRunIds: ReadonlySet<string>,
): EvaluationRunVM | undefined {
  const scored = runs.filter((candidate) =>
    candidate.id !== run.id && isScoredRun(candidate, resultRunIds));
  const linkedId = run.comparedToRunId?.toLowerCase();
  const linked = linkedId ? scored.find((candidate) => candidate.id.toLowerCase() === linkedId) : undefined;
  if (linked) return linked;
  const hasEvaluations = resultRunIds.has(run.id.toLowerCase());
  const hasKit = hasKitResults(run);
  return scored
    .filter((candidate) => compareRunsChronologically(candidate, run) < 0)
    .filter((candidate) =>
      (hasEvaluations && resultRunIds.has(candidate.id.toLowerCase())) ||
      (hasKit && hasKitResults(candidate)))
    .sort((a, b) => compareRunsChronologically(b, a))[0];
}

const sameModel = (a: string | undefined, b: string | undefined) =>
  Boolean(a?.trim()) && a?.trim().toLowerCase() === b?.trim().toLowerCase();

/**
 * Explains why a comparison does not open against the previous model named in the
 * run's model history: that model's run has a different kind of results (Kit tests
 * versus Copilot Studio evaluations) or no results to compare.
 */
export function comparisonBaselineNote(
  run: EvaluationRunVM,
  baseline: EvaluationRunVM | undefined,
  runs: readonly EvaluationRunVM[],
  history: readonly ModelHistoryVM[],
  resultRunIds: ReadonlySet<string>,
): string | undefined {
  const historyById = new Map(history.map((item) => [item.id, item]));
  const modelOf = (candidate: EvaluationRunVM) =>
    candidate.historyId ? historyById.get(candidate.historyId)?.currentModel : undefined;
  const previousModel = run.historyId ? historyById.get(run.historyId)?.previousModel : undefined;
  if (baseline && baseline.id.toLowerCase() === run.comparedToRunId?.toLowerCase()) return undefined;
  if (!previousModel?.trim() || (baseline && sameModel(modelOf(baseline), previousModel))) return undefined;

  const evaluations = resultRunIds.has(run.id.toLowerCase());
  const kind = evaluations ? 'Copilot Studio evaluations' : 'Copilot Agent Kit tests';
  const previousRun = runs
    .filter((candidate) =>
      candidate.id !== run.id &&
      sameModel(modelOf(candidate), previousModel) &&
      isScoredRun(candidate, resultRunIds) &&
      compareRunsChronologically(candidate, run) < 0)
    .sort((a, b) => compareRunsChronologically(b, a))[0];
  if (previousRun && (evaluations
    ? resultRunIds.has(previousRun.id.toLowerCase())
    : hasKitResults(previousRun))) return undefined;

  const previous = `The previous model, ${modelDisplayName(previousModel)},`;
  const reason = previousRun
    ? `${previous} was assessed with ${evaluations ? 'Copilot Agent Kit tests' : 'Copilot Studio evaluations'}, so its results can't be compared with this run.`
    : `${previous} has no completed results to compare with this run.`;
  const baselineName = baseline ? modelDisplayName(modelOf(baseline)) : '';
  const fallback = !baseline
    ? `No earlier run has ${kind} to compare with.`
    : baselineName
      ? `Comparing with ${baselineName} instead, as it has the latest run with ${kind}.`
      : `Comparing with the latest earlier run with ${kind} instead.`;
  return `${reason} ${fallback}`;
}

/** Classify all adjacent transitions so an intermediate change is never hidden. */
export function classifyRunStatuses(statuses: Array<string | undefined>): ComparisonChange {
  let regressed = false;
  let improved = false;
  let changed = false;
  // A run without a result for the test (not run) is skipped, not counted as a change.
  const present = statuses.map(norm).filter(Boolean);
  for (let i = 1; i < present.length; i += 1) {
    const previous = present[i - 1];
    const current = present[i];
    if (previous === current) continue;
    changed = true;
    if (previous === 'pass' && (current === 'fail' || current === 'error')) {
      regressed = true;
    }
    if ((previous === 'fail' || previous === 'error') && current === 'pass') {
      improved = true;
    }
  }
  if (regressed) return 'regressed';
  if (improved) return 'improved';
  return changed ? 'changed' : 'unchanged';
}

/** Combine the latest run status with the latest completed result summary. */
export function withRunSummary(
  agent: TrackedAgentVM,
  runs: EvaluationRunVM[],
  resultRunIds: ReadonlySet<string>,
  history: readonly ModelHistoryVM[] = [],
): TrackedAgentVM {
  const agentRuns = runs.filter((run) => run.agentId === agent.id);
  // A run skipped because another was in progress says nothing about the agent;
  // report the run that actually did the work.
  const latestRun = agentRuns.find((run) => !isSkippedConcurrentRun(run)) ?? agentRuns[0];
  const latestCompletedAssessment = agentRuns.find(
    (run) => isComparableRun(run, resultRunIds),
  );
  const lastRunModel = latestRun?.historyId
    ? history.find((entry) => entry.id === latestRun.historyId)?.currentModel
    : undefined;
  return {
    ...agent,
    lastRunStatus: latestRun ? runDisplayStatus(latestRun) : 'None',
    lastRunId: latestRun?.id,
    ...(lastRunModel ? { lastRunModel } : {}),
    lastRunCompletedOn: latestRun?.completedOn ?? latestRun?.startedOn,
    lastKit: latestRun?.kit,
    lastRunMessage: runNotice(latestRun)?.message,
    regression: latestCompletedAssessment?.regression ?? 'Not Assessed',
    pass: latestCompletedAssessment?.pass ?? 0,
    fail: latestCompletedAssessment?.fail ?? 0,
    error: latestCompletedAssessment?.error ?? 0,
    excluded: latestCompletedAssessment?.excluded ?? 0,
  };
}
