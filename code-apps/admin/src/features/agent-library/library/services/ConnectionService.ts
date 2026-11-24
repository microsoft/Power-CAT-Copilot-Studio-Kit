/**
 * ConnectionService — Queries Power Platform connections via the
 * RetrievePowerAppsConnections Dataverse unbound action.
 *
 * Uses PerformUnboundActionWithOrganization so the same code works for
 * both the current environment (organization: "current") and cross-env
 * (organization: "https://org.crm.dynamics.com").
 *
 * The org URL comes from GetOrganizations() — no environment ID needed.
 */

import type { PowerAppsClient, UserConnection } from '../contracts/types';

// ---------------------------------------------------------------------------
// Types — RetrievePowerAppsConnections response shape
// ---------------------------------------------------------------------------

/**
 * Actual response shape from RetrievePowerAppsConnections:
 * {
 *   "@odata.type": "#Microsoft.Dynamics.CRM.expando",
 *   "name": "b489b4d60431426da36be2d5bef3ebc4",           // connection ID (GUID)
 *   "id": "/providers/Microsoft.PowerApps/apis/shared_.../connections/...",
 *   "apiId": "/providers/Microsoft.PowerApps/apis/shared_wordonlinebusiness",  // connector path
 *   "displayName": "user@contoso.onmicrosoft.com",  // user who created it
 *   "status": "Connected",
 *   "connectorTypeDisplayName": "Word Online (Business)",     // human-readable connector name
 *   "iconUri": "https://...",
 *   "maxAssignedRoleName": "Owner"
 * }
 */
interface PowerAppsConnection {
  /** Connection ID (GUID) — this is the connectionid for ComponentParameters */
  name?: string;
  /** Full connection path: /providers/Microsoft.PowerApps/apis/{connector}/connections/{id} */
  id?: string;
  /** Connector API path: /providers/Microsoft.PowerApps/apis/shared_wordonlinebusiness */
  apiId?: string;
  /** User who created the connection (email) */
  displayName?: string;
  /** Connection status: "Connected", "Error", etc. */
  status?: string;
  /** Human-readable connector name: "Word Online (Business)" */
  connectorTypeDisplayName?: string;
  /** Connector icon URL */
  iconUri?: string;
  /** Allow any additional fields */
  [key: string]: unknown;
}

interface RetrieveConnectionsResponse {
  Connections?: PowerAppsConnection[];
  connections?: PowerAppsConnection[];
  value?: PowerAppsConnection[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Core: Retrieve connections via Dataverse unbound action
// ---------------------------------------------------------------------------

/**
 * Calls RetrievePowerAppsConnections in the specified environment.
 * Uses PerformUnboundActionWithOrganization so it works cross-env.
 *
 * @param orgUrl - Target environment org URL (e.g., "https://org.crm.dynamics.com" or "current")
 */
async function retrieveConnections(client: PowerAppsClient, orgUrl: string): Promise<PowerAppsConnection[]> {
  console.log(`[ConnectionService] RetrievePowerAppsConnections for org: ${orgUrl}`);

  try {
    const result = await client.executeAsync<Record<string, unknown>, RetrieveConnectionsResponse>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'PerformUnboundActionWithOrganization',
        parameters: {
          organization: orgUrl,
          actionName: 'RetrievePowerAppsConnections',
        },
      },
    });

    const data = result.data as RetrieveConnectionsResponse | undefined;

    // Response shape may vary — try multiple field names
    const connections = data?.Connections ?? data?.connections ?? data?.value ?? [];
    return connections;
  } catch (err) {
    console.warn('[ConnectionService] RetrievePowerAppsConnections failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches connections for multiple connector types from a target environment.
 * Uses RetrievePowerAppsConnections via PerformUnboundActionWithOrganization.
 *
 * @param connectorNames - Short connector names (e.g., ["shared_wordonlinebusiness"])
 * @param orgUrl - Target org URL from GetOrganizations (e.g., "https://org.crm.dynamics.com" or "current")
 * @returns Map of connectorName → available connections
 */
export async function fetchConnectionsForConnectors(
  client: PowerAppsClient,
  connectorNames: string[],
  orgUrl: string,
): Promise<Map<string, UserConnection[]>> {
  const unique = [...new Set(connectorNames)];

  const allConnections = await retrieveConnections(client, orgUrl);
  const map = new Map<string, UserConnection[]>();

  for (const connectorName of unique) {
    // Match connections by apiId containing the connector name
    // apiId looks like: "/providers/Microsoft.PowerApps/apis/shared_wordonlinebusiness"
    const matching = allConnections
      .filter((conn) => {
        const apiId = conn.apiId ?? '';
        return apiId.toLowerCase().includes(connectorName.toLowerCase());
      })
      .filter((conn) => {
        const status = conn.status ?? '';
        return !status || status.toLowerCase() === 'connected';
      })
      .map((conn) => ({
        // "name" field is the connection GUID (used as connectionid in ComponentParameters)
        connectionId: conn.name ?? '',
        // Show user email + connector type to differentiate multiple connections of same type
        // e.g., "user@contoso.onmicrosoft.com (Word Online (Business))"
        displayName: conn.displayName
          ? `${conn.displayName}${conn.connectorTypeDisplayName ? ` (${conn.connectorTypeDisplayName})` : ''}`
          : conn.connectorTypeDisplayName ?? connectorName,
        status: 'Connected' as const,
        createdTime: (conn.createdTime as string) ?? new Date().toISOString(),
        connectorName,
      }))
      .filter((conn) => conn.connectionId !== '');

    console.log(`[ConnectionService] ${connectorName}: ${matching.length} connected in ${orgUrl}`);
    map.set(connectorName, matching);
  }

  return map;
}
