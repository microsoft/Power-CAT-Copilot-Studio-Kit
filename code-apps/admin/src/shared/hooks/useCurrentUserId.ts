/**
 * useCurrentUserId Hook
 *
 * Returns the current user's Dataverse systemuserid GUID via Power Apps SDK context.
 * Uses React Query to cache the result for the session.
 */

import { useQuery } from '@tanstack/react-query';
import { getContext } from '@microsoft/power-apps/app';
import { MicrosoftDataverseService } from '../../generated';

async function fetchCurrentUserId(): Promise<string> {
  const ctx = await getContext();
  const email = ctx.user.userPrincipalName;
  if (!email) throw new Error('No user email in context');

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    'current',
    'systemusers',
    undefined, undefined, undefined, undefined,
    'systemuserid',
    `internalemailaddress eq '${email}'`,
    undefined, undefined, undefined,
    1,
  );

  const users = (result.data as { value?: { systemuserid?: string }[] } | undefined)?.value ?? [];
  const userId = users[0]?.systemuserid;
  if (!userId) throw new Error('Current user not found in systemusers');
  return userId;
}

/**
 * Returns the current user's Dataverse systemuserid GUID.
 * Returns undefined while loading or on error.
 */
export function useCurrentUserId() {
  return useQuery<string, Error>({
    queryKey: ['current-user-id'],
    queryFn: fetchCurrentUserId,
    staleTime: Infinity, // user ID never changes in a session
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });
}
