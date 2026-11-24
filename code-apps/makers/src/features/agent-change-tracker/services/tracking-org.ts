/**
 * Resolution of the tracking-store organization for the Agent Change Tracker.
 *
 * The two tracking tables (cat_agenttrackingconfiguration and the elastic
 * cat_agentchangehistoryelastic) live in the SAME environment this app is
 * deployed to. The Dataverse connector accepts the sentinel organization
 * `"current"` for the host environment, which is the convention already used
 * elsewhere in this app (see shared/services/copilotStudioUrl.ts). Using it
 * keeps the feature portable with no bootstrap step and no dependency on the
 * SDK surfacing an org URL.
 *
 * Cross-org *agent source* reads still target the agent's own environment
 * (config.environmentUrl); only the tracking store follows the app host.
 */

import { getContext } from '@microsoft/power-apps/app';
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';

/** Sentinel the Dataverse connector resolves to the app's own environment. */
export const CURRENT_ORG = 'current';

let cachedEnvironmentId: string | undefined;
let cachedUserName: string | undefined;

/**
 * Organization identifier for every tracking-store call. Always the host
 * environment, so it never has to be resolved asynchronously.
 */
export function getTrackingOrgUrl(): string {
  return CURRENT_ORG;
}

/**
 * Resolve and cache the id of the environment the app is deployed to. Used to
 * stamp `cat_environmentid` on rows the app writes. Never throws: outside a
 * Power Apps host the SDK context is unavailable and this resolves to an empty
 * string, which is written as null.
 */
export async function initTrackingEnvironmentId(): Promise<string> {
  if (cachedEnvironmentId !== undefined) return cachedEnvironmentId;
  try {
    const ctx = await getContext();
    cachedEnvironmentId = ctx.app.environmentId ?? '';
  } catch {
    cachedEnvironmentId = '';
  }
  return cachedEnvironmentId;
}

/**
 * Synchronous accessor for the host environment id cached by
 * {@link initTrackingEnvironmentId}. Empty string until that has resolved.
 */
export function getTrackingEnvironmentId(): string {
  return cachedEnvironmentId ?? '';
}

/**
 * Display name of the signed-in user, used to stamp `cat_configuredbyname` when
 * an agent is opted into tracking.
 *
 * `IUserContext.fullName` is optional in the Power Apps SDK and is not always
 * populated by the host, so fall back to the Dataverse `systemuser` record for
 * the signed-in UPN (the same resolution shared/hooks/useCurrentUserId.ts uses)
 * and finally to the UPN itself. Never throws: outside a Power Apps host this
 * resolves to an empty string, which callers write as null.
 */
export async function initTrackingUserName(): Promise<string> {
  if (cachedUserName !== undefined) return cachedUserName;
  cachedUserName = '';
  try {
    const ctx = await getContext();
    const upn = ctx.user.userPrincipalName ?? '';
    const fullName = ctx.user.fullName?.trim();
    if (fullName) {
      cachedUserName = fullName;
      return cachedUserName;
    }
    if (upn) {
      const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
        CURRENT_ORG,
        'systemusers',
        undefined, undefined, undefined, undefined,
        'fullname',
        `internalemailaddress eq '${upn.replace(/'/g, "''")}'`,
        undefined, undefined, undefined,
        1,
      );
      const rows = (result.data as { value?: { fullname?: string }[] } | undefined)?.value ?? [];
      cachedUserName = rows[0]?.fullname?.trim() || upn;
    }
  } catch {
    cachedUserName = '';
  }
  return cachedUserName;
}
