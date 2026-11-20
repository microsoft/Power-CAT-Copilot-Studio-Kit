import { MicrosoftDataverseService } from '../../../../../generated/services/MicrosoftDataverseService';
import type { CloudFlow } from '../../../models/workflow';
import { hasConnectors } from './connectorService';
import { hasConnectorActions } from './connectorActionService';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LOG_PREFIX = '[PowerShield:Workflow]';

const FLOW_SELECT = 'workflowid,name,statecode,statuscode';

/**
 * Filter for the PowerShield cloud flows.
 * - category eq 5  → Modern Flow (Cloud Flow)
 * - type eq 1      → Definition (not activation copy)
 */
const FLOW_FILTER =
  "category eq 5 and type eq 1 and " +
  "(name eq 'PowerShield | Sync Connectors' or name eq 'PowerShield | DLP Request - Patch Custom Connector and Actions')";

// ─────────────────────────────────────────────────────────────────────────────
// Error Helper
// ─────────────────────────────────────────────────────────────────────────────

function extractError(context: string, result: { success: boolean; error?: unknown; data?: unknown }): string {
  const errorObj = result.error ?? result.data;
  console.error(`${LOG_PREFIX} ${context} — full error:`, JSON.stringify(errorObj, null, 2));

  if (typeof errorObj === 'object' && errorObj !== null) {
    const err = errorObj as Record<string, unknown>;
    if (typeof err.error === 'object' && err.error !== null) {
      const inner = err.error as Record<string, unknown>;
      if (inner.message) return `${context}: ${inner.message}`;
    }
    if (err.message) return `${context}: ${err.message}`;
    if (typeof err.body === 'object' && err.body !== null) {
      const body = err.body as Record<string, unknown>;
      if (typeof body.error === 'object' && body.error !== null) {
        const bodyErr = body.error as Record<string, unknown>;
        if (bodyErr.message) return `${context}: ${bodyErr.message}`;
      }
    }
  }

  return `${context}: ${JSON.stringify(errorObj) ?? 'Unknown error'}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

interface FlowRaw {
  workflowid: string;
  name?: string;
  statecode?: number;
  statuscode?: number;
}

function toCloudFlow(r: FlowRaw): CloudFlow {
  return {
    id: r.workflowid,
    name: r.name ?? '',
    statecode: r.statecode ?? 0,
    statuscode: r.statuscode ?? 1,
    isActivated: r.statecode === 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the two PowerShield sync cloud flows by name from the `workflows` table.
 * Uses `ListRecordsWithOrganization('current', ...)` for system table access.
 */
export async function getPowerShieldFlows(): Promise<CloudFlow[]> {
  console.log(`${LOG_PREFIX} getPowerShieldFlows — querying 'workflows' with filter: ${FLOW_FILTER}`);

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    'current',      // organization
    'workflows',    // entityName
    undefined,      // prefer
    undefined,      // accept
    undefined,      // x_ms_odata_metadata_full
    undefined,      // mscrmIncludeMipSensitivityLabel
    FLOW_SELECT,    // $select
    FLOW_FILTER,    // $filter
    'name asc',     // $orderby
    undefined,      // $expand
    undefined,      // fetchXml
    10,             // $top
  );

  if (!result.success) {
    const msg = extractError('Failed to query cloud flows', result);
    throw new Error(msg);
  }

  const rows = (result.data as unknown as { value?: FlowRaw[] })?.value ?? [];
  console.log(`${LOG_PREFIX} getPowerShieldFlows: ${rows.length} flows found`);
  if (rows.length > 0) {
    console.log(`${LOG_PREFIX} Flows:`, rows.map((r) => `${r.name} [state=${r.statecode}]`).join(', '));
  }
  return rows.map(toCloudFlow);
}

// ─────────────────────────────────────────────────────────────────────────────
// Activation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Activates a cloud flow by setting `statecode=1, statuscode=2`.
 * Uses `UpdateRecordWithOrganization` for system table access.
 */
export async function activateFlow(workflowId: string): Promise<void> {
  console.log(`${LOG_PREFIX} activateFlow: id=${workflowId}`);

  const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(
    'return=minimal',
    'application/json',
    'current',
    'workflows',
    workflowId,
    { statecode: 1, statuscode: 2 },
  );

  if (!result.success) {
    const msg = extractError('Failed to activate flow', result);
    if (msg.includes('privilege') || msg.includes('permission')) {
      throw new Error(
        'Unable to activate flow. You may need owner/co-owner rights on this flow. ' +
        'Please check your permissions in Power Automate.',
      );
    }
    if (msg.includes('managed')) {
      throw new Error(
        'Unable to activate this managed flow. Contact the solution owner ' +
        'or activate the flow directly in Power Automate.',
      );
    }
    throw new Error(msg);
  }

  console.log(`${LOG_PREFIX} activateFlow: success`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Sync Verification
// ─────────────────────────────────────────────────────────────────────────────

export interface DataSyncStatus {
  hasConnectorData: boolean;
  hasConnectorActionData: boolean;
  allSynced: boolean;
}

/**
 * Checks whether the PowerShield data tables have been populated by the sync flows.
 */
export async function checkDataSyncStatus(): Promise<DataSyncStatus> {
  console.log(`${LOG_PREFIX} checkDataSyncStatus — checking cat_connector and cat_connectoraction tables`);
  const [hasConn, hasAct] = await Promise.all([
    hasConnectors(),
    hasConnectorActions(),
  ]);
  console.log(`${LOG_PREFIX} checkDataSyncStatus: connectors=${hasConn}, actions=${hasAct}`);
  return {
    hasConnectorData: hasConn,
    hasConnectorActionData: hasAct,
    allSynced: hasConn && hasAct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consolidated Health Check (Home Screen)
// ─────────────────────────────────────────────────────────────────────────────

/** Reason for showing the Connection Health banner on the Home screen. */
export type HealthReason = 'no-data' | 'flows-off' | 'data-pending' | null;

export interface PowerShieldHealth {
  hasConnectorData: boolean;
  hasActionData: boolean;
  flowsTurnedOff: boolean;
  healthy: boolean;
  reason: HealthReason;
}

/**
 * Checks if any PowerShield cloud flows are turned off (statecode=0).
 * Lightweight query: $top=2, single-column select.
 */
export async function hasFlowsTurnedOff(): Promise<boolean> {
  const filter =
    "category eq 5 and type eq 1 and statecode eq 0 and " +
    "(name eq 'PowerShield | Sync Connectors' or name eq 'PowerShield | DLP Request - Patch Custom Connector and Actions')";

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    'current',
    'workflows',
    undefined, undefined, undefined, undefined,
    'workflowid',
    filter,
    undefined, undefined, undefined,
    2,
  );

  if (!result.success) {
    console.warn(`${LOG_PREFIX} hasFlowsTurnedOff — query failed, assuming no flows off`);
    return false;
  }

  const rows = (result.data as unknown as { value?: unknown[] })?.value ?? [];
  return rows.length > 0;
}

// In-memory cache for health check (5-minute TTL)
let healthCache: { data: PowerShieldHealth; timestamp: number } | null = null;
const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Consolidated health check for the Home screen.
 * Runs 3 lightweight parallel queries and caches for 5 minutes.
 * Call `invalidateHealthCache()` after changes (e.g., mapping a CR, activating a flow).
 */
export async function checkPowerShieldHealth(): Promise<PowerShieldHealth> {
  if (healthCache && Date.now() - healthCache.timestamp < HEALTH_CACHE_TTL_MS) {
    console.log(`${LOG_PREFIX} checkPowerShieldHealth — returning cached result`);
    return healthCache.data;
  }

  console.log(`${LOG_PREFIX} checkPowerShieldHealth — running parallel checks`);
  const [hasConn, hasAct, flowsOff] = await Promise.all([
    hasConnectors(),
    hasConnectorActions(),
    hasFlowsTurnedOff(),
  ]);

  let reason: HealthReason = null;
  if (!hasConn || !hasAct) {
    reason = flowsOff ? 'no-data' : 'data-pending';
  } else if (flowsOff) {
    reason = 'flows-off';
  }

  const health: PowerShieldHealth = {
    hasConnectorData: hasConn,
    hasActionData: hasAct,
    flowsTurnedOff: flowsOff,
    healthy: hasConn && hasAct && !flowsOff,
    reason,
  };

  healthCache = { data: health, timestamp: Date.now() };
  console.log(`${LOG_PREFIX} checkPowerShieldHealth — result:`, JSON.stringify(health));
  return health;
}

/** Invalidate the health cache (call after CR mapping, flow activation, etc.). */
export function invalidateHealthCache(): void {
  healthCache = null;
}
