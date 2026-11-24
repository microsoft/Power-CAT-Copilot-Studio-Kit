import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Admin credit reject guards. Approval moved to creditApprovalCommand (spec 024).
//
// rejectCreditRequest enforces, before any write: strict Credits type
// (Connector/Credits isolation, SC-002), awaiting-decision status, the assignee
// gate (SC-M2, case-insensitive) and no unfinished allocation attempt (T031).
// Status ints: Submitted=2, Approved=6; request-type ints: Connector=335350000,
// Credits=335350001; child state Processing=335350011.
// ─────────────────────────────────────────────────────────────────────────────

// Generated services import the browser-only power-apps data client, so every
// generated service reached at module-load time must be mocked for the node env.
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

import { Cat_policyrequestsService } from '../../../generated/services/Cat_policyrequestsService';
import { Cat_powershieldpolicyrequestlogsService } from '../../../generated/services/Cat_powershieldpolicyrequestlogsService';
import { Cat_policyrequestenvironmentsService } from '../../../generated/services/Cat_policyrequestenvironmentsService';
import { rejectCreditRequest } from '../shared/services/dataverse/creditRequestService';

const REQUEST_TYPE_CONNECTOR = 335350000;
const REQUEST_TYPE_CREDITS = 335350001;
const STATUS_SUBMITTED = 2;
const STATUS_APPROVED = 6;
const CHILD_STATE_PROCESSING = 335350011;

const ADMIN = 'admin-1';

const getMock = vi.mocked(Cat_policyrequestsService.get);
const updateMock = vi.mocked(Cat_policyrequestsService.update);
const logCreateMock = vi.mocked(Cat_powershieldpolicyrequestlogsService.create);
const childGetAllMock = vi.mocked(Cat_policyrequestenvironmentsService.getAll);

type GetResult = Awaited<ReturnType<typeof Cat_policyrequestsService.get>>;
type UpdateResult = Awaited<ReturnType<typeof Cat_policyrequestsService.update>>;
type LogCreateResult = Awaited<ReturnType<typeof Cat_powershieldpolicyrequestlogsService.create>>;
type ChildGetAllResult = Awaited<ReturnType<typeof Cat_policyrequestenvironmentsService.getAll>>;

/** Stubs the header read; defaults to an assigned, Credits, Submitted request. */
function setHeader(overrides: Record<string, unknown> = {}): void {
  getMock.mockResolvedValue({
    success: true,
    data: {
      cat_requesttype: REQUEST_TYPE_CREDITS,
      cat_status: STATUS_SUBMITTED,
      _cat_assignedadministrator_value: ADMIN,
      cat_credit_allocatedtotal: 4000,
      ...overrides,
    },
  } as GetResult);
}

beforeEach(() => {
  vi.clearAllMocks();
  setHeader();
  updateMock.mockResolvedValue({ success: true, data: {} } as UpdateResult);
  logCreateMock.mockResolvedValue({ success: true, data: {} } as LogCreateResult);
  childGetAllMock.mockResolvedValue({ success: true, data: [] } as unknown as ChildGetAllResult);
});

describe('Credits/Connector isolation (SC-002) — wrong-type rejection', () => {
  it('reject rejects a non-Credits header', async () => {
    setHeader({ cat_requesttype: REQUEST_TYPE_CONNECTOR });
    await expect(rejectCreditRequest('id', 'no', ADMIN)).rejects.toThrow(
      /not available in the Copilot Credits/,
    );
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('Assignee gate (SC-M2) — only the assigned admin may decide', () => {
  it('reject throws when the caller is not the assignee', async () => {
    setHeader({ _cat_assignedadministrator_value: 'someone-else' });
    await expect(rejectCreditRequest('id', 'no', ADMIN)).rejects.toThrow(
      /Only the assigned admin can reject this request\./,
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('matches the assignee case-insensitively', async () => {
    setHeader({ _cat_assignedadministrator_value: 'ADMIN-1' });
    await expect(rejectCreditRequest('id', 'no', 'admin-1')).resolves.toBeUndefined();
  });
});

describe('Status guard — decisions only while awaiting a decision', () => {
  it('reject throws once the request is already decided', async () => {
    setHeader({ cat_status: STATUS_APPROVED });
    await expect(rejectCreditRequest('id', 'no', ADMIN)).rejects.toThrow(
      /can only be rejected while it is awaiting a decision/,
    );
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('Reject guard (T031) — no reject while an allocation is unfinished', () => {
  it('throws when a child row is still Processing', async () => {
    childGetAllMock.mockResolvedValue({
      success: true,
      data: [{ _cat_policyrequestid_value: 'id', cat_credit_childstate: CHILD_STATE_PROCESSING }],
    } as unknown as ChildGetAllResult);
    await expect(rejectCreditRequest('id', 'no', ADMIN)).rejects.toThrow(/hasn't finished/);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
