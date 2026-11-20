export type ActionStatus = 'Allow' | 'Block' | 'Unknown';

/** Per-connector action overrides stored by the maker. Key = cat_actionkey, value = desired status. */
export type ActionOverrideMap = Record<string, 'Allow' | 'Block'>;

export interface ConnectorAction {
  id: string;                   // cat_connectoractionid (PK GUID)
  connectorId: string;          // _cat_connectorid_value
  actionName: string;           // cat_actionname
  actionKey: string;            // cat_actionkey
  actionDescription?: string;   // cat_actiondescription
  actionStatus: ActionStatus;   // cat_actionstatus (1=Allow, 2=Block)
  isActive: boolean;            // cat_isactive
  blockedByAdmin?: boolean;     // cat_blockedbyadmin
}
