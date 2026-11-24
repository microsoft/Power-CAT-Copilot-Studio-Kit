/**
 * Contracts for the Model Assessment feature.
 *
 * The four Dataverse tables (cat_trackedagent, cat_modelhistory,
 * cat_evaluationrun, cat_evaluationresult) are read through the generic
 * commondataserviceforapps connector. These view models are the projection the
 * UI renders; they intentionally mirror the approved design-1 prototype so the
 * grid, drawer, compare and sync surfaces map one-to-one onto real rows.
 */

import type { EvaluationProgressVM } from './evaluation-progress';
import { metricDisplayName } from './metric-display';

export const ENTITY_SET = {
  trackedAgent: 'cat_trackedagents',
  modelHistory: 'cat_modelhistories',
  evaluationRun: 'cat_evaluationruns',
  evaluationResult: 'cat_evaluationresults',
  kitConfiguration: 'cat_copilotconfigurations',
  kitTestSet: 'cat_copilottestsets',
  kitTest: 'cat_copilottests',
  kitTestRun: 'cat_copilottestruns',
  kitTestResult: 'cat_copilottestresults',
} as const;

/**
 * Per-agent assessment engine settings (saved on cat_trackedagent). An
 * assessment runs either the Copilot Studio evaluations or the Copilot Agent
 * Kit tests; `enabled` (cat_runkittests) selects the Kit tests.
 */
export interface KitSettingsVM {
  enabled: boolean;
  configurationId?: string;
  testSetId?: string;
}

/**
 * The Copilot Agent Kit test track of an assessment run. For agents in Kit
 * mode the "Model Assessment | Run Copilot Agent Kit Tests" flow runs the Kit tests once the
 * model change is confirmed, waits up to 40 minutes, writes a Kit AI summary
 * and finishes the run.
 */
export interface KitRunVM {
  /** Skipped, Running, Analysing, Completed, Failed or Timed Out. */
  status: string;
  message?: string;
  summary?: string;
  testRunId?: string;
  pass: number;
  fail: number;
  total: number;
  regressed: number;
  improved: number;
  startedOn?: string;
  completedOn?: string;
}

/** Semantic colour bucket shared by every badge in the feature. */
export type Tone = 'success' | 'warning' | 'danger' | 'brand' | 'neutral';

/**
 * What the agent can be assessed with: an active Copilot Studio evaluation test
 * set with MODELCHECK in its name, and/or a pipeline-enabled Kit
 * Agent Configuration (standard agents only).
 */
export interface AgentEnginesVM {
  copilot: boolean;
  kit: boolean;
  harness: boolean;
}

export interface TrackedAgentVM {
  id: string;
  name: string;
  schema: string;
  copilotAgentId?: string;
  /** Agent icon from Copilot Studio (data URL). */
  iconUrl?: string;
  sourceStatus: string;
  currentModel?: string;
  /** Model the agent uses right now in Copilot Studio (read on load/refresh). */
  liveModel?: string;
  /** The live model differs from the last assessed model (an assessment has not run yet). */
  modelChangePending?: boolean;
  /** Model in use before the current one, from the latest model-history entry. */
  previousModel?: string;
  regression: string;
  lastRunStatus: string;
  lastRunId?: string;
  /** Model the latest run assessed (from its model-history entry), when the run is linked to one. */
  lastRunModel?: string;
  lastRunCompletedOn?: string;
  /** Kit test track of the latest run, when the run has one. */
  lastKit?: KitRunVM;
  /** Why the latest run failed or stopped, in plain language. */
  lastRunMessage?: string;
  kit?: KitSettingsVM;
  /** Assessment engines set up for the agent in this environment. */
  engines?: AgentEnginesVM;
  pass: number;
  fail: number;
  error: number;
  excluded: number;
}

export interface ModelHistoryVM {
  id: string;
  name?: string;
  agentId?: string;
  changeType: string;
  previousModel?: string;
  currentModel?: string;
  on?: string;
}

/**
 * Estimated Copilot Credits Copilot Studio reported for an evaluation. Only
 * Microsoft Copilot harness agents report them; other runs have none.
 */
export interface CreditsVM {
  /** Credits the agent used to answer the questions. */
  conversation: number;
  /** Credits used to score the answers. */
  evaluators: number;
  /** Copilot Studio could not total every conversation. */
  partial?: boolean;
}

export interface EvaluationRunVM {
  id: string;
  name: string;
  agentId?: string;
  historyId?: string;
  comparedToRunId?: string;
  status: string;
  analysisStatus: string;
  regression: string;
  pass: number;
  fail: number;
  error: number;
  excluded: number;
  ai?: string;
  errorCategory?: string;
  errorMessage?: string;
  createdOn?: string;
  startedOn?: string;
  completedOn?: string;
  /** Present once the Kit test flow has picked the run up. */
  kit?: KitRunVM;
  /** Totals over every test set (Microsoft Copilot harness agents only). */
  credits?: CreditsVM;
  /** How far the Copilot Studio evaluations are while they run. */
  progress?: EvaluationProgressVM;
}

export interface EvaluationResultVM {
  id: string;
  name: string;
  runId?: string;
  testSet?: string;
  /** The Copilot Studio evaluation set (botcomponent) id; distinguishes sets that share a name. */
  testSetId?: string;
  testCase?: string;
  /** The test case's Dataverse botcomponent id (the connector's testCaseId). */
  testCaseId?: string;
  /** The test case is a multi-turn conversation (MultiTurnEvaluationCase). */
  multiTurn?: boolean;
  /** The actual test question/utterance sent to the agent (captured from the eval run). */
  question?: string;
  /** Every user question of the test case in order (several for multi-turn cases). */
  questions?: string[];
  metric?: string;
  /** Name of the Business Classification test method behind the result, when its test set has several. */
  grader?: string;
  status: string;
  previousStatus?: string;
  delta?: string;
  reason?: string;
  /** Credits for the whole test case, repeated on each of its metric rows (Microsoft Copilot harness agents only). */
  credits?: CreditsVM;
}

/** Normalise a status label to a comparable token (case/space insensitive). */
const norm = (value: string | undefined): string =>
  (value ?? '').toLowerCase().replace(/[^a-z]/g, '');

const modelKey = (value: string | undefined) => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Model codes match regardless of case and punctuation (gpt-41 = GPT41). */
export const sameModel = (a: string | undefined, b: string | undefined) => modelKey(a) === modelKey(b);

/**
 * Current/previous model for display. When the live Copilot Studio model
 * differs from the last assessed one, the live model is current and the last
 * assessed model becomes previous until an assessment records the change.
 */
export function withModelState(
  agent: TrackedAgentVM,
  previousFromHistory: string | undefined,
): TrackedAgentVM {
  const live = agent.liveModel?.trim();
  if (live && modelKey(live) !== modelKey(agent.currentModel)) {
    return {
      ...agent,
      currentModel: live,
      previousModel: agent.currentModel ?? previousFromHistory,
      modelChangePending: Boolean(agent.currentModel),
    };
  }
  return { ...agent, previousModel: previousFromHistory, modelChangePending: false };
}

/**
 * Previous model per agent, from the latest history entry of the agent's
 * assessed model. A newer entry can belong to a model whose assessment
 * completed with errors and was never accepted, so it is skipped; agents
 * without a matching entry fall back to their latest change.
 */
export function previousModelsByAgent(
  agents: readonly TrackedAgentVM[],
  history: readonly ModelHistoryVM[],
): Map<string, string | undefined> {
  const assessed = new Map(agents.map((agent) => [agent.id, agent.currentModel]));
  const matched = new Map<string, string | undefined>();
  const latest = new Map<string, string>();
  // History is sorted newest first.
  for (const entry of history) {
    if (!entry.agentId) continue;
    if (entry.previousModel && !latest.has(entry.agentId)) latest.set(entry.agentId, entry.previousModel);
    const model = assessed.get(entry.agentId);
    if (model && !matched.has(entry.agentId) && sameModel(entry.currentModel, model)) {
      matched.set(entry.agentId, entry.previousModel);
    }
  }
  const map = new Map<string, string | undefined>(latest);
  for (const [id, previous] of matched) map.set(id, previous);
  return map;
}

/**
 * The live model was assessed but the assessment completed with errors, so the
 * change is not recorded yet. Call after withModelState.
 */
export function changeAssessedWithErrors(agent: TrackedAgentVM): boolean {
  return Boolean(agent.modelChangePending)
    && norm(agent.lastRunStatus) === 'completedwitherrors'
    && sameModel(agent.lastRunModel, agent.currentModel);
}

export function sourceTone(status: string | undefined): Tone {
  switch (norm(status)) {
    case 'active':
      return 'success';
    case 'deleted':
      return 'danger';
    case 'accessdenied':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function regressionTone(status: string | undefined): Tone {
  switch (norm(status)) {
    case 'healthy':
      return 'success';
    case 'warning':
      return 'warning';
    case 'critical':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function isRunInProgress(status: string | undefined): boolean {
  return [
    'requested', 'running', 'detecting', 'evaluationrunning', 'evaluationcompleted',
    'kittestsrunning', 'kitsummarypending',
  ].includes(norm(status));
}

export function runTone(status: string | undefined): Tone {
  switch (norm(status)) {
    case 'completed':
      return 'success';
    case 'running':
    case 'detecting':
    case 'evaluationrunning':
    case 'requested':
    case 'kittestsrunning':
    case 'kitsummarypending':
      return 'brand';
    case 'completedwitherrors':
    case 'stale':
    case 'timedout':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function resultTone(status: string | undefined): Tone {
  switch (norm(status)) {
    case 'pass':
      return 'success';
    case 'fail':
      return 'danger';
    case 'error':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function deltaTone(delta: string | undefined): Tone {
  switch (norm(delta)) {
    case 'regressed':
      return 'danger';
    case 'improved':
      return 'success';
    case 'new':
      return 'brand';
    case 'removed':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** The Kit track is still in progress (tests running or the summary being generated). */
export function isKitActive(status: string | undefined): boolean {
  return ['running', 'analysing', 'analyzing'].includes(norm(status));
}

export function kitTone(kit: KitRunVM | undefined): Tone {
  switch (norm(kit?.status)) {
    case 'running':
    case 'analysing':
    case 'analyzing':
      return 'brand';
    case 'completed':
      return kit && (kit.regressed > 0 || kit.fail > 0) ? 'warning' : 'success';
    case 'failed':
      return 'danger';
    case 'timedout':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** Run statuses that end the pipeline right after model detection (nothing was evaluated). */
export const STOPPED_AFTER_DETECT: ReadonlySet<string> = new Set([
  'nochange',
  'noevaluationsconfigured',
  'metadataunavailable',
  'rejected',
  'failed',
  'timedout',
  'cancelled',
  'stale',
]);

/**
 * The Kit badge adds information only while the Kit tests are still in progress.
 * Once they finish, the run status, verdict and counts already tell the outcome.
 */
export function showKitBadge(kit: KitRunVM | undefined): kit is KitRunVM {
  return isKitActive(kit?.status);
}

/** Short badge label for a Kit track, e.g. "Kit tests running" or "Kit 8/10 passed". */
export function kitLabel(kit: KitRunVM): string {
  switch (norm(kit.status)) {
    case 'running':
      return 'Kit tests running';
    case 'analysing':
    case 'analyzing':
      return 'Kit summary pending';
    case 'completed':
      return kit.total > 0 ? `Kit ${kit.pass}/${kit.total} passed` : 'Kit completed';
    case 'timedout':
      return 'Kit timed out';
    case 'failed':
      return 'Kit failed';
    default:
      return `Kit ${kit.status.toLowerCase()}`;
  }
}

export function isRegression(status: string | undefined): boolean {
  const n = norm(status);
  return n === 'critical' || n === 'warning';
}

/** Orchestrator message written when a run ends without passing its own detection step. */
export const LOCK_RELEASED_MESSAGE =
  'Run did not complete; lock released automatically to prevent blocking future runs.';
export const NO_MODEL_CHANGED_LABEL = 'No model changed';
export const SKIPPED_RUN_EXPLANATION =
  'Another assessment for this agent was already in progress, so this run was skipped and the model was not changed. See the in-progress run for results.';

/**
 * A run that never started because another assessment already held the
 * agent's lock (two members checking the same agent at once). The orchestrator
 * records it as Failed with the lock-release message, but nothing ran and no
 * model changed: it has no start time, no model-history link and no results.
 */
export function isSkippedConcurrentRun(run: EvaluationRunVM | undefined): boolean {
  if (!run || norm(run.status) !== 'failed') return false;
  const message = run.errorMessage?.trim() ?? '';
  return message.startsWith(LOCK_RELEASED_MESSAGE.slice(0, 40))
    && !run.startedOn
    && !run.historyId
    && run.pass + run.fail + run.error + run.excluded === 0;
}

/**
 * The evaluation flow picks up a new run within seconds. A run still waiting
 * after this was requested while the flow was off (or its trigger failed), and
 * turning the flow on later does not pick it up.
 */
export const RUN_PICKUP_TIMEOUT_MS = 2 * 60_000;
export const EVALUATION_FLOW_NAME = 'Model Assessment | Run Copilot Studio Evaluations';
export const KIT_FLOW_NAME = 'Model Assessment | Run Copilot Agent Kit Tests';

/** A requested run the evaluation flow has not started within {@link RUN_PICKUP_TIMEOUT_MS}. */
export function isRunNotPickedUp(run: EvaluationRunVM | undefined, now = Date.now()): boolean {
  if (!run || norm(run.status) !== 'requested' || run.startedOn) return false;
  const created = Date.parse(run.createdOn ?? '');
  return !Number.isNaN(created) && now - created >= RUN_PICKUP_TIMEOUT_MS;
}

/**
 * A Kit-mode run handed to the Kit test flow (Evaluation Running) that the flow
 * has not started yet. The Kit test flow normally starts within seconds.
 */
export function isAwaitingKitTests(run: EvaluationRunVM | undefined): boolean {
  return Boolean(run) && norm(run!.status) === 'evaluationrunning' && !run!.kit && !run!.progress
    && run!.pass + run!.fail + run!.error + run!.excluded === 0;
}

/** A Kit-mode run whose Kit tests have not started within {@link RUN_PICKUP_TIMEOUT_MS} of the run starting. */
export function isKitNotPickedUp(run: EvaluationRunVM | undefined, now = Date.now()): boolean {
  if (!isAwaitingKitTests(run)) return false;
  const started = Date.parse(run!.startedOn ?? '');
  return !Number.isNaN(started) && now - started >= RUN_PICKUP_TIMEOUT_MS;
}

const STOPPED_RUN_STATUSES = new Set(['failed', 'timedout', 'cancelled', 'stale']);

/**
 * The model the agent's latest run was assessing when it stopped early (failed,
 * timed out, was cancelled or stopped responding). Kit runs record the model
 * change when they start, so that model shows as assessed although it never was;
 * it is assessed again rather than asking for another model. Runs skipped for
 * another one in progress are passed over, and runs not yet linked to a model
 * give undefined. `runs` and `history` are newest first.
 */
export function unfinishedRunModel(
  runs: readonly EvaluationRunVM[],
  history: readonly ModelHistoryVM[],
): string | undefined {
  const run = runs.find((candidate) => !isSkippedConcurrentRun(candidate));
  if (!run?.historyId) return undefined;
  const kitStopped = ['failed', 'timedout'].includes(norm(run.kit?.status));
  if (!STOPPED_RUN_STATUSES.has(norm(run.status)) && !kitStopped) return undefined;
  return history.find((entry) => entry.id === run.historyId)?.currentModel;
}

/** Written by the flows when no step-level failure detail could be captured. */
export const GENERIC_RUN_FAILURE =
  'The assessment stopped before it finished. Try again, and if it keeps failing ask an admin to review the run history of the Model Assessment | Run Copilot Studio Evaluations flow.';

const LOCK_RELEASED_FRIENDLY =
  'The assessment stopped before it finished and was closed automatically. Try again.';
const STALE_FRIENDLY =
  'The assessment stopped responding, so it was closed automatically to let new assessments run. Try again.';
const METADATA_FRIENDLY =
  "The agent's model could not be read from Copilot Studio, so nothing was assessed. Make sure the agent is published, then try again.";
const CONNECTION_FRIENDLY =
  'The Copilot Studio connection used by the assessment flow is missing or not set up, so no evaluation was started. Ask an admin to set the Copilot Agent Kit - Automated Tests connection reference (cat_CopilotStudioKitAutomatedTests) in the solution.';

/** Older flow messages that are not meant for people, mapped to plain language. */
const FRIENDLY_RUN_MESSAGES: ReadonlyArray<[prefix: string, message: string]> = [
  [LOCK_RELEASED_MESSAGE.slice(0, 40), LOCK_RELEASED_FRIENDLY],
  ['Lock auto-reclaimed', STALE_FRIENDLY],
  ['Model metadata could not be resolved', METADATA_FRIENDLY],
  // Earlier flow versions named an old connection reference here.
  ['The Copilot Studio connection used by the assessment flow is missing', CONNECTION_FRIENDLY],
];

/** A run's error message in plain language (undefined when there is none). */
export function friendlyRunMessage(message: string | undefined): string | undefined {
  const text = message?.trim();
  if (!text) return undefined;
  return FRIENDLY_RUN_MESSAGES.find(([prefix]) => text.startsWith(prefix))?.[1] ?? text;
}

// The flow writes these reasons; runs started on older flow versions wrote the raw state instead.
const SET_ENDED_PREFIX = 'External evaluation ended in state:';
const SET_FAILED_REASON = 'Copilot Studio reported that the evaluation failed. Open the test set in Copilot Studio to see why.';
const SET_CANCELLED_REASON = 'The evaluation was cancelled in Copilot Studio before it finished.';
const SET_ABANDONED_REASON = 'Copilot Studio abandoned the evaluation before it finished.';
const SET_DELETED_REASON = 'The evaluation was deleted in Copilot Studio before it finished.';
/** The flow stopped polling while Copilot Studio was still evaluating the set. */
export const SET_TIMED_OUT_REASON = "Copilot Studio didn't finish evaluating this test set in time.";
const SET_ENDED_REASONS: Readonly<Record<string, string>> = {
  failed: SET_FAILED_REASON,
  cancelled: SET_CANCELLED_REASON,
  canceled: SET_CANCELLED_REASON,
  abandoned: SET_ABANDONED_REASON,
  deleted: SET_DELETED_REASON,
};
/** Sets that stopped for these reasons need another run, not a fix to the test set. */
const RERUN_REASONS: ReadonlySet<string> = new Set([
  SET_TIMED_OUT_REASON, SET_CANCELLED_REASON, SET_ABANDONED_REASON, SET_DELETED_REASON,
]);

/** The flow writes this before the error Copilot Studio returned when a test set would not start. */
const SET_START_PREFIX = 'Copilot Studio could not run this test set:';
/** Copilot Studio limits how often an agent can be evaluated; waiting fixes it, not editing the test set. */
const EVALUATION_LIMIT = /evaluated more than \d+ times|wait before trying again/i;

/** The flow writes this when Copilot Studio returned an error for every result in a test set. */
export const SET_UNSCORED_PREFIX = 'No test case in this test set could be scored.';
const SET_UNSCORED_METHODS = 'Test methods:';
/** The reason when none of the test methods that failed has a known per-test-case requirement. */
export const SET_UNSCORED_REASON = 'No test case could be scored.';

/** What a test method needs in each test case before Copilot Studio can score it. */
const METRIC_NEEDS: Readonly<Record<string, string>> = {
  comparemeaning: 'an expected response',
  textsimilarity: 'an expected response',
  exactmatch: 'an expected response',
  anykeywordmatch: 'keywords',
  capabilityuse: 'the expected tools or topics',
};
const metricNeed = (metric: string | undefined) => METRIC_NEEDS[norm(metric)];

const joinNames = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Which test-case details a test set is probably missing, from the methods the flow listed. */
function unscoredSetReason(text: string): string {
  const listed = text.split(SET_UNSCORED_METHODS)[1] ?? '';
  const byNeed = new Map<string, string[]>();
  for (const metric of listed.replace(/\.\s*$/, '').split(',').map((m) => m.trim()).filter(Boolean)) {
    const need = metricNeed(metric);
    const name = metricDisplayName(metric);
    if (need && !byNeed.get(need)?.includes(name)) byNeed.set(need, [...(byNeed.get(need) ?? []), name]);
  }
  const hints = [...byNeed].map(([need, names]) =>
    `${joinNames(names)} ${names.length === 1 ? 'needs' : 'need'} ${need} in every test case.`);
  return hints.length > 0 ? `${SET_UNSCORED_REASON} ${hints.join(' ')}` : SET_UNSCORED_REASON;
}

/**
 * Why a test set could not run, in plain language. Older flow versions wrote
 * the last evaluation state they saw; any state that is not a terminal one
 * means polling ran out of time.
 */
export function friendlySetError(reason: string | undefined): string | undefined {
  const text = reason?.trim();
  if (!text) return undefined;
  if (text.startsWith(SET_UNSCORED_PREFIX)) return unscoredSetReason(text);
  if (EVALUATION_LIMIT.test(text)) return text.startsWith(SET_START_PREFIX) ? text.slice(SET_START_PREFIX.length).trim() : text;
  if (!text.startsWith(SET_ENDED_PREFIX)) return text;
  const state = text.slice(SET_ENDED_PREFIX.length).trim().toLowerCase();
  return SET_ENDED_REASONS[state] ?? SET_TIMED_OUT_REASON;
}

/** Whether Copilot Studio refused to evaluate because the agent hit its evaluation limit. */
export function isEvaluationLimit(reason: string | undefined): boolean {
  return EVALUATION_LIMIT.test(reason ?? '');
}

/** Whether a test set that could not run needs fixing in Copilot Studio before running again. */
export function setNeedsFix(reason: string | undefined): boolean {
  const text = friendlySetError(reason);
  return text === undefined || !(RERUN_REASONS.has(text) || EVALUATION_LIMIT.test(text));
}

export interface RunNotice {
  intent: 'error' | 'warning';
  title: string;
  message: string;
}

/**
 * What to tell people about a run that failed or stopped. The flows write the
 * failing stage, step and error onto the run; this turns it into a title and
 * message. Undefined for runs that are fine, still in progress or were skipped.
 * `previous` words the title for a run that finished before the panel opened.
 */
export function runNotice(run: EvaluationRunVM | undefined, previous = false): RunNotice | undefined {
  if (!run || isSkippedConcurrentRun(run)) return undefined;
  const status = norm(run.status);
  const kitStatus = norm(run.kit?.status);
  const kitStopped = kitStatus === 'failed' || kitStatus === 'timedout';
  const message = friendlyRunMessage(run.errorMessage) ?? (kitStopped ? friendlyRunMessage(run.kit?.message) : undefined);
  const subject = run.kit
    ? previous ? 'Last Kit test run' : 'Kit tests'
    : previous ? 'Last assessment' : 'Assessment';
  if (status === 'failed' || (kitStatus === 'failed' && status !== 'timedout')) {
    return {
      intent: status === 'failed' ? 'error' : 'warning',
      title: `${subject} failed`,
      message: message ?? GENERIC_RUN_FAILURE,
    };
  }
  if (status === 'timedout' || kitStatus === 'timedout') {
    return {
      intent: 'warning',
      title: `${subject} timed out`,
      message: message ?? 'The assessment took too long and was stopped. Try again later.',
    };
  }
  if (status === 'stale') {
    return {
      intent: 'warning',
      title: `${previous ? 'Last assessment' : 'Assessment'} stopped responding`,
      message: message ?? STALE_FRIENDLY,
    };
  }
  if (status === 'metadataunavailable') {
    return {
      intent: 'warning',
      title: 'Model could not be read',
      message: message ?? METADATA_FRIENDLY,
    };
  }
  return undefined;
}

/** The one status shown for a run: while its Kit tests run, the Kit track speaks for it. */
export function runDisplayStatus(run: EvaluationRunVM): string {
  if (isSkippedConcurrentRun(run)) return NO_MODEL_CHANGED_LABEL;
  if (run.kit && isKitActive(run.kit.status)) return kitLabel(run.kit);
  return run.status;
}

/**
 * Build friendly per-case fallback labels for a run's results.
 *
 * The evaluation connector only returns the test-case id, so cat_testcaseutterance
 * is empty on the run rows; the real utterance is resolved separately from the
 * test case's botcomponent (see getTestCaseDetails) and shown when available.
 * This map is the fallback for cases whose utterance could not be resolved:
 * cases are numbered "Case 1", "Case 2"… deterministically within each test set
 * (case ids sorted), returning a GUID → label map. The caller keeps the full
 * GUID available on hover.
 */
export function buildCaseLabels(results: EvaluationResultVM[]): Map<string, string> {
  const bySet = new Map<string, Set<string>>();
  for (const r of results) {
    const id = r.testCase?.trim();
    if (!id) continue;
    const set = r.testSet?.trim() || 'Ungrouped';
    let ids = bySet.get(set);
    if (!ids) {
      ids = new Set();
      bySet.set(set, ids);
    }
    ids.add(id);
  }
  const labels = new Map<string, string>();
  for (const ids of bySet.values()) {
    [...ids].sort().forEach((id, index) => labels.set(id, `Case ${index + 1}`));
  }
  return labels;
}

/**
 * Turn the raw cat_resultreason JSON into a compact, human-readable string.
 *
 * Reason is stored as `{"data":{"relevance":"Yes","completeness":"No",…},
 * "status":"Fail"}`. We surface the per-dimension scores (the actual reason a
 * case passed or failed) as "Relevance: Yes · Completeness: No"; falling back to
 * the raw text if it isn't the expected shape.
 */
export function parseResultReason(reason: string | undefined, metric?: string): string {
  if (!reason) return '';
  if (norm(metric) === 'external') return friendlySetError(reason) ?? '';
  try {
    const parsed = JSON.parse(reason) as { data?: Record<string, unknown>; status?: unknown };
    const data = parsed?.data;
    if (data && typeof data === 'object') {
      const parts = Object.entries(data).map(
        ([key, value]) => `${key.charAt(0).toUpperCase()}${key.slice(1)}: ${String(value)}`,
      );
      if (parts.length > 0) return parts.join(' · ');
    }
    // Copilot Studio returns a bare error when the test case lacks what the method needs.
    if (typeof parsed?.status === 'string' && norm(parsed.status) === 'error') {
      const need = metricNeed(metric);
      return need
        ? `Couldn't be scored. ${metricDisplayName(metric)} needs ${need} in this test case.`
        : "Couldn't be scored.";
    }
    if (typeof parsed?.status === 'string') return parsed.status;
    return reason;
  } catch {
    return reason;
  }
}

/** Locale-aware short date/time, matching the prototype's `fmt` helper. */
export function formatWhen(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format the generated run-name timestamp without changing its stored identity. */
export function formatRunName(name: string): string {
  return name.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, (iso) =>
    Number.isNaN(Date.parse(iso)) ? iso : formatWhen(iso),
  );
}
