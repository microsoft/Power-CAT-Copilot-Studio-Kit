import { Cat_policyrequestsService } from '../../../../../generated/services/Cat_policyrequestsService';
import { Cat_policyrequestenvironmentsService } from '../../../../../generated/services/Cat_policyrequestenvironmentsService';
import { Cat_powershieldpolicyrequestlogsService } from '../../../../../generated/services/Cat_powershieldpolicyrequestlogsService';
import type { CreditChildState } from '../../../models/status';
import {
  CREDIT_CHILD_STATE_NUM_TO_DOMAIN,
  CreditRequestError,
  appendActivity,
  assertCreditHeader,
  escapeODataLiteral,
  normalizeChildState,
  parseAmount,
  type CreditActivityAction,
} from './creditRequestService';
import { andRequestType } from './requestType';

// Dataverse reads/writes for approve-and-allocate (spec 024, data-model.md).
// No schema changes: reuses the spec 017 env-row columns.

const STATUS_SUBMITTED = 2;
const STATUS_UNDER_REVIEW = 5;
const STATUS_APPROVED = 6;

const OPEN_ROW_STATES: ReadonlySet<CreditChildState> = new Set(['Processing', 'UnknownOutcome', 'FailedRetryable']);
// Withdrawn, AutoRejected, Approved, Rejected, Implemented, ImplementedWithErrors: a leftover row state can't reopen these.
const CLOSED_STATUSES: ReadonlySet<number> = new Set([3, 4, 6, 7, 9, 10]);

const CHILD_STATE_TO_NUM = Object.fromEntries(
  Object.entries(CREDIT_CHILD_STATE_NUM_TO_DOMAIN).map(([num, state]) => [state, Number(num)]),
) as Record<CreditChildState, number>;

type EnvUpdate = Parameters<typeof Cat_policyrequestenvironmentsService.update>[1];
type HeaderUpdate = Parameters<typeof Cat_policyrequestsService.update>[1];

/** The single environment row of a credits request, as the approve flow needs it. */
export interface ApprovalRow {
  rowId: string;
  envId: string;
  state?: CreditChildState;
  attemptId?: string;
  target?: number;
  before?: number;
  /** Credits the maker asked for; undefined on older requests. */
  requested?: number;
  /** Spec 032: the maker asked to draw from tenant capacity. */
  requestedDraw: boolean;
  /** Spec 032: the current or last attempt meant to turn tenant draw on. */
  drawApproved: boolean;
  /** Spec 032: TenantPool before the save (enf_tenantpool). null = unknown or absent. */
  beforePool: boolean | null;
}

/** Header facts the approve flow checks before and after writing. */
export interface ApprovalHeader {
  underReview: boolean;
  assigneeDvId: string;
}

export interface IntentInput {
  attemptId: string;
  target: number;
  before: number;
  rules: { ruleType: string; enabled: boolean }[];
  /** Spec 032 FR-005: written on every attempt, so a failed Yes can't survive into a later No. */
  turnOnDraw: boolean;
}

/** One activity-log entry for an allocation attempt (data-model.md "Activity log"). */
export interface AttemptAuditEntry {
  attemptId: string;
  adminId: string;
  before?: number;
  target?: number;
  verified?: number;
  paygChoice: 'allocate' | 'skip' | 'n/a';
  /** Spec 032: the attempt meant to turn tenant draw on. */
  turnOnDraw?: boolean;
  outcome: CreditChildState;
  /** The step that failed, in the admin's words (for example "Save your comment"). */
  step?: string;
  error?: string;
  note?: string;
}

// The enf_* columns are whole numbers: 1 = on, 0 = off, null = no such rule (FR-015: absent is not off).
// null, not omitted, so a retry clears a snapshot left by an earlier try.
function snapshotValue(rules: IntentInput['rules'], type: string): 0 | 1 | null {
  const matches = rules.filter((r) => r.ruleType === type);
  if (matches.length === 0) return null;
  return matches.some((r) => r.enabled) ? 1 : 0;
}

async function updateRow(rowId: string, fields: Record<string, unknown>, failMessage: string): Promise<void> {
  const result = await Cat_policyrequestenvironmentsService.update(rowId, fields as unknown as EnvUpdate);
  if (!result.success) throw new CreditRequestError(result.error?.message ?? failMessage);
}

/** Reads the header status and assignee. Throws if the row is missing or not a Credits request. */
export async function readApprovalHeader(requestId: string): Promise<ApprovalHeader> {
  const header = await assertCreditHeader(requestId, [
    'cat_requesttype', 'cat_status', '_cat_assignedadministrator_value',
  ]);
  return {
    underReview: Number(header.cat_status) === STATUS_UNDER_REVIEW,
    assigneeDvId: (header._cat_assignedadministrator_value ?? '').toLowerCase(),
  };
}

/** Reads the request's environment row. Throws if it can't be read or doesn't exist. */
export async function readApprovalRow(requestId: string): Promise<ApprovalRow> {
  const result = await Cat_policyrequestenvironmentsService.getAll({
    filter: `_cat_policyrequestid_value eq ${requestId}`,
    select: [
      'cat_policyrequestenvironmentid', 'cat_environmentguid', 'cat_credit_childstate',
      'cat_credit_attemptid', 'cat_credit_absolutetarget', 'cat_credit_observedallocation',
      'cat_creditrequestedamount', 'cat_credit_requesttenantdraw', 'cat_credit_tenantdrawapproved',
      'cat_credit_enf_tenantpool',
    ],
  });
  if (!result.success) throw new CreditRequestError(result.error?.message ?? 'Failed to read the environment row.');
  const row = result.data?.[0];
  if (!row?.cat_environmentguid) throw new CreditRequestError('This request has no environment to allocate to.');
  const pool = parseAmount(row.cat_credit_enf_tenantpool);
  return {
    rowId: row.cat_policyrequestenvironmentid,
    envId: row.cat_environmentguid,
    state: normalizeChildState(row.cat_credit_childstate),
    attemptId: row.cat_credit_attemptid || undefined,
    target: parseAmount(row.cat_credit_absolutetarget),
    before: parseAmount(row.cat_credit_observedallocation),
    requested: parseAmount(row.cat_creditrequestedamount),
    requestedDraw: row.cat_credit_requesttenantdraw === true,
    drawApproved: row.cat_credit_tenantdrawapproved === true,
    beforePool: pool === undefined ? null : pool === 1,
  };
}

/**
 * Returns the ID of another open credits request for the same environment, if any (FR-011).
 * Open = header Submitted/Under review, or a header that isn't closed whose row is
 * Processing, UnknownOutcome or FailedRetryable.
 */
export async function findOtherOpenRequest(envId: string, requestId: string): Promise<string | undefined> {
  const rows = await Cat_policyrequestenvironmentsService.getAll({
    filter: `cat_environmentguid eq '${escapeODataLiteral(envId)}' and _cat_policyrequestid_value ne ${requestId}`,
    select: ['_cat_policyrequestid_value', 'cat_credit_childstate'],
  });
  if (!rows.success) throw new CreditRequestError(rows.error?.message ?? 'Failed to check other requests.');
  const parents = new Map<string, CreditChildState | undefined>();
  for (const r of rows.data ?? []) {
    if (r._cat_policyrequestid_value) parents.set(r._cat_policyrequestid_value, normalizeChildState(r.cat_credit_childstate));
  }
  if (parents.size === 0) return undefined;

  const idFilter = [...parents.keys()].map((id) => `cat_policyrequestid eq ${id}`).join(' or ');
  const headers = await Cat_policyrequestsService.getAll({
    filter: andRequestType(idFilter, 'Credits'),
    select: ['cat_policyrequestid', 'cat_status'],
  });
  if (!headers.success) throw new CreditRequestError(headers.error?.message ?? 'Failed to check other requests.');
  const open = (headers.data ?? []).find((h) => {
    const status = Number(h.cat_status);
    const rowState = parents.get(h.cat_policyrequestid);
    if (status === STATUS_SUBMITTED || status === STATUS_UNDER_REVIEW) return true;
    return !CLOSED_STATUSES.has(status) && rowState !== undefined && OPEN_ROW_STATES.has(rowState);
  });
  return open?.cat_policyrequestid;
}

/**
 * Saves the admin's comment on the request before any credits change, so recovery can
 * finish the approval without losing it. Returns false if the request is no longer Under review.
 */
export async function saveApprovalComment(requestId: string, comment: string): Promise<boolean> {
  const header = await readApprovalHeader(requestId);
  if (!header.underReview) return false;
  const result = await Cat_policyrequestsService.update(requestId, { cat_admincomment: comment } as unknown as HeaderUpdate);
  if (!result.success) throw new CreditRequestError(result.error?.message ?? "Couldn't save the comment.");
  return true;
}

/** Saves the intent before any write to Power Platform (FR-016): Processing + attempt, target, before, rule snapshot. */
export async function saveIntent(rowId: string, intent: IntentInput): Promise<void> {
  // The amount and enf_* columns are whole numbers in Dataverse; text values are rejected.
  await updateRow(rowId, {
    cat_credit_childstate: CHILD_STATE_TO_NUM.Processing,
    cat_credit_attemptid: intent.attemptId,
    cat_credit_correlationid: intent.attemptId,
    cat_credit_absolutetarget: intent.target,
    cat_credit_observedallocation: intent.before,
    cat_credit_approvedamount: intent.target - intent.before,
    cat_credit_enf_alert: snapshotValue(intent.rules, 'Alert'),
    cat_credit_enf_deny: snapshotValue(intent.rules, 'Deny'),
    cat_credit_enf_paygo: snapshotValue(intent.rules, 'PayGo'),
    cat_credit_enf_tenantpool: snapshotValue(intent.rules, 'TenantPool'),
    cat_credit_tenantdrawapproved: intent.turnOnDraw,
  }, "Couldn't start the allocation.");
}

/** Sets the row's child state, optionally with the verified total and an error message. */
export async function setChildState(
  rowId: string,
  state: CreditChildState,
  extra: { lastVerified?: number; error?: string; drawApproved?: boolean } = {},
): Promise<void> {
  await updateRow(rowId, {
    cat_credit_childstate: CHILD_STATE_TO_NUM[state],
    ...(extra.lastVerified !== undefined ? { cat_credit_lastverifiedallocation: extra.lastVerified } : {}),
    ...(extra.drawApproved !== undefined ? { cat_credit_tenantdrawapproved: extra.drawApproved } : {}),
    cat_fulfillmenterror: extra.error ?? null,
  }, 'Failed to update the environment row.');
}

/**
 * Approves the header with the verified total (FR-018, FR-021), but only if it is still
 * Under review. Returns false when it was already decided, so callers can just fix the row.
 */
export async function approveWithVerifiedTotal(
  requestId: string,
  total: number,
  adminAadObjectId: string,
  comment?: string,
): Promise<boolean> {
  const header = await readApprovalHeader(requestId);
  if (!header.underReview) return false;
  const result = await Cat_policyrequestsService.update(requestId, {
    cat_status: STATUS_APPROVED,
    // Number, not string: the column is whole-number with a minimum of 1, so leave it out below that.
    ...(total >= 1 ? { cat_credit_allocatedtotal: total } : {}),
    cat_approvedbyaadobjectid: adminAadObjectId,
    cat_decidedon: new Date().toISOString(),
    ...(comment && comment.trim() ? { cat_admincomment: comment } : {}),
  } as unknown as HeaderUpdate);
  if (!result.success) throw new CreditRequestError(result.error?.message ?? 'Failed to approve the request.');
  return true;
}

async function auditExists(requestId: string, attemptId: string, outcome: string): Promise<boolean> {
  const result = await Cat_powershieldpolicyrequestlogsService.getAll({
    filter: `_cat_policyrequest_value eq ${requestId}`,
    select: ['cat_message'],
  });
  if (!result.success) return false;
  return (result.data ?? []).some((row) => {
    try {
      const msg = JSON.parse(row.cat_message ?? '') as { attemptId?: unknown; outcome?: unknown };
      return msg.attemptId === attemptId && msg.outcome === outcome;
    } catch {
      return false;
    }
  });
}

/** Writes one audit row per attempt + outcome (FR-022). Best effort: never throws. */
export async function appendAttemptAudit(
  requestId: string,
  action: Extract<CreditActivityAction, 'CreditAllocationAttempted' | 'CreditApprovedWithoutAllocation'>,
  entry: AttemptAuditEntry,
): Promise<void> {
  try {
    if (await auditExists(requestId, entry.attemptId, entry.outcome)) return;
    await appendActivity(requestId, action, { ...entry, at: new Date().toISOString() });
  } catch {
    // Best effort — the allocation result has already been recorded on the row.
  }
}
