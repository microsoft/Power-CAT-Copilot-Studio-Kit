export interface BlockedConnector {
  id: string;              // cat_powershieldblockedconnectorsid (PK)
  name: string;            // cat_name
  connectorKey: string;    // cat_connectorkey
  publisherName?: string;  // cat_publishername
  blockReason?: string;    // cat_blockreason
  isNonBlockable: boolean; // cat_isnonblockable (0=No/false, 1=Yes/true)
  lastSyncedOn?: string;   // cat_lastsyncedon (ISO string)
  createdOn?: string;      // createdon (ISO string)
}
