/** A member record loaded from Dataverse (cat_powershieldservicetreememberses). */
export interface ServiceTreeMember {
  /** cat_powershieldservicetreemembersid */
  id: string;
  /** _cat_servicetree_value */
  serviceTreeId: string;
  /** _cat_member_value */
  dvUserId: string;
  /** cat_name (display name stored at creation time) */
  displayName: string;
}

/** In-memory representation used during the add-member flow (MemberPicker). */
export interface ServiceTreeMemberEntry {
  /** Dataverse systemuser PK */
  dvUserId: string;
  /** Azure AD Object ID (from lookupUserByDomainName) */
  aadObjectId: string;
  /** User Principal Name – used for duplicate detection and display */
  upn: string;
  /** Full display name – persisted as cat_name */
  displayName: string;
}
