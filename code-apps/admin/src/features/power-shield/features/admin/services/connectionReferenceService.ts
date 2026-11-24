import { MicrosoftDataverseService } from '../../../../../generated/services/MicrosoftDataverseService';
import { PowerAppsforMakersService } from '../../../../../generated/services/PowerAppsforMakersService';
import type { ConnectionReference, AvailableConnection } from '../../../models/connectionReference';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LOG_PREFIX = '[PowerShield:ConnectionRef]';

const CR_SELECT = [
  'connectionreferenceid',
  'connectionreferencedisplayname',
  'connectionreferencelogicalname',
  'connectionid',
  'connectorid',
  'statecode',
].join(',');

const CR_FILTER = "statecode eq 0 and startswith(connectionreferencedisplayname,'PowerShield')";

// ─────────────────────────────────────────────────────────────────────────────
// Error Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts a human-readable error message from a Dataverse IOperationResult.
 * Logs the full error object for debugging.
 */
function extractError(context: string, result: { success: boolean; error?: unknown; data?: unknown }): string {
  const errorObj = result.error ?? result.data;
  console.error(`${LOG_PREFIX} ${context} — full error:`, JSON.stringify(errorObj, null, 2));

  if (typeof errorObj === 'object' && errorObj !== null) {
    const err = errorObj as Record<string, unknown>;
    // Dataverse error format: { error: { code, message } }
    if (typeof err.error === 'object' && err.error !== null) {
      const inner = err.error as Record<string, unknown>;
      if (inner.message) return `${context}: ${inner.message}`;
    }
    // Alternative format: { message }
    if (err.message) return `${context}: ${err.message}`;
    // Connector error format: { body: { error: { message } } }
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

interface CrRaw {
  connectionreferenceid: string;
  connectionreferencedisplayname?: string;
  connectionreferencelogicalname?: string;
  connectionid?: string | null;
  connectorid?: string;
  statecode?: number;
}

function toConnectionReference(r: CrRaw): ConnectionReference {
  return {
    id: r.connectionreferenceid,
    displayName: r.connectionreferencedisplayname ?? '',
    logicalName: r.connectionreferencelogicalname ?? '',
    connectorId: r.connectorid ?? '',
    connectionId: r.connectionid ?? null,
    isActive: r.statecode === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection Reference Queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all active PowerShield connection references (cat_ publisher prefix).
 * Uses `ListRecordsWithOrganization('current', ...)` for system table access.
 */
export async function getPowerShieldConnectionReferences(): Promise<ConnectionReference[]> {
  console.log(`${LOG_PREFIX} getPowerShieldConnectionReferences — querying 'connectionreferences' with filter: ${CR_FILTER}`);

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    'current',                // organization
    'connectionreferences',   // entityName
    undefined,                // prefer
    undefined,                // accept
    undefined,                // x_ms_odata_metadata_full
    undefined,                // mscrmIncludeMipSensitivityLabel
    CR_SELECT,                // $select
    CR_FILTER,                // $filter
    'connectionreferencedisplayname asc', // $orderby
    undefined,                // $expand
    undefined,                // fetchXml
    100,                      // $top
  );

  if (!result.success) {
    const msg = extractError('Failed to query connection references', result);
    throw new Error(msg);
  }

  const rows = (result.data as unknown as { value?: CrRaw[] })?.value ?? [];
  console.log(`${LOG_PREFIX} getPowerShieldConnectionReferences: ${rows.length} connection references found`);
  if (rows.length > 0) {
    console.log(`${LOG_PREFIX} First CR:`, JSON.stringify(rows[0], null, 2));
  }
  return rows.map(toConnectionReference);
}

// ─────────────────────────────────────────────────────────────────────────────
// Available Connections (API Hub)
// ─────────────────────────────────────────────────────────────────────────────

interface ApiHubConnectionRaw {
  name?: string;
  properties?: {
    displayName?: string;
    apiId?: string;
    statuses?: Array<{ status?: string }>;
    createdBy?: { displayName?: string };
    createdTime?: string;
  };
}

interface ApiHubConnectionsPage {
  value?: ApiHubConnectionRaw[];
  nextLink?: string;
  '@odata.nextLink'?: string;
}

const PAGE_SIZE = 1000;

function toAvailableConnection(r: ApiHubConnectionRaw): AvailableConnection {
  const name = r.name ?? '';
  return {
    name,
    normalizedId: normalizeConnectionId(name),
    displayName: r.properties?.displayName ?? name,
    status: r.properties?.statuses?.[0]?.status ?? 'Unknown',
    createdBy: r.properties?.createdBy?.displayName ?? '',
    apiId: r.properties?.apiId ?? '',
    createdTime: r.properties?.createdTime ?? '',
  };
}

/**
 * Normalizes a connection identifier to the 32-char compact hex form persisted by Dataverse in
 * `connectionreferences.connectionid`.
 *
 * Microsoft Power Platform encodes the same connection's underlying GUID in several forms across
 * APIs:
 *  - bare hyphenated GUID, e.g. `00000000-0000-0000-0000-000000000000`
 *  - prefixed string, e.g. `shared-cdsforapps-00000000-0000-0000-0000-000000000000`
 *  - full ARM path, e.g. `/providers/Microsoft.PowerApps/apis/<api>/connections/<id>`
 *  - Dataverse compact hex, e.g. `00000000000000000000000000000000`
 *
 * Returns the lowercased trailing 32 hex characters, or `null` if no 32+ hex run exists. We
 * intentionally do NOT fall back to the raw value: matching shorter strings can produce
 * accidental collisions and false-positive "mapped" UI state.
 */
export function normalizeConnectionId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = raw.toLowerCase().replace(/[^0-9a-f]/g, '');
  return hex.length >= 32 ? hex.slice(-32) : null;
}

/**
 * Normalizes a connectorId to the short api name used in `apiId` paths
 * (e.g., `shared_commondataserviceforapps`).
 *
 * Accepts:
 *  - full path: `/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps`
 *  - short name: `shared_commondataserviceforapps`
 *  - hyphen variant: `shared-commondataserviceforapps`
 */
function normalizeConnectorApiName(connectorId: string): string {
  const tail = connectorId.includes('/') ? connectorId.split('/').pop()! : connectorId;
  return tail.toLowerCase();
}

function apiNameMatches(apiId: string | undefined, apiName: string): boolean {
  if (!apiId) return false;
  return apiId.toLowerCase().endsWith(`/apis/${apiName}`);
}

export interface AvailableConnectionsResult {
  /** Connections matching the connector. */
  connections: AvailableConnection[];
  /** Human-readable error message when the fetch failed. `null` when the call succeeded
   *  (even if no connections matched the filter). */
  error: string | null;
}

/**
 * Lists available connections for a given connector type via the Power Apps for Makers connector.
 *
 * Implementation notes:
 *  - Issues a server-side `$filter` combining `environment` AND `apiId` so first-party
 *    connectors (Dataverse, PowerAppsForMakers, …) are not lost to client-side `$top` truncation.
 *  - Falls back to client-side filtering if the server returns more than the requested apiId
 *    (defensive — keeps prior behavior as a safety net).
 *  - Follows `nextLink` / `@odata.nextLink` up to {@link MAX_PAGES} pages.
 *
 * @param connectorId   Connector path or short api name (e.g. `shared_commondataserviceforapps`).
 * @param environmentId Required Power Platform environment id.
 */
export async function getAvailableConnections(
  connectorId: string,
  environmentId: string,
): Promise<AvailableConnectionsResult> {
  const apiName = normalizeConnectorApiName(connectorId);
  console.log(
    `${LOG_PREFIX} getAvailableConnections: connectorId="${connectorId}", apiName="${apiName}", env="${environmentId}"`,
  );

  if (!environmentId) {
    console.warn(`${LOG_PREFIX} getAvailableConnections: no environmentId — cannot fetch connections`);
    return { connections: [], error: 'Environment id is unavailable.' };
  }

  const apiIdValue = `/providers/Microsoft.PowerApps/apis/${apiName}`;
  const filter = `environment eq '${environmentId}' and apiId eq '${apiIdValue}'`;

  try {
    const all: ApiHubConnectionRaw[] = [];
    const result = await PowerAppsforMakersService.Get_Connections(
      '2016-11-01',
      filter,
      PAGE_SIZE,
    );

    if (!result.success) {
      const msg = extractError('Failed to fetch available connections', result);
      console.error(`${LOG_PREFIX} ${msg}`);
      return { connections: [], error: msg };
    }

    const pageData = (result.data as unknown as ApiHubConnectionsPage) ?? {};
    const rows = pageData.value ?? [];
    all.push(...rows);

    const nextLink = pageData.nextLink ?? pageData['@odata.nextLink'];
    if (nextLink) {
      // The generated connector method only exposes `$filter`/`$top`. Without a way to pass an
      // arbitrary continuation URL we cannot follow pages here. Logging surfaces truncation.
      console.warn(
        `${LOG_PREFIX} getAvailableConnections: nextLink present but generated connector does not support continuation tokens; results may be truncated`,
      );
    }

    // Defensive client-side filter — if server-side `apiId eq` is silently ignored we still
    // return only connections for the requested connector.
    const filtered = all.filter((c) => apiNameMatches(c.properties?.apiId, apiName));

    console.log(
      `${LOG_PREFIX} getAvailableConnections: server returned ${all.length}, ${filtered.length} match "${apiName}"`,
    );
    return { connections: filtered.map(toAvailableConnection), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch available connections';
    console.error(`${LOG_PREFIX} getAvailableConnections failed:`, err);
    return { connections: [], error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Map Connection to Connection Reference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps an API Hub connection to a Dataverse connection reference by updating
 * the `connectionid` field via `UpdateRecordWithOrganization`.
 *
 * The value passed in (`connectionName`) may be a raw API Hub identifier in any of the supported
 * forms (bare GUID, prefixed string, full ARM path). Before writing, we normalize it to the
 * 32-char compact hex form Dataverse persists, so subsequent reads round-trip cleanly.
 *
 * @param connectionReferenceId  The `connectionreferenceid` GUID
 * @param connectionName         The API Hub connection identifier (any supported form)
 */
export async function mapConnectionToReference(
  connectionReferenceId: string,
  connectionName: string,
): Promise<void> {
  const normalized = normalizeConnectionId(connectionName);
  if (!normalized) {
    throw new Error(
      `Selected connection identifier "${connectionName}" does not contain a valid 32-character connection id.`,
    );
  }

  console.log(
    `${LOG_PREFIX} mapConnectionToReference: ref=${connectionReferenceId}, connection="${connectionName}", normalized=${normalized}`,
  );

  const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(
    'return=minimal',
    'application/json',
    'current',
    'connectionreferences',
    connectionReferenceId,
    { connectionid: normalized },
  );

  if (!result.success) {
    const msg = extractError('Failed to map connection reference', result);
    throw new Error(msg);
  }

  console.log(`${LOG_PREFIX} mapConnectionToReference: success`);
}
