import { Cat_copilotstudiokitlogsesService } from '../../../generated/services/Cat_copilotstudiokitlogsesService';
import type { Cat_copilotstudiokitlogsescat_syncnotified } from '../../../generated/models/Cat_copilotstudiokitlogsesModel';
import { WorkflowsService } from '../../../generated/services/WorkflowsService';
import { escapeODataValue, usageLoadEnabled } from './syncStatusService';

const AGENTS_DATA_LOAD_FLOW = 'Agent Inventory | Agents Data Load';
const USAGE_DATA_LOAD_FLOW = 'Agent Inventory | Usage Data Load';
const COMPLIANCE_SCAN_FLOW = 'Agent Inventory | Compliance Scan';

/** Sentinel used when no prior agent-load log exists (first ever run). */
const EPOCH_ISO = '1900-01-01T00:00:00Z';

/**
 * `cat_syncnotified` is a Dataverse Boolean (two-option) attribute — the same
 * data type as `cat_isenabled` — so the SDK serializes it as a JS boolean even
 * though the generated model mistypes it as `0 | 1`. Writing the numeric `1`
 * fails the BooleanType schema and is silently dropped (the record stays "No"),
 * so the "already notified" value is written as a real boolean.
 */
const SYNC_NOTIFIED_YES = true as unknown as Cat_copilotstudiokitlogsescat_syncnotified;

/**
 * Normalizes the raw `cat_syncnotified` value to a boolean. Reads may surface a
 * BooleanType field as a boolean, its numeric option value, or its formatted
 * string, so every representation of "Yes" is treated as notified.
 */
function isNotified(value: unknown): boolean {
  return value === true || value === 1 || value === 'Yes';
}

/** Execution-status choice values (see Cat_copilotstudiokitlogsescat_executionstatuscode). */
const EXECUTION_STATUS = {
  notStarted: 1,
  running: 2,
  complete: 3,
  error: 4,
} as const;

type LogPhase = 'inProgress' | 'complete' | 'error' | 'cancelled';

/** Non-pending outcomes surfaced to a caller once a tracked run settles. */
export type SyncSettledOutcome = 'success' | 'error' | 'cancelled';

/**
 * Snapshot captured just before an on-demand sync is triggered. `baseline` is
 * the latest existing agent-load log timestamp, used as a guard so a prior
 * (possibly never-notified) run cannot be mistaken for the run being started.
 * `usageEnabled` / `complianceEnabled` mirror the custom page's `IsUsageFlowOn`
 * / `IsComplianceFlowOn`.
 */
export interface SyncTrackingSetup {
  baseline: string;
  usageEnabled: boolean;
  complianceEnabled: boolean;
}

/**
 * Outcome of one agent+usage tracking poll. `pending` means keep polling.
 * `agentLogId` / `usageLogId` identify the records to mark as notified, and
 * `startCompliance` is true when an active, non-cancelled compliance scan log
 * exists and should now be tracked.
 */
export interface SyncProgress {
  outcome: 'pending' | 'success' | 'error' | 'cancelled';
  agentLogId?: string;
  usageLogId?: string;
  startCompliance?: boolean;
}

/**
 * Outcome of one compliance-scan tracking poll. `stop` ends tracking silently
 * (no record, already notified, or cancelled); `success` / `error` notify and
 * then mark `complianceLogId` as notified.
 */
export interface ComplianceProgress {
  outcome: 'pending' | 'stop' | 'success' | 'error';
  complianceLogId?: string;
}

/**
 * Evaluated when the feature opens to decide whether completion-notification
 * tracking should resume for a run that is still in flight or that finished
 * while the app was closed without notifying the user. Agent+usage and
 * compliance are surfaced independently (mirroring the custom page's
 * `IsSyncAgentFeatureEnabled` and `IsComplianceScanForNotification`) so a
 * compliance scan is never skipped just because the agent/usage notification
 * already fired in a prior session.
 */
export interface ResumeTrackingState {
  /** Resume agent+usage tracking: latest run is unnotified and not cancelled. */
  resumeSync: boolean;
  /** Setup for the agent tracker, present only when {@link resumeSync} is true. */
  syncSetup?: SyncTrackingSetup;
  /** Resume compliance tracking: a compliance log after the latest agent run is unnotified and not cancelled. */
  resumeCompliance: boolean;
}

/**
 * Maps a raw execution-status code to a coarse phase. Any value that is not a
 * known in-progress / complete / error code (e.g. a "Cancelled" state absent
 * from the generated enum) is treated as cancelled so polling can stop.
 */
function classifyPhase(code: number | undefined): LogPhase {
  switch (code) {
    case EXECUTION_STATUS.notStarted:
    case EXECUTION_STATUS.running:
      return 'inProgress';
    case EXECUTION_STATUS.complete:
      return 'complete';
    case EXECUTION_STATUS.error:
      return 'error';
    default:
      return 'cancelled';
  }
}

interface LogRecord {
  id: string;
  executionStatus?: number;
  createdOn?: string;
  notified: boolean;
}

async function latestLog(flowName: string, createdAfter?: string): Promise<LogRecord | undefined> {
  const clauses = [`cat_cloudflowname eq '${escapeODataValue(flowName)}'`];
  if (createdAfter) {
    clauses.push(`createdon gt ${createdAfter}`);
  }
  const result = await Cat_copilotstudiokitlogsesService.getAll({
    select: ['cat_copilotstudiokitlogsid', 'cat_executionstatuscode', 'createdon', 'cat_syncnotified'],
    filter: clauses.join(' and '),
    orderBy: ['createdon desc'],
    top: 1,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Unable to load the agent sync status.');
  }
  const row = result.data?.[0];
  if (!row) return undefined;
  return {
    id: row.cat_copilotstudiokitlogsid,
    executionStatus: row.cat_executionstatuscode,
    createdOn: row.createdon,
    notified: isNotified(row.cat_syncnotified),
  };
}

/**
 * A log still awaits a completion notification when it has not already been
 * notified and has not been cancelled. Mirrors the custom page's
 * `SyncNotified = false && 'Execution Status' <> Cancelled` guard.
 */
function notificationPending(log: LogRecord): boolean {
  return !log.notified && classifyPhase(log.executionStatus) !== 'cancelled';
}

/**
 * Mirrors the custom page's `IsComplianceFlowOn`: the compliance scan is only
 * tracked when the "Agent Inventory | Compliance Scan" cloud flow is activated.
 * Errors are tolerated (treated as "not enabled") so this optional post-sync
 * phase never disrupts the main sync flow.
 */
export async function complianceScanEnabled(): Promise<boolean> {
  try {
    const result = await WorkflowsService.getAll({
      select: ['name', 'statecode', 'statuscode'],
      filter: `category eq 5 and type eq 1 and statecode eq 1 and statuscode eq 2 and name eq '${escapeODataValue(COMPLIANCE_SCAN_FLOW)}'`,
      top: 5,
    });
    if (!result.success) return false;
    return (result.data ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Captures whether the usage and compliance pipelines are active plus the
 * pre-run agent-load baseline. Must be called *before* the on-demand sync flow
 * is triggered so tracking reacts to the new run rather than a prior one.
 */
export async function prepareSyncTracking(): Promise<SyncTrackingSetup> {
  const [usageEnabled, complianceEnabled, latest] = await Promise.all([
    usageLoadEnabled(),
    complianceScanEnabled(),
    latestLog(AGENTS_DATA_LOAD_FLOW),
  ]);
  return { baseline: latest?.createdOn ?? EPOCH_ISO, usageEnabled, complianceEnabled };
}

/**
 * Determines, when the Agent Inventory feature is opened, whether completion-
 * notification tracking should be (re)started for a run that is still in flight
 * or that finished while the app was closed without notifying the user. Mirrors
 * the custom page's on-load `IsSyncAgentFeatureEnabled` (agent + usage) and
 * `IsComplianceScanForNotification` (compliance) context evaluation:
 * - Agent+usage: the latest agent-load log must be unnotified and not cancelled;
 *   when usage is active, its post-agent log (if any yet) must also be unnotified
 *   and not cancelled (a missing usage log still counts as pending).
 * - Compliance: evaluated independently of the agent notification state — the
 *   latest compliance log after the agent run must exist, be unnotified, and not
 *   be cancelled — so a scan is tracked even when the agent/usage run was already
 *   notified in a previous session.
 * The agent tracker resumes with an epoch baseline so it re-evaluates the
 * existing latest run rather than waiting for a newer one.
 */
export async function getResumeTrackingState(): Promise<ResumeTrackingState> {
  const [usageEnabled, complianceEnabled, agent] = await Promise.all([
    usageLoadEnabled(),
    complianceScanEnabled(),
    latestLog(AGENTS_DATA_LOAD_FLOW),
  ]);

  const agentPending = Boolean(agent && notificationPending(agent));
  const agentCreatedOn = agent?.createdOn ?? EPOCH_ISO;

  const [usage, compliance] = await Promise.all([
    agentPending && usageEnabled
      ? latestLog(USAGE_DATA_LOAD_FLOW, agentCreatedOn)
      : Promise.resolve(undefined),
    agent ? latestLog(COMPLIANCE_SCAN_FLOW, agentCreatedOn) : Promise.resolve(undefined),
  ]);

  let resumeSync = agentPending;
  if (agentPending && usageEnabled) {
    resumeSync = !usage || notificationPending(usage);
  }

  const resumeCompliance = Boolean(compliance && notificationPending(compliance));

  return {
    resumeSync,
    syncSetup: resumeSync ? { baseline: EPOCH_ISO, usageEnabled, complianceEnabled } : undefined,
    resumeCompliance,
  };
}

/**
 * Marks each supplied log record's `cat_syncnotified` field as "Yes" so a
 * completed run is not notified again. Best-effort (the user has already been
 * notified by the time this runs) but failures are surfaced to the console:
 * the generated service resolves with `{ success: false }` rather than
 * throwing, so each result is inspected instead of relying on Promise
 * settlement, and unexpected throws are caught per record.
 */
export async function markSyncNotified(logIds: Array<string | undefined>): Promise<void> {
  const ids = logIds.filter((id): id is string => Boolean(id));
  await Promise.all(
    ids.map(async (id) => {
      try {
        const result = await Cat_copilotstudiokitlogsesService.update(id, {
          cat_syncnotified: SYNC_NOTIFIED_YES,
        });
        if (!result.success) {
          console.error(
            `[syncTracking] Failed to mark log ${id} as notified: ${result.error?.message ?? 'Unknown error'}`,
          );
        }
      } catch (error) {
        console.error(`[syncTracking] Error marking log ${id} as notified:`, error);
      }
    }),
  );
}

/**
 * Evaluates the agent+usage sync run, mirroring the custom page's polling:
 * 1. Take the latest agent-load log created by this run; keep polling until one
 *    exists that has not already been notified (SyncNotified = false).
 * 2. Cancelled ends tracking (refresh only); running keeps polling.
 * 3. When usage is active, require a usage-load log created after the agent log;
 *    cancelled ends tracking, running keeps polling.
 * 4. When compliance is active, its log must exist before the notification fires;
 *    `startCompliance` is set unless that log is cancelled.
 * Resolves `success` only when agent and usage are both complete, otherwise
 * `error`, exposing the record ids so the caller can mark them notified.
 */
export async function getSyncProgress(
  baseline: string,
  usageEnabled: boolean,
  complianceEnabled: boolean,
): Promise<SyncProgress> {
  const agent = await latestLog(AGENTS_DATA_LOAD_FLOW, baseline);
  if (!agent || agent.notified) return { outcome: 'pending' };

  const agentPhase = classifyPhase(agent.executionStatus);
  if (agentPhase === 'cancelled') return { outcome: 'cancelled' };
  if (agentPhase === 'inProgress') return { outcome: 'pending' };

  const agentCreatedOn = agent.createdOn ?? EPOCH_ISO;
  let usagePhase: LogPhase = 'complete';
  let usageLogId: string | undefined;
  if (usageEnabled) {
    const usage = await latestLog(USAGE_DATA_LOAD_FLOW, agentCreatedOn);
    if (!usage) return { outcome: 'pending' };
    usageLogId = usage.id;
    usagePhase = classifyPhase(usage.executionStatus);
    if (usagePhase === 'cancelled') return { outcome: 'cancelled' };
    if (usagePhase === 'inProgress') return { outcome: 'pending' };
  }

  let startCompliance = false;
  if (complianceEnabled) {
    const compliance = await latestLog(COMPLIANCE_SCAN_FLOW, agentCreatedOn);
    if (!compliance) return { outcome: 'pending' };
    startCompliance = classifyPhase(compliance.executionStatus) !== 'cancelled';
  }

  const outcome = agentPhase === 'complete' && usagePhase === 'complete' ? 'success' : 'error';
  return { outcome, agentLogId: agent.id, usageLogId, startCompliance };
}

/**
 * Evaluates the compliance scan, mirroring the custom page's dedicated polling:
 * finds the latest compliance-scan log created after the latest agent-load log,
 * and proceeds only when it exists and has not already been notified. Cancelled
 * scans stop silently; complete/error settle so the caller can notify and mark
 * the record notified; running keeps polling.
 */
export async function getComplianceProgress(): Promise<ComplianceProgress> {
  const agent = await latestLog(AGENTS_DATA_LOAD_FLOW);
  if (!agent) return { outcome: 'stop' };

  const compliance = await latestLog(COMPLIANCE_SCAN_FLOW, agent.createdOn ?? EPOCH_ISO);
  if (!compliance || compliance.notified) return { outcome: 'stop' };

  const phase = classifyPhase(compliance.executionStatus);
  if (phase === 'cancelled') return { outcome: 'stop' };
  if (phase === 'inProgress') return { outcome: 'pending' };
  return { outcome: phase === 'complete' ? 'success' : 'error', complianceLogId: compliance.id };
}
