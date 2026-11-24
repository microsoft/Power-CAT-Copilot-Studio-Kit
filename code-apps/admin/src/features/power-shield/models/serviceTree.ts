export interface ServiceTree {
  id: string;               // cat_servicetreeid (PK GUID)
  name: string;             // cat_servicetreename
  organization?: string;    // cat_organization
  description?: string;     // cat_description
  createdOn?: string;       // createdon (Dataverse standard field)
}
