/**
 * EnvironmentService — Cross-environment operations for Agent Template import.
 *
 * Provides:
 * 1. GetOrganizations() — list of environments the user can access
 * 2. Privilege check — verify user has System Customizer+ role in target env
 *
 * All cross-env operations use the org URL from GetOrganizations.
 * Connection retrieval uses RetrievePowerAppsConnections (see ConnectionService).
 */

import type { PowerAppsClient } from '../contracts/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Organization {
  /** Dataverse org URL (e.g., "https://org.crm.dynamics.com") or "Current" sentinel */
  Url: string;
  /** Human-readable name (e.g., "CSK-Dev") */
  FriendlyName: string;
  /** Power Platform environment ID (GUID used in make.powerapps.com deep links) */
  EnvironmentId?: string;
  /** Allow capturing any additional fields from the API response */
  [key: string]: unknown;
}

interface SdkResult<T> {
  success: boolean;
  data: { value: T[] };
}

interface RoleRecord {
  name: string;
  roleid: string;
}

interface SystemUserRecord {
  systemuserid: string;
  organizationid?: string;
  internalemailaddress?: string;
}

interface WhoAmIResponse {
  UserId: string;
  OrganizationId?: string;
}

// ---------------------------------------------------------------------------
// Well-known role names that always have prvImportSolution
// ---------------------------------------------------------------------------

const IMPORT_CAPABLE_ROLES = new Set([
  'System Administrator',
  'System Customizer',
]);

// ---------------------------------------------------------------------------
// GetOrganizations
// ---------------------------------------------------------------------------

/**
 * Fetches all environments the current user has access to.
 * Returns organizations with Url, FriendlyName, and any additional fields
 * the API provides (including potential EnvironmentId).
 */
export async function getOrganizations(client: PowerAppsClient): Promise<Organization[]> {
  const result = await client.executeAsync<void, { value: Record<string, unknown>[] }>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'GetOrganizations',
    },
  });

  const raw = result.data?.value ?? [];
  console.log('[EnvironmentService] GetOrganizations raw response:', JSON.stringify(raw, null, 2));

  return raw.map((item) => ({
    ...item,
    Url: (item.Url ?? item.url ?? '') as string,
    FriendlyName: (item.FriendlyName ?? item.friendlyName ?? '') as string,
    EnvironmentId: (item.EnvironmentId ?? item.environmentId ?? item.Id ?? item.id ?? undefined) as string | undefined,
  }));
}

// ---------------------------------------------------------------------------
// RetrieveCurrentOrganization — get real Power Platform Environment ID
// ---------------------------------------------------------------------------

interface RetrieveOrgDetail {
  OrganizationId?: string;
  EnvironmentId?: string;
  FriendlyName?: string;
  TenantId?: string;
  Geo?: string;
  State?: string;
  [key: string]: unknown;
}

interface RetrieveOrgResponse {
  Detail?: RetrieveOrgDetail;
  detail?: RetrieveOrgDetail;
  [key: string]: unknown;
}

/**
 * Fetches the real Power Platform Environment ID for a target environment.
 * Uses RetrieveCurrentOrganization — an OData Function (GET), NOT an Action (POST).
 *
 * Web API URL: GET /api/data/v9.2/RetrieveCurrentOrganization(AccessType=@p1)?@p1=Microsoft.Dynamics.CRM.EndpointAccessType'Default'
 *
 * Via CDS connector: ListRecordsWithOrganization with the function call as entityName.
 *
 * The Dataverse `organizationid` is NOT the same as the Power Platform `EnvironmentId`.
 * This function returns the actual EnvironmentId used in make.powerapps.com deep links.
 *
 * @param orgUrl - Target environment org URL (or "current")
 */
interface EnvironmentInfo {
  id: string | null;
  name: string | null;
}

export async function fetchEnvironmentInfo(client: PowerAppsClient, orgUrl: string): Promise<EnvironmentInfo> {
  try {
    const result = await client.executeAsync<Record<string, string>, RetrieveOrgResponse>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecordsWithOrganization',
        parameters: {
          organization: orgUrl,
          entityName: "RetrieveCurrentOrganization(AccessType=Microsoft.Dynamics.CRM.EndpointAccessType'Default')",
        },
      },
    });

    const data = result.data as RetrieveOrgResponse | undefined;
    const detail = data?.Detail ?? data?.detail;
    const envId = (detail?.EnvironmentId ?? detail?.environmentId) as string | undefined;
    const envName = (detail?.FriendlyName ?? detail?.friendlyName) as string | undefined;
    return { id: envId ?? null, name: envName ?? null };
  } catch (err) {
    console.warn('[EnvironmentService] RetrieveCurrentOrganization failed:', err);
    return { id: null, name: null };
  }
}

/** @deprecated Use fetchEnvironmentInfo instead */
export async function fetchEnvironmentId(client: PowerAppsClient, orgUrl: string): Promise<string | null> {
  const info = await fetchEnvironmentInfo(client, orgUrl);
  return info.id;
}

// ---------------------------------------------------------------------------
// Privilege Check (cross-environment)
// ---------------------------------------------------------------------------

/** Result of cross-env privilege check — includes env info to avoid extra API calls. */
export interface PrivilegeCheckResult {
  hasPrivilege: boolean;
  /** Power Platform Environment ID (from RetrieveCurrentOrganization) — used for deep links */
  environmentId: string | null;
  /** Human-readable environment name (e.g., "HPA Templates Demo") */
  environmentName: string | null;
}

/**
 * Checks if the current user has System Customizer+ role in the target environment.
 * Also returns the target environment's organization ID (best-effort, for deep links only).
 *
 * Strategy:
 * 1. Resolve user's systemuserid + organizationid in target env via email lookup
 * 2. Get user roles via systemuserroles_association
 * 3. Return privilege status + environment ID in one call
 *
 * @param orgUrl - Target environment URL (or "current")
 * @param userEmail - Current user's email (from getContext().user.userPrincipalName)
 */
/**
 * Resolves the current user's systemuserid in a target environment.
 * For 'current' env, uses WhoAmI to avoid email mismatch for guest/B2B users
 * whose Azure AD UPN doesn't match the Dataverse internalemailaddress.
 * For cross-env, falls back to email/domainname lookup.
 */
async function resolveUserId(
  client: PowerAppsClient,
  orgUrl: string,
  userEmail: string,
): Promise<string | undefined> {
  if (orgUrl === 'current') {
    const result = await client.executeAsync<Record<string, string>, WhoAmIResponse>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecordsWithOrganization',
        parameters: {
          organization: 'current',
          entityName: 'WhoAmI',
        },
      },
    });
    return (result as unknown as { data: WhoAmIResponse }).data?.UserId;
  }

  const result = await client.executeAsync<Record<string, string>, { value: SystemUserRecord[] }>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: orgUrl,
        entityName: 'systemusers',
        $select: 'systemuserid',
        $filter: `internalemailaddress eq '${userEmail}' or domainname eq '${userEmail}'`,
        $top: '1',
      },
    },
  });
  return (result as unknown as SdkResult<SystemUserRecord>).data?.value?.[0]?.systemuserid;
}

export async function checkInstallPrivilegeInOrg(
  client: PowerAppsClient,
  orgUrl: string,
  userEmail: string,
  requiresAdmin?: boolean,
): Promise<PrivilegeCheckResult> {
  try {
    // Step 1: Resolve systemuserid + fetch real EnvironmentId in parallel
    const [userId, envInfo] = await Promise.all([
      resolveUserId(client, orgUrl, userEmail),
      fetchEnvironmentInfo(client, orgUrl),
    ]);

    if (!userId) {
      console.warn('[EnvironmentService] User not found in target env:', orgUrl);
      return { hasPrivilege: false, environmentId: envInfo.id, environmentName: envInfo.name };
    }

    // Step 2: Get user roles in target environment
    const rolesResult = await client.executeAsync<Record<string, string>, { value: RoleRecord[] }>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'ListRecordsWithOrganization',
        parameters: {
          organization: orgUrl,
          entityName: `systemusers(${userId})/systemuserroles_association`,
          $select: 'name,roleid',
        },
      },
    });

    const rolesSdkResult = rolesResult as unknown as SdkResult<RoleRecord>;
    const roles = rolesSdkResult.data?.value ?? [];
    const roleNames = roles.map((r) => r.name).filter(Boolean);

    console.log('[EnvironmentService] Roles in target env:', roleNames, 'environmentId:', envInfo.id);

    // Step 3: Check for import-capable roles
    // Solutions with security role definitions require System Administrator
    const requiredRoles = requiresAdmin
      ? new Set(['System Administrator'])
      : IMPORT_CAPABLE_ROLES;
    const hasPrivilege = roleNames.some((name) => requiredRoles.has(name));
    return { hasPrivilege, environmentId: envInfo.id, environmentName: envInfo.name };
  } catch (err) {
    console.warn('[EnvironmentService] Privilege check failed:', err);
    return { hasPrivilege: false, environmentId: null, environmentName: null };
  }
}

