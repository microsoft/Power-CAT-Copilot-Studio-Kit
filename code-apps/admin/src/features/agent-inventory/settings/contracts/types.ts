export const ENVIRONMENT_TYPE_OPTIONS = [
  { value: 0, label: 'Default' },
  { value: 1, label: 'Developer' },
  { value: 2, label: 'Production' },
  { value: 3, label: 'Sandbox' },
  { value: 4, label: 'Teams' },
  { value: 5, label: 'Trial' },
] as const;

export const AGENT_TYPE_OPTIONS = [
  { value: 0, label: 'Custom agents' },
  { value: 1, label: 'Declarative agents' },
] as const;

export const INVENTORY_PROCESS_NAMES = {
  autoSync: 'Agent Inventory | Agents Data Load Scheduler',
  usage: 'Agent Inventory | Usage Data Load',
  usageChild: 'Agent Inventory | Usage Data Load (Child)',
  usageGrandChild: 'Agent Inventory | Usage Data Load (GrandChild)',
} as const;

export type InventoryProcessName =
  typeof INVENTORY_PROCESS_NAMES[keyof typeof INVENTORY_PROCESS_NAMES];

export interface InventorySettings {
  id?: string;
  environmentTypeValues: number[];
  agentTypeValues: number[];
  excludeSystemAgents: boolean;
  aiGeneratedDescription: boolean;
  oneInventory: boolean;
  enableUsage: boolean;
}

export interface EnvironmentGroup {
  id: string;
  name: string;
  environmentIds: string[];
  environmentCount: number;
  enabled: boolean;
  modifiedOn?: string;
}

export interface EnvironmentCatalogItem {
  id: string;
  name: string;
  type: string;
  region: string;
  url: string;
}

export interface InventoryProcess {
  id: string;
  name: InventoryProcessName;
  stateCode: number;
  statusCode?: number;
  isActive: boolean;
  isManaged: boolean;
}

export interface SettingsPageData {
  settings: InventorySettings;
  groups: EnvironmentGroup[];
  environments: EnvironmentCatalogItem[];
  processes: InventoryProcess[];
}

export interface EnvironmentGroupInput {
  id?: string;
  name: string;
  environmentIds: string[];
}

export interface SettingsDraft {
  settings: InventorySettings;
  enabledGroupIds: string[];
  autoSyncEnabled: boolean;
  usageEnabled: boolean;
}

export interface SaveOperationResult {
  key: string;
  label: string;
  status: 'succeeded' | 'failed';
  message?: string;
}

export interface SettingsSaveResult {
  operations: SaveOperationResult[];
  succeeded: boolean;
  partiallySucceeded: boolean;
}

export interface SettingsSaveRequest {
  baseline: SettingsPageData;
  draft: SettingsDraft;
}
