import { PowerAppsforMakersService } from '../../../../../generated/services/PowerAppsforMakersService';
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../../../../../.power/schemas/appschemas/dataSourcesInfo';
import type { PpEnvironment } from '../../../models/environment';

/**
 * Raw shape of a single item in the Get-Environments API response.
 * The generated service returns Record<string, unknown> so we cast at call site.
 */
interface GetEnvironmentsResponse {
  value?: Array<{
    id: string;
    name: string;
    type: string;
    location: string;
    properties: {
      displayName: string;
      environmentSku: string;
      provisioningState?: string;
    };
  }>;
}

function toEnvironment(raw: NonNullable<GetEnvironmentsResponse['value']>[number]): PpEnvironment {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    location: raw.location,
    displayName: raw.properties?.displayName ?? raw.name,
    environmentSku: raw.properties?.environmentSku ?? '',
  };
}

/**
 * Fetches the list of Power Platform environments accessible to the current user
 * via the powerappsforappmakers connector.
 *
 * Get-Environments returns only environments the current user has access to —
 * no secondary eligibility filter against Dataverse is needed.
 * Developer environments are excluded client-side.
 */
export async function getEligibleEnvironments(): Promise<PpEnvironment[]> {
  const result = await PowerAppsforMakersService.Get_Environments('2022-11-01', 250);
  const data = result.data as GetEnvironmentsResponse | undefined;
  const items = data?.value ?? [];

  console.log('[getEligibleEnvironments] Total environments fetched:', items.length);

  const developerEnvs = items.filter((e) => e.properties?.environmentSku === 'Developer');
  console.log('[getEligibleEnvironments] Removed (environmentSku === Developer):', developerEnvs.length, developerEnvs.map((e) => e.name));

  const notSucceededEnvs = items.filter(
    (e) => e.properties?.environmentSku !== 'Developer' && e.properties?.provisioningState !== 'Succeeded',
  );
  console.log('[getEligibleEnvironments] Removed (provisioningState !== Succeeded):', notSucceededEnvs.length, notSucceededEnvs.map((e) => ({ name: e.name, provisioningState: e.properties?.provisioningState })));

  const eligible = items
    .filter((e) => e.properties?.environmentSku !== 'Developer')
    .filter((e) => e.properties?.provisioningState === 'Succeeded')
    .map(toEnvironment);

  console.log('[getEligibleEnvironments] Eligible environments remaining:', eligible.length, eligible.map((e) => ({ name: e.name, displayName: e.displayName, sku: e.environmentSku })));

  return eligible;
}

export interface AdminCheckProgress {
  completed: number;
  total: number;
  envId: string;
}

/**
 * For each given PP environment ID, calls GetSingleEnvironment ("Get Environment as Admin")
 * via the powerplatformforadmins connector. This admin-scoped API works for all environment
 * types (CDS/Dataverse-backed and non-CDS alike). A successful result confirms the current
 * user has admin-level access to that environment; a failed result means they do not.
 *
 * NOTE: The @microsoft/power-apps SDK never throws on HTTP errors — it always resolves
 * with { success: false, error: ... }. We explicitly check result.success and throw so
 * that Promise.allSettled correctly classifies failures as 'rejected'.
 *
 * Returns two disjoint sets: authorizedIds (call succeeded) and unauthorizedIds (call failed).
 */
export async function checkAdminAccessForEnvironments(
  envIds: string[],
  onProgress?: (progress: AdminCheckProgress) => void,
): Promise<{ authorizedIds: Set<string>; unauthorizedIds: Set<string> }> {
  console.log('[checkAdminAccessForEnvironments] Starting admin access check for envs:', envIds);

  let completed = 0;
  const total = envIds.length;

  const results = await Promise.allSettled(
    envIds.map(async (id) => {
      console.log(`[checkAdminAccessForEnvironments] Calling GetSingleEnvironment — envId: ${id}`);

      // Bypass the generated PowerPlatformforAdminsService.GetSingleEnvironment wrapper
      // because it sends `apiVersion` (camelCase) in the params object, but the connector
      // expects `api_version` (underscore). This is a code-gen naming inconsistency in CSK.
      const adminClient = getClient(dataSourcesInfo);
      const result = await adminClient.executeAsync<
        { environment: string; api_version: string },
        Record<string, unknown>
      >({
        connectorOperation: {
          tableName: 'powerplatformforadmins',
          operationName: 'GetSingleEnvironment',
          parameters: { environment: id, api_version: '2024-05-01' },
        },
      });
      console.log(`[checkAdminAccessForEnvironments] Result for "${id}":`, {
        success: result.success,
        errorMessage: result.error?.message,
        roleCount: (result.data as { value?: unknown[] } | undefined)?.value?.length,
      });

      completed++;
      onProgress?.({ completed, total, envId: id });

      if (!result.success) {
        throw new Error(result.error?.message ?? `Admin check failed for environment "${id}"`);
      }
      return id;
    }),
  );

  const authorizedIds = new Set<string>();
  const unauthorizedIds = new Set<string>();

  results.forEach((r, index) => {
    const id = envIds[index];
    if (r.status === 'fulfilled') {
      console.log(`[checkAdminAccessForEnvironments] ✔ Authorized: ${id}`);
      authorizedIds.add(id);
    } else {
      console.warn(`[checkAdminAccessForEnvironments] ✘ Unauthorized/Error: ${id}`, r.reason);
      unauthorizedIds.add(id);
    }
  });

  console.log('[checkAdminAccessForEnvironments] Summary — authorized:', [...authorizedIds], '| unauthorized:', [...unauthorizedIds]);
  return { authorizedIds, unauthorizedIds };
}
