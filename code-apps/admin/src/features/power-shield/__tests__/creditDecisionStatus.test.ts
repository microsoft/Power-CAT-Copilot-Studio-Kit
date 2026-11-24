import { describe, it, expect } from 'vitest';
import {
  AWAITING_DECISION_STATUSES,
  isAwaitingDecisionStatus,
} from '../models/status';
import type { RequestStatus } from '../models/status';

// ─────────────────────────────────────────────────────────────────────────────
// T029 — reject/assign are allowed only while a request is awaiting a decision.
//
// Reject is a plain Code App data source update (FR-027, data-model.md §9.1); the
// status matrix that gates it is this pure rule, shared by the service guard and
// the command-bar UI. It must allow exactly Submitted and UnderReview and refuse
// every decided/terminal status.
// ─────────────────────────────────────────────────────────────────────────────

describe('isAwaitingDecisionStatus — reject/assign gate', () => {
  it('allows exactly Submitted and UnderReview', () => {
    expect(AWAITING_DECISION_STATUSES).toEqual(['Submitted', 'UnderReview']);
    expect(isAwaitingDecisionStatus('Submitted')).toBe(true);
    expect(isAwaitingDecisionStatus('UnderReview')).toBe(true);
  });

  it('refuses every decided or terminal status', () => {
    const refused: RequestStatus[] = [
      'Draft',
      'Withdrawn',
      'Approved',
      'Rejected',
      'Implementing',
      'Implemented',
      'ImplementedWithErrors',
      'AutoRejected',
    ];
    for (const status of refused) {
      expect(isAwaitingDecisionStatus(status)).toBe(false);
    }
  });
});
