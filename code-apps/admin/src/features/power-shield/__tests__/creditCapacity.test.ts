import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../generated/services/PowerPlatformforAdminsV2Service', () => ({
  PowerPlatformforAdminsV2Service: {
    GetAllocationsByEnvironment: vi.fn(),
    GetAllocationsAvailabilityV2: vi.fn(),
    ListBillingPolicies: vi.fn(),
  },
}));

import { PowerPlatformforAdminsV2Service as Svc } from '../../../generated/services/PowerPlatformforAdminsV2Service';
import { createLatestLoader, loadCreditSnapshot } from '../features/credits/services/creditCapacity';

const envRead = vi.mocked(Svc.GetAllocationsByEnvironment);
const spareRead = vi.mocked(Svc.GetAllocationsAvailabilityV2);
const paygRead = vi.mocked(Svc.ListBillingPolicies);

const ok = (data: unknown) => ({ success: true, data }) as never;
const fail = (status: number) => ({ success: false, data: undefined, error: { status } }) as never;

function allSucceed() {
  envRead.mockResolvedValue(
    ok({ currencyAllocations: [{ currencyType: 'MCSMessages', allocated: 600, enforcementRules: [{ ruleType: 'TenantPool', enabled: true }] }] }),
  );
  spareRead.mockResolvedValue(ok({ entitlementAllocationsAvailable: [{ entitlementId: 'MCSMessages', availableQuantity: 8000 }] }));
  paygRead.mockResolvedValue(ok({ value: [] }));
}

describe('loadCreditSnapshot (spec 025)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    allSucceed();
  });

  it('returns all three parts when every read works', async () => {
    const s = await loadCreditSnapshot('e');
    expect(s.env).toEqual({ ok: true, value: { allocated: 600, rules: [{ ruleType: 'TenantPool', enabled: true }], rulesDefaulted: false } });
    expect(s.spare).toEqual({ ok: true, value: 8000 });
    expect(s.payg).toEqual({ ok: true, value: { status: 'none', policyName: undefined } });
    expect(s.accessDenied).toBe(false);
  });

  it('keeps the other parts when one read fails (US3-AS1)', async () => {
    spareRead.mockResolvedValue(fail(429));
    const s = await loadCreditSnapshot('e');
    expect(s.spare).toEqual({ ok: false, kind: 'Throttled' });
    expect(s.env.ok).toBe(true);
    expect(s.payg.ok).toBe(true);
    expect(s.accessDenied).toBe(false);
  });

  it('flags access denied when any read is refused (US3-AS2)', async () => {
    paygRead.mockRejectedValue({ status: 403 });
    const s = await loadCreditSnapshot('e');
    expect(s.payg).toEqual({ ok: false, kind: 'Permission' });
    expect(s.accessDenied).toBe(true);
  });
});

describe('createLatestLoader (US3-AS3)', () => {
  function deferred() {
    let resolve!: (v: string) => void;
    const promise = new Promise<string>((r) => (resolve = r));
    return { promise, resolve };
  }

  it('drops an older load that finishes after a newer one', async () => {
    const first = deferred();
    const second = deferred();
    const loader = createLatestLoader(vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise));
    const a = loader.load('e');
    const b = loader.load('e');
    second.resolve('new');
    first.resolve('old');
    expect(await a).toBeUndefined();
    expect(await b).toBe('new');
  });

  it('drops a load that finishes after cancel', async () => {
    const d = deferred();
    const loader = createLatestLoader(() => d.promise);
    const a = loader.load('e');
    loader.cancel();
    d.resolve('late');
    expect(await a).toBeUndefined();
  });
});
