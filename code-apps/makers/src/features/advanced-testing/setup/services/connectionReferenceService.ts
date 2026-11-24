/**
 * Connection Reference service for Advanced Testing setup.
 *
 * Ported from `CopilotStudioKitAdmin/src/features/power-shield/features/admin/
 * services/connectionReferenceService.ts`. Power Apps SDK methods and
 * error-extraction shape are preserved verbatim so future maintenance can
 * share patterns with the Power Shield surface.
 *
 * Generalized to a typed registry of required Connection References
 * (`REQUIRED_CRS`). Each entry holds a stable logical name plus presentation
 * metadata (display name, connector id) used when the Dataverse record is
 * absent. The Connections tab renders one row per definition, mapped to a
 * {@link ConnectionReferenceSlot} that pairs the definition with the live
 * record (or null).
 */

import { MicrosoftDataverseService } from "../../../../generated/services/MicrosoftDataverseService";
import { PowerAppsforMakersService } from "../../../../generated/services/PowerAppsforMakersService";
import type {
  AvailableConnection,
  ConnectionReference,
  ConnectionReferenceSlot,
  RequiredCrDefinition,
} from "../contracts/types";

const LOG_PREFIX = "[AdvancedTesting:Setup:ConnectionRef]";

/**
 * Registry of Connection References the Advanced Testing feature requires.
 * Source of truth for the Connections tab row order and for the Setup-status
 * aggregation. Definitions live in code (not Dataverse) so the UI can render
 * a Not Installed placeholder when a CR row is missing from the environment.
 *
 * Render order in the Connections tab matches array order.
 */
export const REQUIRED_CRS: readonly RequiredCrDefinition[] = [
  {
    logicalName: "cat_CopilotStudioAcceleratorDataverse",
    displayName: "Copilot Studio Kit - Dataverse",
    connectorId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
  },
  {
    logicalName: "cat_CopilotStudioKitAutomatedTests",
    displayName: "Copilot Agent Kit - Automated Tests",
    connectorId: "/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio",
  },
];

const CR_SELECT = [
  "connectionreferenceid",
  "connectionreferencedisplayname",
  "connectionreferencelogicalname",
  "connectionid",
  "connectorid",
  "statecode",
].join(",");

function buildCrFilter(logicalNames: readonly string[]): string {
  const orClause = logicalNames
    .map((n) => `connectionreferencelogicalname eq '${n}'`)
    .join(" or ");
  return `statecode eq 0 and (${orClause})`;
}

// ─── Error helper ────────────────────────────────────────────────────────────

/**
 * Extracts a human-readable error message from a Dataverse `IOperationResult`.
 * Logs the full error object for debugging.
 */
function extractError(
  context: string,
  result: { success: boolean; error?: unknown; data?: unknown },
): string {
  const errorObj = result.error ?? result.data;
  console.error(`${LOG_PREFIX} ${context}, full error:`, JSON.stringify(errorObj, null, 2));

  if (typeof errorObj === "object" && errorObj !== null) {
    const err = errorObj as Record<string, unknown>;
    if (typeof err.error === "object" && err.error !== null) {
      const inner = err.error as Record<string, unknown>;
      if (inner.message) return `${context}: ${inner.message}`;
    }
    if (err.message) return `${context}: ${err.message}`;
    if (typeof err.body === "object" && err.body !== null) {
      const body = err.body as Record<string, unknown>;
      if (typeof body.error === "object" && body.error !== null) {
        const bodyErr = body.error as Record<string, unknown>;
        if (bodyErr.message) return `${context}: ${bodyErr.message}`;
      }
    }
  }

  return `${context}: ${JSON.stringify(errorObj) ?? "Unknown error"}`;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

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
    displayName: r.connectionreferencedisplayname ?? "",
    logicalName: r.connectionreferencelogicalname ?? "",
    connectorId: r.connectorid ?? "",
    connectionId: r.connectionid ?? null,
    isActive: r.statecode === 0,
  };
}

// ─── CR Query ────────────────────────────────────────────────────────────────

/**
 * Fetches the live Dataverse records for every CR in {@link REQUIRED_CRS} and
 * returns one slot per definition, preserving registry order. When a CR row is
 * absent from the environment (solution layer not installed, CR deleted, or
 * `statecode != 0`), the slot's `record` is `null` and the UI renders a
 * Not Installed placeholder.
 *
 * One round trip to Dataverse regardless of registry size; slots are matched
 * by logical name (stable identity).
 */
export async function getRequiredConnectionReferences(): Promise<
  ConnectionReferenceSlot[]
> {
  const logicalNames = REQUIRED_CRS.map((d) => d.logicalName);
  const filter = buildCrFilter(logicalNames);
  console.log(`${LOG_PREFIX} getRequiredConnectionReferences, filter: ${filter}`);

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    "current",
    "connectionreferences",
    undefined,
    undefined,
    undefined,
    undefined,
    CR_SELECT,
    filter,
    "connectionreferencedisplayname asc",
    undefined,
    undefined,
    // 2 rows per definition is enough to detect duplicates while staying small.
    Math.max(2 * REQUIRED_CRS.length, 4),
  );

  if (!result.success) {
    throw new Error(extractError("Failed to query connection references", result));
  }

  const rows = (result.data as unknown as { value?: CrRaw[] })?.value ?? [];
  console.log(
    `${LOG_PREFIX} getRequiredConnectionReferences, ${rows.length} rows returned for ${REQUIRED_CRS.length} definitions`,
  );

  const byLogicalName = new Map<string, CrRaw[]>();
  for (const r of rows) {
    const key = r.connectionreferencelogicalname ?? "";
    if (!key) continue;
    const bucket = byLogicalName.get(key) ?? [];
    bucket.push(r);
    byLogicalName.set(key, bucket);
  }

  const slots: ConnectionReferenceSlot[] = REQUIRED_CRS.map((definition) => {
    const matches = byLogicalName.get(definition.logicalName) ?? [];
    if (matches.length === 0) {
      console.warn(
        `${LOG_PREFIX} no row matched logical name "${definition.logicalName}". Either the CR is missing from this environment or the solution is not installed.`,
      );
      return { definition, record: null };
    }
    if (matches.length > 1) {
      console.warn(
        `${LOG_PREFIX} ${matches.length} matches for logical name "${definition.logicalName}", using first (Dataverse solution layering is normal).`,
      );
    }
    return { definition, record: toConnectionReference(matches[0]) };
  });

  slots.forEach((s, i) =>
    console.log(
      `${LOG_PREFIX} slot[${i}]:`,
      JSON.stringify(
        {
          logicalName: s.definition.logicalName,
          displayName: s.definition.displayName,
          hasRecord: s.record !== null,
          connectionId: s.record?.connectionId ?? null,
        },
        null,
        2,
      ),
    ),
  );

  return slots;
}

// ─── Available connections (API Hub) ─────────────────────────────────────────

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
  "@odata.nextLink"?: string;
}

const PAGE_SIZE = 1000;

function toAvailableConnection(r: ApiHubConnectionRaw): AvailableConnection {
  const name = r.name ?? "";
  return {
    name,
    normalizedId: normalizeConnectionId(name),
    displayName: r.properties?.displayName ?? name,
    status: r.properties?.statuses?.[0]?.status ?? "Unknown",
    createdBy: r.properties?.createdBy?.displayName ?? "",
    apiId: r.properties?.apiId ?? "",
    createdTime: r.properties?.createdTime ?? "",
  };
}

/**
 * Normalizes a connection identifier to the 32-char compact hex form persisted
 * by Dataverse in `connectionreferences.connectionid`.
 *
 * Microsoft Power Platform encodes the same connection's underlying GUID in
 * several forms across APIs:
 *  - bare hyphenated GUID: `00000000-0000-0000-0000-000000000000`
 *  - prefixed string:      `shared-cdsforapps-00000000-0000-0000-0000-000000000000`
 *  - full ARM path:        `/providers/Microsoft.PowerApps/apis/<api>/connections/<id>`
 *  - Dataverse hex form:   `00000000000000000000000000000000`
 *
 * Returns the lowercased trailing 32 hex characters, or `null` if no 32+ hex run
 * exists. We intentionally do NOT fall back to the raw value: matching shorter
 * strings can produce accidental collisions and false-positive "mapped" UI state.
 */
export function normalizeConnectionId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = raw.toLowerCase().replace(/[^0-9a-f]/g, "");
  return hex.length >= 32 ? hex.slice(-32) : null;
}

function normalizeConnectorApiName(connectorId: string): string {
  const tail = connectorId.includes("/") ? connectorId.split("/").pop()! : connectorId;
  return tail.toLowerCase();
}

function apiNameMatches(apiId: string | undefined, apiName: string): boolean {
  if (!apiId) return false;
  return apiId.toLowerCase().endsWith(`/apis/${apiName}`);
}

export interface AvailableConnectionsResult {
  /** Connections matching the connector. */
  connections: AvailableConnection[];
  /**
   * Human-readable error message when the fetch failed. `null` when the call
   * succeeded (even if no connections matched the filter).
   */
  error: string | null;
}

/**
 * Lists available connections for a given connector type via the Power Apps for
 * Makers connector. Identical implementation to Power Shield.
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
    `${LOG_PREFIX} getAvailableConnections, connectorId="${connectorId}", apiName="${apiName}", env="${environmentId}"`,
  );

  if (!environmentId) {
    console.warn(`${LOG_PREFIX} getAvailableConnections, no environmentId; cannot fetch connections`);
    return { connections: [], error: "Environment id is unavailable." };
  }

  const apiIdValue = `/providers/Microsoft.PowerApps/apis/${apiName}`;
  const filter = `environment eq '${environmentId}' and apiId eq '${apiIdValue}'`;

  try {
    const result = await PowerAppsforMakersService.Get_Connections(
      "2016-11-01",
      filter,
      PAGE_SIZE,
    );

    if (!result.success) {
      const msg = extractError("Failed to fetch available connections", result);
      return { connections: [], error: msg };
    }

    const pageData = (result.data as unknown as ApiHubConnectionsPage) ?? {};
    const rows = pageData.value ?? [];

    const nextLink = pageData.nextLink ?? pageData["@odata.nextLink"];
    if (nextLink) {
      console.warn(
        `${LOG_PREFIX} getAvailableConnections, nextLink present but generated connector does not support continuation tokens; results may be truncated`,
      );
    }

    const filtered = rows.filter((c) => apiNameMatches(c.properties?.apiId, apiName));

    console.log(
      `${LOG_PREFIX} getAvailableConnections, server returned ${rows.length}, ${filtered.length} match "${apiName}"`,
    );
    if (filtered.length === 0 && rows.length > 0) {
      console.warn(
        `${LOG_PREFIX} no connection matched apiName="${apiName}". Server rows had apiIds:`,
        rows.map((r) => r.properties?.apiId).filter(Boolean),
      );
    }
    filtered.forEach((c, i) =>
      console.log(
        `${LOG_PREFIX} availableConnection[${i}]:`,
        JSON.stringify(
          {
            name: c.name,
            displayName: c.properties?.displayName,
            apiId: c.properties?.apiId,
            status: c.properties?.statuses?.[0]?.status,
          },
          null,
          2,
        ),
      ),
    );
    return { connections: filtered.map(toAvailableConnection), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch available connections";
    console.error(`${LOG_PREFIX} getAvailableConnections failed:`, err);
    return { connections: [], error: message };
  }
}

// ─── Map connection to CR ────────────────────────────────────────────────────

/**
 * Maps an API Hub connection to a Dataverse Connection Reference by updating
 * the `connectionid` field. Identical PATCH semantics to Power Shield.
 *
 * The `connectionName` may be any of the supported identifier forms (bare GUID,
 * prefixed string, full ARM path). It is normalized to the 32-char compact hex
 * form Dataverse persists before being written, so subsequent reads round-trip
 * cleanly.
 *
 * Per RD-10 in the plan, the caller MUST refetch the CR after this call returns
 * and compare the persisted `connectionId` against what was selected. A diff
 * signals a concurrent update by another admin and the UI must surface a
 * warning MessageBar.
 *
 * @param connectionReferenceId The `connectionreferenceid` GUID
 * @param connectionName        The API Hub connection identifier (any supported form)
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
    `${LOG_PREFIX} mapConnectionToReference, ref=${connectionReferenceId}, connection="${connectionName}", normalized=${normalized}`,
  );

  const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(
    "return=minimal",
    "application/json",
    "current",
    "connectionreferences",
    connectionReferenceId,
    { connectionid: normalized },
  );

  if (!result.success) {
    throw new Error(extractError("Failed to map connection reference", result));
  }

  console.log(`${LOG_PREFIX} mapConnectionToReference, success`);
}
