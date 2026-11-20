import { describe, it, expect } from 'vitest';
import {
  buildRetryPlan,
  categorizeFailure,
  retryEnvironmentIds,
} from '../features/credits/services/creditRetryPlanning';
import type { CreditEnvironmentView } from '../models/creditRequest';
import type { CreditChildState } from '../models/status';

function env(
  id: string,
  creditChildState: CreditChildState,
  partial: Partial<CreditEnvironmentView> = {},
): CreditEnvironmentView {
  return {
    id,
    environmentGuid: `guid-${id}`,
    environmentName: `Env ${id}`,
    creditChildState,
    ...partial,
  };
}

describe('buildRetryPlan — retry eligibility (FR-025)', () => {
  it('treats only FailedRetryable and UnknownOutcome as candidates', () => {
    const plan = buildRetryPlan([
      env('a', 'FailedRetryable'),
      env('b', 'UnknownOutcome'),
      env('c', 'Succeeded'),
      env('d', 'Pending'),
      env('e', 'Processing'),
      env('h', 'FailedPermanent'),
    ]);

    expect(plan.candidateCount).toBe(2);
    expect(plan.candidates.map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(plan.failedRetryable.map((e) => e.id)).toEqual(['a']);
    expect(plan.unknownToReconcile.map((e) => e.id)).toEqual(['b']);
  });

  it('never re-queues a Succeeded environment', () => {
    const plan = buildRetryPlan([env('a', 'Succeeded'), env('b', 'Succeeded')]);
    expect(plan.candidateCount).toBe(0);
    expect(plan.candidates).toHaveLength(0);
  });

  it('surfaces FailedPermanent separately and never as a candidate', () => {
    const plan = buildRetryPlan([env('a', 'FailedPermanent'), env('b', 'FailedRetryable')]);
    expect(plan.permanent.map((e) => e.id)).toEqual(['a']);
    expect(plan.candidates.map((e) => e.id)).toEqual(['b']);
  });

  it('counts a Processing row as stale attention unless this tab owns the attempt', () => {
    const rows = [
      env('a', 'Processing', { attemptId: 'att-1' }),
      env('b', 'FailedRetryable'),
      env('c', 'FailedPermanent'),
    ];
    const plan = buildRetryPlan(rows);
    expect(plan.stale.map((e) => e.id)).toEqual(['a']);
    expect(plan.attentionCount).toBe(3);

    const owned = buildRetryPlan(rows, new Set(['att-1']));
    expect(owned.stale).toHaveLength(0);
    expect(owned.attentionCount).toBe(2);
  });

  it('returns an empty plan for no environments', () => {
    const plan = buildRetryPlan([]);
    expect(plan.candidateCount).toBe(0);
    expect(plan.grouped).toHaveLength(0);
    expect(plan.permanent).toHaveLength(0);
  });
});

describe('categorizeFailure', () => {
  it('buckets by keyword and falls back to Other', () => {
    expect(categorizeFailure('401 Unauthorized token expired')).toBe('Authentication');
    expect(categorizeFailure('Quota exceeded for tenant')).toBe('Capacity');
    expect(categorizeFailure('Service unavailable (503) gateway timeout')).toBe('Service outage');
    expect(categorizeFailure('Something unusual happened')).toBe('Other');
    expect(categorizeFailure(undefined)).toBe('Other');
    expect(categorizeFailure('   ')).toBe('Other');
  });
});

describe('buildRetryPlan — grouping and dedupe', () => {
  it('collapses environments that share a category and identical message', () => {
    const plan = buildRetryPlan([
      env('a', 'FailedRetryable', { fulfillmentError: 'Allocation service timeout' }),
      env('b', 'FailedRetryable', { fulfillmentError: 'allocation service timeout ' }),
      env('c', 'FailedRetryable', { fulfillmentError: '401 Unauthorized' }),
    ]);

    // Two service-outage envs collapse into one group; auth is its own group.
    const outage = plan.grouped.find((g) => g.category === 'Service outage');
    const auth = plan.grouped.find((g) => g.category === 'Authentication');
    expect(outage?.environments.map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(auth?.environments.map((e) => e.id)).toEqual(['c']);
    expect(plan.grouped).toHaveLength(2);
  });

  it('keeps every candidate represented across the groups', () => {
    const plan = buildRetryPlan([
      env('a', 'FailedRetryable', { fulfillmentError: 'x' }),
      env('b', 'UnknownOutcome', { fulfillmentError: 'y' }),
    ]);
    const grouped = plan.grouped.flatMap((g) => g.environments.map((e) => e.id)).sort();
    expect(grouped).toEqual(['a', 'b']);
  });
});

describe('retryEnvironmentIds', () => {
  it('returns candidate environment GUIDs only, dropping empties', () => {
    const plan = buildRetryPlan([
      env('a', 'FailedRetryable'),
      env('b', 'UnknownOutcome'),
      env('c', 'Succeeded'),
      env('d', 'FailedRetryable', { environmentGuid: '' }),
    ]);
    expect(retryEnvironmentIds(plan)).toEqual(['guid-a', 'guid-b']);
  });
});
