import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// T014 — bidirectional isolation between the Connector and Credit experiences.
//
// Every generated Dataverse service is mocked so the real @microsoft/power-apps
// data module never loads (it cannot resolve in the node test env). Each mock
// exposes the operations the services under test call; tests drive the header
// discriminator and inspect the OData filters that get built.
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

import { getCreditRequestDetail, getCreditRequestList, withdrawCreditRequest } from '../shared/services/dataverse/creditRequestService';
import { getRequestDetail, getRequestList, withdrawRequest } from '../shared/services/dataverse/requestService';

const CONNECTOR = 335350000;
const CREDITS = 335350001;

function ok<T>(data: T) {
  return { success: true, data };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Benign defaults; individual tests override the header type they care about.
  h.requests.get.mockResolvedValue(ok({ cat_policyrequestid: 'x', cat_requesttype: CONNECTOR, cat_status: 2 }));
  h.requests.getAll.mockResolvedValue(ok([]));
  h.requests.update.mockResolvedValue(ok({}));
  h.participants.getAll.mockResolvedValue(ok([]));
  h.environments.getAll.mockResolvedValue(ok([]));
});

describe('T014 isolation — ID-taking ops reject the opposite type', () => {
  it('a credit op rejects a Connector id (typed not-found)', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_policyrequestid: 'c1', cat_requesttype: CONNECTOR }));
    await expect(getCreditRequestDetail('c1')).rejects.toMatchObject({ notFound: true });
  });

  it('a credit op rejects a legacy null (Connector) id', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_policyrequestid: 'legacy', cat_requesttype: null }));
    await expect(getCreditRequestDetail('legacy')).rejects.toMatchObject({ notFound: true });
  });

  it('a connector op rejects a Credits id', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_policyrequestid: 'k1', cat_requesttype: CREDITS }));
    await expect(getRequestDetail('k1')).rejects.toThrow(/Connector experience/);
  });

  it('credit withdraw rejects a Connector id before any update', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_policyrequestid: 'c2', cat_requesttype: CONNECTOR, cat_status: 2 }));
    await expect(withdrawCreditRequest('c2')).rejects.toMatchObject({ notFound: true });
    expect(h.requests.update).not.toHaveBeenCalled();
  });

  it('connector withdraw rejects a Credits id before any update', async () => {
    h.requests.get.mockResolvedValue(ok({ cat_policyrequestid: 'k2', cat_requesttype: CREDITS, cat_status: 2 }));
    await expect(withdrawRequest('k2')).rejects.toThrow(/Connector experience/);
    expect(h.requests.update).not.toHaveBeenCalled();
  });
});

describe('T014 isolation — list queries never cross types', () => {
  it('the credit list filters strictly on Credits (335350001) and never Connector', async () => {
    await getCreditRequestList({ aadObjectId: 'u1' });
    const filter = h.requests.getAll.mock.calls[0][0].filter as string;
    expect(filter).toContain(`cat_requesttype eq ${CREDITS}`);
    expect(filter).not.toContain(String(CONNECTOR));
  });

  it('the connector list filters on Connector + legacy null and never Credits', async () => {
    await getRequestList({ isAdmin: false, aadObjectId: 'u1' });
    const filter = h.requests.getAll.mock.calls[0][0].filter as string;
    expect(filter).toContain(`cat_requesttype eq ${CONNECTOR}`);
    expect(filter).toContain('cat_requesttype eq null');
    expect(filter).not.toContain(String(CREDITS));
  });
});
