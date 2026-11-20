import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// T006 — spec 024 approve-and-allocate command and recovery.
// The command takes its services as `deps`, so every branch runs against fakes.
// The audit-dedupe case drives the real repository with mocked generated services.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../generated/services/Cat_policyrequestsService', () => ({
  Cat_policyrequestsService: { get: vi.fn(), update: vi.fn(), create: vi.fn(), getAll: vi.fn() },
}));
vi.mock('../../../generated/services/Cat_powershieldpolicyrequestlogsService', () => ({
  Cat_powershieldpolicyrequestlogsService: { create: vi.fn(), get: vi.fn(), getAll: vi.fn() },
}));
vi.mock('../../../generated/services/Cat_policyrequestenvironmentsService', () => ({
  Cat_policyrequestenvironmentsService: { get: vi.fn(), getAll: vi.fn(), update: vi.fn(), create: vi.fn() },
}));
vi.mock('../../../generated/services/Cat_policyrequestparticipantsService', () => ({
  Cat_policyrequestparticipantsService: { get: vi.fn(), getAll: vi.fn() },
}));
vi.mock('../../../generated/services/Cat_servicetreesService', () => ({
  Cat_servicetreesService: { get: vi.fn(), getAll: vi.fn() },
}));
vi.mock('../../../generated/services/Cat_powershieldenvironmentgroupsService', () => ({
  Cat_powershieldenvironmentgroupsService: { get: vi.fn(), getAll: vi.fn() },
}));
vi.mock('../../../generated/services/SystemusersService', () => ({
  SystemusersService: { get: vi.fn(), getAll: vi.fn() },
}));

import { Cat_powershieldpolicyrequestlogsService } from '../../../generated/services/Cat_powershieldpolicyrequestlogsService';
import { Cat_policyrequestsService } from '../../../generated/services/Cat_policyrequestsService';
import { Cat_policyrequestenvironmentsService } from '../../../generated/services/Cat_policyrequestenvironmentsService';
import {
  MSG_DRAW_LOCKED,
  runApproval,
  withRequestLock,
  type ApprovalDeps,
} from '../features/credits/services/creditApprovalCommand';
import { runRecovery, startFreshReview } from '../features/credits/services/creditRecoveryCommand';
import type { ReviewSnapshot } from '../features/credits/services/creditApprovalRules';
import type { ApprovalRow } from '../shared/services/dataverse/creditApprovalRepository';
import {
  appendAttemptAudit,
  approveWithVerifiedTotal,
  findOtherOpenRequest,
  saveApprovalComment,
  saveIntent,
  setChildState,
} from '../shared/services/dataverse/creditApprovalRepository';
import { parseAmount, creditsAddedFor, creditsRequestedFor } from '../shared/services/dataverse/creditRequestService';
import { cleanSystemMessage } from '../features/credits/services/approvalErrorDetails';
import { REQUEST_TYPE_CREDITS } from '../shared/services/dataverse/requestType';

const REQ = 'req-1';
const ENV = 'env-1';
const RULES = [{ ruleType: 'TenantPool', enabled: true }];

const review: ReviewSnapshot = {
  envId: ENV, current: 1000, available: 5000, rules: RULES, payg: 'none',
  headerOk: true, rowState: 'Pending', rowAttemptId: undefined,
};

function makeDeps(opts: {
  row?: Partial<ApprovalRow>; totals?: number[]; rules?: { ruleType: string; enabled: boolean }[][];
} = {}) {
  const calls: string[] = [];
  const totals = [...(opts.totals ?? [1000, 1500])];
  const ruleReads = [...(opts.rules ?? [RULES])];
  let row: ApprovalRow = {
    rowId: 'row-1', envId: ENV, state: 'Pending', requestedDraw: false, drawApproved: false, beforePool: null, ...opts.row,
  };
  const deps = {
    adminDvId: 'ADMIN-1',
    adminAadId: 'aad-1',
    newId: () => 'att-1',
    credits: {
      getEnvironmentCredits: vi.fn(async () => {
        calls.push('read');
        return {
          allocated: totals.length > 1 ? totals.shift()! : totals[0],
          rules: ruleReads.length > 1 ? ruleReads.shift()! : ruleReads[0],
        };
      }),
      setEnvironmentCredits: vi.fn(async () => { calls.push('put'); }),
      getPaygStatus: vi.fn(async () => 'none' as const),
    },
    repo: {
      readApprovalHeader: vi.fn(async () => ({ underReview: true, assigneeDvId: 'admin-1' })),
      readApprovalRow: vi.fn(async () => row),
      findOtherOpenRequest: vi.fn(async () => undefined),
      saveApprovalComment: vi.fn(async () => { calls.push('comment'); return true; }),
      saveIntent: vi.fn(async (_id: string, i: { attemptId: string }) => {
        calls.push('intent');
        row = { ...row, state: 'Processing', attemptId: i.attemptId };
      }),
      setChildState: vi.fn(async (_id: string, state: ApprovalRow['state']) => {
        calls.push(`state:${state}`);
        row = { ...row, state };
      }),
      approveWithVerifiedTotal: vi.fn(async () => { calls.push('header'); return true; }),
      appendAttemptAudit: vi.fn(async () => { calls.push('audit'); }),
    },
  } satisfies ApprovalDeps;
  return { deps, calls };
}

const allocate = { mode: 'allocate' as const, amount: 500, comment: 'ok' };
const skipInput = { mode: 'skip' as const, comment: 'ok' };

describe('runApproval — allocate', () => {
  it('saves intent before PUT, verifies, then marks row Succeeded before the header', async () => {
    const { deps, calls } = makeDeps();
    const r = await runApproval(deps, REQ, review, allocate);
    expect(r).toEqual({ kind: 'Succeeded', verifiedTotal: 1500, drawTurnedOn: false, creditsAdded: true });
    expect(calls.indexOf('intent')).toBeLessThan(calls.indexOf('put'));
    expect(calls.indexOf('state:Succeeded')).toBeLessThan(calls.indexOf('header'));
    expect(deps.credits.setEnvironmentCredits).toHaveBeenCalledWith(ENV, 1500, RULES);
  });

  it('never PUTs when the intent save fails', async () => {
    const { deps } = makeDeps();
    deps.repo.saveIntent.mockRejectedValueOnce(new Error('boom'));
    const r = await runApproval(deps, REQ, review, allocate);
    expect(r).toMatchObject({ kind: 'Failed', state: 'FailedRetryable' });
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
  });

  it('saves the comment before the intent', async () => {
    const { deps, calls } = makeDeps();
    await runApproval(deps, REQ, review, { ...allocate, comment: '  looks good  ' });
    expect(deps.repo.saveApprovalComment).toHaveBeenCalledWith(REQ, 'looks good');
    expect(calls.indexOf('comment')).toBeLessThan(calls.indexOf('intent'));
  });

  it('stops before the intent when the comment save fails, and says which step failed', async () => {
    const { deps } = makeDeps();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    deps.repo.saveApprovalComment.mockRejectedValueOnce(new Error('Bad value see https://x.example/a'));
    const r = await runApproval(deps, REQ, review, allocate);
    expect(r).toMatchObject({
      kind: 'Failed',
      details: { step: 'Save your comment', reference: 'att-1', systemMessage: 'Bad value see [link removed]' },
    });
    expect(deps.repo.saveIntent).not.toHaveBeenCalled();
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
    expect(deps.repo.appendAttemptAudit).toHaveBeenCalledWith(REQ, 'CreditAllocationAttempted', expect.objectContaining({
      attemptId: 'att-1', outcome: 'FailedRetryable', step: 'Save your comment',
    }));
  });

  it('returns Superseded when the request left Under review before the comment save', async () => {
    const { deps } = makeDeps();
    deps.repo.saveApprovalComment.mockResolvedValueOnce(false);
    expect(await runApproval(deps, REQ, review, allocate)).toEqual({ kind: 'Superseded' });
    expect(deps.repo.saveIntent).not.toHaveBeenCalled();
  });

  it.each([
    ['allocate', { ...allocate, comment: '   ' }],
    ['skip', { ...skipInput, comment: '' }],
  ])('%s with a blank comment is rejected without writing anything', async (_name, input) => {
    const { deps } = makeDeps();
    const r = await runApproval(deps, REQ, { ...review, payg: 'active' }, input);
    expect(r).toEqual({ kind: 'Invalid', message: 'Add a comment to continue.' });
    expect(deps.repo.saveApprovalComment).not.toHaveBeenCalled();
    expect(deps.repo.setChildState).not.toHaveBeenCalled();
    expect(deps.repo.approveWithVerifiedTotal).not.toHaveBeenCalled();
  });

  it('rejects an invalid amount without writing anything', async () => {
    const { deps } = makeDeps();
    const r = await runApproval(deps, REQ, review, { mode: 'allocate', amount: 0, comment: 'ok' });
    expect(r.kind).toBe('Invalid');
    expect(deps.repo.saveIntent).not.toHaveBeenCalled();
  });

  it('returns Superseded with no PUT when the total drifted', async () => {
    const { deps, calls } = makeDeps({ totals: [1200] });
    const r = await runApproval(deps, REQ, review, allocate);
    expect(r).toEqual({ kind: 'Superseded' });
    expect(calls).toContain('state:Superseded');
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
  });

  it('fails retryable with no PUT when the pre-PUT re-read fails', async () => {
    const { deps } = makeDeps();
    deps.repo.findOtherOpenRequest.mockRejectedValueOnce(new Error('x'));
    const r = await runApproval(deps, REQ, review, allocate);
    expect(r).toMatchObject({ kind: 'Failed', state: 'FailedRetryable' });
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
  });

  it.each([
    ['Permission', 'Failed', 'state:FailedRetryable'],
    ['InvalidAllocation', 'Failed', 'state:FailedPermanent'],
    ['Timeout', 'NeedsAttention', 'state:UnknownOutcome'],
  ])('maps a %s PUT error', async (kind, resultKind, stateCall) => {
    const { deps, calls } = makeDeps();
    deps.credits.setEnvironmentCredits.mockRejectedValueOnce({ kind, plainMessage: 'msg' });
    const r = await runApproval(deps, REQ, review, allocate);
    expect(r.kind).toBe(resultKind);
    expect(calls).toContain(stateCall);
  });

  it('a failed PUT says which step failed and gives a reference', async () => {
    const { deps } = makeDeps();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    deps.credits.setEnvironmentCredits.mockRejectedValueOnce({ kind: 'Permission', plainMessage: 'msg' });
    const r = await runApproval(deps, REQ, review, allocate);
    expect(r).toMatchObject({ kind: 'Failed', details: { step: 'Add the credits', reference: 'att-1' } });
  });

  it('marks UnknownOutcome when the read-back does not match the target', async () => {
    const { deps, calls } = makeDeps({ totals: [1000, 1400] });
    const r = await runApproval(deps, REQ, review, allocate);
    expect(r.kind).toBe('NeedsAttention');
    expect(calls).toContain('state:UnknownOutcome');
  });

  it('keeps the row Succeeded when the header write fails after a verified PUT', async () => {
    const { deps, calls } = makeDeps();
    deps.repo.approveWithVerifiedTotal.mockRejectedValueOnce(new Error('x'));
    const r = await runApproval(deps, REQ, review, allocate);
    expect(r.kind).toBe('NeedsAttention');
    expect(calls).toContain('state:Succeeded');
    expect(calls.filter((c) => c.startsWith('state:'))).toEqual(['state:Succeeded']);
  });
});

describe('runApproval — PAYG skip', () => {
  it('approves with the current total and never PUTs', async () => {
    const { deps, calls } = makeDeps({ totals: [1000] });
    const r = await runApproval(deps, REQ, { ...review, payg: 'active' }, skipInput);
    expect(r).toEqual({ kind: 'Skipped', total: 1000 });
    expect(calls).toContain('state:Skipped');
    expect(deps.repo.approveWithVerifiedTotal).toHaveBeenCalledWith(REQ, 1000, 'aad-1', 'ok');
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
  });
  it('refuses to skip when PAYG is not active, and writes nothing', async () => {
    const { deps } = makeDeps({ totals: [1000] });
    const r = await runApproval(deps, REQ, { ...review, payg: 'linkedInactive' }, skipInput);
    expect(r.kind).toBe('Invalid');
    expect(deps.repo.approveWithVerifiedTotal).not.toHaveBeenCalled();
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
  });
  it('logs a failed approve so the Activity tab shows it', async () => {
    const { deps } = makeDeps({ totals: [1000] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    deps.repo.approveWithVerifiedTotal.mockRejectedValueOnce(new Error('boom'));
    const r = await runApproval(deps, REQ, { ...review, payg: 'active' }, skipInput);
    expect(r).toMatchObject({ kind: 'Failed', state: 'FailedRetryable' });
    expect(deps.repo.appendAttemptAudit).toHaveBeenCalledWith(REQ, 'CreditApprovedWithoutAllocation', expect.objectContaining({
      outcome: 'FailedRetryable', step: 'Approve the request',
    }));
  });
});

describe('an unfinished attempt from another session blocks new writes', () => {
  it.each([
    ['UnknownOutcome', 'att-1'],
    ['Processing', 'someone-elses-attempt'],
  ])('allocate refuses when the row is %s', async (state, attemptId) => {
    const { deps, calls } = makeDeps({ row: { state: state as ApprovalRow['state'], attemptId } });
    const r = await runApproval(deps, REQ, review, allocate);
    expect(r.kind).toBe('NeedsAttention');
    expect(calls).not.toContain('intent');
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
    expect(deps.repo.approveWithVerifiedTotal).not.toHaveBeenCalled();
  });

  it('skip refuses when the row is UnknownOutcome', async () => {
    const { deps, calls } = makeDeps({ row: { state: 'UnknownOutcome', attemptId: 'old' }, totals: [1000] });
    const r = await runApproval(deps, REQ, { ...review, payg: 'active' }, skipInput);
    expect(r.kind).toBe('NeedsAttention');
    expect(calls).not.toContain('state:Skipped');
    expect(deps.repo.approveWithVerifiedTotal).not.toHaveBeenCalled();
  });

  it.each([
    ['allocate', allocate],
    ['skip', skipInput],
  ])('%s refuses a Succeeded row so credits are never added twice', async (_name, input) => {
    const { deps, calls } = makeDeps({ row: { state: 'Succeeded', attemptId: 'old', target: 1500 } });
    const r = await runApproval(deps, REQ, { ...review, payg: 'active' }, input);
    expect(r.kind).toBe('NeedsAttention');
    expect(calls).not.toContain('intent');
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
    expect(deps.repo.approveWithVerifiedTotal).not.toHaveBeenCalled();
  });
});

describe('the request was decided elsewhere before the header write', () => {
  it('allocate reports attention instead of success', async () => {
    const { deps } = makeDeps();
    deps.repo.approveWithVerifiedTotal.mockResolvedValueOnce(false);
    expect((await runApproval(deps, REQ, review, allocate)).kind).toBe('NeedsAttention');
  });

  it('skip reports Superseded instead of Skipped', async () => {
    const { deps } = makeDeps({ totals: [1000] });
    deps.repo.approveWithVerifiedTotal.mockResolvedValueOnce(false);
    const r = await runApproval(deps, REQ, { ...review, payg: 'active' }, skipInput);
    expect(r).toEqual({ kind: 'Superseded' });
  });

  it.each([
    ['a Succeeded row', { state: 'Succeeded' as const, target: 1500, before: 1000 }],
    ['an unclear row that landed', { state: 'UnknownOutcome' as const, attemptId: 'old', target: 1500, before: 1000 }],
  ])('recovery of %s reports AlreadyDecided', async (_name, row) => {
    const { deps } = makeDeps({ row, totals: [1500] });
    deps.repo.approveWithVerifiedTotal.mockResolvedValueOnce(false);
    expect(await runRecovery(deps, REQ)).toEqual({ kind: 'AlreadyDecided' });
  });
});

describe('withRequestLock', () => {
  it('returns Busy while held and releases after a throw', async () => {
    let release!: () => void;
    const held = withRequestLock('lock-1', () => new Promise<void>((res) => { release = res; }));
    expect(await withRequestLock('lock-1', async () => 'second')).toBe('Busy');
    release();
    await held;
    await expect(withRequestLock('lock-1', async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await withRequestLock('lock-1', async () => 'free')).toBe('free');
  });
});

describe('runRecovery', () => {
  const stuck = { state: 'UnknownOutcome' as const, attemptId: 'old', target: 1500, before: 1000 };

  it.each([
    [1500, 'Finished', 'state:Succeeded'],
    [1000, 'SafeToRetry', 'state:FailedRetryable'],
  ])('live total %d → %s', async (total, kind, stateCall) => {
    const { deps, calls } = makeDeps({ row: stuck, totals: [total] });
    const r = await runRecovery(deps, REQ);
    expect(r.kind).toBe(kind);
    expect(calls).toContain(stateCall);
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
  });

  it('reports a conflict when the total matches neither value', async () => {
    const { deps } = makeDeps({ row: stuck, totals: [1234] });
    const r = await runRecovery(deps, REQ);
    expect(r.kind).toBe('Conflict');
    expect(deps.repo.approveWithVerifiedTotal).not.toHaveBeenCalled();
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
  });

  it('finishes the header for a Succeeded row still under review', async () => {
    const { deps } = makeDeps({ row: { state: 'Succeeded', target: 1500, before: 1000 } });
    const r = await runRecovery(deps, REQ);
    expect(r).toEqual({ kind: 'Finished', verifiedTotal: 1500 });
    expect(deps.repo.approveWithVerifiedTotal).toHaveBeenCalledWith(REQ, 1500, 'aad-1');
  });

  it('does nothing for a Pending row', async () => {
    const { deps } = makeDeps();
    expect(await runRecovery(deps, REQ)).toEqual({ kind: 'NotNeeded' });
  });
});

describe('startFreshReview', () => {
  const stuck = { state: 'UnknownOutcome' as const, attemptId: 'old', target: 1500, before: 1000 };

  it('marks a conflicting attempt Superseded', async () => {
    const { deps, calls } = makeDeps({ row: stuck, totals: [1234] });
    expect(await startFreshReview(deps, REQ)).toEqual({ kind: 'Reset' });
    expect(calls).toContain('state:Superseded');
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
  });

  it.each([1500, 1000])('refuses when the live total %d is not a conflict', async (total) => {
    const { deps, calls } = makeDeps({ row: stuck, totals: [total] });
    expect((await startFreshReview(deps, REQ)).kind).toBe('NotAllowed');
    expect(calls.filter((c) => c.startsWith('state:'))).toEqual([]);
  });

  it('refuses when this admin is not the assignee', async () => {
    const { deps } = makeDeps({ row: stuck, totals: [1234] });
    deps.repo.readApprovalHeader.mockResolvedValueOnce({ underReview: true, assigneeDvId: 'someone-else' });
    expect((await startFreshReview(deps, REQ)).kind).toBe('NotAllowed');
    expect(deps.repo.setChildState).not.toHaveBeenCalled();
  });

  it.each([
    ['the row is Succeeded', { state: 'Succeeded' as const, target: 1500, before: 1000 }],
    ['the attempt has no saved totals', { state: 'UnknownOutcome' as const, attemptId: 'old' }],
  ])('refuses when %s', async (_name, row) => {
    const { deps } = makeDeps({ row, totals: [1234] });
    expect((await startFreshReview(deps, REQ)).kind).toBe('NotAllowed');
    expect(deps.repo.setChildState).not.toHaveBeenCalled();
  });

  it('still resets when the audit write fails', async () => {
    const { deps } = makeDeps({ row: stuck, totals: [1234] });
    deps.repo.appendAttemptAudit.mockRejectedValueOnce(new Error('x'));
    expect(await startFreshReview(deps, REQ)).toEqual({ kind: 'Reset' });
  });
});

describe('spec 032 — tenant draw', () => {
  const OFF = [{ ruleType: 'Alert', enabled: true }, { ruleType: 'TenantPool', enabled: false }];
  const ON = [{ ruleType: 'Alert', enabled: true }, { ruleType: 'TenantPool', enabled: true }];
  const offReview: ReviewSnapshot = { ...review, rules: OFF, requestedDraw: true };
  const turnOn = { mode: 'allocate' as const, turnOnDraw: true, comment: 'ok' };

  it('draw-only turn-on sends the current total with TenantPool on and verifies it', async () => {
    const { deps } = makeDeps({ totals: [1000], rules: [OFF, ON] });
    const r = await runApproval(deps, REQ, offReview, turnOn);
    expect(r).toEqual({ kind: 'Succeeded', verifiedTotal: 1000, drawTurnedOn: true, creditsAdded: false });
    expect(deps.credits.setEnvironmentCredits).toHaveBeenCalledWith(ENV, 1000, ON);
    expect(deps.repo.saveIntent).toHaveBeenCalledWith('row-1', expect.objectContaining({ target: 1000, turnOnDraw: true }));
  });

  it('works when the tenant has no spare credits', async () => {
    const { deps } = makeDeps({ totals: [1000], rules: [OFF, ON] });
    expect((await runApproval(deps, REQ, { ...offReview, available: 0 }, turnOn)).kind).toBe('Succeeded');
  });

  it('adds credits and turns on in one PUT', async () => {
    const { deps } = makeDeps({ totals: [1000, 1500], rules: [OFF, ON] });
    const r = await runApproval(deps, REQ, offReview, { ...turnOn, amount: 500 });
    expect(r).toMatchObject({ kind: 'Succeeded', verifiedTotal: 1500, drawTurnedOn: true, creditsAdded: true });
    expect(deps.credits.setEnvironmentCredits).toHaveBeenCalledWith(ENV, 1500, ON);
  });

  it('marks UnknownOutcome when TenantPool is still off after the PUT', async () => {
    const { deps, calls } = makeDeps({ totals: [1000], rules: [OFF] });
    expect((await runApproval(deps, REQ, offReview, turnOn)).kind).toBe('NeedsAttention');
    expect(calls).toContain('state:UnknownOutcome');
  });

  it('approves without changes: intent with No, no PUT, row Succeeded', async () => {
    const { deps, calls } = makeDeps({ totals: [1000] });
    const r = await runApproval(deps, REQ, review, { mode: 'allocate', comment: 'ok' });
    expect(r).toEqual({ kind: 'Succeeded', verifiedTotal: 1000, drawTurnedOn: false, creditsAdded: false });
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
    expect(deps.repo.saveIntent).toHaveBeenCalledWith('row-1', expect.objectContaining({ target: 1000, before: 1000, turnOnDraw: false }));
    expect(calls.indexOf('intent')).toBeLessThan(calls.indexOf('state:Succeeded'));
  });

  it('returns Superseded with no PUT when pay-as-you-go turned on before the save', async () => {
    const { deps, calls } = makeDeps({ totals: [1000], rules: [OFF] });
    const withPayg = { ...deps, credits: { ...deps.credits, getPaygStatus: vi.fn(async () => 'active' as const) } };
    expect(await runApproval(withPayg, REQ, offReview, turnOn)).toEqual({ kind: 'Superseded', reason: 'payg' });
    expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
    expect(calls).toContain('state:Superseded');
  });

  it.each([
    ['the maker did not ask for it', { ...offReview, requestedDraw: false }],
    ['it is already on', { ...offReview, rules: ON }],
  ])('refuses to turn on when %s', async (_name, r) => {
    const { deps } = makeDeps();
    expect((await runApproval(deps, REQ, r, turnOn)).kind).toBe('Invalid');
    expect(deps.repo.saveApprovalComment).not.toHaveBeenCalled();
  });

  it('logs the turn-on in the activity log', async () => {
    const { deps } = makeDeps({ totals: [1000], rules: [OFF, ON] });
    await runApproval(deps, REQ, offReview, turnOn);
    expect(deps.repo.appendAttemptAudit).toHaveBeenCalledWith(
      REQ, 'CreditAllocationAttempted', expect.objectContaining({ outcome: 'Succeeded', turnOnDraw: true }),
    );
  });

  it('approving without adding credits clears a leftover draw approval', async () => {
    const { deps } = makeDeps({ row: { drawApproved: true, state: 'FailedRetryable' } });
    expect((await runApproval(deps, REQ, { ...review, payg: 'active' }, skipInput)).kind).toBe('Skipped');
    expect(deps.repo.setChildState).toHaveBeenCalledWith('row-1', 'Skipped', expect.objectContaining({ drawApproved: false }));
  });

  it('refuses to turn on while pay-as-you-go is active, or with an unknown rule', async () => {
    const { deps } = makeDeps();
    expect((await runApproval(deps, REQ, { ...offReview, payg: 'active' }, turnOn)).kind).toBe('Invalid');
    const odd = { ...offReview, rules: [...OFF, { ruleType: 'Mystery', enabled: true }] };
    expect((await runApproval(deps, REQ, odd, turnOn)).kind).toBe('Invalid');
    expect(deps.repo.saveApprovalComment).not.toHaveBeenCalled();
  });

  it('a group lock fails retryable, flagged drawLocked, at the tenant draw step', async () => {
    const { deps, calls } = makeDeps({ totals: [1000], rules: [OFF] });
    deps.credits.setEnvironmentCredits.mockRejectedValueOnce({ kind: 'TenantPoolLocked', plainMessage: 'locked' });
    expect(await runApproval(deps, REQ, offReview, { ...turnOn, amount: 500 })).toMatchObject({
      kind: 'Failed', state: 'FailedRetryable', message: MSG_DRAW_LOCKED, drawLocked: true,
      details: { step: 'Turn on tenant draw' },
    });
    expect(calls).toContain('state:FailedRetryable');
  });

  describe('recovery', () => {
    const drawStuck = {
      state: 'UnknownOutcome' as const, attemptId: 'old', target: 1000, before: 1000, drawApproved: true, beforePool: false,
    };

    it.each([
      ['TenantPool on → Finished', ON, 'Finished'],
      ['TenantPool still off → SafeToRetry', OFF, 'SafeToRetry'],
    ])('%s', async (_name, rules, kind) => {
      const { deps } = makeDeps({ row: drawStuck, totals: [1000], rules: [rules] });
      expect((await runRecovery(deps, REQ)).kind).toBe(kind);
      expect(deps.credits.setEnvironmentCredits).not.toHaveBeenCalled();
    });

    it('fresh review treats a turn-on that landed with a different total as a conflict', async () => {
      const { deps } = makeDeps({ row: { ...drawStuck, target: 1500 }, totals: [1000], rules: [ON] });
      expect(await startFreshReview(deps, REQ)).toEqual({ kind: 'Reset' });
    });
  });

  it('saveIntent writes the tenant draw choice', async () => {
    const update = vi.mocked(Cat_policyrequestenvironmentsService.update);
    update.mockReset();
    update.mockResolvedValue({ success: true } as never);
    await saveIntent('row-1', { attemptId: 'a', target: 1000, before: 1000, rules: OFF, turnOnDraw: true });
    expect(update.mock.calls[0][1]).toMatchObject({ cat_credit_tenantdrawapproved: true, cat_credit_enf_tenantpool: 0 });
  });
});

describe('findOtherOpenRequest', () => {
  const envGetAll = vi.mocked(Cat_policyrequestenvironmentsService.getAll);
  const headerGetAll = vi.mocked(Cat_policyrequestsService.getAll);
  beforeEach(() => { envGetAll.mockReset(); headerGetAll.mockReset(); });

  function setup(status: number, childState: number) {
    envGetAll.mockResolvedValue({
      success: true, data: [{ _cat_policyrequestid_value: 'other', cat_credit_childstate: childState }],
    } as never);
    headerGetAll.mockResolvedValue({ success: true, data: [{ cat_policyrequestid: 'other', cat_status: status }] } as never);
  }

  it('ignores a closed request even if its row was left FailedRetryable', async () => {
    setup(7, 335350013);
    expect(await findOtherOpenRequest(ENV, REQ)).toBeUndefined();
  });

  it('counts an Implementing request whose row is still Processing', async () => {
    setup(8, 335350011);
    expect(await findOtherOpenRequest(ENV, REQ)).toBe('other');
  });

  it('counts an Under review request whatever its row state', async () => {
    setup(5, 335350012);
    expect(await findOtherOpenRequest(ENV, REQ)).toBe('other');
  });
});

describe('approveWithVerifiedTotal', () => {
  const get = vi.mocked(Cat_policyrequestsService.get);
  const update = vi.mocked(Cat_policyrequestsService.update);
  beforeEach(() => {
    get.mockReset(); update.mockReset();
    get.mockResolvedValue({ success: true, data: { cat_requesttype: REQUEST_TYPE_CREDITS, cat_status: 5 } } as never);
    update.mockResolvedValue({ success: true } as never);
  });

  it('writes the total as a number', async () => {
    await approveWithVerifiedTotal(REQ, 1500, 'aad-1');
    expect(update.mock.calls[0][1]).toMatchObject({ cat_credit_allocatedtotal: 1500 });
  });

  it('leaves the total out when it is below the column minimum of 1', async () => {
    await approveWithVerifiedTotal(REQ, 0, 'aad-1');
    expect(update.mock.calls[0][1]).not.toHaveProperty('cat_credit_allocatedtotal');
  });
});

describe('environment row writes send whole numbers', () => {
  const update = vi.mocked(Cat_policyrequestenvironmentsService.update);
  beforeEach(() => { update.mockReset(); update.mockResolvedValue({ success: true } as never); });

  it('saveIntent sends numbers, and null for a rule that does not exist', async () => {
    await saveIntent('row-1', {
      attemptId: 'att-1', target: 1500, before: 0, turnOnDraw: false,
      rules: [{ ruleType: 'TenantPool', enabled: true }, { ruleType: 'Alert', enabled: false }],
    });
    expect(update.mock.calls[0][1]).toMatchObject({
      cat_credit_absolutetarget: 1500,
      cat_credit_observedallocation: 0,
      cat_credit_approvedamount: 1500,
      cat_credit_enf_tenantpool: 1,
      cat_credit_enf_alert: 0,
      cat_credit_enf_deny: null,
      cat_credit_enf_paygo: null,
    });
  });

  it('setChildState sends the verified total as a number and clears an old error', async () => {
    await setChildState('row-1', 'Succeeded', { lastVerified: 1500 });
    expect(update.mock.calls[0][1]).toMatchObject({ cat_credit_lastverifiedallocation: 1500, cat_fulfillmenterror: null });
  });
});

describe('saveApprovalComment', () => {
  const get = vi.mocked(Cat_policyrequestsService.get);
  const update = vi.mocked(Cat_policyrequestsService.update);
  beforeEach(() => { get.mockReset(); update.mockReset(); update.mockResolvedValue({ success: true } as never); });

  it('saves the comment while the request is Under review', async () => {
    get.mockResolvedValue({ success: true, data: { cat_requesttype: REQUEST_TYPE_CREDITS, cat_status: 5 } } as never);
    expect(await saveApprovalComment(REQ, 'looks good')).toBe(true);
    expect(update).toHaveBeenCalledWith(REQ, { cat_admincomment: 'looks good' });
  });

  it('returns false and writes nothing when the request is no longer Under review', async () => {
    get.mockResolvedValue({ success: true, data: { cat_requesttype: REQUEST_TYPE_CREDITS, cat_status: 3 } } as never);
    expect(await saveApprovalComment(REQ, 'looks good')).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('reading values back', () => {
  it('parseAmount accepts numbers as well as text', () => {
    expect(parseAmount(1500)).toBe(1500);
    expect(parseAmount('1500')).toBe(1500);
  });

  it('cleanSystemMessage removes links and shortens long text', () => {
    expect(cleanSystemMessage(new Error('See  https://a.example/x  now'))).toBe('See [link removed] now');
    const long = cleanSystemMessage(new Error('x'.repeat(400)))!;
    expect(long).toBe(`${'x'.repeat(300)}…`);
  });
});

describe('creditsAddedFor (list "Credits" column)', () => {
  it('adds verified minus observed for finished environments', () => {
    expect(creditsAddedFor([{ creditChildState: 'Succeeded', observedAllocation: 1000, lastVerifiedAllocation: 1500 }])).toBe(500);
    expect(creditsAddedFor([{ creditChildState: 'Skipped' }])).toBe(0);
  });

  it('shows nothing when unfinished, unreadable or empty', () => {
    expect(creditsAddedFor([])).toBeUndefined();
    expect(creditsAddedFor([{ creditChildState: 'Processing', observedAllocation: 1, lastVerifiedAllocation: 2 }])).toBeUndefined();
    expect(creditsAddedFor([{ creditChildState: 'Succeeded', observedAllocation: 1000 }])).toBeUndefined();
  });
});

describe('appendAttemptAudit dedupe', () => {
  const getAll = vi.mocked(Cat_powershieldpolicyrequestlogsService.getAll);
  const create = vi.mocked(Cat_powershieldpolicyrequestlogsService.create);
  beforeEach(() => { getAll.mockReset(); create.mockReset(); });

  const entry = { attemptId: 'att-1', adminId: 'a', paygChoice: 'n/a' as const, outcome: 'Succeeded' as const };

  it('skips a second entry with the same attempt ID and outcome', async () => {
    getAll.mockResolvedValue({ success: true, data: [{ cat_message: JSON.stringify(entry) }] } as never);
    await appendAttemptAudit(REQ, 'CreditAllocationAttempted', entry);
    expect(create).not.toHaveBeenCalled();
  });

  it('writes when no matching entry exists', async () => {
    getAll.mockResolvedValue({ success: true, data: [] } as never);
    create.mockResolvedValue({ success: true } as never);
    await appendAttemptAudit(REQ, 'CreditAllocationAttempted', entry);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('creditsRequestedFor (list "Credits requested" column)', () => {
  it('sums the amounts the maker asked for', () => {
    expect(creditsRequestedFor([{ requestedAmount: 2000 }, { requestedAmount: 500 }])).toBe(2500);
  });
  it('is undefined when no environment has an amount', () => {
    expect(creditsRequestedFor([])).toBeUndefined();
    expect(creditsRequestedFor([{}, {}])).toBeUndefined();
  });
  it('sums only the amounts that exist, since draw-only rows have none (spec 032)', () => {
    expect(creditsRequestedFor([{ requestedAmount: 2000 }, {}])).toBe(2000);
  });
});