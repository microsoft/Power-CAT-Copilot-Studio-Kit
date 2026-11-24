export interface EnvironmentGroup {
  id: string;          // cat_powershieldenvironmentgroupid
  name: string;        // cat_name
  description?: string;
  ownerUpn?: string;   // cat_ownerupn
  memberCount: number; // derived from member query count
  createdOn?: string;  // createdon (Dataverse standard field)
}

export interface EnvironmentGroupMember {
  environmentGuid: string;   // cat_environmentguid
  environmentName: string;   // cat_environmentname
}
