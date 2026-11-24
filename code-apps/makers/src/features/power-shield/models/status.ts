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
// Credit slice (Copilot Credits) — isolated from the connector RequestStatus above
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-environment child fulfilment state for a credit request.
 * Bound to `cat_credit_childstate` (335350010–335350015). See data-model.md §8.
 * Single-environment grain: there is no Skipped/Superseded state.
 */
export type CreditChildState =
  | 'Pending'
  | 'Processing'
  | 'Succeeded'
  | 'FailedRetryable'
  | 'FailedPermanent'
  | 'UnknownOutcome';

/**
 * Maker-visible request label for a credit request (data-model.md §4/§5).
 * This is a server rollup of the header state plus child `CreditChildState`; the
 * maker slice reads it and never computes it authoritatively.
 */
export type CreditRequestLabel =
  | 'Draft'
  | 'Awaiting approval'
  | 'Returned'
  | 'Declined'
  | 'Approved and awaiting allocation'
  | 'Allocating'
  | 'Allocated'
  | 'Needs admin attention'
  | 'Withdrawn';

/**
 * Maker-facing per-environment status label. Plain language, no amounts — makers
 * see whether an environment's credits are pending, granted, or need attention.
 */
export const CREDIT_CHILD_STATE_LABELS: Record<CreditChildState, string> = {
  Pending: 'Awaiting allocation',
  Processing: 'Allocating',
  Succeeded: 'Allocated',
  FailedRetryable: 'Needs attention',
  FailedPermanent: 'Needs attention',
  UnknownOutcome: 'Needs attention',
};

/** Reuses the shared pill palette for each per-environment child state. */
export const CREDIT_CHILD_STATE_TO_COLOR_KEY: Record<CreditChildState, StatusDisplayKey> = {
  Pending: 'Submitted',
  Processing: 'In Progress',
  Succeeded: 'Completed',
  FailedRetryable: 'Policy Failed',
  FailedPermanent: 'Policy Failed',
  UnknownOutcome: 'Policy Failed',
};

/** Stat-card buckets on the credit landing page (data-model.md §5, A-3). */
export type CreditStatCardBucket =
  | 'Total'
  | 'Awaiting decision'
  | 'Being allocated'
  | 'Allocated'
  | 'Needs your attention';

/**
 * Maps each maker credit label to its stat-card bucket (data-model.md §5 table).
 * `null` means the label is terminal and belongs to no active bucket
 * (Declined, Withdrawn). Every request also counts toward Total separately.
 */
export const CREDIT_LABEL_TO_STAT_BUCKET: Record<CreditRequestLabel, CreditStatCardBucket | null> = {
  Draft: 'Total',
  'Awaiting approval': 'Awaiting decision',
  Returned: 'Awaiting decision',
  Declined: null,
  'Approved and awaiting allocation': 'Being allocated',
  Allocating: 'Being allocated',
  Allocated: 'Allocated',
  'Needs admin attention': 'Needs your attention',
  Withdrawn: null,
};

/**
 * Reuses the existing StatusBadge colour keys for credit labels so the credit
 * slice renders with the shared badge styling (data-model.md §5). No new colours.
 */
export const CREDIT_LABEL_TO_COLOR_KEY: Record<CreditRequestLabel, StatusDisplayKey> = {
  Draft: 'Draft',
  'Awaiting approval': 'Submitted',
  Returned: 'In Review',
  Declined: 'Rejected',
  'Approved and awaiting allocation': 'Approved',
  Allocating: 'In Progress',
  Allocated: 'Completed',
  'Needs admin attention': 'Policy Failed',
  Withdrawn: 'Withdrawn',
};
