import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../generated/services/PowerPlatformforAdminsV2Service', () => ({
  PowerPlatformforAdminsV2Service: { GetAllocationsByEnvironment: vi.fn() },
}));

import { PowerPlatformforAdminsV2Service } from '../../../generated/services/PowerPlatformforAdminsV2Service';
import { getEnvironmentCredits } from '../features/credits/services/creditAllocationService';
import { getAllocateBlocks, type ReviewSnapshot } from '../features/credits/services/creditApprovalRules';

const read = vi.mocked(PowerPlatformforAdminsV2Service.GetAllocationsByEnvironment);

function respond(currencyAllocations: unknown[]) {
  read.mockResolvedValue({ success: true, data: { currencyAllocations } } as never);
}

function blocksFor(rules: ReviewSnapshot['rules']) {
  return getAllocateBlocks({
    envId: 'e', current: 0, available: 5000, rules, payg: 'none',
    headerOk: true, rowState: 'Pending', rowAttemptId: undefined,
  });
}

describe('getEnvironmentCredits — missing credits entry', () => {
  beforeEach(() => read.mockReset());

  it('uses the PPAC default (spare credits on) when the environment has no credits entry', async () => {
    respond([{ currencyType: 'SomethingElse', allocated: 9 }]);
    const r = await getEnvironmentCredits('e');
    expect(r).toEqual({ allocated: 0, rules: [{ ruleType: 'TenantPool', enabled: true }], rulesDefaulted: true });
    expect(blocksFor(r.rules)).toEqual([]);
  });

  it('keeps an entry with an empty rule list as-is, so it stays blocked', async () => {
    respond([{ currencyType: 'MCSMessages', allocated: 600, enforcementRules: [] }]);
    const r = await getEnvironmentCredits('e');
    expect(r).toEqual({ allocated: 600, rules: [], rulesDefaulted: false });
    expect(blocksFor(r.rules)).toEqual(['NoRules']);
  });

  it('returns the rules as read when the entry has them', async () => {
    respond([{ currencyType: 'MCSMessages', allocated: 600, enforcementRules: [{ ruleType: 'TenantPool', enabled: false }] }]);
    expect(await getEnvironmentCredits('e')).toEqual({
      allocated: 600, rules: [{ ruleType: 'TenantPool', enabled: false }], rulesDefaulted: false,
    });
  });
});
