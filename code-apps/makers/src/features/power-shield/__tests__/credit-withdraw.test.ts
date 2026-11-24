import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// T036 — Copilot Credits withdraw guard (US3, FR-019/FR-036).
//
// The header transition is the atomic guard: a credit request can only be
// withdrawn while it is "Awaiting approval" (header status 2 Submitted or 5
// UnderReview). A wrong-type id is rejected as a typed not-found BEFORE the
// update, and an allocated/terminal request is never withdrawable — those rows
// offer "Request a change" instead. Generated services are mocked so the real
// @microsoft/power-apps module never loads in the node env.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  const svc = () => ({ get: vi.fn(), getAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() });
  return {
    requests: svc(), environments: svc(), connectors: svc(), answers: svc(),
    participants: svc(), patterns: svc(), servicetrees: svc(), envgroups: svc(),
    systemusers: svc(), annotations: svc(),
  };
});

vi.mock('../../../generated/services/Cat_policyrequestsService', () => ({ Cat_policyrequestsService: h.requests }));
vi.mock('../../../generated/services/Cat_policyrequestenvironmentsService', () => ({ Cat_policyrequestenvironmentsService: h.environments }));
vi.mock('../../../generated/services/Cat_policyrequestconnectorsService', () => ({ Cat_policyrequestconnectorsService: h.connectors }));
vi.mock('../../../generated/services/Cat_policyrequestanswersService', () => ({ Cat_policyrequestanswersService: h.answers }));
vi.mock('../../../generated/services/Cat_policyrequestparticipantsService', () => ({ Cat_policyrequestparticipantsService: h.participants }));
vi.mock('../../../generated/services/Cat_powershieldcustomconnectorpatternsService', () => ({ Cat_powershieldcustomconnectorpatternsService: h.patterns }));
vi.mock('../../../generated/services/Cat_servicetreesService', () => ({ Cat_servicetreesService: h.servicetrees }));
vi.mock('../../../generated/services/Cat_powershieldenvironmentgroupsService', () => ({ Cat_powershieldenvironmentgroupsService: h.envgroups }));
vi.mock('../../../generated/services/SystemusersService', () => ({ SystemusersService: h.systemusers }));
vi.mock('../../../generated/services/AnnotationsService', () => ({ AnnotationsService: h.annotations }));

import { withdrawCreditRequest, deriveCreditLabel } from '../shared/services/dataverse/creditRequestService';

const REQUEST_TYPE_CONNECTOR = 335350000;
const REQUEST_TYPE_CREDITS = 335350001;
const HEADER_STATUS_WITHDRAWN = 3;

function ok<T>(data: T) {
  return { success: true, data };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requests.update.mockResolvedValue(ok({ cat_policyrequestid: 'req-1' }));
});

describe('T036 withdraw — allowed only while awaiting approval', () => {
  it.each([2, 5])('withdraws a Credits request in status %i', async (status) => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: REQUEST_TYPE_CREDITS, cat_status: status }));

    await expect(withdrawCreditRequest('req-1')).resolves.toBeUndefined();

    expect(h.requests.update).toHaveBeenCalledTimes(1);
    expect(h.requests.update).toHaveBeenCalledWith('req-1', { cat_status: HEADER_STATUS_WITHDRAWN });
  });
});

describe('T036 withdraw — rejected for wrong state / type', () => {
  it('rejects a request that has moved past awaiting approval (stale / allocated)', async () => {
    // Status 6 (Approved) — allocation has begun; withdraw must be refused.
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: REQUEST_TYPE_CREDITS, cat_status: 6 }));

    await expect(withdrawCreditRequest('req-1')).rejects.toThrow(/awaiting approval/i);
    expect(h.requests.update).not.toHaveBeenCalled();
  });

  it('rejects an already-withdrawn request (no double transition)', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: REQUEST_TYPE_CREDITS, cat_status: 3 }));

    await expect(withdrawCreditRequest('req-1')).rejects.toThrow(/awaiting approval/i);
    expect(h.requests.update).not.toHaveBeenCalled();
  });

  it('rejects a Connector id as a typed not-found before any update (isolation)', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_requesttype: REQUEST_TYPE_CONNECTOR, cat_status: 2 }));

    await expect(withdrawCreditRequest('req-1')).rejects.toThrow(/not available in the copilot credits/i);
    expect(h.requests.update).not.toHaveBeenCalled();
  });
});

describe('T036 allocated rows are not withdrawable — they offer Request a change', () => {
  it('an all-succeeded approved request labels as Allocated (not a withdraw candidate)', () => {
    // The row menu offers Withdraw only for "Awaiting approval" and Request a
    // change only for "Allocated" (CreditRowActionsMenu). This proves the label
    // that drives that gate: an allocated request is never awaiting-approval.
    expect(deriveCreditLabel(8, ['Succeeded', 'Succeeded'])).toBe('Allocated');
    expect(deriveCreditLabel(8, ['Succeeded', 'Succeeded'])).not.toBe('Awaiting approval');
  });
});
