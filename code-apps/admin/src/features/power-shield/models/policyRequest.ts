import type { RequestStatus } from './status';

/**
 * Discriminator that isolates connector policy requests from credit requests.
 * Bound to `cat_requesttype` (335350000 = Connector, 335350001 = Credits).
 * Legacy pre-upgrade rows have a null `cat_requesttype`; the data layer
 * normalizes null to 'Connector', so this domain field is always resolved.
 */
export type RequestType = 'Connector' | 'Credits';

export interface PolicyRequest {
  id: string;                       // cat_policyrequestid (PK GUID)
  requestType: RequestType;         // cat_requesttype (null-normalized to 'Connector')
  requestNumber: string;            // cat_policyrequestname (primary name, auto-number e.g. REQ-0042)
  serviceTreeId: string;            // cat_servicetreeid (lookup FK)
  serviceTreeName?: string;         // fetched via cat_servicetrees(cat_servicetreename) by GUID
  createdByAadObjectId: string;     // cat_createdbyaadobjectid (stored as text)
  createdByUpn: string;             // cat_createdbyupn
  createdByName?: string;           // resolved from systemusers.fullname via AAD Object ID
  status: RequestStatus;            // cat_status
  justification: string;            // cat_justification
  adminComment?: string;            // cat_admincomment
  submittedOn?: string;             // cat_submittedon (ISO datetime string)
  decidedOn?: string;               // cat_decidedon (ISO datetime string)
  approvedByAadObjectId?: string;   // cat_approvedbyaadobjectid (stored as text)
  dlpPolicyId?: string;             // cat_dlppolicyid (written by flow)
  dlpPolicyName?: string;           // cat_dlppolicyname (written by flow)
  lastErrorSummary?: string;        // cat_lasterrorsummary (written by flow)
  hasSupportingDocument: boolean;   // derived: true if annotation with SUPPORTING_DOC prefix exists
  supportingDocumentAttachment?: { id: string; fileName: string; mimeType: string; fileSize: number };
  environmentGroupId?: string;     // _cat_environmentgroup_value (lookup GUID)
  environmentGroupName?: string;   // resolved from cat_powershieldenvironmentgroups.cat_name
  assignedAdminName?: string;      // cat_assignedadministratorname (lookup display name)
  assignedAdminDvUserId?: string;  // _cat_assignedadministrator_value (systemuser GUID)
}

/** Summary row used in request list views */
export interface PolicyRequestSummary {
  id: string;
  requestType: RequestType;       // cat_requesttype (null-normalized to 'Connector')
  requestNumber: string;
  serviceTreeId: string;
  serviceTreeName?: string;
  environmentGroupId?: string;    // _cat_environmentgroup_value (lookup GUID)
  environmentGroupName?: string;  // resolved from cat_powershieldenvironmentgroups.cat_name
  environmentCount?: number;      // cat_requestenvironmentcount
  connectorsCount?: number;       // cat_policyconnectorscount
  status: RequestStatus;
  submittedOn?: string;
  createdByUpn: string;
  createdByAadObjectId?: string;
  createdByName?: string;           // resolved from systemusers.fullname via AAD Object ID
  assignedAdminName?: string;      // cat_assignedadministratorname (lookup display name)
}
