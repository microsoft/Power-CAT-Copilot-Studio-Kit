import type { FulfillmentStatus, CreditChildState } from './status';

/** Per-environment enforcement snapshot preserved on PATCH (0/1 flags). */
export interface CreditEnforcementSnapshot {
  alert: boolean;       // cat_credit_enf_alert
  tenantPool: boolean;  // cat_credit_enf_tenantpool
  payGo: boolean;       // cat_credit_enf_paygo
  deny: boolean;        // cat_credit_enf_deny
}

export interface RequestEnvironment {
  id: string;                    // cat_policyrequestenvironmentid (PK GUID)
  policyRequestId: string;       // cat_policyrequestid (lookup FK)
  environmentGuid: string;       // cat_environmentguid — PP environment unique ID
  environmentName: string;       // cat_environmentname — PP environment display name
  fulfillmentStatus: FulfillmentStatus;  // cat_fulfillmentstatus
  fulfillmentError?: string;     // cat_fulfillmenterror
  fulfilledOn?: string;          // cat_fulfilledon (ISO datetime string)
  // Credit slice — shared (non-secured) fields:
  creditChildState?: CreditChildState;  // cat_credit_childstate
  activeEnvKey?: string;                // cat_credit_activeenvkey (unique alt-key value)
  // Credit slice — admin-only, field-secured (Copilot Credits Admin profile).
  // These are amounts the maker never sees; written by the approval command.
  approvedAmount?: number;         // cat_credit_approvedamount
  absoluteTarget?: number;         // cat_credit_absolutetarget
  observedAllocation?: number;     // cat_credit_observedallocation
  lastVerifiedAllocation?: number; // cat_credit_lastverifiedallocation
  enforcement?: CreditEnforcementSnapshot;
}
