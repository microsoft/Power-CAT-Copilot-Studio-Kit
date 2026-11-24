import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// T015 — row-level ownership for the credit experience.
//
// The list read is scoped server-side to the caller (created-by OR participant)
// before the Credits type predicate is applied, so Maker B can never enumerate
// Maker A's requests. Single-record ops (detail/withdraw/change) take only a
// request id and rely on Dataverse row-level security for ownership, matching the
// connector app (data-model.md §7a); this suite proves the list-scoping seam.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  const svc = () => ({
    get: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  });
  return {
    requests: svc(),
    environments: svc(),
    connectors: svc(),
    answers: svc(),
    participants: svc(),
    patterns: svc(),
    servicetrees: svc(),
    envgroups: svc(),
    systemusers: svc(),
    annotations: svc(),
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

import { getCreditRequestList } from '../shared/services/dataverse/creditRequestService';

const CREDITS = 335350001;

function ok<T>(data: T) {
  return { success: true, data };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requests.getAll.mockResolvedValue(ok([]));
  h.participants.getAll.mockResolvedValue(ok([]));
  h.environments.getAll.mockResolvedValue(ok([]));
});

describe('T015 row-level ownership — credit list is scoped to the caller', () => {
  it('scopes the header query to created-by OR participant, and never another maker', async () => {
    h.participants.getAll.mockResolvedValue(ok([{ _cat_policyrequestid_value: 'reqA' }]));

    await getCreditRequestList({ aadObjectId: 'maker-A' });

    const filter = h.requests.getAll.mock.calls[0][0].filter as string;
    expect(filter).toContain(`cat_createdbyaadobjectid eq 'maker-A'`);
    expect(filter).toContain('cat_policyrequestid eq reqA');
    expect(filter).not.toContain('maker-B');
  });

  it('looks up participation for the caller only', async () => {
    await getCreditRequestList({ aadObjectId: 'maker-A' });

    const partFilter = h.participants.getAll.mock.calls[0][0].filter as string;
    expect(partFilter).toBe(`cat_participantaadobjectid eq 'maker-A'`);
  });

  it('applies ownership before the Credits type predicate (ownership cannot be bypassed)', async () => {
    await getCreditRequestList({ aadObjectId: 'maker-A' });

    const filter = h.requests.getAll.mock.calls[0][0].filter as string;
    // andRequestType wraps the whole ownership/status clause and ANDs the type.
    expect(filter).toContain(`) and cat_requesttype eq ${CREDITS}`);
    expect(filter).toContain('cat_createdbyaadobjectid');
  });

  it('keeps ownership ANDed with a status filter', async () => {
    await getCreditRequestList({ aadObjectId: 'maker-A', statusFilter: [2] });

    const filter = h.requests.getAll.mock.calls[0][0].filter as string;
    expect(filter).toContain(`cat_createdbyaadobjectid eq 'maker-A'`);
    expect(filter).toContain('cat_status eq 2');
    expect(filter).toContain(`cat_requesttype eq ${CREDITS}`);
  });
});
