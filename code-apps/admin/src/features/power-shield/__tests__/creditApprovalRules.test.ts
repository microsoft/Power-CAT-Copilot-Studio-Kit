import { describe, it, expect } from 'vitest';
import {
  getApprovalBlocks,
  getAllocateBlocks,
  getAddRange,
  getWarnings,
  validateAmount,
  derivePaygStatus,
  derivePaygPolicyName,
  encodeRuleSnapshot,
  rulesUnchanged,
  hasDrifted,
  stateForError,
  decideRecovery,
  needsRecovery,
  prefillAmount,
  getApproveAvailability,
  tenantDrawState,
  withTenantPoolOn,
  canTurnOnDraw,
  isVerified,
  type AllocationRule,
  type CapacityFacts,
  type ReviewSnapshot,
} from '../features/credits/services/creditApprovalRules';

const ENV = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function snap(over: Partial<ReviewSnapshot> = {}): ReviewSnapshot {
  return {
    envId: ENV,
    current: 1000,
    available: 5000,
    rules: [
      { ruleType: 'Alert', enabled: true },
      { ruleType: 'TenantPool', enabled: true },
    ],
    payg: 'none',
    headerOk: true,
    rowState: 'Pending',
    ...over,
  };
}

describe('getApprovalBlocks (FR-011)', () => {
  it('returns nothing when the admin can decide', () => {
    expect(getApprovalBlocks(snap())).toEqual([]);
  });
  it('blocks when not assignee or not Under review', () => {
    expect(getApprovalBlocks(snap({ headerOk: false }))).toEqual(['NotAssigneeOrNotUnderReview']);
  });
  it('blocks when another request is open for the environment', () => {
    expect(getApprovalBlocks(snap({ otherOpenRequestId: 'r2' }))).toEqual(['OtherOpenRequest']);
  });
  it('blocks when a read failed', () => {
    expect(getApprovalBlocks(null)).toEqual(['ReadFailed']);
  });
});

describe('getAllocateBlocks (FR-012)', () => {
  it('blocks an unknown rule type such as Throttle', () => {
    const s = snap({ rules: [{ ruleType: 'Alert', enabled: true }, { ruleType: 'Throttle', enabled: true }] });
    expect(getAllocateBlocks(s)).toEqual(['UnknownRule']);
  });
  it('blocks when there are no rules', () => {
    expect(getAllocateBlocks(snap({ rules: [] }))).toEqual(['NoRules']);
  });
  it.each([
    [0, 300, true],
    [400, 100, false],
    [1000, 300, false],
    [0, 800, false],
    [400, 300, false],
    [100, 0, true],
  ])('current %i, available %i → blocked %s', (current, available, blocked) => {
    expect(getAllocateBlocks(snap({ current, available })).includes('NoValidTotal')).toBe(blocked);
  });
});

describe('getAddRange (spec 025 FR-007)', () => {
  it.each([
    [0, 800, 500, 800],
    [200, 8000, 300, 8000],
    [1000, 300, 1, 300],
  ])('current %i, available %i → %i..%i, and Approve agrees at both ends', (current, available, min, max) => {
    expect(getAddRange(snap({ current, available }))).toEqual({ kind: 'range', min, max });
    expect(validateAmount(String(min), current, available).ok).toBe(true);
    expect(validateAmount(String(max), current, available).ok).toBe(true);
    expect(validateAmount(String(max + 1), current, available).ok).toBe(false);
    if (min > 1) expect(validateAmount(String(min - 1), current, available).ok).toBe(false);
  });
  it('returns the same blocks as Approve when no amount would work', () => {
    expect(getAddRange(snap({ current: 0, available: 300 }))).toEqual({ kind: 'blocked', blocks: ['NoValidTotal'] });
    expect(getAddRange(snap({ rules: [] }))).toEqual({ kind: 'blocked', blocks: ['NoRules'] });
  });
});

describe('getWarnings (FR-013)', () => {
  it('warns on linked-but-inactive PAYG, but not for an environment group', () => {
    expect(getWarnings(snap({ payg: 'linkedInactive', group: { id: 'g1', name: 'ALM' } }))).toEqual([
      'PaygLinkedInactive',
    ]);
  });
  it('does not warn for active PAYG or none', () => {
    expect(getWarnings(snap({ payg: 'active' }))).toEqual([]);
    expect(getWarnings(snap())).toEqual([]);
  });
});

describe('validateAmount (FR-007)', () => {
  it.each(['0', '-5', '1.5', 'abc', ''])('rejects %j', (raw) => {
    expect(validateAmount(raw, 1000, 5000).ok).toBe(false);
  });
  it('rejects a new total under 500', () => {
    expect(validateAmount('499', 0, 5000).ok).toBe(false);
  });
  it('rejects more than the pool', () => {
    expect(validateAmount('5001', 1000, 5000).ok).toBe(false);
  });
  it('accepts a valid amount and returns the new total', () => {
    expect(validateAmount('500', 1000, 5000)).toEqual({ ok: true, value: 500, newTotal: 1500 });
  });
  it.each([
    [400, 100, '100', 500],
    [1000, 300, '300', 1300],
    [0, 800, '500', 500],
  ])('boundary current %i, available %i, amount %s → total %i', (current, available, raw, total) => {
    expect(validateAmount(raw, current, available)).toMatchObject({ ok: true, newTotal: total });
  });
});

describe('derivePaygStatus (FR-014)', () => {
  const policy = (over: Record<string, unknown> = {}) => ({
    status: 'Enabled',
    environmentIds: [ENV.toUpperCase()],
    payGoEntitlements: [{ entitlementId: 'MCSMessages', payAsYouGoState: true }],
    ...over,
  });
  it('is active when an Enabled policy has MCSMessages PAYG on', () => {
    expect(derivePaygStatus([policy()], ENV)).toBe('active');
  });
  it('is none when the environment is not listed', () => {
    expect(derivePaygStatus([policy({ environmentIds: ['other'] })], ENV)).toBe('none');
    expect(derivePaygStatus([null, 'x', {}], ENV)).toBe('none');
  });
  it('is linkedInactive when the policy is Disabled', () => {
    expect(derivePaygStatus([policy({ status: 'Disabled' })], ENV)).toBe('linkedInactive');
  });
  it('is linkedInactive when the MCSMessages flag is false', () => {
    const p = policy({ payGoEntitlements: [{ entitlementId: 'MCSMessages', payAsYouGoState: false }] });
    expect(derivePaygStatus([p], ENV)).toBe('linkedInactive');
  });
  it('names the active policy, and nothing when PAYG is inactive', () => {
    const off = policy({ name: 'Off', status: 'Disabled' });
    expect(derivePaygPolicyName([off, policy({ name: 'CAT-Tools-PAYG' })], ENV)).toBe('CAT-Tools-PAYG');
    expect(derivePaygPolicyName([off], ENV)).toBeUndefined();
  });
});

// T026: one case per prototype scenario in specs/024-credits-auto-allocation/context/design (guardrail excluded).
describe('prototype scenarios (US2)', () => {
  const proto = (over: Partial<ReviewSnapshot> = {}) => snap({ current: 0, available: 169153, ...over });
  it.each<[string, Partial<ReviewSnapshot>, string[], string[], string[]]>([
    ['1 healthy', {}, [], [], []],
    ['2 payg active', { payg: 'active', paygPolicyName: 'CAT-Tools-PAYG' }, [], [], []],
    ['3 payg linked but off', { payg: 'linkedInactive' }, [], [], ['PaygLinkedInactive']],
    ['4 pool under 500', { available: 320 }, [], ['NoValidTotal'], []],
    ['5 allocation fully used', { current: 1000 }, [], [], []],
    ['6 environment group', { group: { id: 'g1' } }, [], [], []],
    [
      '7 unknown rule',
      { rules: [{ ruleType: 'TenantPool', enabled: true }, { ruleType: 'Throttle', enabled: true }] },
      [],
      ['UnknownRule'],
      [],
    ],
    ['8 already decided', { headerOk: false }, ['NotAssigneeOrNotUnderReview'], [], []],
    ['10 changed after review (review is healthy)', {}, [], [], []],
    ['11 write timed out (review is healthy)', {}, [], [], []],
    ['12 request update failed (review is healthy)', {}, [], [], []],
  ])('%s', (_, over, blocks, allocateBlocks, warnings) => {
    const s = proto(over);
    expect(getApprovalBlocks(s)).toEqual(blocks);
    expect(getAllocateBlocks(s)).toEqual(allocateBlocks);
    expect(getWarnings(s)).toEqual(warnings);
  });
});

describe('rule snapshot (FR-015)', () => {
  it('keeps absent and disabled distinct', () => {
    const a = encodeRuleSnapshot([{ ruleType: 'Alert', enabled: true }]);
    const b = encodeRuleSnapshot([{ ruleType: 'Alert', enabled: true }, { ruleType: 'Deny', enabled: false }]);
    expect(a.Deny).toBe('absent');
    expect(b.Deny).toBe('disabled');
    expect(rulesUnchanged(a, b)).toBe(false);
    expect(rulesUnchanged(a, encodeRuleSnapshot([{ ruleType: 'Alert', enabled: true }]))).toBe(true);
  });
});

describe('hasDrifted (FR-016)', () => {
  it('is false for an identical re-read (rule order ignored)', () => {
    const review = snap();
    expect(hasDrifted(review, snap({ rules: [...review.rules].reverse() }))).toBe(false);
  });
  it('ignores rulesDefaulted when the effective rules match', () => {
    expect(hasDrifted(snap({ rulesDefaulted: true }), snap({ rulesDefaulted: false }))).toBe(false);
  });
  it.each<[string, Partial<ReviewSnapshot>]>([
    ['header', { headerOk: false }],
    ['row state', { rowState: 'Processing' }],
    ['attempt id', { rowAttemptId: 'other' }],
    ['other open request', { otherOpenRequestId: 'r2' }],
    ['current total', { current: 1001 }],
    ['rules', { rules: [{ ruleType: 'Alert', enabled: false }] }],
  ])('detects a %s change', (_label, over) => {
    expect(hasDrifted(snap(), snap(over))).toBe(true);
  });
});

describe('stateForError (FR-019)', () => {
  it('maps known failures', () => {
    expect(stateForError('Permission', true)).toBe('FailedRetryable');
    expect(stateForError('Throttled', true)).toBe('FailedRetryable');
    expect(stateForError('TenantPoolLocked', true)).toBe('FailedRetryable');
    expect(stateForError('InvalidAllocation', true)).toBe('FailedPermanent');
  });
  it('treats timeout/unknown as UnknownOutcome only if the PUT may have run', () => {
    expect(stateForError('Timeout', true)).toBe('UnknownOutcome');
    expect(stateForError('Unknown', true)).toBe('UnknownOutcome');
    expect(stateForError('Timeout', false)).toBe('FailedRetryable');
  });
});

describe('decideRecovery (FR-020)', () => {
  it('takes each path', () => {
    expect(decideRecovery(1500, 1500, 1000)).toBe('finish');
    expect(decideRecovery(1000, 1500, 1000)).toBe('safeToRetry');
    expect(decideRecovery(1200, 1500, 1000)).toBe('conflict');
  });

  it('spec 032: checks TenantPool only when the attempt meant to turn it on', () => {
    const draw = (livePool: boolean, beforePool: boolean | null = false) => ({ intended: true, livePool, beforePool });
    expect(decideRecovery(1000, 1000, 1000, draw(true))).toBe('finish');
    expect(decideRecovery(1000, 1000, 1000, draw(false))).toBe('safeToRetry');
    expect(decideRecovery(1500, 1500, 1000, draw(false))).toBe('conflict');
    expect(decideRecovery(1000, 1500, 1000, draw(true))).toBe('conflict');
    expect(decideRecovery(1500, 1500, 1000, { intended: false, livePool: false, beforePool: true })).toBe('finish');
  });
});

describe('tenant draw rules (spec 032)', () => {
  const OFF = [{ ruleType: 'Alert', enabled: true, ruleData: { x: 1 } }, { ruleType: 'TenantPool', enabled: false }];

  it('tenantDrawState reads default, on and off', () => {
    expect(tenantDrawState([], true)).toBe('onDefault');
    expect(tenantDrawState([{ ruleType: 'TenantPool', enabled: true }])).toBe('on');
    expect(tenantDrawState(OFF)).toBe('off');
    expect(tenantDrawState([{ ruleType: 'Alert', enabled: true }])).toBe('off');
  });

  it('withTenantPoolOn keeps every rule whole and only turns TenantPool on', () => {
    expect(withTenantPoolOn(OFF)).toEqual([OFF[0], { ruleType: 'TenantPool', enabled: true }]);
    expect(withTenantPoolOn([])).toEqual([{ ruleType: 'TenantPool', enabled: true }]);
    expect(OFF[1].enabled).toBe(false);
  });

  it('canTurnOnDraw needs the ask, an off setting and no active pay-as-you-go', () => {
    expect(canTurnOnDraw(true, 'off', 'none')).toBe(true);
    expect(canTurnOnDraw(false, 'off', 'none')).toBe(false);
    expect(canTurnOnDraw(true, 'onDefault', 'none')).toBe(false);
    expect(canTurnOnDraw(true, 'off', 'active')).toBe(false);
  });

  it('isVerified checks TenantPool only when turning on', () => {
    expect(isVerified({ allocated: 1000, rules: OFF }, 1000, false)).toBe(true);
    expect(isVerified({ allocated: 1000, rules: OFF }, 1000, true)).toBe(false);
    expect(isVerified({ allocated: 900, rules: withTenantPoolOn(OFF) }, 1000, true)).toBe(false);
  });

  it('getApproveAvailability lets a draw-only request through with no spare credits', () => {
    const facts: CapacityFacts = {
      env: { ok: true, value: { allocated: 0, rules: OFF } },
      spare: { ok: true, value: 0 },
      payg: { ok: true, value: { status: 'none' } },
    };
    expect(getApproveAvailability(facts, false)).toEqual({ kind: 'ok', via: 'allocate' });
    expect(getApproveAvailability(facts).kind).toBe('blocked');
  });

  it('getApproveAvailability blocks a draw-only request that would change nothing', () => {
    const facts = (rules: AllocationRule[], status: 'none' | 'active', rulesDefaulted?: boolean): CapacityFacts => ({
      env: { ok: true, value: { allocated: 0, rules, rulesDefaulted } },
      spare: { ok: true, value: 0 },
      payg: { ok: true, value: { status } },
    });
    const ON = [{ ruleType: 'TenantPool', enabled: true }];
    expect(getApproveAvailability(facts(ON, 'none'), false)).toEqual({ kind: 'blocked', blocks: ['DrawAlreadyOn'] });
    expect(getApproveAvailability(facts([], 'none', true), false)).toEqual({ kind: 'blocked', blocks: ['DrawAlreadyOn'] });
    expect(getApproveAvailability(facts(OFF, 'active'), false)).toEqual({ kind: 'blocked', blocks: ['PaygCoversDraw'] });
    expect(getApproveAvailability({ ...facts(OFF, 'none'), env: { ok: false } }, false)).toEqual({ kind: 'unknown' });
  });
});

describe('needsRecovery (FR-020a)', () => {
  const session = new Set(['mine']);
  it('flags UnknownOutcome', () => {
    expect(needsRecovery('UnknownOutcome', 'mine', session)).toBe(true);
  });
  it('flags Processing only when the attempt is not in this tab', () => {
    expect(needsRecovery('Processing', 'other', session)).toBe(true);
    expect(needsRecovery('Processing', undefined, session)).toBe(true);
    expect(needsRecovery('Processing', 'mine', session)).toBe(false);
  });
  it('ignores Succeeded', () => {
    expect(needsRecovery('Succeeded', 'other', session)).toBe(false);
  });
});

describe('prefillAmount (spec 027)', () => {
  it('fills the requested amount when it fits', () => {
    expect(prefillAmount(snap({ requested: 2000 }))).toBe('2000');
  });
  it('caps at the spare credits', () => {
    expect(prefillAmount(snap({ requested: 8000, available: 5000 }))).toBe('5000');
  });
  it('leaves the box empty when nothing was requested or the capped value is invalid', () => {
    expect(prefillAmount(snap())).toBe('');
    expect(prefillAmount(snap({ current: 0, requested: 300 }))).toBe('');
  });
  it('leaves the box empty when adding credits is blocked', () => {
    expect(prefillAmount(snap({ requested: 2000, rules: [] }))).toBe('');
  });
});

describe('getApproveAvailability (spec 030)', () => {
  const RULES = [{ ruleType: 'TenantPool', enabled: true }];
  const FAIL = { ok: false } as const;
  const facts = (spare: number, payg: CapacityFacts['payg'] = { ok: true, value: { status: 'none' } }): CapacityFacts => ({
    env: { ok: true, value: { allocated: 0, rules: RULES } },
    spare: { ok: true, value: spare },
    payg,
  });
  const ACTIVE = { ok: true, value: { status: 'active' } } as const;

  it('is checking while the check runs', () => {
    expect(getApproveAvailability(null)).toEqual({ kind: 'checking' });
  });
  it('allows adding credits when enough are spare', () => {
    expect(getApproveAvailability(facts(5000))).toEqual({ kind: 'ok', via: 'allocate' });
  });
  it('is blocked when the tenant has too few spare credits and no pay-as-you-go', () => {
    expect(getApproveAvailability(facts(0))).toEqual({ kind: 'blocked', blocks: ['NoValidTotal'] });
  });
  it('allows pay-as-you-go approval when credits are short', () => {
    expect(getApproveAvailability(facts(0, ACTIVE))).toEqual({ kind: 'ok', via: 'payg' });
  });
  it('is unknown when credits are short and the billing policy read failed', () => {
    expect(getApproveAvailability(facts(0, FAIL))).toEqual({ kind: 'unknown' });
  });
  it('is unknown when the environment or spare read failed, unless pay-as-you-go is on', () => {
    expect(getApproveAvailability({ ...facts(5000), env: FAIL })).toEqual({ kind: 'unknown' });
    expect(getApproveAvailability({ ...facts(5000), spare: FAIL })).toEqual({ kind: 'unknown' });
    expect(getApproveAvailability({ ...facts(5000, ACTIVE), env: FAIL })).toEqual({ kind: 'ok', via: 'payg' });
  });
});