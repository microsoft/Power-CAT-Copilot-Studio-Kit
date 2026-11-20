import { WorkflowsService } from '../../../generated/services/WorkflowsService';
import { Cat_copilotstudiokitlogsesService } from '../../../generated/services/Cat_copilotstudiokitlogsesService';
import { INVENTORY_PROCESS_NAMES } from '../settings/contracts/types';
import { InventorySettingsService } from '../settings/services/InventorySettingsService';

/** Execution-status choice value for a log entry that is still running. */
const EXECUTION_STATUS_RUNNING = 2;

/** Agent-load cloud flows whose latest log signals an in-progress sync. */
const AGENT_LOAD_FLOWS = [
  'Agent Inventory | Agents Data Load',
  'Agent Inventory | Agents Data Load Scheduler',
];

/** Usage-load cloud flows, only relevant when the usage pipeline is activated. */
const USAGE_LOAD_FLOWS = [
  'Agent Inventory | Usage Data Load',
  'Agent Inventory | Usage Data Load Scheduler',
];

export interface SyncStatus {
  /** True when the latest data-load run is confirmed to still be running. */
  inProgress: boolean;
}

export function escapeODataValue(value: string): string {
  return value.replaceAll("'", "''");
}

/**
 * Mirrors the custom page's `IsUsageExists` / `IsUsageFlowOn`: the usage
 * pipeline is considered live only when both the parent "Usage Data Load" and
 * its "(Child)" process are activated. Missing processes are tolerated (treated
 * as not activated).
 */
async function usageProcessesActivated(): Promise<boolean> {
  const names = [INVENTORY_PROCESS_NAMES.usage, INVENTORY_PROCESS_NAMES.usageChild];
  const nameFilter = names.map((name) => `name eq '${escapeODataValue(name)}'`).join(' or ');
  const result = await WorkflowsService.getAll({
    select: ['name', 'statecode', 'statuscode'],
    filter: `category eq 5 and type eq 1 and statecode eq 1 and statuscode eq 2 and (${nameFilter})`,
    top: 20,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Unable to load Agent Inventory processes.');
  }
  const activatedNames = new Set((result.data ?? []).map((row) => row.name));
  return names.every((name) => activatedNames.has(name));
}

/**
 * Single gate for the Agent Inventory usage pipeline. The pipeline counts as
 * live only when BOTH conditions hold:
 * 1. the "Usage Data Load" and "Usage Data Load (Child)" processes are activated,
 * 2. the settings singleton's `cat_enableusage` column is present and true.
 * Every usage-dependent behaviour (sync-in-progress detection, the Sync agents
 * and Settings button gating, and sync completion-notification tracking) routes
 * through here so the two checks stay in sync.
 */
export async function usageLoadEnabled(): Promise<boolean> {
  const [settingEnabled, processesActivated] = await Promise.all([
    InventorySettingsService.isUsageEnabled(),
    usageProcessesActivated(),
  ]);
  return settingEnabled && processesActivated;
}

/**
 * Reports whether an Agent Inventory data-load run is currently in progress by
 * inspecting the most recent Copilot Studio Kit log for the relevant cloud
 * flows. Mirrors the custom page's `IsSyncAgentVisible`:
 * - Usage flows are only considered when the usage pipeline is activated.
 * - A missing latest log means the environment has not run a sync yet, so the
 *   first on-demand sync remains available.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const usageEnabled = await usageLoadEnabled();
  const flowNames = usageEnabled ? [...AGENT_LOAD_FLOWS, ...USAGE_LOAD_FLOWS] : AGENT_LOAD_FLOWS;
  const nameFilter = flowNames
    .map((name) => `cat_cloudflowname eq '${escapeODataValue(name)}'`)
    .join(' or ');

  const result = await Cat_copilotstudiokitlogsesService.getAll({
    select: ['cat_cloudflowname', 'cat_executionstatuscode', 'createdon'],
    filter: `(${nameFilter})`,
    orderBy: ['createdon desc'],
    top: 1,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Unable to load the agent sync status.');
  }

  const latest = result.data?.[0];
  const inProgress = latest?.cat_executionstatuscode === EXECUTION_STATUS_RUNNING;
  return { inProgress };
}

/**
 * Returns the `createdon` timestamp of the most recent
 * "Agent Inventory | Agents Data Load" or "... Scheduler" run recorded in the
 * Copilot Studio Kit logs, or `undefined` when no such run exists. Drives the
 * dashboard's "Last synchronized" indicator.
 */
export async function getLastAgentSyncTime(): Promise<string | undefined> {
  const nameFilter = AGENT_LOAD_FLOWS
    .map((name) => `cat_cloudflowname eq '${escapeODataValue(name)}'`)
    .join(' or ');
  const result = await Cat_copilotstudiokitlogsesService.getAll({
    select: ['cat_cloudflowname', 'createdon'],
    filter: `(${nameFilter})`,
    orderBy: ['createdon desc'],
    top: 1,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Unable to load the last agent sync time.');
  }
  return result.data?.[0]?.createdon;
}
