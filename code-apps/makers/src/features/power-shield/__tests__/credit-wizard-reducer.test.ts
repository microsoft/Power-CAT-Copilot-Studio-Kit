import { describe, it, expect } from 'vitest';

// Spec 026 (T008/T020) — requested amounts and retry in the credit wizard reducer.
// The reducer is pure, so no generated service needs mocking here.

import { creditWizardReducer } from '../features/credits/wizard/contexts/CreditWizardContext';
import {
  CREDIT_WIZARD_INITIAL_STATE,
  canRetryFailed,
  getSubmissionBlockedReason,
  type CreditWizardState,
} from '../features/credits/wizard/contexts/creditWizardTypes';

const A = { environmentId: 'env-a', displayName: 'Alpha' };
const B = { environmentId: 'env-b', displayName: 'Bravo' };

const base: CreditWizardState = {
  ...CREDIT_WIZARD_INITIAL_STATE,
  selectedEnvironments: [A, B],
  envConfirmation: 'confirmed',
  justification: 'Pilot.',
  requestedAmounts: { 'env-a': '1000', 'env-b': '2000' },
};

describe('spec 026 reducer — requested amounts', () => {
  it('SET_REQUESTED_AMOUNT stores the raw text for that environment only', () => {
    const next = creditWizardReducer(base, {
      type: 'SET_REQUESTED_AMOUNT',
      payload: { environmentId: 'env-a', raw: '1,500' },
    });
    expect(next.requestedAmounts).toEqual({ 'env-a': '1,500', 'env-b': '2000' });
  });

  it('SET_ENVIRONMENTS keeps amounts for environments still selected and drops the rest', () => {
    const next = creditWizardReducer(base, { type: 'SET_ENVIRONMENTS', payload: [B] });
    expect(next.requestedAmounts).toEqual({ 'env-b': '2000' });
  });

  it('does not block submit for a missing Service Tree (spec 028)', () => {
    const state: CreditWizardState = { ...CREDIT_WIZARD_INITIAL_STATE, ...base };
    expect('serviceTreeId' in state).toBe(false);
    expect(getSubmissionBlockedReason(state, false)).toBeNull();
  });

  it('SET_ENVIRONMENTS clears resumed-draft warnings (spec 028 FR-013)', () => {
    const resumed: CreditWizardState = {
      ...base,
      envDiff: { removed: [B] },
      draftRevalidation: 'invalidAccess',
      envConfirmation: 'diffPending',
    };
    const next = creditWizardReducer(resumed, { type: 'SET_ENVIRONMENTS', payload: [A] });
    expect(next.envDiff).toBeNull();
    expect(next.draftRevalidation).toBe('unchanged');
    expect(next.envConfirmation).toBe('unconfirmed');
    expect(getSubmissionBlockedReason(next, false)).not.toBe('invalidDraftAccess');
  });

  it('ACKNOWLEDGE_ENV_DIFF drops amounts for removed environments', () => {
    const withDiff: CreditWizardState = {
      ...base,
      envDiff: { removed: [B] },
      envConfirmation: 'diffPending',
    };
    const next = creditWizardReducer(withDiff, { type: 'ACKNOWLEDGE_ENV_DIFF' });
    expect(next.requestedAmounts).toEqual({ 'env-a': '1000' });
  });

  it.each([
    ['empty', ''],
    ['below the minimum', '499'],
    ['a decimal', '500.5'],
    ['not a number', 'abc'],
  ])('blocks submit with invalidRows when an amount is %s', (_label, raw) => {
    const state: CreditWizardState = { ...base, requestedAmounts: { 'env-a': raw, 'env-b': '2000' } };
    expect(getSubmissionBlockedReason(state, false)).toBe('invalidRows');
  });

  it('checks rows before the justification', () => {
    const state: CreditWizardState = { ...base, justification: '', requestedAmounts: {} };
    expect(getSubmissionBlockedReason(state, false)).toBe('invalidRows');
  });

  it('allows submit when every environment has a valid amount', () => {
    expect(getSubmissionBlockedReason(base, false)).toBeNull();
  });
});

describe('spec 031 reducer — tenant draw', () => {
  it('a tick alone makes a blank row valid', () => {
    const state: CreditWizardState = {
      ...base,
      requestedAmounts: { 'env-b': '2000' },
      requestTenantDraw: { 'env-a': true },
    };
    expect(getSubmissionBlockedReason(state, false)).toBeNull();
  });

  it('a tick does not excuse a bad amount', () => {
    const state: CreditWizardState = {
      ...base,
      requestedAmounts: { 'env-a': '499', 'env-b': '2000' },
      requestTenantDraw: { 'env-a': true },
    };
    expect(getSubmissionBlockedReason(state, false)).toBe('invalidRows');
  });

  it('SET_TENANT_DRAW stores only true and removes the key on untick', () => {
    const on = creditWizardReducer(base, {
      type: 'SET_TENANT_DRAW',
      payload: { environmentId: 'env-a', value: true },
    });
    expect(on.requestTenantDraw).toEqual({ 'env-a': true });
    const off = creditWizardReducer(on, {
      type: 'SET_TENANT_DRAW',
      payload: { environmentId: 'env-a', value: false },
    });
    expect(off.requestTenantDraw).toEqual({});
  });

  it('SET_ENVIRONMENTS drops ticks for environments no longer selected', () => {
    const state: CreditWizardState = { ...base, requestTenantDraw: { 'env-a': true, 'env-b': true } };
    const next = creditWizardReducer(state, { type: 'SET_ENVIRONMENTS', payload: [B] });
    expect(next.requestTenantDraw).toEqual({ 'env-b': true });
  });
});

describe('spec 026 reducer — retry failed (FR-016)', () => {
  const partial: CreditWizardState = {
    ...base,
    submitPhase: 'completed',
    submitOutcomes: [
      { environmentGuid: 'env-a', status: 'created', requestId: 'r1' },
      { environmentGuid: 'env-b', status: 'failed', error: 'network' },
    ],
  };

  it('keeps Submit locked after a partial success but allows Retry', () => {
    expect(getSubmissionBlockedReason(partial, false)).toBe('alreadySubmitted');
    expect(canRetryFailed(partial, false)).toBe(true);
    expect(canRetryFailed(partial, true)).toBe(false);
  });

  it('RETRY_START keeps earlier outcomes, and blocks a second retry while running', () => {
    const running = creditWizardReducer(partial, { type: 'RETRY_START' });
    expect(running.submitPhase).toBe('submitting');
    expect(running.submitOutcomes).toEqual(partial.submitOutcomes);
    expect(canRetryFailed(running, false)).toBe(false);
  });

  it('RETRY_COMPLETE merges the retried outcome in place', () => {
    const running = creditWizardReducer(partial, { type: 'RETRY_START' });
    const done = creditWizardReducer(running, {
      type: 'RETRY_COMPLETE',
      payload: [{ environmentGuid: 'env-b', status: 'created', requestId: 'r2' }],
    });
    expect(done.submitPhase).toBe('completed');
    expect(done.submitOutcomes.map((o) => [o.environmentGuid, o.status])).toEqual([
      ['env-a', 'created'],
      ['env-b', 'created'],
    ]);
    expect(canRetryFailed(done, false)).toBe(false);
  });

  it('RETRY_COMPLETE with an empty payload keeps every earlier outcome', () => {
    const running = creditWizardReducer(partial, { type: 'RETRY_START' });
    const done = creditWizardReducer(running, { type: 'RETRY_COMPLETE', payload: [] });
    expect(done.submitOutcomes).toEqual(partial.submitOutcomes);
    expect(done.submitPhase).toBe('completed');
  });
});
