import { Cat_agentinventoryactionauditsService } from '../../../generated/services/Cat_agentinventoryactionauditsService';
import { escapeODataValue } from './syncStatusService';
import type { AgentActionType } from './agentActionsService';

/** Coarse per-agent outcome derived from an audit row's execution status. */
export type ActionRecordStatus =
  | 'notStarted'
  | 'running'
  | 'complete'
  | 'error'
  | 'cancelled'
  | 'unknown';

/** Execution-status choice values (Cat_agentinventoryactionauditscat_executionstatuscode). */
const ACTION_STATUS = {
  notStarted: 1,
  running: 2,
  complete: 3,
  error: 4,
  cancelled: 5,
} as const;

const STATUS_LABEL: Record<ActionRecordStatus, string> = {
  notStarted: 'Not started',
  running: 'Running',
  complete: 'Complete',
  error: 'Error',
  cancelled: 'Cancelled',
  unknown: 'Unknown',
};

/** Latest resolved audit state for a single agent within an action batch. */
export interface ActionAuditRecord {
  agentId: string;
  status: ActionRecordStatus;
  statusLabel: string;
  errorMessage?: string;
}

/** Result of one completion poll. `settled` stops the poller. */
export interface ActionCompletionProgress {
  settled: boolean;
  records: ActionAuditRecord[];
}

/** Final roll-up handed to the parent screen once an action settles. */
export interface ActionCompletionSummary {
  action: AgentActionType;
  single: boolean;
  total: number;
  successCount: number;
  errorCount: number;
  /** Representative error message (single-agent, or the first failing agent). */
  errorMessage?: string;
}

function classify(code: number | undefined): ActionRecordStatus {
  switch (code) {
    case ACTION_STATUS.notStarted:
      return 'notStarted';
    case ACTION_STATUS.running:
      return 'running';
    case ACTION_STATUS.complete:
      return 'complete';
    case ACTION_STATUS.error:
      return 'error';
    case ACTION_STATUS.cancelled:
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/** Complete / Error / Cancelled are the states that end polling for an agent. */
function isTerminal(status: ActionRecordStatus): boolean {
  return status === 'complete' || status === 'error' || status === 'cancelled';
}

/**
 * Polls the agent-action audit table for one action batch. Retrieves every row
 * tagged with the flow-returned `name`, deduplicates to the latest row per
 * agent (the flow may append or update in place), and reports the batch as
 * `settled` once every targeted agent has a terminal row — mirroring the custom
 * page's "retrieved records match the selected records and none are still
 * running" condition.
 */
export async function getActionCompletion(
  name: string,
  expectedCount: number,
): Promise<ActionCompletionProgress> {
  const result = await Cat_agentinventoryactionauditsService.getAll({
    select: [
      'cat_agentid',
      'cat_executionstatuscode',
      'cat_errormessage',
      'createdon',
    ],
    filter: `cat_name eq '${escapeODataValue(name)}'`,
    orderBy: ['createdon desc'],
    top: 500,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Unable to load the action status.');
  }

  const byAgent = new Map<string, ActionAuditRecord>();
  for (const row of result.data ?? []) {
    const agentId = row.cat_agentid ?? '';
    if (!agentId || byAgent.has(agentId)) continue;
    const status = classify(row.cat_executionstatuscode);
    byAgent.set(agentId, {
      agentId,
      status,
      statusLabel: STATUS_LABEL[status],
      errorMessage: row.cat_errormessage ?? undefined,
    });
  }

  const records = [...byAgent.values()];
  const settled = records.length >= expectedCount && records.every((record) => isTerminal(record.status));
  return { settled, records };
}

/**
 * Rolls per-agent audit outcomes into a single {@link ActionCompletionSummary}.
 * Both `error` and `cancelled` count as failures, so a single-agent toast can
 * surface the captured error and a bulk dialog can report the failure count.
 */
export function summarizeActionCompletion(
  action: AgentActionType,
  single: boolean,
  records: ActionAuditRecord[],
): ActionCompletionSummary {
  const failures = records.filter((record) => record.status === 'error' || record.status === 'cancelled');
  return {
    action,
    single,
    total: records.length,
    successCount: records.length - failures.length,
    errorCount: failures.length,
    errorMessage: failures[0]?.errorMessage,
  };
}
