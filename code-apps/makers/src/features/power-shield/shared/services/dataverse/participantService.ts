import { SystemusersService } from '../../../../../generated/services/SystemusersService';

export interface UserSearchResult {
  dvUserId: string;
  aadObjectId: string;
  upn: string;
  displayName: string;
}

/**
 * Looks up a single active systemuser by exact domainname match.
 * Returns null if no enabled user matches the given domain name.
 * isdisabled is an integer option set: 0=Enabled, 1=Disabled.
 */
export async function lookupUserByDomainName(domainName: string): Promise<UserSearchResult | null> {
  const filter = `domainname eq '${domainName}'`;
  const result = await SystemusersService.getAll({
    filter,
    select: ['systemuserid', 'fullname', 'domainname', 'azureactivedirectoryobjectid', 'isdisabled', 'systemmanagedusertype'],
    top: 5,
  });
  // Client-side: filter to enabled (isdisabled=0), human (systemmanagedusertype=0) users
  const user = (result.data ?? []).find(
    (u) => Number(u.isdisabled) === 0 && Number(u.systemmanagedusertype) === 0,
  );
  if (!user) return null;
  return {
    dvUserId: user.systemuserid,
    aadObjectId: user.azureactivedirectoryobjectid ?? '',
    upn: user.domainname ?? '',
    displayName: user.fullname ?? '',
  };
}
