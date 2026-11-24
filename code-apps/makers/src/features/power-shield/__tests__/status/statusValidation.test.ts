import { describe, it, expect } from 'vitest';
import { isValidStatusTransition } from '../../shared/services/dataverse/statusValidation';
import type { RequestStatus } from '../../models/status';

describe('isValidStatusTransition — status lifecycle guards', () => {
  // ── Valid Code App transitions ──────────────────────────────────────────────

  describe('valid transitions (should return true)', () => {
    const validTransitions: [RequestStatus, RequestStatus][] = [
      ['Draft',       'Submitted'],    // Maker submits wizard
      ['Draft',       'Withdrawn'],    // Maker withdraws a draft
      ['Submitted',   'Withdrawn'],    // Maker withdraws after submitting
      ['Submitted',   'UnderReview'],  // Admin takes ownership
      ['Submitted',   'Approved'],     // Admin approves directly
      ['Submitted',   'Rejected'],     // Admin rejects
      ['UnderReview', 'Approved'],     // Admin approves after review
      ['UnderReview', 'Rejected'],     // Admin rejects after review
    ];

    it.each(validTransitions)(
      '%s → %s is allowed',
      (current, next) => {
        expect(isValidStatusTransition(current, next)).toBe(true);
      },
    );
  });

  // ── Invalid Code App transitions ────────────────────────────────────────────

  describe('invalid transitions (should return false)', () => {
    const invalidTransitions: [RequestStatus, RequestStatus][] = [
      // Cannot skip steps
      ['Draft',       'Approved'],
      ['Draft',       'Rejected'],
      ['Draft',       'UnderReview'],
      // Cannot go backwards
      ['Submitted',   'Draft'],
      ['UnderReview', 'Submitted'],
      ['Approved',    'Submitted'],
      // Terminal statuses — no Code App transitions out
      ['Withdrawn',   'Draft'],
      ['Withdrawn',   'Submitted'],
      ['Rejected',    'Draft'],
      ['Rejected',    'Submitted'],
      ['Approved',    'Withdrawn'],
      // Flow-managed statuses are read-only — Code App cannot set them
      ['Draft',            'AutoRejected'],
      ['Submitted',        'Implementing'],
      ['Approved',         'Implemented'],
      ['Implementing',     'ImplementedWithErrors'],
      // Cannot transition to self
      ['Draft',       'Draft'],
      ['Submitted',   'Submitted'],
    ];

    it.each(invalidTransitions)(
      '%s → %s is not allowed',
      (current, next) => {
        expect(isValidStatusTransition(current, next)).toBe(false);
      },
    );
  });

  // ── Terminal / flow-managed statuses have no Code App outbound transitions ──

  describe('flow-managed statuses block all Code App writes', () => {
    const flowStatuses: RequestStatus[] = [
      'AutoRejected',
      'Implementing',
      'Implemented',
      'ImplementedWithErrors',
    ];
    const codeAppStatuses: RequestStatus[] = [
      'Draft', 'Submitted', 'Withdrawn', 'UnderReview', 'Approved', 'Rejected',
    ];

    it.each(flowStatuses)(
      'no Code App transition is allowed out of %s',
      (flowStatus) => {
        for (const next of codeAppStatuses) {
          expect(isValidStatusTransition(flowStatus, next)).toBe(false);
        }
      },
    );
  });
});
