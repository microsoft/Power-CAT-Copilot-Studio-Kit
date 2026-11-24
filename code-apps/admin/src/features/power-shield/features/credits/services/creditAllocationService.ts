import { PowerPlatformforAdminsV2Service } from '../../../../../generated/services/PowerPlatformforAdminsV2Service';
import {
  DEFAULT_RULES,
  derivePaygPolicyName,
  derivePaygStatus,
  PPAC_CAPACITY_LINK,
  type AllocationRule,
  type CreditAllocationErrorKind,
  type EnvironmentGroupRef,
  type PaygStatus,
} from './creditApprovalRules';

// The only file that talks to the Power Platform for Admins V2 connector
// (contracts/v2-allocation-connector.md). Calls run as the signed-in admin.

const API_VERSION = '2024-10-01';
const CREDITS_ID = 'MCSMessages';

const PLAIN_MESSAGES: Record<CreditAllocationErrorKind, string> = {
  InvalidAllocation:
    "Power Platform didn't accept the new total. It must be at least 500 and no more than your tenant's spare credits.",
  TenantPoolLocked:
    "The environment group for this environment has tenant draw turned off, so it can't be turned on here. Nothing was changed.",
  Permission: 'You need the Power Platform Administrator role to add credits.',
  Throttled: 'Power Platform is busy. Wait a minute and try again.',
  Timeout: "We couldn't tell if the credits were saved.",
  NotFound: "We couldn't load this environment's credits. Try again.",
  Unknown: "We couldn't load this environment's credits. Try again.",
};

export class CreditAllocationError extends Error {
  readonly kind: CreditAllocationErrorKind;
  readonly plainMessage: string;
  readonly ppacLink?: string;

  constructor(kind: CreditAllocationErrorKind, detail?: string) {
    super(detail ? `${kind}: ${detail}` : kind);
    this.name = 'CreditAllocationError';
    this.kind = kind;
    this.plainMessage = PLAIN_MESSAGES[kind];
    if (kind === 'TenantPoolLocked') this.ppacLink = PPAC_CAPACITY_LINK;
  }
}

interface ErrorLike {
  message?: unknown;
  status?: unknown;
}

function classify(err: unknown, isPut: boolean): CreditAllocationError {
  if (err instanceof CreditAllocationError) return err;
  const e: ErrorLike = typeof err === 'object' && err !== null ? err : {};
  const message = typeof e.message === 'string' ? e.message : String(err ?? '');
  const status = typeof e.status === 'number' ? e.status : undefined;
  let kind: CreditAllocationErrorKind;
  if (/TenantPoolLockedByPolicy/i.test(message)) kind = 'TenantPoolLocked';
  else if (/InvalidAllocationRequest/i.test(message)) kind = 'InvalidAllocation';
  else if (status === 401 || status === 403) kind = 'Permission';
  else if (status === 429) kind = 'Throttled';
  else if (status === 404) kind = isPut ? 'InvalidAllocation' : 'NotFound';
  else if (status === 408 || status === 504 || /time[d ]?\s?out|aborted|network/i.test(message)) kind = 'Timeout';
  else kind = 'Unknown';
  return new CreditAllocationError(kind, message);
}

/** Runs a connector call and returns its data, or throws a classified CreditAllocationError. */
async function call<T>(op: () => Promise<{ success: boolean; data: T; error?: unknown }>, isPut = false): Promise<T> {
  let result: { success: boolean; data: T; error?: unknown };
  try {
    result = await op();
  } catch (err) {
    throw classify(err, isPut);
  }
  if (!result.success) throw classify(result.error ?? 'Request failed', isPut);
  return result.data;
}

/**
 * Current credits total and enforcement rules for one environment. Rules keep every field as read.
 * No credits entry means PPAC's default applies, so DEFAULT_RULES are returned with `rulesDefaulted: true`.
 * An entry with an empty rule list is returned as-is (still blocked downstream).
 */
export async function getEnvironmentCredits(
  envId: string,
): Promise<{ allocated: number; rules: AllocationRule[]; rulesDefaulted: boolean }> {
  const data = await call(() => PowerPlatformforAdminsV2Service.GetAllocationsByEnvironment(envId, API_VERSION));
  const entry = data?.currencyAllocations?.find((a) => a.currencyType === CREDITS_ID);
  if (!entry) return { allocated: 0, rules: DEFAULT_RULES.map((r) => ({ ...r })), rulesDefaulted: true };
  const rules = (entry.enforcementRules ?? []).map((r) => ({
    ...r,
    ruleType: r.ruleType ?? '',
    enabled: r.enabled === true,
  }));
  return { allocated: entry.allocated ?? 0, rules, rulesDefaulted: false };
}

/** Unallocated Copilot Credits left in the tenant pool, rounded down. */
export async function getAvailableCredits(): Promise<number> {
  const data = await call(() =>
    PowerPlatformforAdminsV2Service.GetAllocationsAvailabilityV2(API_VERSION, `entitlementId eq '${CREDITS_ID}'`),
  );
  const entry = data?.entitlementAllocationsAvailable?.find((e) => e.entitlementId === CREDITS_ID);
  return Math.max(0, Math.floor(entry?.availableQuantity ?? 0));
}

/** PAYG status and active policy name. Billing-policy PAYG fields are missing from the generated type, so read them raw (R1). */
export async function getPaygInfo(envId: string): Promise<{ status: PaygStatus; policyName?: string }> {
  const data = await call(() => PowerPlatformforAdminsV2Service.ListBillingPolicies(API_VERSION));
  const raw: unknown = data?.value;
  const policies = Array.isArray(raw) ? raw : [];
  return { status: derivePaygStatus(policies, envId), policyName: derivePaygPolicyName(policies, envId) };
}

/**
 * The environment's group with its display name, or undefined when it isn't in a group.
 * Never throws: the group only drives hint text, so a failed read must not block approval (spec 032 FR-015).
 */
export async function getEnvironmentGroup(envId: string): Promise<EnvironmentGroupRef | undefined> {
  let id: string | undefined;
  try {
    const env = await call(() =>
      PowerPlatformforAdminsV2Service.GetEnvironmentByIdForUser(envId, API_VERSION, 'environmentGroupId'),
    );
    id = env?.environmentGroupId || undefined;
  } catch (err) {
    console.log('[Copilot Credits] Couldn\'t read the environment group.', err);
    return undefined;
  }
  if (!id) return undefined;
  try {
    const group = await call(() => PowerPlatformforAdminsV2Service.GetEnvironmentGroup(id, API_VERSION));
    return { id, name: group?.displayName?.trim() || undefined };
  } catch (err) {
    console.log('[Copilot Credits] Couldn\'t read the environment group name.', err);
    return { id };
  }
}

/** Sets the environment's absolute credits total. Rules are sent back exactly as read; autoAllocated is never sent. */
export async function setEnvironmentCredits(envId: string, total: number, rules: AllocationRule[]): Promise<void> {
  await call(
    () =>
      PowerPlatformforAdminsV2Service.PutAllocationsV2(API_VERSION, {
        scope: { environmentId: envId },
        allocatedEntitlements: [
          {
            entitlementId: CREDITS_ID,
            allocation: { quantity: total, unit: 'Count' },
            enforcementRules: rules,
          },
        ],
      }),
    true,
  );
}
