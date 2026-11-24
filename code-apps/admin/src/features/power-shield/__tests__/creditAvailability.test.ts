import { describe, it, expect } from 'vitest';
import { computeNetImpact } from '../models/creditRequest';
import type { CreditNetImpactInput } from '../models/creditRequest';

function env(partial: Partial<CreditNetImpactInput> & { environmentId?: string }): CreditNetImpactInput {
  return {
    observedCurrent: 0,
    approvedAmount: 0,
    ...partial,
  };
}

describe('credit availability net-impact math', () => {
  it('sums max(target - current, 0), NOT the sum of absolute targets', () => {
    // Env A: current 10000, add 5000 -> target 15000, impact 5000
    // Env B: current 7000,  add 0    -> target 7000,  impact 0
    const environments = [
      env({ environmentId: 'a', observedCurrent: 10000, approvedAmount: 5000 }),
      env({ environmentId: 'b', observedCurrent: 7000, approvedAmount: 0 }),
    ];
    // Sum of absolute targets would be 22000 — the wrong number.
    expect(computeNetImpact(environments)).toBe(5000);
  });

  it('treats a missing observedCurrent as 0 (target = approved add)', () => {
    const environments = [env({ environmentId: 'a', observedCurrent: undefined, approvedAmount: 3000 })];
    expect(computeNetImpact(environments)).toBe(3000);
  });

  it('never contributes a negative impact when the target is below current', () => {
    const environments = [env({ environmentId: 'a', observedCurrent: 9000, approvedAmount: 0 })];
    expect(computeNetImpact(environments)).toBe(0);
  });
});
