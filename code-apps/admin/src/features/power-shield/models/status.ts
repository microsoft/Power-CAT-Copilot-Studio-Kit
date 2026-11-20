/** Statuses managed by this Code App */
export type AppManagedStatus =
  | 'Draft'
  | 'Submitted'
  | 'Withdrawn'
  | 'UnderReview'
  | 'Approved'
  | 'Rejected'
  | 'Implementing'
  | 'Implemented'
  | 'ImplementedWithErrors';

/** Statuses managed by external Power Automate flows (read-only in Code App) */
export type FlowManagedStatus = 'AutoRejected';

export type RequestStatus = AppManagedStatus | FlowManagedStatus;

/** Statuses that block a new request for the same Service Tree */
export const IN_PROGRESS_BLOCKING_STATUSES: RequestStatus[] = [
  'Draft',
  'Submitted',
  'UnderReview',
  'Approved',
  'Implementing',
  'AutoRejected',
];

/** Statuses in which a request is still awaiting an admin decision (assign / reject are allowed). */
export const AWAITING_DECISION_STATUSES: RequestStatus[] = ['Submitted', 'UnderReview'];

/** True while a request can still be assigned or rejected (it has no decision yet). */
export function isAwaitingDecisionStatus(status: RequestStatus): boolean {
  return AWAITING_DECISION_STATUSES.includes(status);
}

/**
 * User-friendly display labels for statuses.
 * Internal statuses like Implementing/Implemented are hidden from end users
 * because they represent back-end fulfilment steps, not meaningful user states.
 */
export const STATUS_DISPLAY_LABELS: Record<RequestStatus, string> = {
  Draft: 'Draft',
  Submitted: 'Submitted',
  Withdrawn: 'Withdrawn',
  UnderReview: 'In Review',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Implementing: 'In Progress',
  Implemented: 'Completed',
  ImplementedWithErrors: 'Policy Failed',
  AutoRejected: 'Auto Rejected',
};

/** Map an internal status to its user-facing display label */
export function getStatusDisplayLabel(status: RequestStatus): string {
  return STATUS_DISPLAY_LABELS[status] ?? status;
}

/**
 * Display-label colour key — used by StatusBadge to pick the right colour
 * when multiple internal statuses share the same display label.
 */
export type StatusDisplayKey =
  | 'Draft'
  | 'Submitted'
  | 'In Review'
  | 'Approved'
  | 'In Progress'
  | 'Completed'
  | 'Policy Failed'
  | 'Rejected'
  | 'Withdrawn'
  | 'Auto Rejected';

export type FulfillmentStatus = 'Pending' | 'Succeeded' | 'Failed' | 'Skipped';

export type ParticipantRole = 'Participant';

export type AnswerType = 'Boolean' | 'Text' | 'Choice' | 'MultiselectChoice' | 'Date';

// ─────────────────────────────────────────────────────────────────────────────
// Credit slice (Copilot Credits) — isolated from the connector RequestStatus above.
// The CreditChildState union and the per-child label/colour maps below are the
// shared leaf kept identical with CopilotStudioKitMakers (FR-041 copy-check).
// The request-level label map uses the admin vocabulary (data-model.md §4/§5).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-environment child fulfilment state for a credit request.
 * Bound to `cat_credit_childstate` (335350010–335350017). See data-model.md §8.
 * Skipped = PAYG "approve without allocating"; Superseded = review went stale
 * before the write, nothing was written (spec 024).
 */
export type CreditChildState =
  | 'Pending'
  | 'Processing'
  | 'Succeeded'
  | 'FailedRetryable'
  | 'FailedPermanent'
  | 'UnknownOutcome'
  | 'Skipped'
  | 'Superseded';

/** Per-environment status label. Plain language; the admin allocation grid also shows amounts separately. */
export const CREDIT_CHILD_STATE_LABELS: Record<CreditChildState, string> = {
  Pending: 'Awaiting allocation',
  Processing: 'Allocating',
  Succeeded: 'Allocated',
  FailedRetryable: 'Needs attention',
  FailedPermanent: 'Needs attention',
  UnknownOutcome: 'Needs attention',
  Skipped: 'Not allocated (pay-as-you-go)',
  Superseded: 'Awaiting allocation',
};

/** Reuses the shared pill palette for each per-environment child state. */
export const CREDIT_CHILD_STATE_TO_COLOR_KEY: Record<CreditChildState, StatusDisplayKey> = {
  Pending: 'Submitted',
  Processing: 'In Progress',
  Succeeded: 'Completed',
  FailedRetryable: 'Policy Failed',
  FailedPermanent: 'Policy Failed',
  UnknownOutcome: 'Policy Failed',
  Skipped: 'Completed',
  Superseded: 'Submitted',
};

/**
 * Admin-visible request label for a credit request (data-model.md §4).
 * Derived (child-state primary) from the header rollup plus child
 * `CreditChildState`; failing closed so an unknown state never reads as an
 * optimistic 'Allocated'. Do NOT re-decode the connector `cat_status` domain.
 */
export type CreditRequestLabel =
  | 'Awaiting decision'
  | 'Approved and awaiting allocation'
  | 'Allocating'
  | 'Allocated'
  | 'Needs admin attention'
  | 'Declined'
  | 'Canceled';

/** The four admin stat-card / filter buckets: Total plus three header-status buckets (MVP). */
export type AdminCreditStatBucket =
  | 'Total'
  | 'Awaiting decision'
  | 'Allocation recorded'
  | 'Rejected';

/** The three non-Total buckets, derived from the header status (not child states). */
export type CreditStatBucket = Exclude<AdminCreditStatBucket, 'Total'>;

/**
 * Maps a credit request's header status to its stat-card bucket, or null when the
 * request counts only toward Total (Draft, Withdrawn, AutoRejected). The Approved
 * family (Approved plus the legacy Implementing/Implemented/ImplementedWithErrors
 * states) all read as "Allocation recorded": in this MVP an approval records the
 * allocated total on the header, and the older async-fulfilment states are treated
 * as recorded. Only an admin Reject counts as "Rejected".
 */
export function creditStatBucketForStatus(status: RequestStatus): CreditStatBucket | null {
  switch (status) {
    case 'Submitted':
    case 'UnderReview':
      return 'Awaiting decision';
    case 'Approved':
    case 'Implementing':
    case 'Implemented':
    case 'ImplementedWithErrors':
      return 'Allocation recorded';
    case 'Rejected':
      return 'Rejected';
    default:
      return null; // Draft, Withdrawn, AutoRejected — counted in Total only
  }
}

/**
 * Header-status badge for the admin credit surface: a plain label plus a shared
 * colour key. Approved-family statuses read as "Approved" — a decision label only;
 * per-environment results (and any "needs attention") are shown in the credits table.
 */
export const CREDIT_STATUS_BADGE: Record<RequestStatus, { label: string; colorKey: StatusDisplayKey }> = {
  Draft: { label: 'Draft', colorKey: 'Draft' },
  Submitted: { label: 'Awaiting decision', colorKey: 'Submitted' },
  UnderReview: { label: 'Awaiting decision', colorKey: 'In Review' },
  Approved: { label: 'Approved', colorKey: 'Completed' },
  Implementing: { label: 'Approved', colorKey: 'Completed' },
  Implemented: { label: 'Approved', colorKey: 'Completed' },
  ImplementedWithErrors: { label: 'Approved', colorKey: 'Completed' },
  Rejected: { label: 'Rejected', colorKey: 'Rejected' },
  Withdrawn: { label: 'Withdrawn', colorKey: 'Withdrawn' },
  AutoRejected: { label: 'Auto Rejected', colorKey: 'Auto Rejected' },
};

/** Reuses the existing StatusBadge colour keys for admin credit labels. No new colours. */
export const CREDIT_LABEL_TO_COLOR_KEY: Record<CreditRequestLabel, StatusDisplayKey> = {
  'Awaiting decision': 'Submitted',
  'Approved and awaiting allocation': 'Approved',
  Allocating: 'In Progress',
  Allocated: 'Completed',
  'Needs admin attention': 'Policy Failed',
  Declined: 'Rejected',
  Canceled: 'Withdrawn',
};
