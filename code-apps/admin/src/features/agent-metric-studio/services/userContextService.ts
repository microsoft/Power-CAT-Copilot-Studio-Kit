// Resolves the current user's identity at app startup.
// Uses getContext() from @microsoft/power-apps/app per:
// https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/retrieve-context
//
// getContext().user.objectId returns the Azure AD Object ID, but Dataverse
// _owninguser_value stores the systemuserid (a different GUID). We resolve
// the mapping by querying the systemusers table at startup.

import { getContext } from '@microsoft/power-apps/app';
import { dv } from './dataverseClient';
import type { UserInfo } from '../types';

let cached: UserInfo | null = null;
let initPromise: Promise<UserInfo | null> | null = null;

interface SystemUserRow {
  systemuserid: string;
  azureactivedirectoryobjectid?: string;
}

/**
 * Initialize user context. Call once at app startup.
 * Resolves the Dataverse systemuserid from the AAD objectId via the systemusers table.
 * Returns null if context cannot be resolved (fail-closed: services will return []).
 */
export async function initUserContext(): Promise<UserInfo | null> {
  if (cached) return cached;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const ctx = await getContext();
      const objectId = ctx.user.objectId;
      if (!objectId) {
        console.error('[userContext] getContext() returned no objectId');
        return null;
      }

      // Resolve AAD objectId → Dataverse systemuserid
      let systemUserId: string | null = null;
      try {
        const users = await dv.list<SystemUserRow>('systemusers', {
          filter: `azureactivedirectoryobjectid eq '${objectId}'`,
          select: ['systemuserid'],
          top: 1,
        });
        if (users.length > 0) {
          systemUserId = users[0].systemuserid;
        }
      } catch (e) {
        console.error('[userContext] Failed to query systemusers table:', e);
      }

      if (!systemUserId) {
        console.error(
          '[userContext] Could not resolve systemuserid for the AAD objectId of the current user. ' +
          'Owner filter will not work — only recommended metrics will be visible.'
        );
        return null;
      }

      cached = {
        systemUserId,
        objectId,
        fullName: ctx.user.fullName ?? '',
        userPrincipalName: ctx.user.userPrincipalName ?? '',
        tenantId: ctx.user.tenantId ?? '',
      };
      return cached;
    } catch (e) {
      console.error('[userContext] Failed to resolve user context — app will show no owned records', e);
      return null;
    }
  })();

  return initPromise;
}

/** Returns cached user info, or null if not yet initialized / failed. */
export function getCachedUser(): UserInfo | null {
  return cached;
}

/** Returns cached systemUserId, or null. */
export function getCachedUserId(): string | null {
  return cached?.systemUserId ?? null;
}

/**
 * Builds an OData filter clause restricting results to the current user's owned records.
 * Returns null if user context is unavailable (caller must handle fail-closed).
 */
export function buildOwnerFilter(opts?: {
  baseFilter?: string;
  includeRecommended?: boolean;
}): string | null {
  const userId = getCachedUserId();
  if (!userId) {
    console.warn('[userContext] buildOwnerFilter: no cached userId — context not initialized?');
    return null;
  }

  const ownerClause = `_owninguser_value eq ${userId}`;
  const effectiveOwner = opts?.includeRecommended
    ? `(cat_isrecommendedmetric eq true or ${ownerClause})`
    : ownerClause;

  if (opts?.baseFilter) {
    return `${opts.baseFilter} and ${effectiveOwner}`;
  }
  return effectiveOwner;
}

/** Reset cached user (for testing or session refresh). */
export function resetUserContext(): void {
  cached = null;
  initPromise = null;
}
