import type { Cat_agentinventorysettingses } from '../../../../generated/models/Cat_agentinventorysettingsesModel';
import type { Cat_agentinventorysettingsesBase } from '../../../../generated/models/Cat_agentinventorysettingsesModel';
import { Cat_agentinventorysettingsesService } from '../../../../generated/services/Cat_agentinventorysettingsesService';
import type { InventorySettings } from '../contracts/types';
import { normalizeNumbers, parseMultiSelect } from '../utils/settingsUtils';

const SETTINGS_NAME = 'AgentInventorySettings';
const SELECT = [
  'cat_agentinventorysettingsid',
  'cat_name',
  'cat_environmenttypescode',
  'cat_agenttypescode',
  'cat_excludesystemagents',
  'cat_aigenerateddescription',
  'cat_oneinventory',
  'cat_enableusage',
];

function rawValue(row: Cat_agentinventorysettingses, key: string): unknown {
  return (row as unknown as Record<string, unknown>)[key];
}

function toDomain(row: Cat_agentinventorysettingses): InventorySettings {
  return {
    id: row.cat_agentinventorysettingsid,
    environmentTypeValues: parseMultiSelect(rawValue(row, 'cat_environmenttypescode')),
    agentTypeValues: parseMultiSelect(rawValue(row, 'cat_agenttypescode')),
    excludeSystemAgents: row.cat_excludesystemagents ?? false,
    aiGeneratedDescription: row.cat_aigenerateddescription ?? true,
    oneInventory: row.cat_oneinventory ?? true,
    enableUsage: row.cat_enableusage === true,
  };
}

function toGenerated(settings: InventorySettings): Partial<Cat_agentinventorysettingsesBase> {
  return {
    cat_name: SETTINGS_NAME,
    cat_environmenttypescode: multiSelectValue(settings.environmentTypeValues) as unknown as Cat_agentinventorysettingsesBase['cat_environmenttypescode'],
    cat_agenttypescode: multiSelectValue(settings.agentTypeValues) as unknown as Cat_agentinventorysettingsesBase['cat_agenttypescode'],
    cat_excludesystemagents: settings.excludeSystemAgents,
    cat_aigenerateddescription: settings.aiGeneratedDescription,
    cat_oneinventory: settings.oneInventory,
    cat_enableusage: settings.enableUsage,
  };
}

/**
 * Serialize a multi-select choice column: a comma-joined list of option values,
 * or `null` when nothing is selected. Dataverse rejects an empty string for a
 * multi-select picklist ("Edm Object passed should have the options selected.").
 */
function multiSelectValue(values: number[]): string | null {
  const normalized = normalizeNumbers(values);
  return normalized.length > 0 ? normalized.join(',') : null;
}

export class InventorySettingsService {
  /** Load the unique Agent Inventory settings record or return defaults. */
  static async get(): Promise<InventorySettings> {
    const result = await Cat_agentinventorysettingsesService.getAll({
      select: SELECT,
      filter: 'statecode eq 0',
      top: 10,
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to load Agent Inventory settings.');
    }
    const rows = result.data ?? [];
    const named = rows.filter((row) => row.cat_name === SETTINGS_NAME);
    const candidates = named.length > 0 ? named : rows;
    if (candidates.length > 1) {
      throw new Error('Multiple active Agent Inventory settings records were found. Resolve the duplicate records before saving.');
    }
    return candidates[0]
      ? toDomain(candidates[0])
      : {
          environmentTypeValues: [],
          agentTypeValues: [],
          excludeSystemAgents: false,
          aiGeneratedDescription: true,
          oneInventory: true,
          enableUsage: false,
        };
  }

  /**
   * Reads only the `cat_enableusage` flag from the settings singleton. Tolerant
   * by design (no record, duplicates, or a failed request all resolve to
   * `false`) so the usage pipeline gates used across the dashboard never break
   * the page the way {@link InventorySettingsService.get} would.
   */
  static async isUsageEnabled(): Promise<boolean> {
    try {
      const result = await Cat_agentinventorysettingsesService.getAll({
        select: ['cat_name', 'cat_enableusage'],
        filter: 'statecode eq 0',
        orderBy: ['createdon asc'],
        top: 10,
      });
      if (!result.success) return false;
      const rows = result.data ?? [];
      const named = rows.filter((row) => row.cat_name === SETTINGS_NAME);
      const candidate = (named.length > 0 ? named : rows)[0];
      return candidate?.cat_enableusage === true;
    } catch {
      return false;
    }
  }

  /** Return the id of the existing settings singleton (top 1 active), or undefined when none exists. */
  private static async findExistingId(): Promise<string | undefined> {
    const result = await Cat_agentinventorysettingsesService.getAll({
      select: ['cat_agentinventorysettingsid'],
      filter: 'statecode eq 0',
      orderBy: ['createdon asc'],
      top: 1,
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to load Agent Inventory settings.');
    }
    return result.data?.[0]?.cat_agentinventorysettingsid;
  }

  /** Create or update the Agent Inventory settings singleton. */
  static async save(settings: InventorySettings): Promise<void> {
    const fields = toGenerated(settings);
    const existingId = settings.id ?? await InventorySettingsService.findExistingId();
    if (existingId) {
      const result = await Cat_agentinventorysettingsesService.update(existingId, fields);
      if (!result.success) {
        throw new Error(result.error?.message ?? 'Unable to update Agent Inventory settings.');
      }
      return;
    }
    const result = await Cat_agentinventorysettingsesService.create(
      fields as Omit<Cat_agentinventorysettingsesBase, 'cat_agentinventorysettingsid'>,
    );
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to create Agent Inventory settings.');
    }
  }
}
