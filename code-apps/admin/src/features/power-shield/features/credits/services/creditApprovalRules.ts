import type { CreditChildState } from '../../../models/status';

// Pure approval rules for credits auto-allocation (contracts/credit-approval-rules.md).
// No connector or generated-service imports: everything here is unit-tested in isolation.

export const MIN_NONZERO_TOTAL = 500;
export const PPAC_CAPACITY_LINK = 'https://admin.powerplatform.microsoft.com/resources/capacity';
export const KNOWN_RULE_TYPES = ['Alert', 'PayGo', 'TenantPool', 'Deny'] as const;

/** Spec 032: the environment's group (an environment is in at most one). `name` is missing when its read failed. */
export interface EnvironmentGroupRef {
  id: string;
  name?: string;
}

/** Spec 032: the group's page in the Power Platform admin center. */
export function environmentGroupLink(groupId: string): string {
  return `https://admin.powerplatform.microsoft.com/manage/environmentGroups/${encodeURIComponent(groupId)}`;
}

export type RuleType = (typeof KNOWN_RULE_TYPES)[number];
export type RuleSnapshotValue = 'absent' | 'enabled' | 'disabled';
export type RuleSnapshot = Record<RuleType, RuleSnapshotValue>;
export type PaygStatus = 'active' | 'linkedInactive' | 'none';

export interface AllocationRule {
  ruleType: RuleType | (string & {});
  enabled: boolean;
}

/**
 * Rules used when an environment has no Copilot Credits entry at all. PPAC's documented default for that
 * case is "Draw from the available capacity in my tenant" (TenantPool) switched on.
 * https://learn.microsoft.com/power-platform/admin/programmability-tutorial-manage-copilot-credit-allocations
 */
export const DEFAULT_RULES: readonly AllocationRule[] = [{ ruleType: 'TenantPool', enabled: true }];

export interface ReviewSnapshot {
  envId: string;
  current: number;
  available: number;
  rules: AllocationRule[];
  /** True when the environment had no credits entry, so `rules` holds DEFAULT_RULES. Not used for drift. */
  rulesDefaulted?: boolean;
  payg: PaygStatus;
  /** Name of the active PAYG billing policy, shown in the PAYG choice text. */
  paygPolicyName?: string;
  /** Spec 032: the environment's group, if any. Only drives hint text, so a failed read leaves it undefined. */
  group?: EnvironmentGroupRef;
  otherOpenRequestId?: string;
  headerOk: boolean;
  rowState?: CreditChildState;
  rowAttemptId?: string;
  /** Credits the maker asked for; undefined on older requests. Display only, not part of drift. */
  requested?: number;
  /** Spec 032: the maker asked to draw from tenant capacity. Display only, not part of drift. */
  requestedDraw?: boolean;
}

export type ApprovalBlock = 'NotAssigneeOrNotUnderReview' | 'OtherOpenRequest' | 'ReadFailed';
export type AllocateBlock = 'NoValidTotal' | 'UnknownRule' | 'NoRules';
/** Spec 032: a draw-only request where approving would change nothing. */
export type NothingToChangeBlock = 'DrawAlreadyOn' | 'PaygCoversDraw';
export type ApproveBlock = AllocateBlock | NothingToChangeBlock;

export function isNothingToChange(b: ApproveBlock): b is NothingToChangeBlock {
  return b === 'DrawAlreadyOn' || b === 'PaygCoversDraw';
}
export type ApprovalWarning = 'PaygLinkedInactive';

export type CreditAllocationErrorKind =
  | 'Permission'
  | 'Throttled'
  | 'TenantPoolLocked'
  | 'InvalidAllocation'
  | 'NotFound'
  | 'Timeout'
  | 'Unknown';

export type RecoveryPath = 'finish' | 'safeToRetry' | 'conflict';

const KNOWN_RULE_SET: ReadonlySet<string> = new Set(KNOWN_RULE_TYPES);

/** FR-011: reasons that block the whole approval, in display order. `null` snapshot = a read failed. */
export function getApprovalBlocks(s: ReviewSnapshot | null): ApprovalBlock[] {
  if (!s) return ['ReadFailed'];
  const blocks: ApprovalBlock[] = [];
  if (!s.headerOk) blocks.push('NotAssigneeOrNotUnderReview');
  if (s.otherOpenRequestId) blocks.push('OtherOpenRequest');
  return blocks;
}

/** FR-012: reasons that block only the Allocate path. A pool below 500 alone is not a block. */
export function getAllocateBlocks(s: Pick<ReviewSnapshot, 'current' | 'available' | 'rules'>): AllocateBlock[] {
  const blocks: AllocateBlock[] = [];
  if (s.available < 1 || s.current + s.available < MIN_NONZERO_TOTAL) blocks.push('NoValidTotal');
  if (s.rules.some((r) => !KNOWN_RULE_SET.has(r.ruleType))) blocks.push('UnknownRule');
  if (s.rules.length === 0) blocks.push('NoRules');
  return blocks;
}

export type AddRange = { kind: 'range'; min: number; max: number } | { kind: 'blocked'; blocks: AllocateBlock[] };

/**
 * Spec 025 FR-007/FR-007a: how many credits Approve would accept right now. Uses the same blocks as Approve,
 * so the credits check card never promises a range that Approve refuses.
 */
export function getAddRange(s: Pick<ReviewSnapshot, 'current' | 'available' | 'rules'>): AddRange {
  const blocks = getAllocateBlocks(s);
  if (blocks.length > 0) return { kind: 'blocked', blocks };
  return { kind: 'range', min: Math.max(1, MIN_NONZERO_TOTAL - s.current), max: s.available };
}

/** One capacity read: its value, or a failure. Matches `Part<T>` in creditCapacity.ts. */
type CapacityRead<T> = { ok: true; value: T } | { ok: false };

export interface CapacityFacts {
  env: CapacityRead<{ allocated: number; rules: AllocationRule[]; rulesDefaulted?: boolean }>;
  spare: CapacityRead<number>;
  payg: CapacityRead<{ status: PaygStatus }>;
}

export type ApproveAvailability =
  | { kind: 'checking' }
  | { kind: 'ok'; via: 'allocate' | 'payg' }
  | { kind: 'blocked'; blocks: ApproveBlock[] }
  | { kind: 'unknown' };

/**
 * Spec 030: whether Approve can succeed, from the page's capacity check. `null` means the check is still running.
 * Blocked only when the facts prove it. A failed read gives `unknown`, so Approve stays on and its dialog checks again.
 * Spec 032: a request that asks for no credits needs only tenant draw turned on. When it's already on, or
 * pay-as-you-go is active (the app doesn't change draw then), approving would change nothing, so it's blocked.
 */
export function getApproveAvailability(facts: CapacityFacts | null, creditsRequested = true): ApproveAvailability {
  if (!facts) return { kind: 'checking' };
  const paygActive = facts.payg.ok && facts.payg.value.status === 'active';
  if (!creditsRequested) {
    if (!facts.env.ok) return { kind: 'unknown' };
    if (tenantDrawState(facts.env.value.rules, facts.env.value.rulesDefaulted) !== 'off') {
      return { kind: 'blocked', blocks: ['DrawAlreadyOn'] };
    }
    if (paygActive) return { kind: 'blocked', blocks: ['PaygCoversDraw'] };
    return { kind: 'ok', via: 'allocate' };
  }
  if (!facts.env.ok || !facts.spare.ok) return paygActive ? { kind: 'ok', via: 'payg' } : { kind: 'unknown' };
  const range = getAddRange({ current: facts.env.value.allocated, available: facts.spare.value, rules: facts.env.value.rules });
  if (range.kind === 'range') return { kind: 'ok', via: 'allocate' };
  if (paygActive) return { kind: 'ok', via: 'payg' };
  return facts.payg.ok ? { kind: 'blocked', blocks: range.blocks } : { kind: 'unknown' };
}

/**
 * Spec 027: what to put in the amount box when the dialog opens — the maker's request,
 * capped at the spare credits. Empty when there's no request, allocate is blocked, or the
 * capped number wouldn't pass validation.
 */
export function prefillAmount(s: Pick<ReviewSnapshot, 'current' | 'available' | 'rules' | 'requested'>): string {
  if (s.requested === undefined || getAllocateBlocks(s).length > 0) return '';
  const text = String(Math.min(s.requested, s.available));
  return validateAmount(text, s.current, s.available).ok ? text : '';
}

/**
 * FR-013: non-blocking warnings. Spec 032: no group warning here. The only capacity group rule controls
 * tenant draw, not credits, so the group hint shows at the draw checkbox instead.
 */
export function getWarnings(s: ReviewSnapshot): ApprovalWarning[] {
  const warnings: ApprovalWarning[] = [];
  if (s.payg === 'linkedInactive') warnings.push('PaygLinkedInactive');
  return warnings;
}

/** FR-007: validates the raw amount text against the current total and the tenant pool. */
export function validateAmount(
  amount: string,
  current: number,
  available: number,
): { ok: true; value: number; newTotal: number } | { ok: false; message: string } {
  const text = amount.trim();
  const value = Number(text);
  if (text === '' || !/^\d+$/.test(text) || !Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, message: 'Enter a whole number greater than 0.' };
  }
  if (value > available) {
    return { ok: false, message: `Your tenant has ${available.toLocaleString()} spare credits, so you can add up to that many.` };
  }
  const newTotal = current + value;
  if (newTotal < MIN_NONZERO_TOTAL) {
    return {
      ok: false,
      message: `This environment needs at least ${MIN_NONZERO_TOTAL.toLocaleString()} credits in total. Add at least ${(MIN_NONZERO_TOTAL - current).toLocaleString()}.`,
    };
  }
  return { ok: true, value, newTotal };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function policyIncludesEnv(policy: Record<string, unknown>, envId: string): boolean {
  const ids = policy.environmentIds;
  if (!Array.isArray(ids)) return false;
  const target = envId.toLowerCase();
  return ids.some((id) => typeof id === 'string' && id.toLowerCase() === target);
}

function policyHasActiveMcsPayg(policy: Record<string, unknown>): boolean {
  if (policy.status !== 'Enabled') return false;
  const ents = policy.payGoEntitlements;
  if (!Array.isArray(ents)) return false;
  return ents.some(
    (e) => isRecord(e) && e.entitlementId === 'MCSMessages' && e.payAsYouGoState === true,
  );
}

/** FR-014: PAYG status for an environment from raw billing policies (fields read defensively). */
export function derivePaygStatus(policies: unknown[], envId: string): PaygStatus {
  const linked = policies.filter(isRecord).filter((p) => policyIncludesEnv(p, envId));
  if (linked.length === 0) return 'none';
  return linked.some(policyHasActiveMcsPayg) ? 'active' : 'linkedInactive';
}

/** Name of the first billing policy that makes PAYG active for the environment, if any. */
export function derivePaygPolicyName(policies: unknown[], envId: string): string | undefined {
  const active = policies
    .filter(isRecord)
    .find((p) => policyIncludesEnv(p, envId) && policyHasActiveMcsPayg(p));
  return typeof active?.name === 'string' && active.name ? active.name : undefined;
}

/** FR-015: records each known rule as absent / enabled / disabled. Absent is not the same as disabled. */
export function encodeRuleSnapshot(rules: AllocationRule[]): RuleSnapshot {
  const snap: RuleSnapshot = { Alert: 'absent', PayGo: 'absent', TenantPool: 'absent', Deny: 'absent' };
  for (const r of rules) {
    if (KNOWN_RULE_SET.has(r.ruleType)) {
      snap[r.ruleType as RuleType] = r.enabled ? 'enabled' : 'disabled';
    }
  }
  return snap;
}

export function rulesUnchanged(a: RuleSnapshot, b: RuleSnapshot): boolean {
  return KNOWN_RULE_TYPES.every((t) => a[t] === b[t]);
}

function ruleSignature(rules: AllocationRule[]): string {
  return rules
    .map((r) => `${r.ruleType}:${r.enabled ? 1 : 0}`)
    .sort()
    .join('|');
}

/** FR-016: true when anything that matters changed between Review and the pre-PUT re-read. */
export function hasDrifted(review: ReviewSnapshot, fresh: ReviewSnapshot): boolean {
  return (
    !fresh.headerOk ||
    review.rowState !== fresh.rowState ||
    review.rowAttemptId !== fresh.rowAttemptId ||
    (fresh.otherOpenRequestId ?? '') !== (review.otherOpenRequestId ?? '') ||
    review.current !== fresh.current ||
    ruleSignature(review.rules) !== ruleSignature(fresh.rules)
  );
}

/** FR-019: maps an allocation error to the child state to save. */
export function stateForError(kind: CreditAllocationErrorKind, putMayHaveRun: boolean): CreditChildState {
  switch (kind) {
    case 'Permission':
    case 'Throttled':
    case 'TenantPoolLocked':
      return 'FailedRetryable';
    case 'InvalidAllocation':
      return 'FailedPermanent';
    default:
      return putMayHaveRun ? 'UnknownOutcome' : 'FailedRetryable';
  }
}

/** Spec 032 FR-009: the tenant-draw facts recovery needs when the attempt meant to turn it on. */
export interface DrawRecoveryFacts {
  intended: boolean;
  livePool: boolean;
  /** TenantPool before the save, from cat_credit_enf_tenantpool. null = unknown or absent. */
  beforePool: boolean | null;
}

/**
 * FR-020: which recovery path to take, from the live total vs. the saved target and before-value.
 * Spec 032: when the attempt meant to turn on tenant draw, "finish" also needs TenantPool on, and
 * "safe to retry" also needs TenantPool back at its before-value. Otherwise the pool doesn't matter,
 * because that attempt's PUT never changes it.
 */
export function decideRecovery(current: number, target: number, before: number, draw?: DrawRecoveryFacts): RecoveryPath {
  const drawOn = !draw?.intended || draw.livePool;
  if (current === target && drawOn) return 'finish';
  const poolAsBefore = !draw?.intended || draw.livePool === (draw.beforePool ?? false);
  if (current === before && poolAsBefore) return 'safeToRetry';
  return 'conflict';
}

export type TenantDrawState = 'on' | 'onDefault' | 'off';

/**
 * Spec 032: the "Draw from tenant" setting. No credits entry means PPAC's default, which is on.
 * An entry with TenantPool missing or disabled counts as off.
 */
export function tenantDrawState(rules: AllocationRule[], rulesDefaulted?: boolean): TenantDrawState {
  if (rulesDefaulted) return 'onDefault';
  return rules.some((r) => r.ruleType === 'TenantPool' && r.enabled) ? 'on' : 'off';
}

/** Spec 032 FR-003: every rule copied whole, with TenantPool switched on (added when missing). Never turns anything off. */
export function withTenantPoolOn(rules: AllocationRule[]): AllocationRule[] {
  const hasPool = rules.some((r) => r.ruleType === 'TenantPool');
  const out = rules.map((r) => (r.ruleType === 'TenantPool' ? { ...r, enabled: true } : { ...r }));
  return hasPool ? out : [...out, { ruleType: 'TenantPool', enabled: true }];
}

/** Spec 032: the admin can turn tenant draw on only when the maker asked, it's off, and pay-as-you-go isn't active. */
export function canTurnOnDraw(requested: boolean, state: TenantDrawState, payg: PaygStatus): boolean {
  return requested && state === 'off' && payg !== 'active';
}

/** Spec 032 FR-006: the read-back matches the target total and, when turning on, TenantPool is on. */
export function isVerified(
  readBack: { allocated: number; rules: AllocationRule[]; rulesDefaulted?: boolean },
  target: number,
  turnOnDraw: boolean,
): boolean {
  if (readBack.allocated !== target) return false;
  return !turnOnDraw || tenantDrawState(readBack.rules, readBack.rulesDefaulted) !== 'off';
}

/** FR-020a: UnknownOutcome, or Processing whose attempt isn't running in this tab. */
export function needsRecovery(
  rowState: CreditChildState | undefined,
  rowAttemptId: string | undefined,
  sessionAttempts: ReadonlySet<string>,
): boolean {
  if (rowState === 'UnknownOutcome') return true;
  if (rowState === 'Processing') return !rowAttemptId || !sessionAttempts.has(rowAttemptId);
  return false;
}
