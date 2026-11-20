import type { ActionOverrideMap } from './connectorAction';

export interface RequestConnector {
  id: string;               // cat_policyrequestconnectorid (PK GUID)
  policyRequestId: string;  // cat_policyrequestid (lookup FK)
  connectorId: string;      // cat_connectorid (lookup FK)
  connectorName?: string;   // display name — from cat_connectoridname (auto-populated lookup name)
  connectorKey?: string;    // connector key — from cat_policyrequestconnectorname (stored at submit time)
  connectorUrl?: string;    // details page URL — from cat_connectorurl (copied from cat_connectors.cat_connectordetailsurl at submit)
  connectorDisplayName?: string; // cat_connectordisplayname — snapshot of cat_connector.cat_connectorname at submit time
  actionOverrides?: ActionOverrideMap; // parsed from cat_actionoverrides JSON array
}

export interface RequestConnectorCreate {
  policyRequestId: string;
  connectorId: string;
}
