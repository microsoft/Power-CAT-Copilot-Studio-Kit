import type { FulfillmentStatus, CreditChildState } from './status';

export interface RequestEnvironment {
  id: string;                    // cat_policyrequestenvironmentid (PK GUID)
  policyRequestId: string;       // cat_policyrequestid (lookup FK)
  environmentGuid: string;       // cat_environmentguid — PP environment unique ID
  environmentName: string;       // cat_environmentname — PP environment display name
  fulfillmentStatus: FulfillmentStatus;  // cat_fulfillmentstatus
  fulfillmentError?: string;     // cat_fulfillmenterror
  fulfilledOn?: string;          // cat_fulfilledon (ISO datetime string)
  // Credit slice (maker-visible fields only; never amounts/targets):
  creditChildState?: CreditChildState;  // cat_credit_childstate
  activeEnvKey?: string;                // cat_credit_activeenvkey (unique alt-key value)
}
