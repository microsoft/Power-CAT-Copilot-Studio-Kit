import type {
  EnvironmentGroup,
  InventoryProcess,
  InventorySettings,
  SettingsDraft,
  SettingsPageData,
} from '../contracts/types';
import { INVENTORY_PROCESS_NAMES } from '../contracts/types';

export function normalizeNumbers(values: number[]): number[] {
  return [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);
}

export function parseMultiSelect(value: unknown): number[] {
  if (Array.isArray(value)) {
    return normalizeNumbers(value.map(Number));
  }
  if (typeof value === 'number') {
    return [value];
  }
  if (typeof value === 'string') {
    return normalizeNumbers(value.split(',').map((item) => Number(item.trim())));
  }
  return [];
}

interface LegacyEnvironmentId {
  Value: string;
}

function isLegacyEnvironmentId(item: unknown): item is LegacyEnvironmentId {
  return (
    typeof item === 'object'
    && item !== null
    && 'Value' in item
    && typeof item.Value === 'string'
  );
}

/** Parse current and legacy environment ID representations stored by the settings apps. */
export function parseEnvironmentIds(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error('Stored environment IDs are not a valid array.');
  }

  const ids = parsed.map((item) => {
    if (typeof item === 'string') return item;
    if (isLegacyEnvironmentId(item)) return item.Value;
    throw new Error('Stored environment IDs contain an invalid entry.');
  });

  return [...new Set(ids.map((item) => item.trim()).filter(Boolean))];
}

/** Trim, drop blanks, and de-duplicate a set of environment IDs. */
export function normalizeEnvironmentIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/**
 * Serialize environment IDs into the `[{ "Value": guid }]` shape the Copilot
 * Studio Kit inventory cloud flows expect (the format the Power Apps settings
 * apps also write). Reading back is handled by {@link parseEnvironmentIds}.
 */
export function serializeEnvironmentIds(ids: string[]): string {
  return JSON.stringify(
    normalizeEnvironmentIds(ids).map((id) => ({ Value: id })),
    null,
    2,
  );
}

export function createDraft(data: SettingsPageData): SettingsDraft {
  const processByName = new Map(data.processes.map((process) => [process.name, process]));
  return {
    settings: {
      ...data.settings,
      environmentTypeValues: normalizeNumbers(data.settings.environmentTypeValues),
      agentTypeValues: normalizeNumbers(data.settings.agentTypeValues),
    },
    enabledGroupIds: data.groups.filter((group) => group.enabled).map((group) => group.id).sort(),
    autoSyncEnabled: processByName.get(INVENTORY_PROCESS_NAMES.autoSync)?.isActive ?? false,
    usageEnabled: data.settings.enableUsage === true
      && [
        INVENTORY_PROCESS_NAMES.usage,
        INVENTORY_PROCESS_NAMES.usageChild,
        INVENTORY_PROCESS_NAMES.usageGrandChild,
      ].every((name) => processByName.get(name)?.isActive),
  };
}

export function settingsEqual(left: InventorySettings, right: InventorySettings): boolean {
  return (
    left.excludeSystemAgents === right.excludeSystemAgents
    && left.aiGeneratedDescription === right.aiGeneratedDescription
    && left.oneInventory === right.oneInventory
    && left.enableUsage === right.enableUsage
    && normalizeNumbers(left.environmentTypeValues).join(',') === normalizeNumbers(right.environmentTypeValues).join(',')
    && normalizeNumbers(left.agentTypeValues).join(',') === normalizeNumbers(right.agentTypeValues).join(',')
  );
}

export function draftEqual(left: SettingsDraft, right: SettingsDraft): boolean {
  return (
    settingsEqual(left.settings, right.settings)
    && [...left.enabledGroupIds].sort().join(',') === [...right.enabledGroupIds].sort().join(',')
    && left.autoSyncEnabled === right.autoSyncEnabled
    && left.usageEnabled === right.usageEnabled
  );
}

export function validateGroupName(
  name: string,
  groups: EnvironmentGroup[],
  editingId?: string,
): string | undefined {
  const normalized = name.trim();
  if (!normalized) return 'Group name is required.';
  const duplicate = groups.some(
    (group) => group.id !== editingId && group.name.trim().localeCompare(normalized, undefined, { sensitivity: 'accent' }) === 0,
  );
  return duplicate ? 'An environment group with this name already exists.' : undefined;
}

export function requireProcess(
  processes: InventoryProcess[],
  name: InventoryProcess['name'],
): InventoryProcess {
  const matches = processes.filter((process) => process.name === name);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Required process "${name}" was not found.`
        : `Multiple processes named "${name}" were found.`,
    );
  }
  return matches[0];
}
