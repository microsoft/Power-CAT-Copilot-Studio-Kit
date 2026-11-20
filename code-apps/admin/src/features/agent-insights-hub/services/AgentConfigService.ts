/**
 * Service wrapper for the cat_copilotconfigurations Dataverse table.
 * Provides typed access to agent configuration records.
 */
import { Cat_copilotconfigurationsService } from '../../../generated/services/Cat_copilotconfigurationsService';
import type {
  Cat_copilotconfigurationsBase,
  Cat_copilotconfigurations,
} from '../../../generated/models/Cat_copilotconfigurationsModel';
import type { AgentConfiguration } from '../contracts/types';
import { paginatedFetchAll } from './paginatedFetchAll';

const SELECT: string[] = [
  'cat_copilotconfigurationid',
  'cat_name',
  'cat_agentname',
  'cat_copilotid',
  'cat_dataverseurl',
  'cat_configurationtypescodes',
  'cat_azureappinsightsapplicationid',
  'cat_azureappinsightstenantid',
  'cat_azureappinsightsclientid',
  'cat_azureappinsightssecretlocationcode',
  'cat_azureappinsightssecret',
  'cat_azureappinsightsenvironmentvariable',
  'cat_actionparameters',
  'statecode',
  '_cat_agents_value',
  'cat_kpisourcecodes',
  'cat_iscaptureuserdetailsenabled',
  'cat_iscaptureuserfeedbackenabled',
  'createdon',
];

// ---------------------------------------------------------------------------
// Mapping: Generated type -> Domain type
// ---------------------------------------------------------------------------

/**
 * Maps a generated `Cat_copilotconfigurations` record to the domain
 * `AgentConfiguration` interface, converting enum literal types to their
 * broader domain counterparts (e.g. numeric literal union -> number).
 */
function toAgentConfiguration(raw: Cat_copilotconfigurations): AgentConfiguration {
  return {
    cat_copilotconfigurationid: raw.cat_copilotconfigurationid,
    cat_name: raw.cat_name,
    cat_agentname: raw.cat_agentname,
    cat_copilotid: raw.cat_copilotid,
    cat_dataverseurl: raw.cat_dataverseurl,
    cat_configurationtypescodes: raw.cat_configurationtypescodes != null
      ? String(raw.cat_configurationtypescodes)
      : undefined,
    cat_azureappinsightsapplicationid: raw.cat_azureappinsightsapplicationid,
    cat_azureappinsightstenantid: raw.cat_azureappinsightstenantid,
    cat_azureappinsightsclientid: raw.cat_azureappinsightsclientid,
    cat_azureappinsightssecretlocationcode: raw.cat_azureappinsightssecretlocationcode != null
      ? Number(raw.cat_azureappinsightssecretlocationcode)
      : undefined,
    cat_azureappinsightssecret: raw.cat_azureappinsightssecret,
    cat_azureappinsightsenvironmentvariable: raw.cat_azureappinsightsenvironmentvariable,
    cat_actionparameters: raw.cat_actionparameters,
    statecode: raw.statecode != null ? Number(raw.statecode) : undefined,
    _cat_agents_value: raw._cat_agents_value,
    // Fields below exist on the Dataverse record but are not in the generated model;
    // they arrive at runtime via the $select projection and live on the raw object.
    cat_kpisourcecodes: (raw as unknown as Record<string, unknown>).cat_kpisourcecodes as string | undefined,
    cat_iscaptureuserdetailsenabled: (raw as unknown as Record<string, unknown>).cat_iscaptureuserdetailsenabled as boolean | undefined,
    cat_iscaptureuserfeedbackenabled: (raw as unknown as Record<string, unknown>).cat_iscaptureuserfeedbackenabled as boolean | undefined,
    createdon: (raw as unknown as Record<string, unknown>).createdon as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// Mapping: Domain type -> Generated type (for create / update)
// ---------------------------------------------------------------------------

/**
 * Maps a partial domain `AgentConfiguration` to the generated
 * `Cat_copilotconfigurationsBase` shape expected by the service layer for
 * create and update operations.
 */
function toConfigBase(
  config: Partial<AgentConfiguration>,
): Partial<Omit<Cat_copilotconfigurationsBase, 'cat_copilotconfigurationid'>> {
  const base: Record<string, unknown> = {};

  if (config.cat_name !== undefined) base.cat_name = config.cat_name;
  if (config.cat_agentname !== undefined) base.cat_agentname = config.cat_agentname;
  if (config.cat_copilotid !== undefined) base.cat_copilotid = config.cat_copilotid;
  if (config.cat_dataverseurl !== undefined) base.cat_dataverseurl = config.cat_dataverseurl;
  if (config.cat_configurationtypescodes !== undefined) {
    base.cat_configurationtypescodes = config.cat_configurationtypescodes;
  }
  if (config.cat_azureappinsightsapplicationid !== undefined) {
    base.cat_azureappinsightsapplicationid = config.cat_azureappinsightsapplicationid;
  }
  if (config.cat_azureappinsightstenantid !== undefined) {
    base.cat_azureappinsightstenantid = config.cat_azureappinsightstenantid;
  }
  if (config.cat_azureappinsightsclientid !== undefined) {
    base.cat_azureappinsightsclientid = config.cat_azureappinsightsclientid;
  }
  if (config.cat_azureappinsightssecretlocationcode !== undefined) {
    base.cat_azureappinsightssecretlocationcode = config.cat_azureappinsightssecretlocationcode;
  }
  if (config.cat_azureappinsightssecret !== undefined) {
    base.cat_azureappinsightssecret = config.cat_azureappinsightssecret;
  }
  if (config.cat_azureappinsightsenvironmentvariable !== undefined) {
    base.cat_azureappinsightsenvironmentvariable = config.cat_azureappinsightsenvironmentvariable;
  }
  if (config.cat_actionparameters !== undefined) base.cat_actionparameters = config.cat_actionparameters;
  if (config.statecode !== undefined) base.statecode = config.statecode;
  if (config._cat_agents_value !== undefined) base._cat_agents_value = config._cat_agents_value;
  if (config.cat_kpisourcecodes !== undefined) base.cat_kpisourcecodes = config.cat_kpisourcecodes;
  if (config.cat_iscaptureuserdetailsenabled !== undefined) {
    base.cat_iscaptureuserdetailsenabled = config.cat_iscaptureuserdetailsenabled;
  }
  if (config.cat_iscaptureuserfeedbackenabled !== undefined) {
    base.cat_iscaptureuserfeedbackenabled = config.cat_iscaptureuserfeedbackenabled;
  }

  return base as Partial<Omit<Cat_copilotconfigurationsBase, 'cat_copilotconfigurationid'>>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AgentConfigService {
  /** Fetch active configurations that include insights (type code 4). */
  static async getActiveInsightsConfigs(filter?: string): Promise<AgentConfiguration[]> {
    const baseFilter = "statecode eq 0 and contains(cat_configurationtypescodes, '4')";
    const combinedFilter = filter ? `${baseFilter} and (${filter})` : baseFilter;

    const all = await paginatedFetchAll<Cat_copilotconfigurations>(
      (opts) => Cat_copilotconfigurationsService.getAll(opts),
      { select: SELECT, filter: combinedFilter, orderBy: ['createdon desc'] },
    );
    return all.map(toAgentConfiguration);
  }

  /** Fetch a single configuration by ID. */
  static async getById(id: string): Promise<AgentConfiguration> {
    const result = await Cat_copilotconfigurationsService.get(id, { select: SELECT });
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to fetch configuration');
    if (!result.data) throw new Error('Configuration data is missing from response');
    return toAgentConfiguration(result.data);
  }

  /** Create a new configuration record. */
  static async create(record: Partial<AgentConfiguration>): Promise<AgentConfiguration> {
    const result = await Cat_copilotconfigurationsService.create(
      toConfigBase(record) as Omit<Cat_copilotconfigurationsBase, 'cat_copilotconfigurationid'>,
    );
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to create configuration');
    if (!result.data) throw new Error('Created configuration data is missing from response');
    return toAgentConfiguration(result.data);
  }

  /** Update an existing configuration (single round-trip). */
  static async update(id: string, fields: Partial<AgentConfiguration>): Promise<AgentConfiguration> {
    const result = await Cat_copilotconfigurationsService.update(id, toConfigBase(fields));
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to update configuration');
    if (!result.data) throw new Error('Updated configuration data is missing from response');
    return toAgentConfiguration(result.data);
  }

  /** Delete a configuration by ID. */
  static async delete(id: string): Promise<void> {
    await Cat_copilotconfigurationsService.delete(id);
  }
}
