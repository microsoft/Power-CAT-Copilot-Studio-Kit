import type { CreditEnvironmentView } from '../../../models/creditRequest';
import { needsRecovery } from './creditApprovalRules';

// ─────────────────────────────────────────────────────────────────────────────
// Retry planning (pure, unit-tested) — FR-020/FR-025.
//
// Turns the per-environment child states into a safe retry plan. Only
// FailedRetryable and UnknownOutcome are candidates; Succeeded, Pending and
// Processing are NEVER re-queued. UnknownOutcome is kept separate because the
// server reconciles it with a GET first and retries it only if it is still short
// of its stored absolute target (FR-020). Terminal FailedPermanent children are
// surfaced for the operator but never retried.
//
// This module performs NO I/O so it can be unit-tested in the node env without
// loading the @microsoft/power-apps data module.
// ─────────────────────────────────────────────────────────────────────────────

export type RetryFailureCategory = 'Authentication' | 'Service outage' | 'Capacity' | 'Other';

/** One shared-failure group: environments that failed for the same reason. */
export interface RetryFailureGroup {
  category: RetryFailureCategory;
  /** Representative (first) original error message for the group. */
  message: string;
  environments: CreditEnvironmentView[];
}

export interface CreditRetryPlan {
  /** FailedRetryable children — re-PATCHed to their stored absolute target. */
  failedRetryable: CreditEnvironmentView[];
  /** UnknownOutcome children — reconciled via GET first, retried only if unresolved. */
  unknownToReconcile: CreditEnvironmentView[];
  /** Everything sent to the server (failedRetryable + unknownToReconcile). */
  candidates: CreditEnvironmentView[];
  /** Terminal failures — shown with error + PPAC link, never retried. */
  permanent: CreditEnvironmentView[];
  /** Candidates grouped by shared failure category, identical messages deduped. */
  grouped: RetryFailureGroup[];
  /** candidates.length — drives whether the Retry action is offered. */
  candidateCount: number;
  /** Processing children whose attempt isn't running in this tab — recovery checks them (FR-020a). */
  stale: CreditEnvironmentView[];
  /** Everything an admin should look at: candidates, stale and permanent. */
  attentionCount: number;
}

const CATEGORY_ORDER: RetryFailureCategory[] = ['Authentication', 'Service outage', 'Capacity', 'Other'];

const CATEGORY_PATTERNS: Array<{ category: RetryFailureCategory; pattern: RegExp }> = [
  { category: 'Authentication', pattern: /auth|unauthor|token|forbidden|401|403|credential|permission|expired/i },
  { category: 'Capacity', pattern: /capacity|quota|insufficient|exceed|limit|throttl|429/i },
  { category: 'Service outage', pattern: /outage|unavailable|timeout|timed out|503|502|500|gateway|transient|retry later/i },
];

/**
 * Buckets a raw fulfilment error message into a shared-failure category so that
 * environments failing for the same reason can be grouped. Unmatched or empty
 * messages fall back to 'Other'.
 */
export function categorizeFailure(error: string | undefined): RetryFailureCategory {
  if (!error || !error.trim()) return 'Other';
  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(error)) return category;
  }
  return 'Other';
}

/** Normalizes a message for dedupe: lowercased, whitespace-collapsed, trimmed. */
function normalizeMessage(error: string | undefined): string {
  return (error ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Builds the retry plan from a request's environment children. See module note
 * for the state rules (FR-025). The grouping "suppresses pointless repeats" by
 * collapsing environments that share both a category and an identical message
 * into a single displayed group.
 */
export function buildRetryPlan(
  environments: CreditEnvironmentView[],
  sessionAttempts: ReadonlySet<string> = new Set(),
): CreditRetryPlan {
  const failedRetryable = environments.filter((e) => e.creditChildState === 'FailedRetryable');
  const unknownToReconcile = environments.filter((e) => e.creditChildState === 'UnknownOutcome');
  const permanent = environments.filter((e) => e.creditChildState === 'FailedPermanent');
  const candidates = [...failedRetryable, ...unknownToReconcile];
  const stale = environments.filter(
    (e) => e.creditChildState === 'Processing' && needsRecovery(e.creditChildState, e.attemptId, sessionAttempts),
  );

  // Group by (category, normalized message); keep the first original message.
  const groupMap = new Map<string, RetryFailureGroup>();
  for (const env of candidates) {
    const category = categorizeFailure(env.fulfillmentError);
    const key = `${category}::${normalizeMessage(env.fulfillmentError)}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.environments.push(env);
    } else {
      groupMap.set(key, {
        category,
        message: env.fulfillmentError?.trim() || 'No error detail reported',
        environments: [env],
      });
    }
  }

  const grouped = Array.from(groupMap.values()).sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.message.localeCompare(b.message),
  );

  return {
    failedRetryable,
    unknownToReconcile,
    candidates,
    permanent,
    grouped,
    candidateCount: candidates.length,
    stale,
    attentionCount: candidates.length + stale.length + permanent.length,
  };
}

/** Normalized environment GUIDs sent to the server retry action (one active op per env). */
export function retryEnvironmentIds(plan: CreditRetryPlan): string[] {
  return plan.candidates.map((e) => e.environmentGuid).filter((id) => id.length > 0);
}
