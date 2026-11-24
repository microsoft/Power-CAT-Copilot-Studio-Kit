import { Office365UsersService } from '../../../generated/services/Office365UsersService';
import type { User } from '../../../generated/models/Office365UsersModel';

export interface TenantUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  jobTitle?: string;
}

const MAX_RESULTS = 25;

function toTenantUser(user: User): TenantUser {
  return {
    id: user.Id,
    displayName: user.DisplayName ?? user.UserPrincipalName ?? user.Mail ?? user.Id,
    userPrincipalName: user.UserPrincipalName ?? user.Mail ?? '',
    jobTitle: user.JobTitle,
  };
}

/**
 * Search tenant-wide users (Entra ID) by name or email via the Office 365 Users
 * connector. Returns an empty list for terms shorter than two characters to
 * avoid unbounded directory scans.
 */
export async function searchTenantUsers(term: string): Promise<TenantUser[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const result = await Office365UsersService.SearchUser(trimmed, MAX_RESULTS);
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Unable to search users.');
  }

  // SearchUser (V1) returns User[] directly. Guard against a { value: User[] }
  // envelope too so either shape resolves to a usable array.
  const data = result.data as { value?: User[] } | User[] | undefined;
  const users = Array.isArray(data) ? data : data?.value ?? [];
  return users.map(toTenantUser);
}
