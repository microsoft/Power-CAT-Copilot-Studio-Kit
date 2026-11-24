import type { CreditChildState } from '../../../models/status';
import type {
  ApprovalHeader,
  ApprovalRow,
  AttemptAuditEntry,
  IntentInput,
} from '../../../shared/services/dataverse/creditApprovalRepository';
import {
  KNOWN_RULE_TYPES,
  canTurnOnDraw,
  hasDrifted,
  isVerified,
  needsRecovery,
  stateForError,
  tenantDrawState,
  validateAmount,
  withTenantPoolOn,
  type AllocationRule,
  type CreditAllocationErrorKind,
  type PaygStatus,
  type ReviewSnapshot,
} from './creditApprovalRules';
import { describeFailure, type ApprovalErrorDetails } from './approvalErrorDetails';

// Write order for approve-and-allocate and recovery
// (contracts/credit-approve-auto-allocate-command.md, contracts/credit-recovery.md).
// Services come in through `deps`, so Vitest can drive every branch with fakes.

export interface ApprovalDeps {
  adminDvId: string;
  adminAadId: string;
  credits: {
    getEnvironmentCredits(envId: string): Promise<{ allocated: number; rules: AllocationRule[]; rulesDefaulted?: boolean }>;
    setEnvironmentCredits(envId: string, total: number, rules: AllocationRule[]): Promise<void>;
    /** Spec 032: re-read before turning tenant draw on. */
    getPaygStatus(envId: string): Promise<PaygStatus>;
  };
  repo: {
    readApprovalHeader(requestId: string): Promise<ApprovalHeader>;
    readApprovalRow(requestId: string): Promise<ApprovalRow>;
    findOtherOpenRequest(envId: string, requestId: string): Promise<string | undefined>;
    saveApprovalComment(requestId: string, comment: string): Promise<boolean>;
    saveIntent(rowId: string, intent: IntentInput): Promise<void>;
    setChildState(
      rowId: string, state: CreditChildState, extra?: { lastVerified?: number; error?: string; drawApproved?: boolean },
    ): Promise<void>;
    approveWithVerifiedTotal(requestId: string, total: number, adminAadId: string, comment?: string): Promise<boolean>;
    appendAttemptAudit(
      requestId: string,
      action: 'CreditAllocationAttempted' | 'CreditApprovedWithoutAllocation',
      entry: AttemptAuditEntry,
    ): Promise<void>;
  };
  newId?: () => string;
}

export type SubmitInput =
  | { mode: 'allocate'; amount?: number; turnOnDraw?: boolean; comment: string }
  | { mode: 'skip'; comment: string };

export type ApprovalResult =
  | { kind: 'Succeeded'; verifiedTotal: number; drawTurnedOn?: boolean; creditsAdded?: boolean }
  | { kind: 'Skipped'; total: number }
  /** 'payg': pay-as-you-go turned on before tenant draw was saved. Otherwise the request or credits changed. */
  | { kind: 'Superseded'; reason?: 'payg' }
  | { kind: 'Busy' }
  | { kind: 'Invalid'; message: string }
  | {
      kind: 'Failed'; state: 'FailedRetryable' | 'FailedPermanent'; message: string; ppacLink?: string;
      details?: ApprovalErrorDetails;
      /** Spec 032 US5: a group rule has tenant draw turned off, so turning it on failed. Nothing was changed. */
      drawLocked?: true;
    }
  | { kind: 'NeedsAttention'; message: string; details?: ApprovalErrorDetails };

export const MSG_COMMENT_REQUIRED = 'Add a comment to continue.';
const MSG_START_FAILED = "We couldn't start adding credits. Nothing was changed. Try again.";
export const MSG_READ_FAILED = "We couldn't load this environment's credits. Nothing was changed. Try again.";
export const MSG_DRAW_LOCKED =
  "Approval failed. The environment group has tenant draw turned off, so it can't be turned on for this environment. Nothing was changed.";
const MSG_UNCONFIRMED = "We couldn't tell if the credits were saved. Open the request to check.";
const MSG_HEADER_PENDING =
  "The credits were added, but the request isn't marked approved yet. Open the request to finish.";
const MSG_UNFINISHED =
  "An earlier try on this request didn't finish. Close this and select Retry on the request first.";
const MSG_DECIDED_ELSEWHERE =
  'The credits were added, but someone else made a decision on this request first. Open the request to check.';

const locks = new Map<string, Promise<unknown>>();
const attempts = new Set<string>();

/** Attempt IDs running in this tab right now (FR-020a). */
export const sessionAttempts: ReadonlySet<string> = attempts;

/** Runs `fn` while holding the per-request lock. Returns 'Busy' if something already holds it. */
export async function withRequestLock<T>(requestId: string, fn: () => Promise<T>): Promise<T | 'Busy'> {
  if (locks.has(requestId)) return 'Busy';
  const running = fn();
  locks.set(requestId, running);
  try {
    return await running;
  } finally {
    locks.delete(requestId);
  }
}

function errorInfo(err: unknown): { kind: CreditAllocationErrorKind; message: string; ppacLink?: string } {
  const e = (typeof err === 'object' && err !== null ? err : {}) as {
    kind?: CreditAllocationErrorKind; plainMessage?: string; ppacLink?: string;
  };
  return { kind: e.kind ?? 'Unknown', message: e.plainMessage ?? MSG_UNCONFIRMED, ppacLink: e.ppacLink };
}

async function quietly(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // A failed state write leaves the row Processing; recovery picks it up.
    console.warn('[Credits approval] Could not update the request status:', err);
  }
}

async function readFresh(deps: ApprovalDeps, requestId: string, review: ReviewSnapshot): Promise<ReviewSnapshot> {
  const [header, row, other, credits] = await Promise.all([
    deps.repo.readApprovalHeader(requestId),
    deps.repo.readApprovalRow(requestId),
    deps.repo.findOtherOpenRequest(review.envId, requestId),
    deps.credits.getEnvironmentCredits(review.envId),
  ]);
  return {
    ...review,
    current: credits.allocated,
    rules: credits.rules,
    rulesDefaulted: credits.rulesDefaulted,
    otherOpenRequestId: other,
    headerOk: header.underReview && header.assigneeDvId === deps.adminDvId.toLowerCase(),
    rowState: row.state,
    rowAttemptId: row.attemptId,
  };
}

const MSG_UNKNOWN_RULE =
  "This environment has a credits rule this app doesn't recognize, so it can't change its settings safely. Change it in the Power Platform admin center.";
const MSG_PAYG_NO_DRAW = "Tenant draw isn't changed while pay-as-you-go is active.";
const MSG_DRAW_NOT_NEEDED = "Tenant draw can't be turned on here: the maker didn't ask for it, or it's already on.";

async function allocate(
  deps: ApprovalDeps, requestId: string, review: ReviewSnapshot,
  amount: number | undefined, turnOnDraw: boolean, comment: string,
): Promise<ApprovalResult> {
  let target = review.current;
  if (amount !== undefined) {
    const check = validateAmount(String(amount), review.current, review.available);
    if (!check.ok) return { kind: 'Invalid', message: check.message };
    target = check.newTotal;
  }
  if (turnOnDraw) {
    if (review.payg === 'active') return { kind: 'Invalid', message: MSG_PAYG_NO_DRAW };
    const known: ReadonlySet<string> = new Set(KNOWN_RULE_TYPES);
    if (review.rules.some((r) => !known.has(r.ruleType))) return { kind: 'Invalid', message: MSG_UNKNOWN_RULE };
    // Same rule the dialog uses, so the command never trusts the UI alone.
    const state = tenantDrawState(review.rules, review.rulesDefaulted);
    if (!canTurnOnDraw(review.requestedDraw === true, state, review.payg)) {
      return { kind: 'Invalid', message: MSG_DRAW_NOT_NEEDED };
    }
  }
  // Spec 032 FR-007: nothing to change in Power Platform, but the approval still goes through intent and re-read.
  const needsPut = amount !== undefined || turnOnDraw;
  const before = review.current;
  const attemptId = (deps.newId ?? (() => crypto.randomUUID()))();
  attempts.add(attemptId);
  const details = (step: string, err: unknown) => describeFailure(step, err, { requestId, reference: attemptId });
  const paygChoice = review.payg === 'active' ? 'allocate' : 'n/a';
  const audit = (outcome: CreditChildState, extra: Partial<AttemptAuditEntry> = {}) =>
    deps.repo.appendAttemptAudit(requestId, 'CreditAllocationAttempted', {
      attemptId, adminId: deps.adminDvId, before, target, paygChoice, turnOnDraw, outcome, ...extra,
    });

  try {
    let row: ApprovalRow;
    // Nothing was written yet, so these only record the failure in the activity log.
    const startFailed = async (step: string, err: unknown): Promise<ApprovalResult> => {
      await audit('FailedRetryable', { step, error: MSG_START_FAILED });
      return { kind: 'Failed', state: 'FailedRetryable', message: MSG_START_FAILED, details: details(step, err) };
    };
    const heldBack = async (message: string): Promise<ApprovalResult> => {
      await audit('FailedRetryable', { step: 'Check the request', error: message });
      return { kind: 'NeedsAttention', message };
    };
    try {
      row = await deps.repo.readApprovalRow(requestId);
    } catch (err) {
      return await startFailed('Read the request', err);
    }
    // Never overwrite an unfinished attempt's intent: recovery needs its before/target.
    if (needsRecovery(row.state, row.attemptId, attempts)) return await heldBack(MSG_UNFINISHED);
    // Credits already landed; only the approval is missing. Allocating again would add them twice.
    if (row.state === 'Succeeded') return await heldBack(MSG_HEADER_PENDING);
    const rowId = row.rowId;
    // Saved first so Retry can finish the approval with the admin's comment.
    try {
      if (!(await deps.repo.saveApprovalComment(requestId, comment))) {
        await audit('Superseded', { note: 'The request changed before your comment was saved.' });
        return { kind: 'Superseded' };
      }
    } catch (err) {
      return await startFailed('Save your comment', err);
    }
    try {
      await deps.repo.saveIntent(rowId, { attemptId, target, before, rules: review.rules, turnOnDraw });
    } catch (err) {
      return await startFailed('Get the request ready', err);
    }

    let fresh: ReviewSnapshot;
    try {
      fresh = await readFresh(deps, requestId, review);
    } catch (err) {
      await quietly(() => deps.repo.setChildState(rowId, 'FailedRetryable', { error: MSG_READ_FAILED }));
      await audit('FailedRetryable', { error: MSG_READ_FAILED });
      return {
        kind: 'Failed', state: 'FailedRetryable', message: MSG_READ_FAILED,
        details: details("Check the environment's latest credits", err),
      };
    }
    if (hasDrifted({ ...review, rowState: 'Processing', rowAttemptId: attemptId }, fresh)) {
      await quietly(() => deps.repo.setChildState(rowId, 'Superseded'));
      await audit('Superseded');
      return { kind: 'Superseded' };
    }

    // Spec 032: pay-as-you-go may have turned on since review. Tenant draw is never changed while it's active.
    if (turnOnDraw) {
      let payg: PaygStatus;
      try {
        payg = await deps.credits.getPaygStatus(review.envId);
      } catch (err) {
        await quietly(() => deps.repo.setChildState(rowId, 'FailedRetryable', { error: MSG_READ_FAILED }));
        await audit('FailedRetryable', { error: MSG_READ_FAILED });
        return {
          kind: 'Failed', state: 'FailedRetryable', message: MSG_READ_FAILED,
          details: details('Check pay-as-you-go', err),
        };
      }
      if (payg === 'active') {
        await quietly(() => deps.repo.setChildState(rowId, 'Superseded'));
        await audit('Superseded', { note: 'Pay-as-you-go turned on before tenant draw was saved.' });
        return { kind: 'Superseded', reason: 'payg' };
      }
    }

    let verified: number;
    if (!needsPut) {
      verified = fresh.current;
    } else {
      try {
        await deps.credits.setEnvironmentCredits(review.envId, target, turnOnDraw ? withTenantPoolOn(fresh.rules) : fresh.rules);
      } catch (err) {
        const info = errorInfo(err);
        const drawLocked = info.kind === 'TenantPoolLocked' && turnOnDraw;
        if (drawLocked) info.message = MSG_DRAW_LOCKED;
        const state = stateForError(info.kind, true);
        const step = drawLocked || amount === undefined ? 'Turn on tenant draw' : 'Add the credits';
        const failure = details(step, err);
        await quietly(() => deps.repo.setChildState(rowId, state, { error: info.message }));
        await audit(state, { step, error: info.message });
        if (state === 'UnknownOutcome') return { kind: 'NeedsAttention', message: MSG_UNCONFIRMED, details: failure };
        if (drawLocked) {
          return {
            kind: 'Failed', state: state as 'FailedRetryable' | 'FailedPermanent', message: info.message,
            details: failure, drawLocked: true,
          };
        }
        return {
          kind: 'Failed', state: state as 'FailedRetryable' | 'FailedPermanent', message: info.message,
          ppacLink: info.ppacLink, details: failure,
        };
      }

      let readBack: Awaited<ReturnType<ApprovalDeps['credits']['getEnvironmentCredits']>>;
      try {
        readBack = await deps.credits.getEnvironmentCredits(review.envId);
      } catch (err) {
        await quietly(() => deps.repo.setChildState(rowId, 'UnknownOutcome', { error: MSG_UNCONFIRMED }));
        await audit('UnknownOutcome', { error: MSG_UNCONFIRMED });
        return { kind: 'NeedsAttention', message: MSG_UNCONFIRMED, details: details('Check the credits were saved', err) };
      }
      verified = readBack.allocated;
      if (!isVerified(readBack, target, turnOnDraw)) {
        await quietly(() => deps.repo.setChildState(rowId, 'UnknownOutcome', { lastVerified: verified, error: MSG_UNCONFIRMED }));
        await audit('UnknownOutcome', { verified, error: MSG_UNCONFIRMED });
        return { kind: 'NeedsAttention', message: MSG_UNCONFIRMED };
      }
    }

    // Row first (the credits really are set), then header. A failed header write is finished by recovery.
    await quietly(() => deps.repo.setChildState(rowId, 'Succeeded', { lastVerified: verified }));
    await audit('Succeeded', { verified });
    let approved: boolean;
    try {
      approved = await deps.repo.approveWithVerifiedTotal(requestId, verified, deps.adminAadId, comment);
    } catch (err) {
      return { kind: 'NeedsAttention', message: MSG_HEADER_PENDING, details: details('Mark the request approved', err) };
    }
    if (!approved) return { kind: 'NeedsAttention', message: MSG_DECIDED_ELSEWHERE };
    return { kind: 'Succeeded', verifiedTotal: verified, drawTurnedOn: turnOnDraw, creditsAdded: amount !== undefined };
  } finally {
    attempts.delete(attemptId);
  }
}

async function skip(deps: ApprovalDeps, requestId: string, review: ReviewSnapshot, comment: string): Promise<ApprovalResult> {
  if (review.payg !== 'active') {
    return { kind: 'Invalid', message: 'You can approve without adding credits only when pay-as-you-go is on.' };
  }
  const reference = (deps.newId ?? (() => crypto.randomUUID()))();
  const details = (step: string, err: unknown) => describeFailure(step, err, { requestId, reference });
  const log = (outcome: CreditChildState, extra: Partial<AttemptAuditEntry> = {}) =>
    deps.repo.appendAttemptAudit(requestId, 'CreditApprovedWithoutAllocation', {
      attemptId: reference, adminId: deps.adminDvId, paygChoice: 'skip', outcome, ...extra,
    });
  const failed = async (step: string, message: string, err: unknown): Promise<ApprovalResult> => {
    await log('FailedRetryable', { step, error: message });
    return { kind: 'Failed', state: 'FailedRetryable', message, details: details(step, err) };
  };
  let current: number;
  let row: ApprovalRow;
  try {
    const [header, freshRow, credits] = await Promise.all([
      deps.repo.readApprovalHeader(requestId),
      deps.repo.readApprovalRow(requestId),
      deps.credits.getEnvironmentCredits(review.envId),
    ]);
    if (!header.underReview || header.assigneeDvId !== deps.adminDvId.toLowerCase()) return { kind: 'Superseded' };
    current = credits.allocated;
    row = freshRow;
  } catch (err) {
    return await failed('Read the request', MSG_READ_FAILED, err);
  }
  if (needsRecovery(row.state, row.attemptId, attempts)) return { kind: 'NeedsAttention', message: MSG_UNFINISHED };
  if (row.state === 'Succeeded') return { kind: 'NeedsAttention', message: MSG_HEADER_PENDING };
  let approved: boolean;
  try {
    // drawApproved: false so a Yes left by an earlier failed turn-on doesn't survive this approval (FR-005).
    await deps.repo.setChildState(row.rowId, 'Skipped', { lastVerified: current, drawApproved: false });
    approved = await deps.repo.approveWithVerifiedTotal(requestId, current, deps.adminAadId, comment);
  } catch (err) {
    return await failed('Approve the request', MSG_START_FAILED, err);
  }
  if (!approved) return { kind: 'Superseded' };
  await log('Skipped', { before: current, verified: current });
  return { kind: 'Skipped', total: current };
}

/** Approves a credits request: allocate (PUT + verify) or PAYG skip. Never runs twice at once per request. */
export async function runApproval(
  deps: ApprovalDeps, requestId: string, review: ReviewSnapshot, input: SubmitInput,
): Promise<ApprovalResult> {
  const comment = (input.comment ?? '').trim();
  if (!comment) return { kind: 'Invalid', message: MSG_COMMENT_REQUIRED };
  const result = await withRequestLock(requestId, () =>
    input.mode === 'skip'
      ? skip(deps, requestId, review, comment)
      : allocate(deps, requestId, review, input.amount, input.turnOnDraw === true, comment),
  );
  return result === 'Busy' ? { kind: 'Busy' } : result;
}
