import type {
  CreditWizardEnvironment,
  CreditEnvDiff,
  CreditSubmitOutcome,
} from '../../../../models/creditRequest';
import { countInvalidRows } from '../../../../shared/utils/creditAmountRules';

// ─────────────────────────────────────────────────────────────────────────────
// Credit wizard reducer state (spec 016, T016) — SEPARATE from the connector
// `WizardState` by hard requirement (FR-008, FR-021). This is deliberately small:
// credits has no connectors, questionnaire, action overrides, or clone flow.
//
// Design decisions (rubber-duck review, 2026-09-17):
//  • `submissionBlockedReason` is DERIVED by `getSubmissionBlockedReason` below,
//    NOT stored — stored derived state goes stale (duck #5). The reducer stores
//    only facts.
//  • Environment confirmation is ONE enum, not two booleans, so first-run
//    confirmation and post-draft-resume reconfirmation can never drift into an
//    impossible combination (duck #6).
//  • Partial fan-out submit is first-class: the wizard keeps a submit phase plus
//    per-environment outcomes so a mixed result never strands the maker, and a
//    retry targets only `failed` environments (duck #2).
//  • `LOAD_DRAFT` reinitialises then hydrates durable fields only; a browser
//    `File` is never restored from a draft (duck #7).
//  • The CURRENT step is owned by the shell/route (like the connector wizard),
//    not the reducer; the reducer only gates via `highestCompletedStep`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zero-based index of the step on screen:
 * 0 Environments, 1 Request credits, 2 Justification, 3 Review.
 * `highestCompletedStep` and `attemptedNextSteps` reuse it one-based ("tried to go to step N").
 */
export type CreditWizardStep = 0 | 1 | 2 | 3;

/**
 * Single confirmation state for the environment scope. Preselection of one
 * eligible option never auto-counts as confirmed (FR-009, FR-010).
 *  - `unconfirmed`      scope chosen/changed; maker has not confirmed it yet
 *  - `confirmed`        maker confirmed the current scope
 *  - `diffPending`      resumed draft scope differs from the eligible set; the
 *                       maker must acknowledge the change before submit (FR-021)
 *  - `diffAcknowledged` maker acknowledged the diff; the resulting set is confirmed
 */
export type CreditEnvConfirmation =
  | 'unconfirmed'
  | 'confirmed'
  | 'diffPending'
  | 'diffAcknowledged';

/**
 * Outcome of revalidating a resumed draft against the currently eligible
 * environments. Removes the `envDiff === null` ambiguity (duck #4).
 *  - `notApplicable` a fresh request (no draft resumed)
 *  - `unchanged`     resumed draft, eligible set matches the captured set
 *  - `changed`       resumed draft, `envDiff` is populated
 *  - `invalidAccess` none of the draft's environments is available to the maker any more
 */
export type CreditDraftRevalidation =
  | 'notApplicable'
  | 'unchanged'
  | 'changed'
  | 'invalidAccess';

/** Client-side fan-out submit lifecycle (no server transaction; A-5 partial success). */
export type CreditSubmitPhase = 'idle' | 'submitting' | 'completed';

/**
 * Why submit is currently blocked. This is the return type of the
 * `getSubmissionBlockedReason` SELECTOR — it is not stored in state.
 * `null` means submit is allowed. A single-active-per-environment `conflict`
 * is a submit OUTCOME, not a blocked reason (duck #13).
 */
export type CreditSubmissionBlockedReason =
  | 'viewOnly'
  | 'noEnvironments'
  | 'envScopeUnconfirmed'
  | 'invalidRows'
  | 'invalidDraftAccess'
  | 'missingJustification'
  | 'submitting'
  | 'alreadySubmitted';

export interface CreditWizardState {
  draftRequestId?: string;
  highestCompletedStep: CreditWizardStep;

  // Step 1 — which environments.
  /** Snapshot captured from eligible options; identifiers originate from the option list, never typed (FR-025, duck #12). */
  selectedEnvironments: CreditWizardEnvironment[];
  envConfirmation: CreditEnvConfirmation;
  /** Preserved through Review so Step 3 can show exactly what changed on a resumed draft. */
  envDiff: CreditEnvDiff | null;
  draftRevalidation: CreditDraftRevalidation;

  // Step 2 — raw "Credits requested" text keyed by environmentId (spec 026). Parsed by
  // creditAmountRules; kept raw so the box shows exactly what the maker typed.
  requestedAmounts: Record<string, string>;
  /** "Draw from tenant" ticks keyed by environmentId (spec 031). Only `true` matters. */
  requestTenantDraw: Record<string, boolean>;

  // Step 3 — justification + one optional supporting document.
  justification: string;
  /** A NEWLY selected local file only. Never restored from a draft (a File is not serialisable). */
  supportingDocument?: File;
  /** Display name of a document already attached to a resumed draft (metadata only). */
  existingSupportingDocumentName?: string;

  // Validation visibility — remember which steps the maker tried to leave so the
  // Back navigation can re-show validation without storing error strings (FR-023, duck #10).
  attemptedNextSteps: CreditWizardStep[];

  // Submit lifecycle (partial fan-out). `submitOutcomes` freezes editing once any
  // environment is `created` and lets a retry target only `failed` envs (duck #2).
  submitPhase: CreditSubmitPhase;
  submitOutcomes: CreditSubmitOutcome[];

  // Step 1 early conflict probe (findActiveCreditConflicts). Populated when the
  // maker presses Next and one or more captured environments already have an active
  // credit request, so the clash is surfaced on Step 1 instead of at submit.
  step1Conflicts: CreditSubmitOutcome[];
}

export const CREDIT_WIZARD_INITIAL_STATE: CreditWizardState = {
  highestCompletedStep: 0,
  selectedEnvironments: [],
  envConfirmation: 'unconfirmed',
  envDiff: null,
  draftRevalidation: 'notApplicable',
  requestedAmounts: {},
  requestTenantDraw: {},
  justification: '',
  attemptedNextSteps: [],
  submitPhase: 'idle',
  submitOutcomes: [],
  step1Conflicts: [],
};

/** Durable fields hydrated by `LOAD_DRAFT` (everything else is reset to initial). */
export interface CreditLoadDraftPayload {
  draftRequestId: string;
  selectedEnvironments: CreditWizardEnvironment[];
  justification: string;
  existingSupportingDocumentName?: string;
  envDiff: CreditEnvDiff | null;
  draftRevalidation: CreditDraftRevalidation;
  /** Raw amount text keyed by environmentId (same key as `selectedEnvironments`). */
  requestedAmounts?: Record<string, string>;
  /** Tenant-draw ticks keyed by environmentId (spec 031). */
  requestTenantDraw?: Record<string, boolean>;
}

export type CreditWizardAction =
  | { type: 'SET_ENVIRONMENTS'; payload: CreditWizardEnvironment[] }
  | { type: 'CONFIRM_ENVIRONMENTS' }
  | { type: 'SET_ENV_DIFF'; payload: { diff: CreditEnvDiff | null; revalidation: CreditDraftRevalidation } }
  | { type: 'ACKNOWLEDGE_ENV_DIFF' }
  | { type: 'SET_REQUESTED_AMOUNT'; payload: { environmentId: string; raw: string } }
  | { type: 'SET_TENANT_DRAW'; payload: { environmentId: string; value: boolean } }
  | { type: 'SET_JUSTIFICATION'; payload: string }
  | { type: 'SET_DOCUMENT'; payload: File | undefined }
  | { type: 'ADVANCE_STEP'; payload: 1 | 2 | 3 }
  | { type: 'MARK_NEXT_ATTEMPTED'; payload: CreditWizardStep }
  | { type: 'SET_STEP1_CONFLICTS'; payload: CreditSubmitOutcome[] }
  | { type: 'LOAD_DRAFT'; payload: CreditLoadDraftPayload }
  | { type: 'SET_DRAFT_ID'; payload: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_COMPLETE'; payload: CreditSubmitOutcome[] }
  /** Retry after a partial success: like SUBMIT_START but keeps earlier outcomes (FR-016). */
  | { type: 'RETRY_START' }
  /** Merge retried outcomes into the earlier ones by environmentGuid. `[]` keeps everything. */
  | { type: 'RETRY_COMPLETE'; payload: CreditSubmitOutcome[] }
  | { type: 'RESET' };

// ─────────────────────────────────────────────────────────────────────────────
// Derived selectors (kept beside the state they read; no stored duplicates)
// ─────────────────────────────────────────────────────────────────────────────

/** True once any environment header was created — editing must freeze from here (duck #2). */
export function hasCreatedAnyEnvironment(state: CreditWizardState): boolean {
  return state.submitOutcomes.some((o) => o.status === 'created');
}

/**
 * The single, deterministic reason submit is blocked, or `null` when it is
 * allowed. Order encodes priority: the earliest applicable reason wins.
 * `isViewOnly` comes from the auth role context (not wizard state).
 */
export function getSubmissionBlockedReason(
  state: CreditWizardState,
  isViewOnly: boolean,
): CreditSubmissionBlockedReason | null {
  if (isViewOnly) return 'viewOnly';
  if (state.submitPhase === 'submitting') return 'submitting';
  if (hasCreatedAnyEnvironment(state)) return 'alreadySubmitted';
  if (state.draftRevalidation === 'invalidAccess') return 'invalidDraftAccess';
  if (state.selectedEnvironments.length === 0) return 'noEnvironments';
  if (state.envConfirmation === 'unconfirmed' || state.envConfirmation === 'diffPending') {
    return 'envScopeUnconfirmed';
  }
  if (
    countInvalidRows(
      state.selectedEnvironments.map((e) => e.environmentId),
      state.requestedAmounts,
      state.requestTenantDraw,
    ) > 0
  ) {
    return 'invalidRows';
  }
  if (state.justification.trim().length === 0) return 'missingJustification';
  return null;
}

export function canSubmitCredit(state: CreditWizardState, isViewOnly: boolean): boolean {
  return getSubmissionBlockedReason(state, isViewOnly) === null;
}

/**
 * Whether "Retry failed" may run. Deliberately skips the `alreadySubmitted` rule: after a
 * partial success the main Submit stays locked, but the failed environments can be retried.
 */
export function canRetryFailed(state: CreditWizardState, isViewOnly: boolean): boolean {
  if (isViewOnly) return false;
  if (state.submitPhase === 'submitting') return false;
  return state.submitOutcomes.some((o) => o.status === 'failed');
}

/** Replace earlier outcomes with retried ones by `environmentGuid`, keeping the original order. */
export function mergeSubmitOutcomes(
  previous: CreditSubmitOutcome[],
  retried: CreditSubmitOutcome[],
): CreditSubmitOutcome[] {
  const byEnv = new Map(retried.map((o) => [o.environmentGuid, o]));
  const merged = previous.map((o) => byEnv.get(o.environmentGuid) ?? o);
  const known = new Set(previous.map((o) => o.environmentGuid));
  return [...merged, ...retried.filter((o) => !known.has(o.environmentGuid))];
}
