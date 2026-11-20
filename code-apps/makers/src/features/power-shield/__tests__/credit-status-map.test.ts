import { describe, it, expect, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// T033 — Copilot Credits label mapping (US2, FR-022/FR-032).
//
// Proves the maker label is derived so it never shows an allocation state the
// data cannot prove, and that every label rolls up to the correct stat-card
// bucket. `deriveCreditLabel` lives in creditRequestService, which imports the
// generated Dataverse services, so every one is mocked to keep @microsoft/power-apps
// from loading in the node env (same scaffold as credit-submit.test.ts).
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

import { deriveCreditLabel } from '../shared/services/dataverse/creditRequestService';
import {
  CREDIT_LABEL_TO_STAT_BUCKET,
  CREDIT_LABEL_TO_COLOR_KEY,
  type CreditRequestLabel,
} from '../models/status';

// Header status ints (data-model.md §5): 1 Draft, 2 Submitted, 3 Withdrawn,
// 4 AutoRejected, 5 UnderReview, 6 Approved, 7 Rejected, 8 Implementing,
// 9 Implemented, 10 ImplementedWithErrors.

describe('T033 deriveCreditLabel — header states resolve before children', () => {
  it('maps the header-only lifecycle states', () => {
    expect(deriveCreditLabel(1, [])).toBe('Draft');
    expect(deriveCreditLabel(2, [])).toBe('Awaiting approval');
    expect(deriveCreditLabel(5, [])).toBe('Awaiting approval');
    expect(deriveCreditLabel(3, [])).toBe('Withdrawn');
    expect(deriveCreditLabel(4, [])).toBe('Declined');
    expect(deriveCreditLabel(7, [])).toBe('Declined');
  });

  it('fails closed to "Needs admin attention" on an unknown or NaN header status', () => {
    expect(deriveCreditLabel(999, ['Succeeded'])).toBe('Needs admin attention');
    expect(deriveCreditLabel(null, [])).toBe('Needs admin attention');
    expect(deriveCreditLabel(undefined, [])).toBe('Needs admin attention');
    expect(deriveCreditLabel('not-a-number', [])).toBe('Needs admin attention');
  });
});

describe('T033 deriveCreditLabel — allocation phase never over-claims', () => {
  it('reports awaiting allocation when approved but no children are stamped yet', () => {
    expect(deriveCreditLabel(6, [])).toBe('Approved and awaiting allocation');
  });

  it('requires EVERY child to be Succeeded before showing Allocated', () => {
    expect(deriveCreditLabel(8, ['Succeeded', 'Succeeded'])).toBe('Allocated');
    // One still pending → still allocating, never optimistically Allocated.
    expect(deriveCreditLabel(8, ['Succeeded', 'Pending'])).toBe('Allocating');
  });

  it('treats any failed/unknown child as an attention state (fail closed)', () => {
    expect(deriveCreditLabel(8, ['FailedRetryable'])).toBe('Needs admin attention');
    expect(deriveCreditLabel(8, ['UnknownOutcome'])).toBe('Needs admin attention');
    // Any failure makes the whole request need attention.
    expect(deriveCreditLabel(8, ['Succeeded', 'FailedPermanent'])).toBe('Needs admin attention');
  });

  it('reports Allocating while any child is still processing', () => {
    expect(deriveCreditLabel(8, ['Processing', 'Pending'])).toBe('Allocating');
  });
});

describe('T033 stat-card buckets — rollups match the data-model table', () => {
  const cases: Array<[CreditRequestLabel, string | null]> = [
    ['Draft', 'Total'],
    ['Awaiting approval', 'Awaiting decision'],
    ['Returned', 'Awaiting decision'],
    ['Approved and awaiting allocation', 'Being allocated'],
    ['Allocating', 'Being allocated'],
    ['Allocated', 'Allocated'],
    ['Needs admin attention', 'Needs your attention'],
    ['Declined', null],
    ['Withdrawn', null],
  ];

  it.each(cases)('%s → %s bucket', (label, bucket) => {
    expect(CREDIT_LABEL_TO_STAT_BUCKET[label]).toBe(bucket);
  });

  it('every label has an explicit bucket entry AND a colour key (no undefined fallthrough)', () => {
    for (const [label] of cases) {
      expect(CREDIT_LABEL_TO_STAT_BUCKET).toHaveProperty(label);
      expect(CREDIT_LABEL_TO_COLOR_KEY[label]).toBeTruthy();
    }
  });
});
