import type { EvaluationResultVM } from './model-assessment';
import { metricDisplayName } from './metric-display';
import { displayQuestions } from './test-case-questions';

export interface AttentionQuestion {
  key: string;
  question: string;
  /** Every question of the test case (several, in order, for multi-turn cases). */
  questions: string[];
  testSet?: string;
  regressed: boolean;
  metrics: Array<{ id: string; name: string; transition: string; finding: string }>;
}

const norm = (value?: string) => (value ?? '').trim().toLowerCase();

export function resultsWithBaseline(
  results: EvaluationResultVM[],
  runId: string,
  baselineRunId?: string,
): EvaluationResultVM[] {
  const identity = (result: EvaluationResultVM) =>
    result.testCaseId && result.metric
      ? JSON.stringify([norm(result.testSet), norm(result.testCaseId), norm(result.metric)])
      : undefined;
  const previous = new Map<string, EvaluationResultVM[]>();
  for (const result of results) {
    if (!baselineRunId || norm(result.runId) !== norm(baselineRunId)) continue;
    const key = identity(result);
    if (key) previous.set(key, [...(previous.get(key) ?? []), result]);
  }
  return results.filter((result) => norm(result.runId) === norm(runId)).map((result) => {
    const key = identity(result);
    const matches = key ? previous.get(key) : undefined;
    return {
      ...result,
      previousStatus: matches?.length === 1 ? matches[0].status : undefined,
    };
  });
}

/** Uses the run's recorded baseline, not the selected comparison columns. */
export function attentionQuestions(results: EvaluationResultVM[]): AttentionQuestion[] {
  const groups = new Map<string, AttentionQuestion>();
  for (const result of results) {
    const current = norm(result.status);
    if (current !== 'fail' && current !== 'error') continue;
    const previous = norm(result.previousStatus);
    const hasPrevious = ['pass', 'fail', 'error', 'excluded'].includes(previous);
    const regressed = previous === 'pass';
    const key = JSON.stringify([
      norm(result.testSet),
      norm(result.testCaseId) || result.id,
    ]);
    const group = groups.get(key) ?? {
      key,
      question: result.question?.trim() || 'Question text unavailable',
      questions: displayQuestions(result),
      testSet: result.testSet,
      regressed: false,
      metrics: [],
    };
    if (group.question === 'Question text unavailable' && result.question?.trim()) {
      group.question = result.question.trim();
    }
    const questions = displayQuestions(result);
    if (questions.length > group.questions.length) group.questions = questions;
    group.regressed ||= regressed;
    const currentLabel = current === 'fail' ? 'Fail' : 'Error';
    group.metrics.push({
      id: result.id,
      name: metricDisplayName(result.metric, result.grader) || 'Unnamed metric',
      transition: `${hasPrevious ? previous[0].toUpperCase() + previous.slice(1) : 'No prior result'} → ${currentLabel}`,
      finding: regressed
        ? 'Regressed'
        : current === 'error'
          ? 'Evaluation error'
          : previous === 'fail'
            ? 'Still failing'
            : hasPrevious ? 'Failed' : 'Failed — no comparison',
    });
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.regressed) - Number(a.regressed) || a.question.localeCompare(b.question),
  );
}
