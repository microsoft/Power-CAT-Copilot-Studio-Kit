import type { ApprovalRow } from '../../../shared/services/dataverse/creditApprovalRepository';
import { MSG_READ_FAILED, sessionAttempts, withRequestLock, type ApprovalDeps } from './creditApprovalCommand';
import { decideRecovery, needsRecovery, tenantDrawState, type AllocationRule } from './creditApprovalRules';

// Recovery for unclear or orphaned attempts (contracts/credit-recovery.md).
// Neither command here ever calls PUT; they only read the live total and record what it means.

export type RecoveryResult =
  | { kind: 'Busy' }
  | { kind: 'NotNeeded' }
  | { kind: 'Finished'; verifiedTotal: number }
  | { kind: 'AlreadyDecided' }
  | { kind: 'SafeToRetry' }
  | { kind: 'Conflict'; message: string }
  | { kind: 'ReadFailed'; message: string };

export type FreshReviewResult =
  | { kind: 'Reset' }
  | { kind: 'Busy' }
  | { kind: 'NotAllowed'; message: string }
  | { kind: 'ReadFailed'; message: string };

const MSG_CONFLICT =
  "Someone changed this environment's credits outside this request. Start a fresh review, or check the Power Platform admin center.";
const MSG_NOTHING_TO_RESET = 'There is nothing to reset. Reload the request.';
const MSG_NOT_CONFLICT = 'The credits now match this try. Select Retry to finish it.';
const MSG_NOT_ASSIGNED = 'Only the admin this request is assigned to can reset it.';
const MSG_ALREADY_SET = 'The credits were already added. Select Retry to finish approving.';
const MSG_CANT_CHECK =
  "We can't safely check the earlier try. Check the credits in the Power Platform admin center before going on.";

function rowPath(row: ApprovalRow, live: { allocated: number; rules: AllocationRule[]; rulesDefaulted?: boolean }) {
  if (row.target === undefined || row.before === undefined) return 'conflict';
  return decideRecovery(live.allocated, row.target, row.before, {
    intended: row.drawApproved,
    livePool: tenantDrawState(live.rules, live.rulesDefaulted) !== 'off',
    beforePool: row.beforePool,
  });
}

/** Resolves an unclear or orphaned attempt from the live total. Never calls PUT. */
export async function runRecovery(deps: ApprovalDeps, requestId: string): Promise<RecoveryResult> {
  const result = await withRequestLock(requestId, async (): Promise<RecoveryResult> => {
    let row: ApprovalRow;
    let live: Awaited<ReturnType<ApprovalDeps['credits']['getEnvironmentCredits']>>;
    try {
      row = await deps.repo.readApprovalRow(requestId);
      if (row.state === 'Succeeded' && row.target !== undefined) {
        const header = await deps.repo.readApprovalHeader(requestId);
        if (!header.underReview) return { kind: 'NotNeeded' };
        // The row was verified when it was marked Succeeded, so its target is the allocated total.
        const approved = await deps.repo.approveWithVerifiedTotal(requestId, row.target, deps.adminAadId);
        return approved ? { kind: 'Finished', verifiedTotal: row.target } : { kind: 'AlreadyDecided' };
      }
      if (!needsRecovery(row.state, row.attemptId, sessionAttempts)) return { kind: 'NotNeeded' };
      live = await deps.credits.getEnvironmentCredits(row.envId);
    } catch {
      return { kind: 'ReadFailed', message: MSG_READ_FAILED };
    }
    const current = live.allocated;
    const attemptId = row.attemptId ?? 'unknown';
    const base = {
      attemptId, adminId: deps.adminDvId, before: row.before, target: row.target, paygChoice: 'n/a' as const,
      turnOnDraw: row.drawApproved,
    };
    const path = rowPath(row, live);

    try {
      if (path === 'finish') {
        await deps.repo.setChildState(row.rowId, 'Succeeded', { lastVerified: current });
        const approved = await deps.repo.approveWithVerifiedTotal(requestId, current, deps.adminAadId);
        await deps.repo.appendAttemptAudit(requestId, 'CreditAllocationAttempted', {
          ...base, verified: current, outcome: 'Succeeded',
          note: 'Finished by recovery. Recorded decider is the admin who ran recovery.',
        });
        return approved ? { kind: 'Finished', verifiedTotal: current } : { kind: 'AlreadyDecided' };
      }
      if (path === 'safeToRetry') {
        await deps.repo.setChildState(row.rowId, 'FailedRetryable', { lastVerified: current });
        await deps.repo.appendAttemptAudit(requestId, 'CreditAllocationAttempted', {
          ...base, verified: current, outcome: 'FailedRetryable',
        });
        return { kind: 'SafeToRetry' };
      }
      if (row.state !== 'UnknownOutcome') {
        await deps.repo.setChildState(row.rowId, 'UnknownOutcome', { lastVerified: current, error: MSG_CONFLICT });
      }
      await deps.repo.appendAttemptAudit(requestId, 'CreditAllocationAttempted', {
        ...base, verified: current, outcome: 'UnknownOutcome', error: MSG_CONFLICT,
      });
      return { kind: 'Conflict', message: MSG_CONFLICT };
    } catch {
      return { kind: 'ReadFailed', message: MSG_READ_FAILED };
    }
  });
  return result === 'Busy' ? { kind: 'Busy' } : result;
}

/**
 * Closes a conflicting attempt as Superseded so Approve and Reject come back.
 * Only allowed when the live total matches neither the before nor the target total.
 */
export async function startFreshReview(deps: ApprovalDeps, requestId: string): Promise<FreshReviewResult> {
  const result = await withRequestLock(requestId, async (): Promise<FreshReviewResult> => {
    let row: ApprovalRow;
    let live: Awaited<ReturnType<ApprovalDeps['credits']['getEnvironmentCredits']>>;
    try {
      const header = await deps.repo.readApprovalHeader(requestId);
      if (!header.underReview || header.assigneeDvId !== deps.adminDvId.toLowerCase()) {
        return { kind: 'NotAllowed', message: MSG_NOT_ASSIGNED };
      }
      row = await deps.repo.readApprovalRow(requestId);
      if (row.state === 'Succeeded') return { kind: 'NotAllowed', message: MSG_ALREADY_SET };
      if (!needsRecovery(row.state, row.attemptId, sessionAttempts)) {
        return { kind: 'NotAllowed', message: MSG_NOTHING_TO_RESET };
      }
      // Without both totals we can't prove the change came from outside; fail closed.
      if (row.target === undefined || row.before === undefined) {
        return { kind: 'NotAllowed', message: MSG_CANT_CHECK };
      }
      live = await deps.credits.getEnvironmentCredits(row.envId);
    } catch {
      return { kind: 'ReadFailed', message: MSG_READ_FAILED };
    }
    const current = live.allocated;
    if (rowPath(row, live) !== 'conflict') return { kind: 'NotAllowed', message: MSG_NOT_CONFLICT };

    try {
      await deps.repo.setChildState(row.rowId, 'Superseded', { lastVerified: current });
    } catch {
      return { kind: 'ReadFailed', message: "We couldn't reset the earlier try. Try again." };
    }
    try {
      await deps.repo.appendAttemptAudit(requestId, 'CreditAllocationAttempted', {
        attemptId: row.attemptId ?? 'unknown', adminId: deps.adminDvId, before: row.before, target: row.target,
        paygChoice: 'n/a', verified: current, outcome: 'Superseded',
        note: 'Closed by "Start a fresh review" after the total changed outside this request.',
      });
    } catch {
      // The reset itself is saved; a missing audit line must not undo it.
    }
    return { kind: 'Reset' };
  });
  return result === 'Busy' ? { kind: 'Busy' } : result;
}
