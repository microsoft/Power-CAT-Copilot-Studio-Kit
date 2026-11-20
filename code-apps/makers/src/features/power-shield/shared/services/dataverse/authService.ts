import { SystemuserrolescollectionService } from '../../../../../generated/services/SystemuserrolescollectionService';
import { SystemusersService } from '../../../../../generated/services/SystemusersService';
import { RolesService } from '../../../../../generated/services/RolesService';
import type { CskRole } from '../../config/navigation';

const LOG_PREFIX = '[PowerShield:Auth]';
const MAKER_ROLES = ['CSK - Maker', 'System Administrator'];
const CSK_ADMIN_ROLES = ['CSK - Administrator', 'System Administrator'];
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
 * Uses a two-step approach to avoid navigation property filters on the
 * systemuserrolescollection intersect entity (which Dataverse silently
 * fails). First fetches role assignment IDs, then resolves role names.
 */
async function getUserRoleNames(dvUserId: string): Promise<string[]> {
  let rolesResult;
  try {
    rolesResult = await SystemuserrolescollectionService.getAll({
      filter: `systemuserid eq '${dvUserId}'`,
      select: ['roleid'],
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} getUserRoleNames: SystemuserrolescollectionService.getAll THREW:`, err);
    return [];
  }

  console.log(`${LOG_PREFIX} getUserRoleNames: SystemuserrolescollectionService.getAll result — success=${rolesResult.success}, count=${rolesResult.data?.length ?? 0}`);
  if (!rolesResult.success) {
    console.warn(`${LOG_PREFIX} getUserRoleNames: query returned success=false — role detection will fail`);
    return [];
  }
  if (!rolesResult.data?.length) {
    console.warn(`${LOG_PREFIX} getUserRoleNames: no role assignments found for user`);
    return [];
  }

  const roleIds = rolesResult.data.map(r => r.roleid).filter((id): id is string => Boolean(id));
  console.log(`${LOG_PREFIX} getUserRoleNames: found ${roleIds.length} role assignment(s):`, roleIds);

  // Fetch role names individually — RolesService.getAll() with filter returns
  // success=false in the Power Apps SDK for the intersect role entity.
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
 * Checks if the user has the "CSK - Maker" Dataverse security role.
 */
export async function checkIsMaker(dvUserId: string): Promise<boolean> {
  const names = await getUserRoleNames(dvUserId);
  const isMaker = names.some(n => MAKER_ROLES.includes(n));
  console.log(`${LOG_PREFIX} checkIsMaker: isMaker=${isMaker} (looked for: ${MAKER_ROLES.join(', ')})`);
  return isMaker;
}

/**
 * Resolves the CSK (Copilot Agent Kit) role for MDA navigation filtering.
 * CSK Administrator sees all MDA nav items; CSK Maker sees a subset.
 */
export async function resolveCskRole(dvUserId: string): Promise<CskRole> {
  const names = await getUserRoleNames(dvUserId);
  if (names.some(n => CSK_ADMIN_ROLES.includes(n))) return 'CSK - Administrator';
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
