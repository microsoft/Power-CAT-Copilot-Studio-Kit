import { STOPPED_AFTER_DETECT, type EvaluationRunVM, type KitRunVM, type Tone } from './model-assessment';
import type { StepState } from './step-progress';

const norm = (value: string | undefined) => (value ?? '').toLowerCase().replace(/[^a-z]/g, '');

export interface KitTestTurnVM {
  id: string;
  testId?: string;
  utterance: string;
  testType?: number;
  operator?: number;
  code?: number;
  response?: string;
  /** No result exists; this turn comes from the current test definition. */
  fromDefinition?: boolean;
}

export interface KitTestTurnRow {
  key: string;
  utterance: string;
  metric: string;
  byRun: Map<string, KitTestTurnVM>;
}

/** One top-level Copilot Agent Kit test result (cat_copilottestresult). */
export interface KitTestResultVM {
  id: string;
  testRunId: string;
  testId?: string;
  utterance?: string;
  /** Conversation questions; turns identify any unrecorded, current-definition fallbacks. */
  questions?: string[];
  testName?: string;
  turns?: KitTestTurnVM[];
  expected?: string;
  response?: string;
  /** Kit comparison operator code (cat_comparisonoperator). */
  operator?: number;
  /** Kit test type code (cat_testtypecode). */
  testType?: number;
  /** Kit result code: 1 Success, 2 Failed, 3 Unknown, 4 Error, 5 Pending. */
  code: number;
  reason?: string;
  /** Kit test set of the Kit test run. */
  testSetName?: string;
}

/** A Kit test pivoted across the selected assessment runs (keyed by Kit test run id). */
export interface KitTestRow {
  key: string;
  utterance: string;
  questions?: string[];
  testName?: string;
  multiTurn?: boolean;
  turns?: KitTestTurnRow[];
  expected?: string;
  /** Friendly name of what the Kit test checks. */
  metric: string;
  testSetName?: string;
  byRun: Map<string, KitTestResultVM>;
}

/** Kit tests of one Kit test set. */
export interface KitTestSetGroup {
  name: string;
  rows: KitTestRow[];
}

/** Keep conversation sets and tests first, then use alphabetical order within each type. */
export function groupKitRowsBySet(rows: KitTestRow[]): KitTestSetGroup[] {
  const groups = new Map<string, KitTestSetGroup>();
  for (const row of rows) {
    const name = row.testSetName?.trim() || 'Kit tests';
    const group = groups.get(name) ?? { name, rows: [] };
    group.rows.push(row);
    groups.set(name, group);
  }
  for (const group of groups.values()) {
    group.rows.sort((a, b) => Number(Boolean(b.multiTurn)) - Number(Boolean(a.multiTurn))
      || a.utterance.localeCompare(b.utterance));
  }
  return [...groups.values()].sort((a, b) =>
    Number(b.rows.some((row) => row.multiTurn)) - Number(a.rows.some((row) => row.multiTurn))
    || a.name.localeCompare(b.name));
}

const KIT_RESULT_LABELS: Record<number, string> = {
  1: 'Passed',
  2: 'Failed',
  3: 'Unknown',
  4: 'Error',
  5: 'Pending',
};

export function kitResultLabel(code: number): string {
  return KIT_RESULT_LABELS[code] ?? 'Unknown';
}

const KIT_RESULT_STATUS: Record<number, string> = { 1: 'Pass', 2: 'Fail', 4: 'Error' };

/** Kit result as an evaluation status (Pass/Fail/Error), so both kinds compare the same way. */
export function kitResultStatus(code: number | undefined): string | undefined {
  return code === undefined ? undefined : KIT_RESULT_STATUS[code] ?? kitResultLabel(code);
}

/** Status of a Kit test in each run, in run order (undefined when the run has no result). */
export function kitRowStatuses(row: KitTestRow, runs: EvaluationRunVM[]): Array<string | undefined> {
  return runs.map((run) => {
    const id = run.kit?.testRunId?.toLowerCase();
    return kitResultStatus(id ? row.byRun.get(id)?.code : undefined);
  });
}

/** A Kit test needs attention when any selected run failed or errored it. */
export function kitRowNeedsAttention(row: KitTestRow, runs: EvaluationRunVM[]): boolean {
  return kitRowStatuses(row, runs).some((status) => status === 'Fail' || status === 'Error');
}

export function kitResultTone(code: number): Tone {
  switch (code) {
    case 1:
      return 'success';
    case 2:
      return 'danger';
    case 4:
      return 'warning';
    case 5:
      return 'brand';
    default:
      return 'neutral';
  }
}

const KIT_OPERATOR_METRICS: Record<number, string> = {
  1: 'Exact Response Match',
  2: 'Response Differs',
  3: 'Required Information Included',
  4: 'Unwanted Information Excluded',
  5: 'Response Opening',
  6: 'Response Opening Excluded',
  7: 'Response Ending',
  8: 'Response Ending Excluded',
  9: 'Response Provided',
};

const KIT_TEST_TYPE_METRICS: Record<number, string> = {
  2: 'Topic Routing',
  3: 'Card and Attachment Check',
  4: 'Generative Answer Quality',
  5: 'Conversation Flow',
  6: 'Plan Validation',
};

/** Human-friendly name of what a Kit test checks, from its test type and comparison operator. */
export function kitMetricName(testType: number | undefined, operator: number | undefined): string {
  if (testType !== undefined && testType !== 1 && KIT_TEST_TYPE_METRICS[testType]) {
    return KIT_TEST_TYPE_METRICS[testType];
  }
  return (operator !== undefined && KIT_OPERATOR_METRICS[operator]) || 'Response Check';
}

/** Group Kit results by test so each row shows the same test across runs. */
export function pivotKitResults(results: KitTestResultVM[]): KitTestRow[] {
  const rows = new Map<string, KitTestRow>();
  for (const result of results) {
    const key = result.testId?.toLowerCase() || `utterance:${(result.utterance ?? result.id).trim().toLowerCase()}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        utterance: result.utterance?.trim() || (result.testType === 5 ? '(conversation test, no questions recorded)' : '(no utterance)'),
        questions: result.questions,
        testName: result.testName,
        multiTurn: result.testType === 5 || Boolean(result.turns?.length) || (result.questions?.length ?? 0) > 1,
        expected: result.expected,
        metric: kitMetricName(result.testType, result.operator),
        testSetName: result.testSetName,
        byRun: new Map(),
      };
      rows.set(key, row);
    }
    if (!row.questions?.length && result.questions?.length) row.questions = result.questions;
    row.multiTurn ||= result.testType === 5 || Boolean(result.turns?.length) || (result.questions?.length ?? 0) > 1;
    row.testName ||= result.testName;
    row.byRun.set(result.testRunId.toLowerCase(), result);
  }
  return [...rows.values()].map((row) => {
    if (row.multiTurn) row.turns = pivotKitTurns(row);
    return row;
  }).sort((a, b) => a.utterance.localeCompare(b.utterance));
}

function pivotKitTurns(row: KitTestRow): KitTestTurnRow[] {
  const turns = new Map<string, KitTestTurnRow>();
  for (const [runId, result] of row.byRun) {
    const recorded: KitTestTurnVM[] = result.turns ?? result.questions?.map((utterance, index) => ({
      id: `${index}`, utterance,
    })) ?? [];
    for (const [index, turn] of recorded.entries()) {
      const key = turn.testId?.toLowerCase() || `${index}:${turn.utterance.trim().toLowerCase()}`;
      const existing = turns.get(key) ?? {
        key, utterance: turn.utterance,
        metric: kitMetricName(turn.testType, turn.operator),
        byRun: new Map<string, KitTestTurnVM>(),
      };
      existing.byRun.set(runId, turn);
      turns.set(key, existing);
    }
  }
  return [...turns.values()];
}

/** Step states of a Kit track, mirroring the assessment steps. */
export function kitSteps(kit: KitRunVM | undefined): StepState[] {
  switch (norm(kit?.status)) {
    case '':
      return ['active', 'pending', 'pending', 'pending'];
    case 'running':
      return ['done', 'active', 'pending', 'pending'];
    case 'analysing':
    case 'analyzing':
      return ['done', 'done', 'done', 'active'];
    case 'completed':
      return ['done', 'done', 'done', 'done'];
    default:
      return kit && kit.total > 0 && kit.pass + kit.fail > 0
        ? ['done', 'done', 'skipped', 'skipped']
        : ['done', 'skipped', 'skipped', 'skipped'];
  }
}

/**
 * Assessment steps of a run in Kit mode, where the Kit tests replace the
 * Copilot evaluation: detect the model change, run the Kit tests, score them
 * and write the AI analysis.
 */
export function kitAssessmentSteps(run: EvaluationRunVM | undefined, active: boolean): StepState[] {
  const status = norm(run?.status) || (active ? 'requested' : '');
  if (['', 'requested', 'detecting'].includes(status)) return ['active', 'pending', 'pending', 'pending'];
  if (run?.kit) {
    const [starting, running, scoring, analysis] = kitSteps(run.kit);
    const testing: StepState = starting === 'active' || running === 'active' ? 'active' : running;
    return ['done', testing, scoring, analysis];
  }
  if (STOPPED_AFTER_DETECT.has(status)) return ['done', 'skipped', 'skipped', 'skipped'];
  if (['completed', 'completedwitherrors'].includes(status)) return ['done', 'done', 'done', 'done'];
  return ['done', 'active', 'pending', 'pending'];
}
