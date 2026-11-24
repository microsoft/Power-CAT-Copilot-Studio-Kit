import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// T039 — Copilot Credits draft resume (US4, FR-020/FR-021/SC-004).
//
// Proves: reopening a draft lists the saved environments the maker can no longer
// access (spec 028: removed only, nothing is ever added); a wrong-type id is a typed not-found (thrown, never
// a silent redirect); and submit is blocked while access is invalid or the scope
// is unconfirmed. The submit-gate assertions use the pure reducer selector; the
// diff + not-found assertions exercise the repository with every generated
// service mocked so @microsoft/power-apps never loads in the node env.
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

import { loadCreditDraft, normalizeEnvKey, saveCreditDraft } from '../shared/services/dataverse/creditRequestService';
import { creditWizardReducer } from '../features/credits/wizard/contexts/CreditWizardContext';
import {
  getSubmissionBlockedReason,
  CREDIT_WIZARD_INITIAL_STATE,
  type CreditWizardState,
} from '../features/credits/wizard/contexts/creditWizardTypes';
import type { CreditWizardEnvironment } from '../models/creditRequest';

const REQUEST_TYPE_CONNECTOR = 335350000;
const REQUEST_TYPE_CREDITS = 335350001;

function ok<T>(data: T) {
  return { success: true, data };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Name-resolution lookups default to empty; individual tests set requests.get.
  h.servicetrees.getAll.mockResolvedValue(ok([]));
  h.servicetrees.get.mockResolvedValue(ok(null));
  h.envgroups.getAll.mockResolvedValue(ok([]));
  h.envgroups.get.mockResolvedValue(ok(null));
  h.systemusers.getAll.mockResolvedValue(ok([]));
  h.participants.getAll.mockResolvedValue(ok([]));
});

function creditHeader(overrides: Record<string, unknown> = {}) {
  return ok({
    cat_policyrequestid: 'draft-1',
    cat_policyrequestname: 'CR-1001',
    cat_status: 1,
    cat_requesttype: REQUEST_TYPE_CREDITS,
    cat_justification: 'Pilot.',
    cat_createdbyaadobjectid: 'maker-a',
    cat_createdbyupn: 'maker@contoso.com',
    _cat_servicetreeid_value: 'st-1',
    _cat_environmentgroup_value: 'eg-1',
    ...overrides,
  });
}

describe('spec 028 loadCreditDraft — lists only environments no longer accessible', () => {
  it('lists saved environments missing from the eligible set, and never adds new ones', async () => {
    h.requests.get.mockResolvedValue(creditHeader());
    // Draft captured env-a and env-b.
    h.environments.getAll.mockResolvedValue(
      ok([
        { cat_policyrequestenvironmentid: 'c-a', cat_environmentguid: 'env-a', cat_environmentname: 'Alpha' },
        { cat_policyrequestenvironmentid: 'c-b', cat_environmentguid: 'env-b', cat_environmentname: 'Bravo' },
      ]),
    );

    // Currently eligible set is env-a and env-c.
    const current: CreditWizardEnvironment[] = [
      { environmentId: 'env-a', displayName: 'Alpha' },
      { environmentId: 'env-c', displayName: 'Charlie' },
    ];

    const { envDiff } = await loadCreditDraft('draft-1', current);

    expect('added' in envDiff).toBe(false); // env-c is eligible but was never picked
    expect(envDiff.removed.map((e) => e.environmentId)).toEqual(['env-b']); // no longer available
  });

  it('reports no diff when every saved environment is still accessible', async () => {
    h.requests.get.mockResolvedValue(creditHeader());
    h.environments.getAll.mockResolvedValue(
      ok([{ cat_policyrequestenvironmentid: 'c-a', cat_environmentguid: 'env-a', cat_environmentname: 'Alpha' }]),
    );

    const { envDiff } = await loadCreditDraft('draft-1', [{ environmentId: 'env-a', displayName: 'Alpha' }]);

    expect(envDiff.removed).toEqual([]);
  });

  it('lists every saved environment when none are accessible', async () => {
    h.requests.get.mockResolvedValue(creditHeader());
    h.environments.getAll.mockResolvedValue(
      ok([
        { cat_policyrequestenvironmentid: 'c-a', cat_environmentguid: 'env-a', cat_environmentname: 'Alpha' },
        { cat_policyrequestenvironmentid: 'c-b', cat_environmentguid: 'env-b', cat_environmentname: 'Bravo' },
      ]),
    );

    const { envDiff } = await loadCreditDraft('draft-1', [{ environmentId: 'env-z', displayName: 'Zulu' }]);

    expect(envDiff.removed.map((e) => e.environmentId)).toEqual(['env-a', 'env-b']);
  });
});

describe('T039 loadCreditDraft — wrong-type id is a typed not-found', () => {
  it('throws (no redirect) when the id is a Connector request', async () => {
    h.requests.get.mockResolvedValue(creditHeader({ cat_requesttype: REQUEST_TYPE_CONNECTOR }));

    await expect(loadCreditDraft('draft-1', [])).rejects.toThrow(/not available in the copilot credits/i);
  });
});

describe('T039 submit gate — blocked on invalid access or unconfirmed scope', () => {
  const base: CreditWizardState = {
    ...CREDIT_WIZARD_INITIAL_STATE,
    selectedEnvironments: [{ environmentId: 'env-a', displayName: 'Alpha' }],
    envConfirmation: 'confirmed',
    justification: 'Pilot.',
    requestedAmounts: { 'env-a': '1000' },
  };

  it('blocks submit while the resumed draft has invalid access', () => {
    const state: CreditWizardState = { ...base, draftRevalidation: 'invalidAccess' };
    expect(getSubmissionBlockedReason(state, false)).toBe('invalidDraftAccess');
  });

  it('blocks submit while a resumed diff is pending reconfirmation', () => {
    const state: CreditWizardState = {
      ...base,
      draftRevalidation: 'changed',
      envConfirmation: 'diffPending',
    };
    expect(getSubmissionBlockedReason(state, false)).toBe('envScopeUnconfirmed');
  });

  it('allows submit once access is valid and the scope is confirmed', () => {
    expect(getSubmissionBlockedReason(base, false)).toBeNull();
  });
});

describe('spec 026 draft resume — requested amounts', () => {
  const loadPayload = {
    draftRequestId: 'draft-1',
    selectedEnvironments: [
      { environmentId: 'env-a', displayName: 'Alpha' },
      { environmentId: 'env-c', displayName: 'Charlie' },
    ],
    justification: 'Pilot.',
    envDiff: null,
    draftRevalidation: 'unchanged' as const,
    // env-b was saved but is no longer selected; env-c is new and has no amount.
    requestedAmounts: { 'env-a': '1500', 'env-b': '900' },
  };

  it('restores saved amounts keyed by environment GUID and leaves new environments empty', () => {
    const state = creditWizardReducer(CREDIT_WIZARD_INITIAL_STATE, { type: 'LOAD_DRAFT', payload: loadPayload });
    expect(state.requestedAmounts).toEqual({ 'env-a': '1500' });
    expect(state.requestedAmounts['env-c']).toBeUndefined();
  });

  it('blocks submit with invalidRows until every environment has a valid amount', () => {
    const loaded = creditWizardReducer(CREDIT_WIZARD_INITIAL_STATE, { type: 'LOAD_DRAFT', payload: loadPayload });
    expect(getSubmissionBlockedReason(loaded, false)).toBe('invalidRows');

    const filled = creditWizardReducer(loaded, {
      type: 'SET_REQUESTED_AMOUNT',
      payload: { environmentId: 'env-c', raw: '600' },
    });
    expect(getSubmissionBlockedReason(filled, false)).toBeNull();
  });

  it('saveCreditDraft writes only valid amounts', async () => {
    h.requests.create.mockResolvedValue(ok({ cat_policyrequestid: 'draft-new' }));
    h.environments.create.mockResolvedValue(ok({ cat_policyrequestenvironmentid: 'c' }));

    await saveCreditDraft({
      createdByAadObjectId: 'maker-a',
      createdByUpn: 'maker@contoso.com',
      justification: '',
      environments: [
        { environmentId: 'env-a', displayName: 'Alpha' },
        { environmentId: 'env-b', displayName: 'Bravo' },
        { environmentId: 'env-c', displayName: 'Charlie' },
      ],
      requestedAmounts: { 'env-a': 800, 'env-b': 100 },
      requestTenantDraw: { 'env-c': true },
    });

    const bodies = h.environments.create.mock.calls.map((c) => c[0]);
    const byEnv = new Map(bodies.map((b) => [b.cat_environmentguid, b]));
    expect(byEnv.get('env-a')?.cat_creditrequestedamount).toBe(800);
    expect('cat_creditrequestedamount' in byEnv.get('env-b')).toBe(false);
    expect('cat_creditrequestedamount' in byEnv.get('env-c')).toBe(false);
    // Spec 031: the tick is saved only where it is on; no false is ever written.
    expect(byEnv.get('env-c')?.cat_credit_requesttenantdraw).toBe(true);
    expect('cat_credit_requesttenantdraw' in byEnv.get('env-a')).toBe(false);

    // Spec 028 FR-011: the header never carries the Service Tree or Environment Group lookups.
    const header = h.requests.create.mock.calls[0][0];
    expect(header).not.toHaveProperty(['cat_servicetreeid@odata.bind']);
    expect(header).not.toHaveProperty(['cat_EnvironmentGroup@odata.bind']);
  });
});
describe('spec 031 draft resume — tenant draw ticks', () => {
  it('reads the saved tick and maps it to the matching environment, whatever the GUID casing', async () => {
    h.requests.get.mockResolvedValue(creditHeader());
    h.environments.getAll.mockResolvedValue(
      ok([
        {
          cat_policyrequestenvironmentid: 'c-a',
          cat_environmentguid: '{8F3A1C2D-0000-4000-8000-ABCDEF123456}',
          cat_environmentname: 'Alpha',
          cat_credit_requesttenantdraw: true,
        },
        { cat_policyrequestenvironmentid: 'c-b', cat_environmentguid: 'env-b', cat_environmentname: 'Bravo' },
      ]),
    );

    const eligible = '8f3a1c2d-0000-4000-8000-abcdef123456';
    const { detail } = await loadCreditDraft('draft-1', [
      { environmentId: eligible, displayName: 'Alpha' },
      { environmentId: 'env-b', displayName: 'Bravo' },
    ]);

    const ticked = detail.environments.filter((e) => e.requestTenantDraw);
    expect(ticked).toHaveLength(1);
    expect(normalizeEnvKey(ticked[0].environmentGuid)).toBe(normalizeEnvKey(eligible));
    expect(detail.environments.find((e) => e.environmentGuid === 'env-b')?.requestTenantDraw).toBe(false);
  });

  it('LOAD_DRAFT keeps ticks only for selected environments, so a tick-only row is valid', () => {
    const state = creditWizardReducer(CREDIT_WIZARD_INITIAL_STATE, {
      type: 'LOAD_DRAFT',
      payload: {
        draftRequestId: 'draft-1',
        selectedEnvironments: [{ environmentId: 'env-a', displayName: 'Alpha' }],
        justification: 'Pilot.',
        envDiff: null,
        draftRevalidation: 'unchanged',
        requestedAmounts: {},
        requestTenantDraw: { 'env-a': true, 'env-gone': true },
      },
    });
    expect(state.requestTenantDraw).toEqual({ 'env-a': true });
    expect(getSubmissionBlockedReason(state, false)).toBeNull();
  });
});

describe('spec 028 draft resume — environment key matching', () => {
  it('matches a saved GUID to the eligible GUID regardless of braces, spaces or case', () => {
    const saved = ' {8F3A1C2D-0000-4000-8000-ABCDEF123456} ';
    const eligible = '8f3a1c2d-0000-4000-8000-abcdef123456';
    expect(normalizeEnvKey(saved)).toBe(normalizeEnvKey(eligible));
  });
});
