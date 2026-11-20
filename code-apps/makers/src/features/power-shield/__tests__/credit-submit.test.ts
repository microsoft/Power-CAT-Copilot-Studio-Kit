import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// T025 — Copilot Credits submit fan-out + conflict surfacing (US1, SC-008).
//
// Client-side submit (the Makers slice does NOT use a server command; see
// creditWizardSubmitService.ts and data-model.md §7a). Proves: N environments →
// N headers + N Pending children; a second in-progress request for an environment
// is surfaced as a per-environment `conflict` pointing at the existing request,
// without creating a header for it. The conflict check is status-based (no unique
// alternate key): only an in-progress request blocks a new one.
//
// Every generated Dataverse service is mocked so the real @microsoft/power-apps
// data module never loads (it cannot resolve in the node test env).
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

import { requestCreditChange, submitCreditRequest } from '../shared/services/dataverse/creditRequestService';
import {
  mergeSubmitOutcomes,
  submitCreditWizard,
  summarizeOutcomes,
} from '../features/credits/wizard/services/creditWizardSubmitService';
import type { CreditSubmitOutcome, CreditWizardEnvironment } from '../models/creditRequest';

const PENDING = 335350010;

function ok<T>(data: T) {
  return { success: true, data };
}

const BASE_PAYLOAD = {
  createdByAadObjectId: 'maker-a',
  createdByUpn: 'maker@contoso.com',
  justification: 'Pilot copilot for sellers.',
};

const AMOUNTS = { 'env-a': 2000, 'env-b': 500, 'env-c': 1250 };

let headerCounter = 0;

beforeEach(() => {
  vi.clearAllMocks();
  headerCounter = 0;
  // No in-progress conflict by default: no environment children found, and no
  // owning header when one is looked up.
  h.environments.getAll.mockResolvedValue(ok([]));
  h.requests.getAll.mockResolvedValue(ok([]));
  // Each header create returns a distinct id.
  h.requests.create.mockImplementation(() =>
    Promise.resolve(ok({ cat_policyrequestid: `hdr-${++headerCounter}` })),
  );
  h.environments.create.mockResolvedValue(ok({ cat_policyrequestenvironmentid: 'child-x' }));
  h.requests.delete.mockResolvedValue(undefined);
});

describe('T025 submit fan-out — one header + one Pending child per environment', () => {
  it('creates N headers and N Pending children (no active-env key written)', async () => {
    const environments: CreditWizardEnvironment[] = [
      { environmentId: 'env-a', displayName: 'Sales-Prod-EU' },
      { environmentId: 'env-b', displayName: 'Sales-Prod-US' },
      { environmentId: 'env-c', displayName: 'Sales-Test' },
    ];

    const { results } = await submitCreditRequest({ ...BASE_PAYLOAD, environments, requestedAmounts: AMOUNTS });

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'created')).toBe(true);
    expect(h.requests.create).toHaveBeenCalledTimes(3);
    expect(h.environments.create).toHaveBeenCalledTimes(3);

    // Spec 028 FR-011: headers never carry the Service Tree or Environment Group lookups.
    for (const [header] of h.requests.create.mock.calls) {
      expect(header).not.toHaveProperty(['cat_servicetreeid@odata.bind']);
      expect(header).not.toHaveProperty(['cat_EnvironmentGroup@odata.bind']);
    }

    // Every child carries the Pending state and its environment, and no longer
    // stamps the removed cat_credit_activeenvkey column.
    for (const env of environments) {
      const childCall = h.environments.create.mock.calls
        .map((c) => c[0])
        .find((body) => body.cat_environmentguid === env.environmentId);
      expect(childCall, `child for ${env.environmentId}`).toBeDefined();
      expect(childCall.cat_credit_childstate).toBe(PENDING);
      expect(childCall.cat_environmentname).toBe(env.displayName);
      expect(childCall.cat_credit_activeenvkey).toBeUndefined();
      // Sent as a JSON number, even though the generated type says string.
      expect(childCall.cat_creditrequestedamount).toBe(AMOUNTS[env.environmentId as keyof typeof AMOUNTS]);
      expect(typeof childCall.cat_creditrequestedamount).toBe('number');
    }
  });
});

describe('T025 conflict — a second in-progress request per environment is surfaced, not duplicated', () => {
  it('reports a conflict for the busy environment and creates the others', async () => {
    // env-b already has an environment child owned by "existing-req".
    h.environments.getAll.mockImplementation((opts: { filter?: string }) => {
      if (opts?.filter?.includes("eq 'env-b'")) {
        return Promise.resolve(ok([{ _cat_policyrequestid_value: 'existing-req' }]));
      }
      return Promise.resolve(ok([]));
    });
    // That owning header is a Credits request still Awaiting approval (status 2),
    // so it is in progress and blocks a new request for env-b.
    h.requests.getAll.mockResolvedValue(ok([{ cat_policyrequestid: 'existing-req', cat_status: 2 }]));

    const environments: CreditWizardEnvironment[] = [
      { environmentId: 'env-a', displayName: 'Sales-Prod-EU' },
      { environmentId: 'env-b', displayName: 'Sales-Prod-US' },
      { environmentId: 'env-c', displayName: 'Sales-Test' },
    ];

    const { results } = await submitCreditRequest({ ...BASE_PAYLOAD, environments, requestedAmounts: AMOUNTS });

    const byEnv = new Map(results.map((r) => [r.environmentGuid, r]));
    expect(byEnv.get('env-b')?.status).toBe('conflict');
    expect(byEnv.get('env-b')?.conflictWithRequestId).toBe('existing-req');
    expect(byEnv.get('env-a')?.status).toBe('created');
    expect(byEnv.get('env-c')?.status).toBe('created');

    // The busy environment never created a header — only the two free ones did.
    expect(h.requests.create).toHaveBeenCalledTimes(2);
  });
});

describe('T025 result shaping — retry targets only failed environments', () => {
  it('partitions created/conflict/failed and derives the retry set from failures', () => {
    const submitted: CreditWizardEnvironment[] = [
      { environmentId: 'env-a', displayName: 'A' },
      { environmentId: 'env-b', displayName: 'B' },
      { environmentId: 'env-c', displayName: 'C' },
    ];
    const outcomes: CreditSubmitOutcome[] = [
      { environmentGuid: 'env-a', status: 'created', requestId: 'r1' },
      { environmentGuid: 'env-b', status: 'conflict', conflictWithRequestId: 'r0' },
      { environmentGuid: 'env-c', status: 'failed', error: 'network' },
    ];

    const summary = summarizeOutcomes(outcomes, submitted);

    expect(summary.created.map((o) => o.environmentGuid)).toEqual(['env-a']);
    expect(summary.conflicts.map((o) => o.environmentGuid)).toEqual(['env-b']);
    expect(summary.failed.map((o) => o.environmentGuid)).toEqual(['env-c']);
    expect(summary.anyCreated).toBe(true);
    expect(summary.allCreated).toBe(false);
    // Retry resubmits only the failed env — never a created or conflicted one.
    expect(summary.retryEnvironments).toEqual([{ environmentId: 'env-c', displayName: 'C' }]);
  });
});

describe('spec 026 submit — fails closed without a valid amount', () => {
  it('marks an environment with a missing or invalid amount as failed and creates no header for it', async () => {
    const environments: CreditWizardEnvironment[] = [
      { environmentId: 'env-a', displayName: 'A' },
      { environmentId: 'env-b', displayName: 'B' },
      { environmentId: 'env-c', displayName: 'C' },
    ];

    const { results } = await submitCreditRequest({
      ...BASE_PAYLOAD,
      environments,
      // env-b is below the minimum, env-c has no amount at all.
      requestedAmounts: { 'env-a': 700, 'env-b': 499 },
    });

    const byEnv = new Map(results.map((r) => [r.environmentGuid, r.status]));
    expect(byEnv.get('env-a')).toBe('created');
    expect(byEnv.get('env-b')).toBe('failed');
    expect(byEnv.get('env-c')).toBe('failed');
    expect(h.requests.create).toHaveBeenCalledTimes(1);
    expect(h.environments.create).toHaveBeenCalledTimes(1);
  });
});

describe('spec 031 submit — tenant draw', () => {
  it('writes the tick, allows a tick-only row, and never writes false', async () => {
    const environments: CreditWizardEnvironment[] = [
      { environmentId: 'env-a', displayName: 'A' },
      { environmentId: 'env-b', displayName: 'B' },
      { environmentId: 'env-c', displayName: 'C' },
    ];

    const { results } = await submitCreditRequest({
      ...BASE_PAYLOAD,
      environments,
      // a: credits only. b: tick only. c: both.
      requestedAmounts: { 'env-a': 700, 'env-c': 900 },
      requestTenantDraw: { 'env-b': true, 'env-c': true },
    });

    expect(results.every((r) => r.status === 'created')).toBe(true);
    const bodies = h.environments.create.mock.calls.map((c) => c[0]);
    const byEnv = new Map(bodies.map((b) => [b.cat_environmentguid, b]));
    expect('cat_credit_requesttenantdraw' in byEnv.get('env-a')).toBe(false);
    expect(byEnv.get('env-b')?.cat_credit_requesttenantdraw).toBe(true);
    expect('cat_creditrequestedamount' in byEnv.get('env-b')).toBe(false);
    expect(byEnv.get('env-c')).toMatchObject({
      cat_creditrequestedamount: 900,
      cat_credit_requesttenantdraw: true,
    });
  });

  it('fails a ticked row whose amount is invalid instead of sending it as tick-only', async () => {
    const { results } = await submitCreditRequest({
      ...BASE_PAYLOAD,
      environments: [{ environmentId: 'env-a', displayName: 'A' }],
      requestedAmounts: { 'env-a': 499 },
      requestTenantDraw: { 'env-a': true },
    });

    expect(results[0].status).toBe('failed');
    expect(h.requests.create).not.toHaveBeenCalled();
    expect(h.environments.create).not.toHaveBeenCalled();
  });
});

describe('spec 026 retry — only failed environments, merged back in order', () => {
  it('mergeSubmitOutcomes replaces by environmentGuid and keeps the original order', () => {
    const previous: CreditSubmitOutcome[] = [
      { environmentGuid: 'env-a', status: 'created', requestId: 'r1' },
      { environmentGuid: 'env-b', status: 'failed', error: 'x' },
      { environmentGuid: 'env-c', status: 'failed', error: 'y' },
    ];
    const retried: CreditSubmitOutcome[] = [
      { environmentGuid: 'env-c', status: 'created', requestId: 'r3' },
      { environmentGuid: 'env-b', status: 'failed', error: 'z' },
    ];

    expect(mergeSubmitOutcomes(previous, retried)).toEqual([
      { environmentGuid: 'env-a', status: 'created', requestId: 'r1' },
      { environmentGuid: 'env-b', status: 'failed', error: 'z' },
      { environmentGuid: 'env-c', status: 'created', requestId: 'r3' },
    ]);
  });

  it('a retry submits only the failed environments, each with its own amount', async () => {
    const all: CreditWizardEnvironment[] = [
      { environmentId: 'env-a', displayName: 'A' },
      { environmentId: 'env-c', displayName: 'C' },
    ];
    const first = summarizeOutcomes(
      [
        { environmentGuid: 'env-a', status: 'created', requestId: 'r1' },
        { environmentGuid: 'env-c', status: 'failed', error: 'network' },
      ],
      all,
    );

    const retry = await submitCreditWizard({
      ...BASE_PAYLOAD,
      environments: first.retryEnvironments,
      requestedAmounts: { 'env-c': 1250 },
    });

    expect(retry.created.map((o) => o.environmentGuid)).toEqual(['env-c']);
    expect(h.environments.create).toHaveBeenCalledTimes(1);
    const body = h.environments.create.mock.calls[0][0];
    expect(body.cat_environmentguid).toBe('env-c');
    expect(body.cat_creditrequestedamount).toBe(1250);
  });
});

describe('spec 028 request a change — copies environments and justification only', () => {
  it('creates the new header without Service Tree or Environment Group lookups', async () => {
    h.requests.get.mockResolvedValue(
      ok({
        cat_policyrequestid: 'src-1',
        cat_policyrequestname: 'CR-1',
        cat_status: 8,
        cat_requesttype: 335350001,
        cat_justification: 'Pilot.',
        _cat_servicetreeid_value: 'st-1',
        _cat_environmentgroup_value: 'eg-1',
      }),
    );
    h.environments.getAll.mockResolvedValue(
      ok([
        {
          cat_policyrequestenvironmentid: 'c-a',
          cat_environmentguid: 'env-a',
          cat_environmentname: 'Alpha',
          cat_credit_childstate: 335350012,
        },
      ]),
    );
    h.servicetrees.get.mockResolvedValue(ok(null));
    h.envgroups.get.mockResolvedValue(ok(null));
    h.systemusers.getAll.mockResolvedValue(ok([]));
    h.participants.getAll.mockResolvedValue(ok([]));
    h.annotations.getAll.mockResolvedValue(ok([]));

    await requestCreditChange('src-1', { aadObjectId: 'maker-a', upn: 'maker@contoso.com' });

    expect(h.requests.create).toHaveBeenCalledTimes(1);
    const header = h.requests.create.mock.calls[0][0];
    expect(header.cat_justification).toBe('Pilot.');
    expect(header).not.toHaveProperty(['cat_servicetreeid@odata.bind']);
    expect(header).not.toHaveProperty(['cat_EnvironmentGroup@odata.bind']);
  });
});
