import type { RequestStatus, CreditChildState, CreditRequestLabel } from './status';
import type { RequestParticipant } from './requestParticipant';
import type { RequestAnswerCreate } from './requestAnswer';

// ─────────────────────────────────────────────────────────────────────────────
// Credit request view models (Maker experience).
//
// These types expose maker-safe fields ONLY. The only amounts present are the
// maker's own requested amount and the admin's approved amount (spec 026). No
// target, enforcement, or idempotency/audit column is present on any type here.
// The typed credit repository (creditRequestService.ts) is the only writer.
// ─────────────────────────────────────────────────────────────────────────────

/** One environment inside a credit request, maker-safe. */
export interface CreditEnvironmentView {
  id: string;                        // cat_policyrequestenvironmentid (PK GUID)
  environmentGuid: string;           // cat_environmentguid — PP environment unique ID
  environmentName: string;           // cat_environmentname — PP environment display name
  creditChildState?: CreditChildState; // cat_credit_childstate — drives Outcome/Allocation column
  activeEnvKey?: string;             // cat_credit_activeenvkey — set only while an op is active
  requestedAmount?: number;          // cat_creditrequestedamount — undefined shows as "—"
  approvedAmount?: number;           // cat_credit_approvedamount — set by the admin (spec 027)
  requestTenantDraw: boolean;        // cat_credit_requesttenantdraw — maker asked to draw from tenant (spec 031)
}

/** Summary row for the Copilot Credits landing list. */
export interface CreditRequestSummary {
  id: string;
  requestNumber: string;             // cat_policyrequestname (auto-number)
  serviceTreeId: string;
  serviceTreeName?: string;
  environmentGroupId?: string;
  environmentGroupName?: string;
  environmentCount?: number;         // cat_requestenvironmentcount
  requestedAmount?: number;          // the single child's cat_creditrequestedamount (one env per header)
  status: RequestStatus;             // header cat_status (shared option set)
  creditLabel: CreditRequestLabel;   // derived maker label (see note in creditRequestService)
  creditsAdded?: number;             // approved amount once allocation succeeded; undefined shows "-"
  submittedOn?: string;
  decidedOn?: string;                // cat_decidedon
  assignedAdminName?: string;        // resolved from _cat_assignedadministrator_value
  createdByUpn: string;
  createdByAadObjectId?: string;
  createdByName?: string;
  /** Display names of the request's environments (cat_environmentname). One once submitted; a draft can have several. */
  environmentNames: string[];
}

/** Full credit request header + maker-safe children. */
export interface CreditRequestDetail {
  id: string;
  requestNumber: string;
  serviceTreeId: string;
  serviceTreeName?: string;
  environmentGroupId?: string;
  environmentGroupName?: string;
  status: RequestStatus;
  creditLabel: CreditRequestLabel;
  justification: string;
  submittedOn?: string;
  decidedOn?: string;
  lastErrorSummary?: string;
  createdByAadObjectId: string;
  createdByUpn: string;
  createdByName?: string;
  environments: CreditEnvironmentView[];
  participants: RequestParticipant[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Write / lifecycle payloads
// ─────────────────────────────────────────────────────────────────────────────

/** One environment the maker selected, captured by name (never a raw GUID in UI). */
export interface CreditWizardEnvironment {
  environmentId: string;   // PP environment unique ID (value.name)
  displayName: string;     // PP environment display name
}

/** A participant the maker added to a credit request. */
export interface CreditParticipantInput {
  dvUserId: string;        // systemuser GUID (for the @odata.bind)
  aadObjectId: string;
  upn: string;
  displayName: string;
}

/** Draft save payload — a single durable draft header with N environment children. */
export interface CreditDraftPayload {
  createdByAadObjectId: string;
  createdByUpn: string;
  justification: string;                 // may be empty/short for a draft
  environments: CreditWizardEnvironment[];
  answers?: RequestAnswerCreate[];
  participants?: CreditParticipantInput[];
  supportingDocument?: File;
  draftRequestId?: string;               // set when re-saving an existing draft
  /** Valid requested amounts keyed by environmentId. May be partial for a draft. */
  requestedAmounts?: Record<string, number>;
  /** `true` for environments where the maker asked to draw from tenant capacity (spec 031). */
  requestTenantDraw?: Record<string, boolean>;
}

/**
 * Submit payload — fans out to one header per environment. Each environment needs
 * a valid amount, a tenant-draw tick, or both; one with neither is marked `failed` (fail closed).
 */
export type CreditSubmitPayload = CreditDraftPayload & {
  requestedAmounts: Record<string, number>;
};

/** Per-environment outcome of a submit fan-out (A-5). */
export interface CreditSubmitOutcome {
  environmentGuid: string;
  requestId?: string;
  /**
   * `created` — header + active child persisted.
   * `conflict` — the environment's unique active-key is already held (report only).
   * `failed` — a non-conflict error (network/permission/partial write); `requestId`,
   *   when present, points at a header that may need cleanup (client-side submit is
   *   non-transactional — see data-model.md §7a; true atomicity needs a server command).
   */
  status: 'created' | 'conflict' | 'failed';
  conflictWithRequestId?: string;
  error?: string;
}

export interface CreditSubmitResult {
  results: CreditSubmitOutcome[];
}

/** Difference between a resumed draft's environments and the currently eligible set. */
export interface CreditEnvDiff {
  removed: CreditWizardEnvironment[];  // captured in the draft, no longer available
}

export interface LoadCreditDraftResult {
  detail: CreditRequestDetail;
  envDiff: CreditEnvDiff;
}
