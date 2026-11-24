export type RiskLevel = 'No Risk' | 'Low' | 'Medium' | 'High' | 'None';

export interface Connector {
  id: string;                    // cat_connectorid (PK GUID)
  connectorKey: string;          // cat_connectorkey (AK)
  displayName: string;           // cat_displayname
  publisher?: string;            // cat_publisher
  category?: string;             // cat_category
  isPremium: boolean;            // cat_ispremium
  isActive: boolean;             // cat_isactive
  description?: string;          // cat_description
  riskLevel?: RiskLevel;         // cat_risklevel
  iconUrl?: string;              // cat_iconurl
  connectorDetailsUrl?: string;  // cat_connectordetailsurl
  actionCount?: number;           // cat_actioncount
  releaseTag?: string;            // cat_releasetag ('Production' | 'Preview')
  blockedByAdmin?: boolean;       // cat_blockedbyadmin — set by Sync flow when matched in cat_powershieldblockedconnectors
  connectorName?: string;         // cat_connectorname (primary name field)
}
