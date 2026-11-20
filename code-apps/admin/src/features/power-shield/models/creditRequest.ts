import type { CreditChildState, CreditRequestLabel } from './status';
import type { CreditEnforcementSnapshot } from './requestEnvironment';
import type { RequestStatus } from './status';
import type { RequestParticipant } from './requestParticipant';

// ─────────────────────────────────────────────────────────────────────────────
// Credit request view models (Admin experience).
//
// Unlike the maker slice, these types DO expose the privileged `cat_credit_*`
// amounts the admin is entitled to read through the `Copilot Credits Admin`
// field security profile (data-model.md §2, contracts/creditRequests-admin-repository.md).
// The typed admin repository (creditRequestService.ts) is the only reader/writer.
// ─────────────────────────────────────────────────────────────────────────────

/** One environment inside a credit request, admin view (amounts included). */
export interface CreditEnvironmentView {
  id: string;                          // cat_policyrequestenvironmentid (PK GUID)
  environmentGuid: string;             // cat_environmentguid — PP environment unique ID
  environmentName: string;             // cat_environmentname — PP environment display name
  creditChildState?: CreditChildState; // cat_credit_childstate — drives Outcome/Allocation column
  activeEnvKey?: string;               // cat_credit_activeenvkey — set only while an op is active
  // Privileged, field-secured amounts (present only in detail reads):
  approvedAmount?: number;             // cat_credit_approvedamount
  requestedAmount?: number;            // cat_creditrequestedamount — set by the maker
  requestTenantDraw?: boolean;         // cat_credit_requesttenantdraw — maker asked to draw from tenant
  tenantDrawApproved?: boolean;        // cat_credit_tenantdrawapproved — admin's attempt turns draw on
  absoluteTarget?: number;             // cat_credit_absolutetarget
  observedAllocation?: number;         // cat_credit_observedallocation
  lastVerifiedAllocation?: number;     // cat_credit_lastverifiedallocation
  enforcement?: CreditEnforcementSnapshot;
  operationId?: string;                // cat_credit_operationid
  attemptId?: string;                  // cat_credit_attemptid
  correlationId?: string;              // cat_credit_correlationid
  fulfillmentError?: string;           // cat_fulfillmenterror
}

/** Summary row for the admin Copilot Credits landing list. */
export interface CreditRequestSummary {
  id: string;
  requestNumber: string;               // cat_policyrequestname (auto-number)
  serviceTreeId: string;
  serviceTreeName?: string;
  environmentGroupId?: string;
  environmentGroupName?: string;
  environmentCount?: number;           // cat_requestenvironmentcount
  status: RequestStatus;               // header cat_status (shared option set)
  creditLabel: CreditRequestLabel;     // derived admin label (child-state primary)
  assignedAdminName?: string;          // cat_assignedadministratorname
  assignedAdminDvUserId?: string;      // _cat_assignedadministrator_value (systemuser GUID)
  submittedOn?: string;
  decidedOn?: string;                  // cat_decidedon
  createdByUpn: string;
  createdByAadObjectId?: string;
  createdByName?: string;
  /** Credits actually added (verified − observed; Skipped = 0). Undefined until every environment is confirmed. */
  creditsAdded?: number;
  /** Credits the maker asked for. Undefined for older requests without amounts. */
  creditsRequested?: number;
  /** Display names of the request's environments (cat_environmentname). Usually one. */
  environmentNames: string[];
}

/** Full credit request header + privileged children (admin). */
export interface CreditRequestDetail {
  id: string;
  requestNumber: string;
  serviceTreeId: string;
  serviceTreeName?: string;
  environmentGroupId?: string;
  environmentGroupName?: string;
  status: RequestStatus;
  creditLabel: CreditRequestLabel;
  /** The whole-number credit total the admin recorded at approval (cat_credit_allocatedtotal). Undefined until approved. */
  allocatedTotal?: number;
  justification: string;
  submittedOn?: string;
  decidedOn?: string;
  lastErrorSummary?: string;
  rowVersion?: string;                 // @odata.etag — optimistic concurrency for compare-and-set
  assignedAdminName?: string;
  assignedAdminDvUserId?: string;
  allocationOwner?: string;            // cat_credit_allocationowner
  reviewByDate?: string;               // cat_credit_reviewbydate
  intendedDuration?: number;           // cat_credit_intendedduration
  createdByAadObjectId: string;
  createdByUpn: string;
  createdByName?: string;
  environments: CreditEnvironmentView[];
  participants: RequestParticipant[];
}

/** Append-only audit event surfaced on the Activity/audit tab. */
export interface CreditAuditEvent {
  id: string;
  timestamp: string;
  actor?: string;
  action: string;
  detail?: string;
  environmentGuid?: string;
  operationId?: string;
  attemptId?: string;
}

/** One environment's current allocation and the amount being added. */
export interface CreditNetImpactInput {
  observedCurrent?: number;
  approvedAmount: number;
}

/**
 * Net capacity impact = Σ over environments of max(target − current, 0),
 * where target = observedCurrent + approvedAmount. NOT the sum of targets.
 * See data-model.md §6, FR-008/012.
 */
export function computeNetImpact(environments: CreditNetImpactInput[]): number {
  return environments.reduce((sum, env) => {
    const current = env.observedCurrent ?? 0;
    const target = current + env.approvedAmount;
    return sum + Math.max(target - current, 0);
  }, 0);
}
