import { describe, it, expect } from 'vitest';
import { creditStatBucketForStatus, CREDIT_STATUS_BADGE } from '../models/status';
import type { RequestStatus } from '../models/status';

// ─────────────────────────────────────────────────────────────────────────────
// T049 — admin credit stat-card bucket mapping (locked Point-3 product rules).
//
// Pure test of the header-status → stat-card bucket rule. The four admin cards
// are Total plus three header buckets; Total is derived elsewhere by counting the
// whole list, so this rule only owns the three non-Total buckets and the null
// (Total-only) fall-through. Approved-family statuses all read "Allocation
// recorded"; only an admin Reject reads "Rejected"; Draft/Withdrawn/AutoRejected
// contribute to Total alone, so Total may exceed the sum of the other cards.
// ─────────────────────────────────────────────────────────────────────────────

const APPROVED_FAMILY: RequestStatus[] = [
  'Approved',
  'Implementing',
  'Implemented',
  'ImplementedWithErrors',
];

describe('creditStatBucketForStatus — header-status → stat-card bucket', () => {
  it('maps Submitted and UnderReview to "Awaiting decision"', () => {
    expect(creditStatBucketForStatus('Submitted')).toBe('Awaiting decision');
    expect(creditStatBucketForStatus('UnderReview')).toBe('Awaiting decision');
  });

  it('maps the whole Approved family to "Allocation recorded"', () => {
    for (const status of APPROVED_FAMILY) {
      expect(creditStatBucketForStatus(status)).toBe('Allocation recorded');
    }
  });

  it('maps only Rejected to "Rejected"', () => {
    expect(creditStatBucketForStatus('Rejected')).toBe('Rejected');
  });

  it('counts Draft, Withdrawn and AutoRejected toward Total only (null)', () => {
    expect(creditStatBucketForStatus('Draft')).toBeNull();
    expect(creditStatBucketForStatus('Withdrawn')).toBeNull();
    expect(creditStatBucketForStatus('AutoRejected')).toBeNull();
  });
});

describe('CREDIT_STATUS_BADGE — header-status badge labels', () => {
  it('labels every Approved-family status "Approved"', () => {
    for (const status of APPROVED_FAMILY) {
      expect(CREDIT_STATUS_BADGE[status].label).toBe('Approved');
    }
  });

  it('labels the awaiting and rejected statuses to match the buckets', () => {
    expect(CREDIT_STATUS_BADGE.Submitted.label).toBe('Awaiting decision');
    expect(CREDIT_STATUS_BADGE.UnderReview.label).toBe('Awaiting decision');
    expect(CREDIT_STATUS_BADGE.Rejected.label).toBe('Rejected');
  });
});
