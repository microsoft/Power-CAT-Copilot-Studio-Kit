import type { RequestStatus } from '../../../models/status';

/**
 * Valid Code App-managed outbound transitions per status.
 * Flow-managed statuses (AutoRejected, Implementing, Implemented, ImplementedWithErrors)
 * have empty arrays — the Code App cannot transition out of them.
 */
const VALID_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  Draft:                  ['Submitted', 'Withdrawn'],
  Submitted:              ['Withdrawn', 'UnderReview', 'Approved', 'Rejected'],
  UnderReview:            ['Approved', 'Rejected'],
  Approved:               [],  // Flow takes over after approval
  Withdrawn:              [],  // Terminal
  Rejected:               [],  // Terminal
  AutoRejected:           [],  // Flow-managed — read-only
  Implementing:           [],  // Flow-managed — read-only
  Implemented:            [],  // Flow-managed — read-only
  ImplementedWithErrors:  [],  // Flow-managed — read-only
};

/**
 * Returns true only if the Code App is permitted to transition a request
 * from `current` to `next`. Self-transitions always return false.
 */
export function isValidStatusTransition(
  current: RequestStatus,
  next: RequestStatus,
): boolean {
  if (current === next) return false;
  return (VALID_TRANSITIONS[current] as readonly RequestStatus[]).includes(next);
}
