import { SystemuserrolescollectionService } from '../../../../../generated/services/SystemuserrolescollectionService';
import { SystemusersService } from '../../../../../generated/services/SystemusersService';
import { RolesService } from '../../../../../generated/services/RolesService';
import type { CskRole } from '../../config/navigation';

const LOG_PREFIX = '[PowerShield:Auth]';
const ADMIN_ROLES = ['CSK - Administrator', 'System Administrator'];
const CSK_MAKER_ROLES = ['CSK - Maker'];

/**
 * Resolves an active Dataverse human user by the UPN returned from Code Apps context.
 */
export async function resolveDataverseUserIdByUpn(upn: string): Promise<string> {
  const escapedUpn = upn.replace(/'/g, "''");
  const result = await SystemusersService.getAll({
    filter: `domainname eq '${escapedUpn}'`,
    select: ['systemuserid', 'domainname', 'isdisabled', 'systemmanagedusertype'],
    top: 5,
  });

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to look up the current Dataverse user.');
  }

  const activeHumanUsers = (result.data ?? []).filter(
    (user) => Number(user.isdisabled) === 0 && Number(user.systemmanagedusertype) === 0,
  );

  if (activeHumanUsers.length === 0) {
    throw new Error(`No active Dataverse user found for UPN "${upn}".`);
  }
  if (activeHumanUsers.length > 1) {
    throw new Error(`Multiple active Dataverse users found for UPN "${upn}".`);
  }

  return activeHumanUsers[0].systemuserid;
}

/**
 * Resolves the role names assigned to a Dataverse user.
 *
 * Uses the same pattern as CopilotStudioKit's UserRoleService:
 * 1. Query systemuserrolescollection filtered by systemuserid to get role IDs
 * 2. Fetch each role name individually via RolesService.get(roleId)
 *    (RolesService.getAll with compound filter returns success=false)
 *
 * PREREQUISITE: The systemuserrolescollection data source must be registered
 * via `pac code add-data-source`. If manually added to dataSourcesInfo.ts,
 * the Power Apps runtime rejects queries with success=false.
 */
async function getUserRoleNames(dvUserId: string): Promise<string[]> {
  // Step 1: Get role IDs from systemuserrolescollection
  let roleIds: string[] = [];
  try {
    const result = await SystemuserrolescollectionService.getAll({
      select: ['roleid'],
      filter: `systemuserid eq '${dvUserId}'`,
    });
    console.log(`${LOG_PREFIX} getUserRoleNames: SystemuserrolescollectionService.getAll — success=${result.success}, count=${result.data?.length ?? 0}`);
    if (!result.success) {
      console.warn(`${LOG_PREFIX} getUserRoleNames: query returned success=false — ensure systemuserrolescollection is registered via pac code add-data-source`);
      return [];
    }
    roleIds = (result.data ?? []).map(r => r.roleid).filter((id): id is string => Boolean(id));
  } catch (err) {
    console.error(`${LOG_PREFIX} getUserRoleNames: SystemuserrolescollectionService.getAll THREW:`, err);
    return [];
  }

  if (roleIds.length === 0) {
    console.warn(`${LOG_PREFIX} getUserRoleNames: no role assignments found for user`);
    return [];
  }
  console.log(`${LOG_PREFIX} getUserRoleNames: found ${roleIds.length} role assignment(s):`, roleIds);

  // Step 2: Fetch role names individually — RolesService.getAll() with filter
  // returns success=false in the Power Apps SDK, so use get(id) instead.
  const names: string[] = [];
  for (const roleId of roleIds) {
    try {
      const result = await RolesService.get(roleId, { select: ['name'] });
      if (result.success && result.data?.name) {
        names.push(result.data.name);
      }
    } catch {
      console.warn(`${LOG_PREFIX} getUserRoleNames: failed to fetch role name for roleId=${roleId}`);
    }
  }

  console.log(`${LOG_PREFIX} getUserRoleNames: resolved role names:`, names);
  return names;
}

/**
 * Checks if the user has a Dataverse security role that grants PowerShield
 * admin access. Recognises both the explicit "CSK - Administrator" role and the
 * built-in "System Administrator" role.
 */
export async function checkIsAdmin(dvUserId: string): Promise<boolean> {
  const names = await getUserRoleNames(dvUserId);
  const isAdmin = names.some(n => ADMIN_ROLES.includes(n));
  console.log(`${LOG_PREFIX} checkIsAdmin: isAdmin=${isAdmin} (looked for: ${ADMIN_ROLES.join(', ')})`);
  return isAdmin;
}

/**
 * Resolves the CSK (Copilot Agent Kit) role for MDA navigation filtering.
 * CSK Administrator sees all MDA nav items; CSK Maker sees a subset.
 */
export async function resolveCskRole(dvUserId: string): Promise<CskRole> {
  const names = await getUserRoleNames(dvUserId);
  if (names.some(n => ADMIN_ROLES.includes(n))) return 'CSK - Administrator';
  if (names.some(n => CSK_MAKER_ROLES.includes(n))) return 'CSK - Maker';
  return 'unknown';
}

/**
 * Retrieves the user's AAD Object ID, display name, and UPN from the
 * systemusers table using the Dataverse user GUID as the record ID.
 */
export async function getUserProfile(
  dvUserId: string,
): Promise<{ aadObjectId: string; upn: string; displayName: string }> {
  const result = await SystemusersService.get(dvUserId, {
    select: ['azureactivedirectoryobjectid', 'internalemailaddress', 'fullname'],
  });
  if (!result.success || !result.data) {
    console.error(`${LOG_PREFIX} getUserProfile: FAILED — success=${result.success}`);
    throw new Error('Failed to retrieve user profile from Dataverse.');
  }
  const user = result.data;
  return {
    aadObjectId: user.azureactivedirectoryobjectid ?? '',
    upn: user.internalemailaddress ?? '',
    displayName: user.fullname ?? '',
  };
}
