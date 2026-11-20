/**
 * Data access for Model Assessment.
 *
 * Reads the four cat_ tables through the generic commondataserviceforapps
 * connector (MicrosoftDataverseService). No per-table generated service is
 * required, so the feature needs no `pac code add-data-source` regeneration and
 * no change to power.config.json — it reuses the connector the app already
 * ships. All calls use the `*WithOrganization` connector operations with the
 * `'current'` org sentinel (the app-wide convention); the bare current-
 * environment operations fail under local play with "Invalid organization URL".
 * Choice columns are surfaced through the OData FormattedValue annotation so
 * labels come straight from the environment metadata.
 */

import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { listDataverseRows } from '../../../shared/services/dataversePaging';
import {
  ENTITY_SET,
  EVALUATION_FLOW_NAME,
  isRunNotPickedUp,
  KIT_FLOW_NAME,
  type CreditsVM,
  type EvaluationResultVM,
  type EvaluationRunVM,
  type KitRunVM,
  type KitSettingsVM,
  type ModelHistoryVM,
  type TrackedAgentVM,
} from '../contracts/model-assessment';
import { parseTestCase } from '../contracts/test-case-questions';
import { parseClassificationGraders, type ClassificationGrader } from '../contracts/test-set-graders';
import { parseEvaluationProgress } from '../contracts/evaluation-progress';
import { withMetricCategory } from '../contracts/metric-display';
import type { KitTestResultVM, KitTestTurnVM } from '../contracts/kit-results';
import { parseAgentConfiguration } from './model-parser';

const ACCEPT = 'application/json';
const FV = '@OData.Community.Display.V1.FormattedValue';

/**
 * Sentinel organization the Dataverse connector resolves to the app's own host
 * environment. The bare `ListRecords`/`CreateRecord`/`UpdateRecord` operations
 * (current-environment variants) fail under local play with "Invalid
 * organization URL 'null'", so — like every other feature in this app — we call
 * the `*WithOrganization` variants with this sentinel (see
 * agent-change-tracker/services/tracking-org.ts and shared/services/copilotStudioUrl.ts).
 */
const CURRENT_ORG = 'current';

type Row = Record<string, unknown>;

function str(row: Row, key: string): string | undefined {
  const v = row[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Formatted (label) value of a choice/lookup column, else the raw string. */
function fv(row: Row, key: string): string | undefined {
  const formatted = row[`${key}${FV}`];
  if (typeof formatted === 'string' && formatted.length > 0) return formatted;
  return str(row, key);
}

function num(row: Row, key: string): number {
  const v = row[key];
  return typeof v === 'number' ? v : 0;
}

async function list(
  entitySet: string,
  options: { select?: string; orderby?: string; filter?: string } = {},
): Promise<Row[]> {
  return listDataverseRows(CURRENT_ORG, entitySet, options);
}

const AGENT_SELECT = [
  'cat_trackedagentid',
  'cat_name',
  'cat_schemaname',
  'cat_copilotagentid',
  'cat_sourcestatuscode',
  'cat_currentmodel',
  'cat_runkittests',
  '_cat_kitagentconfiguration_value',
  '_cat_kittestset_value',
].join(',');

export async function getTrackedAgents(): Promise<TrackedAgentVM[]> {
  const rows = await list(ENTITY_SET.trackedAgent, {
    select: AGENT_SELECT,
    orderby: 'cat_name asc',
  });
  return rows.map((row) => ({
    id: str(row, 'cat_trackedagentid') ?? '',
    name: str(row, 'cat_name') ?? '(unnamed agent)',
    schema: str(row, 'cat_schemaname') ?? '',
    copilotAgentId: str(row, 'cat_copilotagentid'),
    sourceStatus: fv(row, 'cat_sourcestatuscode') ?? 'Unknown',
    currentModel: str(row, 'cat_currentmodel'),
    kit: {
      enabled: row['cat_runkittests'] === true,
      configurationId: str(row, '_cat_kitagentconfiguration_value'),
      testSetId: str(row, '_cat_kittestset_value'),
    },
    regression: 'Not Assessed',
    lastRunStatus: 'None',
    pass: 0,
    fail: 0,
    error: 0,
    excluded: 0,
  }));
}

const HISTORY_SELECT = [
  'cat_modelhistoryid',
  'cat_name',
  'cat_changetypecode',
  'cat_previousmodel',
  'cat_currentmodel',
  'createdon',
  '_cat_trackedagentid_value',
].join(',');

export async function getModelHistory(): Promise<ModelHistoryVM[]> {
  const rows = await list(ENTITY_SET.modelHistory, {
    select: HISTORY_SELECT,
    orderby: 'createdon desc',
  });
  return rows.map((row) => ({
    id: str(row, 'cat_modelhistoryid') ?? '',
    name: str(row, 'cat_name'),
    agentId: str(row, '_cat_trackedagentid_value'),
    changeType: fv(row, 'cat_changetypecode') ?? 'Unknown',
    previousModel: str(row, 'cat_previousmodel'),
    currentModel: str(row, 'cat_currentmodel'),
    on: str(row, 'createdon'),
  }));
}

const RUN_SELECT = [
  'cat_evaluationrunid',
  'cat_name',
  'cat_statuscode',
  'cat_analysisstatuscode',
  'cat_regressionstatuscode',
  'cat_passcount',
  'cat_failcount',
  'cat_errorcount',
  'cat_excludedcount',
  'cat_aianalysis',
  'cat_errorcategorycode',
  'cat_errormessage',
  'createdon',
  'cat_startedon',
  'cat_completedon',
  '_cat_trackedagentid_value',
  '_cat_modelhistoryid_value',
  '_cat_comparedtorunid_value',
  'cat_kitstatuscode',
  'cat_kitmessage',
  'cat_kitaisummary',
  '_cat_kittestrun_value',
  'cat_kitpasscount',
  'cat_kitfailcount',
  'cat_kittotalcount',
  'cat_kitregressedcount',
  'cat_kitimprovedcount',
  'cat_kitstartedon',
  'cat_kitcompletedon',
  'cat_conversationcredits',
  'cat_evaluatorcredits',
  'cat_creditspartial',
  'cat_evaluationprogress',
].join(',');

/** Credits are written only for Microsoft Copilot harness agents; other runs leave both columns empty. */
function mapCredits(row: Row): CreditsVM | undefined {
  const conversation = row['cat_conversationcredits'];
  const evaluators = row['cat_evaluatorcredits'];
  if (typeof conversation !== 'number' && typeof evaluators !== 'number') return undefined;
  return {
    conversation: typeof conversation === 'number' ? conversation : 0,
    evaluators: typeof evaluators === 'number' ? evaluators : 0,
    ...(row['cat_creditspartial'] === true ? { partial: true } : {}),
  };
}

function mapKit(row: Row): KitRunVM | undefined {
  if (typeof row['cat_kitstatuscode'] !== 'number') return undefined;
  return {
    status: fv(row, 'cat_kitstatuscode') ?? 'Unknown',
    message: str(row, 'cat_kitmessage'),
    summary: str(row, 'cat_kitaisummary'),
    testRunId: str(row, '_cat_kittestrun_value'),
    pass: num(row, 'cat_kitpasscount'),
    fail: num(row, 'cat_kitfailcount'),
    total: num(row, 'cat_kittotalcount'),
    regressed: num(row, 'cat_kitregressedcount'),
    improved: num(row, 'cat_kitimprovedcount'),
    startedOn: str(row, 'cat_kitstartedon'),
    completedOn: str(row, 'cat_kitcompletedon'),
  };
}

function mapRun(row: Row): EvaluationRunVM {
  const kit = mapKit(row);
  const credits = mapCredits(row);
  const progress = parseEvaluationProgress(str(row, 'cat_evaluationprogress'));
  return {
    id: str(row, 'cat_evaluationrunid') ?? '',
    name: str(row, 'cat_name') ?? '',
    agentId: str(row, '_cat_trackedagentid_value'),
    historyId: str(row, '_cat_modelhistoryid_value'),
    comparedToRunId: str(row, '_cat_comparedtorunid_value'),
    status: fv(row, 'cat_statuscode') ?? 'Requested',
    analysisStatus: fv(row, 'cat_analysisstatuscode') ?? 'Pending',
    regression: fv(row, 'cat_regressionstatuscode') ?? 'Not Assessed',
    pass: num(row, 'cat_passcount'),
    fail: num(row, 'cat_failcount'),
    error: num(row, 'cat_errorcount'),
    excluded: num(row, 'cat_excludedcount'),
    ai: str(row, 'cat_aianalysis'),
    errorCategory: fv(row, 'cat_errorcategorycode'),
    errorMessage: str(row, 'cat_errormessage'),
    createdOn: str(row, 'createdon'),
    startedOn: str(row, 'cat_startedon'),
    completedOn: str(row, 'cat_completedon'),
    ...(kit ? { kit } : {}),
    ...(credits ? { credits } : {}),
    ...(progress ? { progress } : {}),
  };
}

/** Requested, Detecting, Evaluation Running, Evaluation Completed (not yet analysed). */
const ACTIVE_RUN_STATUSES = [335350001, 335350002, 335350003, 335350004];
/**
 * Covers the per-agent lock lifetime: the orchestrator sets cat_lockexpireson to
 * start + 45 min and the Kit flow extends it by 45 min once the Kit tests start.
 */
const ACTIVE_RUN_MAX_AGE_MS = 50 * 60_000;

export interface ActiveRun {
  run: EvaluationRunVM;
  requestKey: string;
  /** Display name of the user who requested the in-flight run. */
  startedBy?: string;
}

export async function getEvaluationRuns(): Promise<EvaluationRunVM[]> {
  const rows = await list(ENTITY_SET.evaluationRun, {
    select: RUN_SELECT,
    orderby: 'createdon desc',
  });
  return rows.map(mapRun);
}

const RESULT_SELECT = [
  'cat_evaluationresultid',
  'cat_name',
  'cat_testsetname',
  'cat_testsetid',
  'cat_testcaseid',
  'cat_testcaseutterance',
  'cat_metrictype',
  'cat_resultstatuscode',
  'cat_resultreason',
  'cat_conversationcredits',
  'cat_evaluatorcredits',
  '_cat_evaluationrunid_value',
].join(',');

export async function getEvaluationResults(): Promise<EvaluationResultVM[]> {
  const rows = await list(ENTITY_SET.evaluationResult, {
    select: RESULT_SELECT,
    orderby: 'cat_testsetname asc',
  });
  return rows.map((row) => {
    const credits = mapCredits(row);
    const reason = str(row, 'cat_resultreason');
    return {
      id: str(row, 'cat_evaluationresultid') ?? '',
      name: str(row, 'cat_name') ?? '',
      runId: str(row, '_cat_evaluationrunid_value'),
      testSet: str(row, 'cat_testsetname'),
      testSetId: str(row, 'cat_testsetid'),
      testCase: str(row, 'cat_testcaseid'),
      testCaseId: str(row, 'cat_testcaseid'),
      question: str(row, 'cat_testcaseutterance'),
      metric: withMetricCategory(str(row, 'cat_metrictype'), reason),
      status: fv(row, 'cat_resultstatuscode') ?? 'Pass',
      reason,
      ...(credits ? { credits } : {}),
    };
  });
}

export interface TestCaseDetails {
  /** The test case's botcomponent name (a current label for the first question). */
  name?: string;
  /** Every user question in conversation order (several for multi-turn cases). */
  questions: string[];
  /** The case is a multi-turn conversation test. */
  multiTurn: boolean;
}

/**
 * Resolve test-case details for a set of test-case ids.
 *
 * Results only snapshot the first user message in cat_testcaseutterance, so the
 * test case's botcomponent is read to recover every user turn of multi-turn
 * cases (and a label for legacy results without a snapshot). Missing records
 * keep the saved-question fallback; request failures reject so React Query and
 * the page can surface the error.
 */
export async function getTestCaseDetails(
  ids: string[],
): Promise<Record<string, TestCaseDetails>> {
  const map: Record<string, TestCaseDetails> = {};
  for (const row of await listBotComponentsById(ids)) {
    const id = str(row, 'botcomponentid');
    if (!id) continue;
    map[id.toLowerCase()] = {
      name: str(row, 'name'),
      ...parseTestCase(str(row, 'data')),
    };
  }
  return map;
}

/**
 * Business Classification test methods of each test set (its botcomponent definition),
 * keyed by lower-case test set id; sets that no longer exist are omitted.
 */
export async function getTestSetGraders(
  ids: string[],
): Promise<Record<string, ClassificationGrader[]>> {
  const map: Record<string, ClassificationGrader[]> = {};
  for (const row of await listBotComponentsById(ids)) {
    const id = str(row, 'botcomponentid');
    if (id) map[id.toLowerCase()] = parseClassificationGraders(str(row, 'data'));
  }
  return map;
}

/** Read botcomponents by id in small parallel batches; invalid ids are skipped. */
async function listBotComponentsById(ids: string[]): Promise<Row[]> {
  const guid = /^[0-9a-fA-F-]{36}$/;
  const unique = Array.from(new Set(ids.filter((id) => guid.test(id)).map((id) => id.toLowerCase())));
  const rows: Row[] = [];
  const CHUNK = 20;
  const CONCURRENCY = 3;
  for (let i = 0; i < unique.length; i += CHUNK * CONCURRENCY) {
    const batches: Promise<Row[]>[] = [];
    for (let offset = i; offset < Math.min(i + CHUNK * CONCURRENCY, unique.length); offset += CHUNK) {
      const filter = unique.slice(offset, offset + CHUNK).map((id) => `botcomponentid eq ${id}`).join(' or ');
      batches.push(list('botcomponents', { select: 'botcomponentid,name,data', filter }));
    }
    for (const batch of await Promise.all(batches)) rows.push(...batch);
  }
  return rows;
}

/**
 * The newest run for an agent that has not reached a terminal status. The
 * orchestrator allows only one active assessment per agent (the
 * cat_activeagentkey lock), so a second request is joined to this one instead of
 * creating a run that would fail on the lock.
 */
export async function getActiveRunForAgent(
  agentId: string,
): Promise<ActiveRun | undefined> {
  const guid = /^[0-9a-fA-F-]{36}$/;
  if (!guid.test(agentId)) return undefined;
  const statuses = ACTIVE_RUN_STATUSES.map((code) => `cat_statuscode eq ${code}`).join(' or ');
  const rows = await list(ENTITY_SET.evaluationRun, {
    select: `${RUN_SELECT},cat_requestkey,_createdby_value`,
    filter: `_cat_trackedagentid_value eq ${agentId} and (${statuses})`,
    orderby: 'createdon desc',
  });
  const cutoff = Date.now() - ACTIVE_RUN_MAX_AGE_MS;
  const candidates = rows.filter((candidate) => {
    const created = Date.parse(str(candidate, 'createdon') ?? '');
    return str(candidate, 'cat_requestkey') && (Number.isNaN(created) || created >= cutoff);
  });
  // A request the flow never picked up must not hide a run that is in progress.
  const row = candidates.find((candidate) => !isRunNotPickedUp(mapRun(candidate))) ?? candidates[0];
  if (!row) return undefined;
  return {
    run: mapRun(row),
    requestKey: str(row, 'cat_requestkey')!,
    startedBy: fv(row, '_createdby_value'),
  };
}

/**
 * cat_evaluationrunstatus / cat_analysisstatus / cat_regressionstatus option
 * values (global choice base 3353500xx) needed when *writing* a new run row.
 * Read paths use the OData FormattedValue label instead.
 */
const RUN_STATUS_REQUESTED = 335350001;
const ANALYSIS_STATUS_PENDING = 335350002;
const REGRESSION_STATUS_NOT_ASSESSED = 335350001;

export interface CreateRunResult {
  success: boolean;
  requestKey: string;
}

/**
 * Create a cat_evaluationrun row in Requested state. The
 * "Model Assessment | Run Copilot Studio Evaluations" flow fires on create,
 * detects a model change, and (when changed) drives the run through evaluation
 * to a terminal status. If the flow fails, it writes the failing stage, step and
 * error onto the run as Failed (see runNotice).
 *
 * Returns the generated request key so the caller can poll
 * {@link getRunByRequestKey} for live status — CreateRecord itself returns no id.
 */
export async function createEvaluationRun(
  agent: TrackedAgentVM,
): Promise<CreateRunResult> {
  const requestKey =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const result = await MicrosoftDataverseService.CreateRecordWithOrganization(
    'return=representation',
    ACCEPT,
    CURRENT_ORG,
    ENTITY_SET.evaluationRun,
    {
      cat_name: `${agent.name} — ${new Date().toISOString()}`,
      cat_requestkey: requestKey,
      cat_statuscode: RUN_STATUS_REQUESTED,
      cat_analysisstatuscode: ANALYSIS_STATUS_PENDING,
      cat_regressionstatuscode: REGRESSION_STATUS_NOT_ASSESSED,
      'cat_TrackedAgentId@odata.bind': `${ENTITY_SET.trackedAgent}(${agent.id})`,
    },
  );
  return { success: result.success, requestKey };
}

const RUN_STATUS_CANCELLED = 335350013;
const ANALYSIS_STATUS_SKIPPED = 335350005;
const KIT_STATUS_SKIPPED = 335350001;

/**
 * Stop an in-progress assessment: mark the run Cancelled and release the
 * per-agent lock so a new assessment can start. Both Model assessment flows
 * check for Cancelled and stop without overwriting it.
 */
export async function cancelEvaluationRun(run: EvaluationRunVM): Promise<void> {
  const item: Record<string, unknown> = {
    cat_statuscode: RUN_STATUS_CANCELLED,
    cat_analysisstatuscode: ANALYSIS_STATUS_SKIPPED,
    cat_activeagentkey: null,
    cat_lockexpireson: null,
    cat_completedon: new Date().toISOString(),
  };
  if (run.kit && ['running', 'analysing', 'analyzing'].includes(run.kit.status.toLowerCase())) {
    item.cat_kitstatuscode = KIT_STATUS_SKIPPED;
  }
  const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(
    'return=minimal',
    ACCEPT,
    CURRENT_ORG,
    ENTITY_SET.evaluationRun,
    run.id,
    item,
  );
  if (!result.success) throw new Error('Could not cancel the assessment.');
}

/** The solution's Model assessment flows; solution import keeps their ids. */
const EVALUATION_FLOW = { id: 'eb45ddbf-02aa-f111-aaab-7ced8d1882b8', name: EVALUATION_FLOW_NAME };
const KIT_FLOW = { id: 'f0ef9a96-d416-49c6-9060-b85cae19ac11', name: KIT_FLOW_NAME };
const FLOW_CHECK_TIMEOUT_MS = 10_000;

/**
 * Names of the flows an assessment needs that are turned off (or suspended).
 * A run requested while the evaluation flow is off is never picked up, even
 * after the flow is turned back on. A flow the member cannot read is not
 * reported: the progress check then reports a request that was not picked up.
 */
export async function getFlowsTurnedOff(kitMode: boolean): Promise<string[]> {
  const flows = kitMode ? [EVALUATION_FLOW, KIT_FLOW] : [EVALUATION_FLOW];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rows = await Promise.race([
      list('workflows', {
        select: 'workflowid,statecode',
        filter: `category eq 5 and (${flows.map((flow) => `workflowid eq ${flow.id}`).join(' or ')})`,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('The flow check timed out.')), FLOW_CHECK_TIMEOUT_MS);
      }),
    ]);
    return flows
      .filter((flow) => {
        const row = rows.find((candidate) => str(candidate, 'workflowid')?.toLowerCase() === flow.id);
        // 0 = Draft (off), 2 = Suspended; anything unreadable is not reported.
        return row !== undefined && ['0', '2'].includes(String(row.statecode));
      })
      .map((flow) => flow.name);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch the single run matching a request key, or undefined if not yet visible. */
export async function getRunByRequestKey(
  requestKey: string,
): Promise<EvaluationRunVM | undefined> {
  const rows = await list(ENTITY_SET.evaluationRun, {
    select: RUN_SELECT,
    filter: `cat_requestkey eq '${requestKey}'`,
    orderby: 'createdon desc',
  });
  return rows.length ? mapRun(rows[0]) : undefined;
}


const GUID_PATTERN = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;

/** Fetch a single run by id (used to follow its Kit test track). */
export async function getRunById(runId: string): Promise<EvaluationRunVM | undefined> {
  if (!GUID_PATTERN.test(runId)) return undefined;
  const rows = await list(ENTITY_SET.evaluationRun, {
    select: RUN_SELECT,
    filter: `cat_evaluationrunid eq ${runId}`,
  });
  return rows.length ? mapRun(rows[0]) : undefined;
}

export interface KitOption {
  id: string;
  name: string;
}

export interface KitOptions {
  /**
   * Active Kit Agent Configurations for this agent's schema name with the
   * pipeline enabled (cat_RunAgentTestsAutomated requires cat_ispipelineenabled).
   */
  configurations: KitOption[];
  testSets: KitOption[];
  /** Copilot harness agents cannot be run by the Kit's standard test automation. */
  harness: boolean;
  /** Kit tests call the published agent; false only when the agent was found and never published. */
  published: boolean;
}

async function getKitAgentInfo(botId: string | undefined): Promise<{ harness: boolean; published: boolean }> {
  if (!botId || !GUID_PATTERN.test(botId)) return { harness: false, published: true };
  const rows = await list('bots', { select: 'configuration,publishedon', filter: `botid eq ${botId}` });
  const row = rows[0];
  if (!row) return { harness: false, published: true };
  let harness = false;
  try {
    harness = parseAgentConfiguration(row['configuration']).isHarness;
  } catch {
    harness = false;
  }
  return { harness, published: Boolean(str(row, 'publishedon')) };
}

/** Kit configurations and test sets the agent's Kit tests can use. */
export async function getKitOptions(agent: TrackedAgentVM): Promise<KitOptions> {
  const schema = agent.schema.replace(/'/g, "''");
  const [configurations, testSets, agentInfo] = await Promise.all([
    schema
      ? list(ENTITY_SET.kitConfiguration, {
        select: 'cat_copilotconfigurationid,cat_name,cat_agentidentifier,createdon',
        filter: `cat_agentidentifier eq '${schema}' and cat_ispipelineenabled eq true and statecode eq 0`,
        orderby: 'createdon desc',
      })
      : Promise.resolve([] as Row[]),
    list(ENTITY_SET.kitTestSet, {
      select: 'cat_copilottestsetid,cat_name',
      filter: 'statecode eq 0',
      orderby: 'cat_name asc',
    }),
    getKitAgentInfo(agent.copilotAgentId),
  ]);
  const option = (idKey: string) => (row: Row): KitOption => ({
    id: str(row, idKey) ?? '',
    name: str(row, 'cat_name') ?? str(row, 'cat_agentidentifier') ?? '(unnamed)',
  });
  return {
    configurations: configurations.map(option('cat_copilotconfigurationid')).filter((o) => o.id),
    testSets: testSets.map(option('cat_copilottestsetid')).filter((o) => o.id),
    ...agentInfo,
  };
}

/** cat_trackedagent columns for the assessment engine and Kit choices. */
export function kitSettingsItem(settings: KitSettingsVM): Record<string, unknown> {
  const item: Record<string, unknown> = { cat_runkittests: settings.enabled };
  if (settings.configurationId) {
    item['cat_KitAgentConfiguration@odata.bind'] = `${ENTITY_SET.kitConfiguration}(${settings.configurationId})`;
  }
  if (settings.testSetId) {
    item['cat_KitTestSet@odata.bind'] = `${ENTITY_SET.kitTestSet}(${settings.testSetId})`;
  }
  return item;
}

/**
 * Save the agent's assessment engine (cat_runkittests: Kit tests instead of the
 * Copilot evaluation) and Kit choices. Lookups are only bound when a value is
 * chosen; switching back to the Copilot evaluation keeps them for next time.
 */
export async function saveKitSettings(agentId: string, settings: KitSettingsVM): Promise<void> {
  const item = kitSettingsItem(settings);
  const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(
    'return=minimal',
    ACCEPT,
    CURRENT_ORG,
    ENTITY_SET.trackedAgent,
    agentId,
    item,
  );
  if (!result.success) throw new Error('Could not save the Kit test settings.');
}

export interface KitProgress {
  /** Top-level tests of the run's test set; multi-turn steps count with their conversation. */
  total: number;
  /** Tests with a final result (not pending analysis). */
  done: number;
}

/** Top-level Kit test results, including the recorded questions of conversation tests. */
export async function getKitTestResults(testRunIds: string[]): Promise<KitTestResultVM[]> {
  const ids = [...new Set(testRunIds.filter((id) => GUID_PATTERN.test(id)).map((id) => id.toLowerCase()))];
  if (ids.length === 0) return [];
  const runFilter = (column: string) => ids.map((id) => `${column} eq ${id}`).join(' or ');
  const [rows, runs] = await Promise.all([
    list(ENTITY_SET.kitTestResult, {
      select: [
        'cat_copilottestresultid',
        '_cat_copilottestrunid_value',
        '_cat_copilottestid_value',
        'cat_testutterance',
        'cat_expectedresponse',
        'cat_response',
        'cat_comparisonoperator',
        'cat_testtypecode',
        'cat_resultcode',
        'cat_resultreason',
      ].join(','),
      filter: `_cat_parent_value eq null and (${runFilter('_cat_copilottestrunid_value')})`,
    }),
    list(ENTITY_SET.kitTestRun, {
      select: 'cat_copilottestrunid,_cat_copilottestsetid_value',
      filter: runFilter('cat_copilottestrunid'),
    }),
  ]);
  const conversationTurns = await getKitConversationTurns(rows.filter((row) =>
    num(row, 'cat_testtypecode') === 5 || !str(row, 'cat_testutterance')?.trim()));
  const setNames = new Map(runs.map((run) => [
    (str(run, 'cat_copilottestrunid') ?? '').toLowerCase(),
    fv(run, '_cat_copilottestsetid_value'),
  ]));
  return rows.map((row) => {
    const testRunId = str(row, '_cat_copilottestrunid_value') ?? '';
    const turns = conversationTurns.get((str(row, 'cat_copilottestresultid') ?? '').toLowerCase());
    const questions = turns?.map((turn) => turn.utterance);
    return {
      id: str(row, 'cat_copilottestresultid') ?? '',
      testRunId,
      testId: str(row, '_cat_copilottestid_value'),
      testName: str(row, `_cat_copilottestid_value${FV}`),
      utterance: str(row, 'cat_testutterance')?.trim()
        || questions?.join('\n'),
      questions,
      turns,
      expected: str(row, 'cat_expectedresponse'),
      response: str(row, 'cat_response'),
      operator: row['cat_comparisonoperator'] == null ? undefined : num(row, 'cat_comparisonoperator'),
      testType: row['cat_testtypecode'] == null ? undefined : num(row, 'cat_testtypecode'),
      code: num(row, 'cat_resultcode'),
      reason: str(row, 'cat_resultreason'),
      testSetName: setNames.get(testRunId.toLowerCase()),
    };
  });
}

async function getKitChildren(
  entitySet: string, parentIds: string[], select: string, orderby: string,
): Promise<Map<string, Row[]>> {
  const ids = [...new Set(parentIds.filter((id) => GUID_PATTERN.test(id)).map((id) => id.toLowerCase()))];
  const byParent = new Map<string, Row[]>();
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const children = await list(entitySet, {
      select,
      filter: chunk.map((id) => `_cat_parent_value eq ${id}`).join(' or '),
      orderby,
    });
    for (const child of children) {
      const parent = (str(child, '_cat_parent_value') ?? '').toLowerCase();
      if (!parent) continue;
      byParent.set(parent, [...(byParent.get(parent) ?? []), child]);
    }
  }
  return byParent;
}

async function getKitConversationTurns(parents: Row[]): Promise<Map<string, KitTestTurnVM[]>> {
  const [results, definitions] = await Promise.all([
    getKitChildren(ENTITY_SET.kitTestResult, parents.map((row) => str(row, 'cat_copilottestresultid') ?? ''),
      '_cat_parent_value,cat_copilottestresultid,_cat_copilottestid_value,cat_testutterance,cat_testtypecode,cat_comparisonoperator,cat_resultcode,cat_response',
      'createdon asc'),
    getKitChildren(ENTITY_SET.kitTest, parents.map((row) => str(row, '_cat_copilottestid_value') ?? ''),
      '_cat_parent_value,cat_copilottestid,cat_testutterance,cat_testtypecode,cat_comparisonoperator,cat_order',
      'cat_order asc,createdon asc'),
  ]);
  const byParent = new Map<string, KitTestTurnVM[]>();
  for (const parent of parents) {
    const id = (str(parent, 'cat_copilottestresultid') ?? '').toLowerCase();
    const testId = (str(parent, '_cat_copilottestid_value') ?? '').toLowerCase();
    const recorded = results.get(id) ?? [];
    const planned = definitions.get(testId) ?? [];
    const turns = recorded.map((row): KitTestTurnVM => ({
      id: str(row, 'cat_copilottestresultid') ?? '',
      testId: str(row, '_cat_copilottestid_value'),
      utterance: str(row, 'cat_testutterance')?.trim() || '(no utterance)',
      testType: row.cat_testtypecode == null ? undefined : num(row, 'cat_testtypecode'),
      operator: row.cat_comparisonoperator == null ? undefined : num(row, 'cat_comparisonoperator'),
      code: num(row, 'cat_resultcode'),
      response: str(row, 'cat_response'),
    }));
    const recordedTests = new Set(turns.flatMap((turn) => turn.testId ? [turn.testId.toLowerCase()] : []));
    // Keep recorded execution order; use current definitions only to insert unrecorded turns.
    for (const [index, definition] of planned.entries()) {
      const childId = (str(definition, 'cat_copilottestid') ?? '').toLowerCase();
      if (recordedTests.has(childId)) continue;
      const next = planned.slice(index + 1).find((row) =>
        recordedTests.has((str(row, 'cat_copilottestid') ?? '').toLowerCase()));
      const nextId = next && str(next, 'cat_copilottestid')?.toLowerCase();
      const before = nextId ? turns.findIndex((turn) => turn.testId?.toLowerCase() === nextId) : -1;
      turns.splice(before < 0 ? turns.length : before, 0, {
        id: childId, testId: childId,
        utterance: str(definition, 'cat_testutterance')?.trim() || '(no utterance)',
        testType: definition.cat_testtypecode == null ? undefined : num(definition, 'cat_testtypecode'),
        operator: definition.cat_comparisonoperator == null ? undefined : num(definition, 'cat_comparisonoperator'),
        fromDefinition: true,
      });
    }
    if (turns.length > 0) byParent.set(id, turns);
  }
  return byParent;
}

/**
 * Live progress of a Kit test run, read from its test results. The run's own
 * cat_tests also counts every multi-turn step result, so the total comes from
 * the test set's top-level tests instead.
 */
export async function getKitProgress(testRunId: string): Promise<KitProgress> {
  if (!GUID_PATTERN.test(testRunId)) return { total: 0, done: 0 };
  const [runs, results] = await Promise.all([
    list(ENTITY_SET.kitTestRun, {
      select: '_cat_copilottestsetid_value',
      filter: `cat_copilottestrunid eq ${testRunId}`,
    }),
    list(ENTITY_SET.kitTestResult, {
      select: 'cat_resultcode',
      filter: `_cat_copilottestrunid_value eq ${testRunId} and _cat_parent_value eq null`,
    }),
  ]);
  const testSetId = str(runs[0] ?? {}, '_cat_copilottestsetid_value') ?? '';
  const tests = GUID_PATTERN.test(testSetId)
    ? await list(ENTITY_SET.kitTest, {
      select: 'cat_copilottestid',
      filter: `_cat_copilottestsetid_value eq ${testSetId} and _cat_parent_value eq null and statecode eq 0`,
    })
    : [];
  const done = results.filter((row) => row['cat_resultcode'] !== 5).length;
  return { total: Math.max(tests.length, results.length), done };
}