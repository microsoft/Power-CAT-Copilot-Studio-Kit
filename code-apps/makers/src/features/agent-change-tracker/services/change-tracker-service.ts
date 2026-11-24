/**
 * Data access for the pre/post-image Agent Change Tracker.
 *
 * The plug-in owns change detection. This app only activates tracking, seeds
 * central current state, and projects event-level history into granular UI
 * cards. It never compares the live Agent with a browser-maintained baseline.
 */

import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import {
  CONFIG_LINK,
  ENTITY_SET,
  PRIMARY_KEY,
  ChangeType,
  ComponentType,
  OperationCode,
  SourceTable,
  TrackingStatus,
  refineComponentType,
  type AddTrackingConfigInput,
  type AgentOwnership,
  type ChangeLogEntry,
  type SaveGroup,
  type TrackingConfig,
} from '../contracts/change-tracker';
import { classifyComponent, readAgentOwnership, readComponentParents } from './agent-state-service';
import { flattenSettings, fnv1a, settingLabel } from './diff-engine';
import { shouldUseLocalStore } from './connection-mode';
import {
  localAddConfig,
  localGetAgentOwnership,
  localListChangeLog,
  localListConfigs,
  localRemoveConfig,
} from './local-store';
import { getTrackingOrgUrl, initTrackingEnvironmentId } from './tracking-org';

const ACCEPT = 'application/json';
const PREFER_REPRESENTATION = 'return=representation';
const INLINE_PAYLOAD_LIMIT = 900_000;
const HISTORY_PAGE_SIZE = 500;
const MAX_HISTORY_PAGES = 40;
const BASELINE_SEED_BATCH_SIZE = 8;

const removalCleanupPromises = new Map<string, Promise<void>>();
const historyLoadPromises = new Map<string, Promise<void>>();

const BOT_SELECT = [
  'botid',
  'name',
  'schemaname',
  'accesscontrolpolicy',
  'applicationmanifestinformation',
  'authenticationconfiguration',
  'authenticationmode',
  'authenticationtrigger',
  'configuration',
  'createdon',
  'iconbase64',
  'language',
  'modifiedon',
  'publishedon',
  'statecode',
  'statuscode',
  'supportedlanguages',
  'versionnumber',
  '_modifiedby_value',
  '_ownerid_value',
].join(',');

const COMPONENT_SELECT = [
  'botcomponentid',
  'name',
  'schemaname',
  'componenttype',
  'category',
  'content',
  'data',
  'dependencies',
  'description',
  'language',
  'createdon',
  'modifiedon',
  'statecode',
  'statuscode',
  'versionnumber',
  '_modifiedby_value',
  '_parentbotid_value',
  '_parentbotcomponentid_value',
  '_parentbotcomponentcollectionid_value',
].join(',');

const CONFIG_SELECT = [
  PRIMARY_KEY.config,
  'cat_name',
  'cat_agentid',
  'cat_sourceenvironmentid',
  'cat_sourceenvironmenturl',
  'cat_statuscode',
  'createdon',
  'modifiedon',
].join(',');

const HISTORY_SELECT = [
  PRIMARY_KEY.changeLog,
  'partitionid',
  'cat_componentname',
  'cat_componentschemaname',
  'cat_sourcecomponenttypecode',
  'cat_componenttypecode',
  'cat_sourcetablecode',
  'cat_sourcerecordid',
  'cat_operationcode',
  'cat_sourceversion',
  'cat_changedon',
  'cat_changedbyid',
  'cat_changedbyname',
  'cat_correlationid',
  'cat_changedcolumns',
  'cat_oldpayload',
  'cat_oldpayloadfile',
  'cat_newpayload',
  'cat_newpayloadfile',
  'cat_payloadschemaversion',
].join(',');

interface BaselineRecord {
  sourceTable: SourceTable;
  sourceRecordId: string;
  sourceComponentType?: number;
  componentId?: string;
  componentName: string;
  componentSchemaName: string;
  payload: Record<string, unknown>;
  sourceVersion: number;
  createdOn?: string;
  modifiedOn?: string;
  modifiedById?: string;
}

export interface CentralAgentMetadata {
  iconBase64?: string;
  publishedOn?: string;
}

interface HistoryEvent {
  id: string;
  eventId: string;
  configId: string;
  agentId: string;
  componentId?: string;
  componentName?: string;
  componentSchemaName?: string;
  sourceComponentType?: number;
  sourceTable?: SourceTable;
  operation: OperationCode;
  sourceVersion?: string;
  changedOn?: string;
  changedById?: string;
  changedByName?: string;
  correlationId?: string;
  changedColumns: string[];
  oldPayload: Record<string, unknown>;
  newPayload: Record<string, unknown>;
}

function normalizeOrg(value: string): string {
  return value.trim().replace(/\/+$/g, '');
}

function normalizeId(value: string | undefined): string {
  return (value ?? '').trim().replace(/[{}]/g, '').toLowerCase();
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function rowsOf(data: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const value = (data as { value?: unknown } | undefined)?.value;
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function str(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return undefined;
}

function num(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function int64(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`The ${key} value cannot be represented safely by the Dataverse connector.`);
  }
  return parsed;
}

function bool(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function jsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  return value;
}

function sourcePayload(
  row: Record<string, unknown>,
  structuralColumns: string[],
  lookups: Array<{ source: string; target: string; logicalName: string }>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of structuralColumns) {
    if (Object.prototype.hasOwnProperty.call(row, key)) payload[key] = jsonValue(row[key]);
  }
  for (const lookup of lookups) {
    const id = str(row, lookup.source);
    if (id) payload[lookup.target] = { id, logicalName: lookup.logicalName };
  }
  return payload;
}

function mapConfig(row: Record<string, unknown>): TrackingConfig {
  return {
    id: str(row, PRIMARY_KEY.config) ?? '',
    agentId: str(row, 'cat_agentid') ?? '',
    agentName: str(row, 'cat_name') ?? '',
    environmentId: str(row, 'cat_sourceenvironmentid'),
    environmentUrl: str(row, 'cat_sourceenvironmenturl')?.replace(/\/+$/, ''),
    status: num(row, 'cat_statuscode') as TrackingStatus | undefined,
    configuredOn: str(row, 'createdon'),
  };
}

function newId(): string {
  return crypto.randomUUID();
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function fromBase64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function payloadHash(payload: string): Promise<string> {
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return fnv1a(payload);
}

async function createRow(
  organization: string,
  entityName: string,
  item: Record<string, unknown>,
): Promise<void> {
  const result = await MicrosoftDataverseService.CreateRecordWithOrganization(
    PREFER_REPRESENTATION,
    ACCEPT,
    organization,
    entityName,
    item,
  );
  if (!result.success) throw new Error(`Failed to create ${entityName} row.`);
}

async function updateRow(
  organization: string,
  entityName: string,
  recordId: string,
  item: Record<string, unknown>,
): Promise<void> {
  const result = await MicrosoftDataverseService.UpdateRecordWithOrganization(
    PREFER_REPRESENTATION,
    ACCEPT,
    organization,
    entityName,
    recordId,
    item,
  );
  if (!result.success) throw new Error(`Failed to update ${entityName} row.`);
}

async function deleteRow(
  organization: string,
  entityName: string,
  recordId: string,
  partitionId?: string,
): Promise<void> {
  const result = await MicrosoftDataverseService.DeleteRecordWithOrganization(
    organization,
    entityName,
    recordId,
    partitionId,
  );
  if (!result.success) throw new Error(`Failed to delete ${entityName} row.`);
}

async function listRelatedRecordIds(
  organization: string,
  entityName: string,
  primaryKey: string,
  filter: string,
  partitionId?: string,
): Promise<string[]> {
  const ids: string[] = [];
  let skipToken: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      organization,
      entityName,
      'odata.maxpagesize=500',
      ACCEPT,
      undefined,
      undefined,
      primaryKey,
      filter,
      undefined,
      undefined,
      undefined,
      500,
      skipToken,
      partitionId,
    );
    if (!result.success) throw new Error(`Failed to list related ${entityName} rows.`);
    ids.push(...rowsOf(result.data).map((row) => str(row, primaryKey)).filter((id): id is string => Boolean(id)));
    skipToken = nextSkipToken(result.data);
    if (!skipToken) return ids;
  }
  throw new Error(`Too many related ${entityName} rows to delete safely.`);
}

async function deleteRows(
  organization: string,
  entityName: string,
  recordIds: string[],
  partitionId?: string,
): Promise<void> {
  const batchSize = 20;
  for (let index = 0; index < recordIds.length; index += batchSize) {
    await Promise.all(
      recordIds
        .slice(index, index + batchSize)
        .map((recordId) => deleteRow(organization, entityName, recordId, partitionId)),
    );
  }
}

async function recordExists(
  organization: string,
  entityName: string,
  primaryKey: string,
  recordId: string,
): Promise<boolean> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    organization,
    entityName,
    undefined,
    ACCEPT,
    undefined,
    undefined,
    primaryKey,
    `${primaryKey} eq ${recordId}`,
    undefined,
    undefined,
    undefined,
    1,
  );
  if (!result.success) throw new Error(`Failed to check ${entityName} row.`);
  return rowsOf(result.data).length > 0;
}

/**
 * Confirm the source environment has the spoke-side schema before creating any
 * central configuration. A failed probe also covers environments where the
 * current connection cannot access the required tables.
 */
async function validateSourceTrackingComponents(sourceOrg: string): Promise<void> {
  const probes = await Promise.all(
    [
      { entitySet: ENTITY_SET.config, primaryKey: PRIMARY_KEY.config },
      { entitySet: ENTITY_SET.outbox, primaryKey: PRIMARY_KEY.outbox },
    ].map(({ entitySet, primaryKey }) =>
      MicrosoftDataverseService.ListRecordsWithOrganization(
        sourceOrg,
        entitySet,
        undefined,
        ACCEPT,
        undefined,
        undefined,
        primaryKey,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
      ).catch(() => undefined),
    ),
  );
  if (probes.some((probe) => !probe?.success)) {
    throw new Error(
      'The target environment does not have the required Agent Change Tracker components. ' +
        'Install the spoke solution with the Agent Tracking Configuration and Agent Change Outbox tables, then try again.',
    );
  }
}

async function readBaselineRecords(agentId: string, sourceOrg: string): Promise<BaselineRecord[]> {
  const org = normalizeOrg(sourceOrg);
  const [botResult, componentResult] = await Promise.all([
    MicrosoftDataverseService.ListRecordsWithOrganization(
      org,
      'bots',
      undefined,
      ACCEPT,
      undefined,
      undefined,
      BOT_SELECT,
      `botid eq ${agentId}`,
      undefined,
      undefined,
      undefined,
      1,
    ),
    MicrosoftDataverseService.ListRecordsWithOrganization(
      org,
      'botcomponents',
      'odata.maxpagesize=5000',
      ACCEPT,
      undefined,
      undefined,
      COMPONENT_SELECT,
      `_parentbotid_value eq ${agentId}`,
      'schemaname asc',
    ),
  ]);
  if (!botResult.success || !componentResult.success) {
    throw new Error('The Agent baseline could not be read from its source environment.');
  }

  const bot = rowsOf(botResult.data)[0];
  if (!bot) throw new Error('The selected Agent no longer exists in its source environment.');

  const botPayload = sourcePayload(
    bot,
    [
      'botid',
      'name',
      'schemaname',
      'accesscontrolpolicy',
      'applicationmanifestinformation',
      'authenticationconfiguration',
      'authenticationmode',
      'authenticationtrigger',
      'configuration',
      'createdon',
      'iconbase64',
      'language',
      'modifiedon',
      'publishedon',
      'statecode',
      'statuscode',
      'supportedlanguages',
    ],
    [
      { source: '_modifiedby_value', target: 'modifiedby', logicalName: 'systemuser' },
      { source: '_ownerid_value', target: 'ownerid', logicalName: 'systemuser' },
    ],
  );

  const records: BaselineRecord[] = [
    {
      sourceTable: SourceTable.Agent,
      sourceRecordId: agentId,
      componentId: agentId,
      componentName: str(bot, 'name') ?? 'Agent settings',
      componentSchemaName: 'AgentSettings',
      payload: botPayload,
      sourceVersion: int64(bot, 'versionnumber') ?? 0,
      createdOn: str(bot, 'createdon'),
      modifiedOn: str(bot, 'modifiedon'),
      modifiedById: str(bot, '_modifiedby_value'),
    },
  ];

  for (const row of rowsOf(componentResult.data)) {
    if (str(row, '_parentbotcomponentcollectionid_value')) continue;
    const id = str(row, 'botcomponentid');
    if (!id) continue;
    const sourceType = num(row, 'componenttype');
    const payload = sourcePayload(
      row,
      [
        'botcomponentid',
        'name',
        'schemaname',
        'componenttype',
        'category',
        'content',
        'data',
        'dependencies',
        'description',
        'language',
        'createdon',
        'modifiedon',
        'statecode',
        'statuscode',
      ],
      [
        { source: '_modifiedby_value', target: 'modifiedby', logicalName: 'systemuser' },
        { source: '_parentbotid_value', target: 'parentbotid', logicalName: 'bot' },
        { source: '_parentbotcomponentid_value', target: 'parentbotcomponentid', logicalName: 'botcomponent' },
      ],
    );
    records.push({
      sourceTable: SourceTable.Component,
      sourceRecordId: id,
      sourceComponentType: sourceType,
      componentId: id,
      componentName: str(row, 'name') ?? str(row, 'schemaname') ?? 'Component',
      componentSchemaName: str(row, 'schemaname') ?? '',
      payload,
      sourceVersion: int64(row, 'versionnumber') ?? 0,
      createdOn: str(row, 'createdon'),
      modifiedOn: str(row, 'modifiedon'),
      modifiedById: str(row, '_modifiedby_value'),
    });
  }
  return records;
}

async function seedState(configId: string, records: BaselineRecord[]): Promise<void> {
  const centralOrg = getTrackingOrgUrl();
  for (let index = 0; index < records.length; index += BASELINE_SEED_BATCH_SIZE) {
    const results = await Promise.allSettled(records.slice(index, index + BASELINE_SEED_BATCH_SIZE).map(async (record) => {
      const stateId = newId();
      const payload = JSON.stringify(record.payload);
      const overflow = utf8ByteLength(payload) > INLINE_PAYLOAD_LIMIT;
      const item: Record<string, unknown> = {
        cat_agenttrackedstateid: stateId,
        cat_name: record.componentName,
        cat_statekey: `${configId}|${record.sourceTable}|${record.sourceRecordId}`,
        cat_sourcetablecode: record.sourceTable,
        cat_sourcerecordid: record.sourceRecordId,
        cat_sourcecomponenttypecode: record.sourceComponentType ?? null,
        cat_componenttypecode:
          record.sourceTable === SourceTable.Agent
            ? 335350018
            : record.sourceComponentType !== undefined && record.sourceComponentType >= 0 && record.sourceComponentType <= 19
              ? 335350000 + record.sourceComponentType
              : 335350020,
        cat_componentschemaname: record.componentSchemaName || null,
        cat_currentpayload: overflow ? null : payload,
        cat_payloadhash: await payloadHash(payload),
        cat_payloadschemaversion: 1,
        cat_sourceversion: record.sourceVersion,
        cat_eventrankcode: OperationCode.Baseline,
        cat_isdeleted: false,
        cat_sourcecreatedon: record.createdOn ?? record.modifiedOn ?? new Date().toISOString(),
        cat_sourcemodifiedon: record.modifiedOn ?? record.createdOn ?? new Date().toISOString(),
        cat_sourcemodifiedbyid: record.modifiedById ?? null,
        [CONFIG_LINK.bindKey]: `/cat_agenttrackingconfigurations(${configId})`,
      };
      await createRow(centralOrg, ENTITY_SET.state, item);
      if (overflow) {
        const upload = await MicrosoftDataverseService.UpdateEntityFileImageFieldContentWithOrganization(
          'application/json',
          centralOrg,
          ENTITY_SET.state,
          stateId,
          'cat_currentpayloadfile',
          toBase64(payload),
          'current-payload.json',
        );
        if (!upload.success) throw new Error(`Baseline payload upload failed for ${record.componentName}.`);
      }
    }));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
}

function configItem(id: string, input: AddTrackingConfigInput, status: TrackingStatus): Record<string, unknown> {
  return {
    cat_agenttrackingconfigurationid: id,
    cat_name: input.agentName,
    cat_agentid: input.agentId,
    cat_sourceenvironmentid: input.environmentId ?? null,
    cat_sourceenvironmenturl: input.environmentUrl?.replace(/\/+$/, '') ?? null,
    cat_statuscode: status,
  };
}

/** List every active tracking configuration. */
export async function listTrackingConfigs(): Promise<TrackingConfig[]> {
  if (await shouldUseLocalStore()) return localListConfigs();
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    getTrackingOrgUrl(),
    ENTITY_SET.config,
    'odata.maxpagesize=500',
    ACCEPT,
    undefined,
    undefined,
    CONFIG_SELECT,
    undefined,
    'createdon desc',
  );
  if (!result.success) throw new Error('Failed to load tracked agents.');
  const configs = rowsOf(result.data).map(mapConfig);
  for (const config of configs.filter((item) => item.status === TrackingStatus.Removed)) {
    startRemovalCleanup(config);
  }
  return configs.filter((item) => item.status !== TrackingStatus.Removed);
}

async function syncTrackingConfigName(config: TrackingConfig, agentName: string): Promise<void> {
  const name = agentName.trim();
  if (!name || name === config.agentName) return;

  const centralOrg = getTrackingOrgUrl();
  await updateRow(centralOrg, ENTITY_SET.config, config.id, { cat_name: name });

  const sourceOrg = config.environmentUrl ? normalizeOrg(config.environmentUrl) : centralOrg;
  const centralEnvironmentId = normalizeId(await initTrackingEnvironmentId());
  const sourceIsCentral =
    Boolean(centralEnvironmentId) && normalizeId(config.environmentId) === centralEnvironmentId;
  if (!sourceIsCentral) {
    await updateRow(sourceOrg, ENTITY_SET.config, config.id, { cat_name: name });
  }
}

/**
 * Activate tracking in the required order: central Initializing, source mirror
 * Initializing, central baseline state, then both configurations Active.
 */
export async function addTrackingConfig(input: AddTrackingConfigInput): Promise<boolean> {
  if (await shouldUseLocalStore()) return localAddConfig(input);
  if (!input.agentId || !input.environmentUrl) {
    throw new Error('Agent ID and source environment URL are required.');
  }

  const configId = newId();
  const centralOrg = getTrackingOrgUrl();
  const sourceOrg = normalizeOrg(input.environmentUrl);
  const centralEnvironmentId = normalizeId(await initTrackingEnvironmentId());
  const sourceEnvironmentId = normalizeId(input.environmentId);
  const sourceIsCentral = Boolean(centralEnvironmentId && sourceEnvironmentId === centralEnvironmentId);
  const initializing = configItem(configId, input, TrackingStatus.Initializing);

  // Preflight first so an unprepared target cannot leave an orphaned central
  // configuration in Initializing.
  await validateSourceTrackingComponents(sourceOrg);

  try {
    await createRow(centralOrg, ENTITY_SET.config, initializing);
    if (!sourceIsCentral) {
      await createRow(sourceOrg, ENTITY_SET.config, initializing);
    }

    const baseline = await readBaselineRecords(input.agentId, sourceOrg);
    await seedState(configId, baseline);
    await updateRow(centralOrg, ENTITY_SET.config, configId, { cat_statuscode: TrackingStatus.Active });
    if (!sourceIsCentral) {
      await updateRow(sourceOrg, ENTITY_SET.config, configId, { cat_statuscode: TrackingStatus.Active });
    }
  } catch (activationError) {
    const partialConfig: TrackingConfig = {
      id: configId,
      agentId: input.agentId,
      agentName: input.agentName,
      environmentId: input.environmentId,
      environmentUrl: sourceOrg,
      status: TrackingStatus.Initializing,
    };
    try {
      await removeTrackingConfig(partialConfig);
    } catch (cleanupError) {
      const activationMessage =
        activationError instanceof Error ? activationError.message : 'Agent tracking activation failed.';
      const cleanupMessage =
        cleanupError instanceof Error ? cleanupError.message : 'Partial tracking cleanup failed.';
      throw new Error(`${activationMessage} Automatic cleanup also failed: ${cleanupMessage}`);
    }
    throw activationError;
  }
  return true;
}

interface RemovalContext {
  centralOrg: string;
  sourceOrg: string;
  sourceConfigExists: boolean;
  centralConfigExists: boolean;
}

async function markTrackingConfigRemoved(config: TrackingConfig): Promise<RemovalContext> {
  const centralOrg = getTrackingOrgUrl();
  const sourceOrg = config.environmentUrl ? normalizeOrg(config.environmentUrl) : centralOrg;
  const centralEnvironmentId = normalizeId(await initTrackingEnvironmentId());
  const sourceIsCentral =
    Boolean(centralEnvironmentId) && normalizeId(config.environmentId) === centralEnvironmentId;

  // Disable both copies before deleting children so the plug-in and processor
  // cannot intentionally enqueue additional work for this configuration.
  const [sourceConfigExists, centralConfigExists] = await Promise.all([
    sourceIsCentral
      ? Promise.resolve(false)
      : recordExists(sourceOrg, ENTITY_SET.config, PRIMARY_KEY.config, config.id),
    recordExists(centralOrg, ENTITY_SET.config, PRIMARY_KEY.config, config.id),
  ]);
  const statusResults = await Promise.allSettled([
    sourceConfigExists
      ? updateRow(sourceOrg, ENTITY_SET.config, config.id, { cat_statuscode: TrackingStatus.Removed })
      : Promise.resolve(),
    centralConfigExists
      ? updateRow(centralOrg, ENTITY_SET.config, config.id, { cat_statuscode: TrackingStatus.Removed })
      : Promise.resolve(),
  ]);
  const statusFailure = statusResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (statusFailure) {
    const previousStatus = config.status ?? TrackingStatus.Active;
    await Promise.allSettled([
      sourceConfigExists && statusResults[0].status === 'fulfilled'
        ? updateRow(sourceOrg, ENTITY_SET.config, config.id, { cat_statuscode: previousStatus })
        : Promise.resolve(),
      centralConfigExists && statusResults[1].status === 'fulfilled'
        ? updateRow(centralOrg, ENTITY_SET.config, config.id, { cat_statuscode: previousStatus })
        : Promise.resolve(),
    ]);
    throw statusFailure.reason;
  }
  return { centralOrg, sourceOrg, sourceConfigExists, centralConfigExists };
}

async function cleanupTrackingConfig(config: TrackingConfig, context: RemovalContext): Promise<void> {
  const { centralOrg, sourceOrg, sourceConfigExists, centralConfigExists } = context;
  const [outboxIds, stateIds, historyIds] = await Promise.all([
    listRelatedRecordIds(
      sourceOrg,
      ENTITY_SET.outbox,
      PRIMARY_KEY.outbox,
      `${CONFIG_LINK.lookupFilterField} eq ${config.id}`,
    ),
    listRelatedRecordIds(
      centralOrg,
      ENTITY_SET.state,
      PRIMARY_KEY.state,
      `${CONFIG_LINK.lookupFilterField} eq ${config.id}`,
    ),
    listRelatedRecordIds(
      centralOrg,
      ENTITY_SET.changeLog,
      PRIMARY_KEY.changeLog,
      `partitionid eq '${escapeOData(config.id)}'`,
      config.id,
    ),
  ]);

  await deleteRows(sourceOrg, ENTITY_SET.outbox, outboxIds);
  await Promise.all([
    deleteRows(centralOrg, ENTITY_SET.state, stateIds),
    deleteRows(centralOrg, ENTITY_SET.changeLog, historyIds, config.id),
  ]);
  if (sourceConfigExists) {
    await deleteRow(sourceOrg, ENTITY_SET.config, config.id);
  }
  if (centralConfigExists) {
    await deleteRow(centralOrg, ENTITY_SET.config, config.id);
  }
}

function startRemovalCleanup(config: TrackingConfig, context?: RemovalContext): void {
  if (removalCleanupPromises.has(config.id)) return;
  const cleanup = (context ? Promise.resolve(context) : markTrackingConfigRemoved(config))
    .then((resolvedContext) => cleanupTrackingConfig(config, resolvedContext))
    .finally(() => removalCleanupPromises.delete(config.id));
  removalCleanupPromises.set(config.id, cleanup);
  void cleanup.catch((error: unknown) => {
    console.warn('[AgentChangeTracker]', `Background cleanup failed for ${config.agentName || config.id}.`, error);
  });
}

/** Mark tracking removed immediately, then delete related records in the background. */
export async function removeTrackingConfig(config: TrackingConfig): Promise<boolean> {
  if (await shouldUseLocalStore()) return localRemoveConfig(config.id);
  const context = await markTrackingConfigRemoved(config);
  startRemovalCleanup(config, context);
  return true;
}

function nextSkipToken(data: Record<string, unknown> | undefined): string | undefined {
  const next = data?.['@odata.nextLink'];
  if (typeof next !== 'string') return undefined;
  const match = /[?&]\$skiptoken=([^&]+)/.exec(next);
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function readHistoryPage(
  configId: string,
  skipToken?: string,
): Promise<{ rows: Record<string, unknown>[]; nextSkipToken?: string }> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    getTrackingOrgUrl(),
    ENTITY_SET.changeLog,
    `odata.maxpagesize=${HISTORY_PAGE_SIZE}`,
    ACCEPT,
    undefined,
    undefined,
    HISTORY_SELECT,
    `partitionid eq '${escapeOData(configId)}'`,
    'cat_changedon desc',
    undefined,
    undefined,
    HISTORY_PAGE_SIZE,
    skipToken,
    configId,
  );
  if (!result.success) throw new Error('Failed to load Agent change history.');
  return { rows: rowsOf(result.data), nextSkipToken: nextSkipToken(result.data) };
}

async function readPayloadFile(
  recordId: string,
  partitionId: string,
  column: 'cat_oldpayloadfile' | 'cat_newpayloadfile',
): Promise<Record<string, unknown>> {
  const result = await MicrosoftDataverseService.GetEntityFileImageFieldContentWithOrganization(
    '',
    getTrackingOrgUrl(),
    ENTITY_SET.changeLog,
    recordId,
    column,
    undefined,
  );
  if (!result.success || !result.data) return {};
  try {
    return parseObject(fromBase64(result.data));
  } catch {
    return {};
  }
}

async function mapHistoryEvent(
  row: Record<string, unknown>,
  agentId: string,
  configId: string,
): Promise<HistoryEvent> {
  const id = str(row, PRIMARY_KEY.changeLog) ?? '';
  const partitionId = str(row, 'partitionid') ?? configId;
  const sourceTable = num(row, 'cat_sourcetablecode') as SourceTable | undefined;
  let oldPayload = parseObject(row.cat_oldpayload);
  let newPayload = parseObject(row.cat_newpayload);
  if (Object.keys(oldPayload).length === 0 && row.cat_oldpayloadfile) {
    oldPayload = await readPayloadFile(id, partitionId, 'cat_oldpayloadfile');
  }
  if (Object.keys(newPayload).length === 0 && row.cat_newpayloadfile) {
    newPayload = await readPayloadFile(id, partitionId, 'cat_newpayloadfile');
  }
  return {
    id,
    eventId: id,
    configId: partitionId,
    agentId,
    componentId:
      sourceTable === SourceTable.Component ? str(row, 'cat_sourcerecordid') : undefined,
    componentName: str(row, 'cat_componentname'),
    componentSchemaName: str(row, 'cat_componentschemaname'),
    sourceComponentType: num(row, 'cat_sourcecomponenttypecode'),
    sourceTable,
    operation: (num(row, 'cat_operationcode') ?? OperationCode.Update) as OperationCode,
    sourceVersion: str(row, 'cat_sourceversion'),
    changedOn: str(row, 'cat_changedon'),
    changedById: str(row, 'cat_changedbyid'),
    changedByName: str(row, 'cat_changedbyname'),
    correlationId: str(row, 'cat_correlationid'),
    changedColumns: parseStringArray(row.cat_changedcolumns),
    oldPayload,
    newPayload,
  };
}

function operationChangeType(operation: OperationCode): ChangeType {
  if (operation === OperationCode.Create) return ChangeType.Created;
  if (operation === OperationCode.Delete) return ChangeType.Deleted;
  return ChangeType.Updated;
}

const BOT_FIELD_LABELS: Record<string, string> = {
  name: 'Agent name',
  iconbase64: 'Agent icon',
  publishedon: 'Published on',
  accesscontrolpolicy: 'Enable multi-tenant',
  authenticationmode: 'Authentication',
  authenticationtrigger: 'Authentication trigger',
  language: 'Primary language',
  supportedlanguages: 'Supported languages',
  statecode: 'Agent state',
  statuscode: 'Agent status',
  applicationmanifestinformation: 'Agent description',
};

function eventComponentType(event: HistoryEvent, body?: string): ComponentType {
  if (event.sourceTable === SourceTable.Agent) return ComponentType.Agent;
  return refineComponentType(
    classifyComponent(event.sourceComponentType, event.componentSchemaName),
    body,
  );
}

function baseEntry(
  event: HistoryEvent,
  idSuffix: string,
  componentType: ComponentType,
  changedByName: string,
): ChangeLogEntry {
  return {
    id: `${event.id}:${idSuffix}`,
    eventId: event.eventId,
    agentId: event.agentId,
    configId: event.configId,
    componentType,
    componentId: event.componentId,
    componentName: event.componentName,
    componentSchemaName: event.componentSchemaName,
    changeType: operationChangeType(event.operation),
    changedByName,
    changedOn: event.changedOn,
    saveTransactionId: event.correlationId || event.eventId,
    sourceVersion: event.sourceVersion,
    sourceTable: event.sourceTable,
    sourceComponentType: event.sourceComponentType,
    changedColumns: event.changedColumns,
  };
}

function expandJsonField(
  event: HistoryEvent,
  field: string,
  changedByName: string,
): ChangeLogEntry[] {
  const oldObject = parseObject(event.oldPayload[field]);
  const newObject = parseObject(event.newPayload[field]);
  const oldLeaves = new Map(flattenSettings(oldObject).map((leaf) => [leaf.path, leaf.value]));
  const newLeaves = new Map(flattenSettings(newObject).map((leaf) => [leaf.path, leaf.value]));
  const paths = new Set([...oldLeaves.keys(), ...newLeaves.keys()]);
  const entries: ChangeLogEntry[] = [];
  for (const path of paths) {
    const oldValue = oldLeaves.get(path) ?? '';
    const newValue = newLeaves.get(path) ?? '';
    if (oldValue === newValue) continue;
    const componentType = path.toLowerCase() === 'agentsettings.instructions'
      ? ComponentType.Instructions
      : ComponentType.Settings;
    entries.push({
      ...baseEntry(event, `${field}:${path}`, componentType, changedByName),
      componentId: undefined,
      componentName: settingLabel(path),
      fieldName: path,
      oldValue,
      newValue,
    });
  }
  return entries;
}

function expandHistoryEvent(event: HistoryEvent, changedByName: string): ChangeLogEntry[] {
  const changeType = operationChangeType(event.operation);
  const primaryBody = valueText(
    (changeType === ChangeType.Deleted ? event.oldPayload : event.newPayload).data ??
      (changeType === ChangeType.Deleted ? event.oldPayload : event.newPayload).content,
  );
  const type = eventComponentType(event, primaryBody);

  if (changeType !== ChangeType.Updated) {
    const payload = changeType === ChangeType.Deleted ? event.oldPayload : event.newPayload;
    const body = valueText(payload.data ?? payload.content) || JSON.stringify(payload, null, 2);
    return [
      {
        ...baseEntry(event, 'component', type, changedByName),
        oldValue: changeType === ChangeType.Deleted ? body : undefined,
        newValue: changeType === ChangeType.Created ? body : undefined,
        componentDescription:
          changeType === ChangeType.Created && type === ComponentType.ChildAgent
            ? valueText(payload.description)
            : undefined,
      },
    ];
  }

  const entries: ChangeLogEntry[] = [];
  const columns = event.changedColumns.length
    ? event.changedColumns
    : Array.from(new Set([...Object.keys(event.oldPayload), ...Object.keys(event.newPayload)]));
  for (const field of columns) {
    if (field === 'modifiedon' || field === 'modifiedby' || field === 'versionnumber') continue;
    if (event.sourceTable === SourceTable.Agent && (field === 'configuration' || field === 'authenticationconfiguration')) {
      entries.push(...expandJsonField(event, field, changedByName));
      continue;
    }
    const oldValue = valueText(event.oldPayload[field]);
    const newValue = valueText(event.newPayload[field]);
    if (oldValue === newValue) continue;
    if (field === 'name' && oldValue.trim() === newValue.trim()) continue;
    const fieldType =
      event.sourceTable === SourceTable.Agent
        ? field === 'name' || field === 'iconbase64' || field === 'publishedon'
          ? ComponentType.Agent
          : ComponentType.Settings
        : type;
    entries.push({
      ...baseEntry(event, field, fieldType, changedByName),
      componentId: event.sourceTable === SourceTable.Agent ? undefined : event.componentId,
      componentName:
        event.sourceTable === SourceTable.Agent
          ? BOT_FIELD_LABELS[field] ?? field
          : event.componentName,
      fieldName: field,
      oldValue,
      newValue,
    });
  }
  return entries;
}

async function resolveUserNames(
  ids: string[],
  sourceOrg: string | undefined,
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.map(normalizeId).filter(Boolean)));
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const groups: string[][] = [];
  for (let index = 0; index < unique.length; index += 20) groups.push(unique.slice(index, index + 20));
  for (const group of groups) {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      sourceOrg ? normalizeOrg(sourceOrg) : getTrackingOrgUrl(),
      'systemusers',
      undefined,
      ACCEPT,
      undefined,
      undefined,
      'systemuserid,fullname',
      group.map((id) => `systemuserid eq ${id}`).join(' or '),
    );
    if (!result.success) continue;
    for (const row of rowsOf(result.data)) {
      const id = normalizeId(str(row, 'systemuserid'));
      const name = str(row, 'fullname');
      if (id && name) names.set(id, name);
    }
  }
  return names;
}

async function projectHistoryEvents(
  events: HistoryEvent[],
  config: TrackingConfig | undefined,
): Promise<ChangeLogEntry[]> {
  const unresolvedEvents = events.filter((event) => !event.changedByName);
  const userNames = await resolveUserNames(
    unresolvedEvents.map((event) => event.changedById ?? ''),
    config?.environmentUrl,
  );
  return events
    .flatMap((event) =>
      expandHistoryEvent(
        event,
        event.changedByName ||
          userNames.get(normalizeId(event.changedById)) ||
          event.changedById ||
          'Unknown user',
      ),
    )
    .sort((left, right) => (right.changedOn ?? '').localeCompare(left.changedOn ?? ''));
}

function loadRemainingHistory(
  agentId: string,
  configId: string,
  config: TrackingConfig | undefined,
  initialSkipToken: string | undefined,
  onEntries: (entries: ChangeLogEntry[]) => void,
  onComplete?: () => void,
): void {
  if (!initialSkipToken || historyLoadPromises.has(configId)) return;

  const load = (async () => {
    let skipToken: string | undefined = initialSkipToken;
    for (let page = 1; page < MAX_HISTORY_PAGES && skipToken; page += 1) {
      const historyPage = await readHistoryPage(configId, skipToken);
      const events = await Promise.all(
        historyPage.rows.map((row) => mapHistoryEvent(row, agentId, configId)),
      );
      onEntries(await projectHistoryEvents(events, config));
      skipToken = historyPage.nextSkipToken;
    }
    onComplete?.();
  })().finally(() => historyLoadPromises.delete(configId));

  historyLoadPromises.set(configId, load);
  void load.catch((error: unknown) => {
    console.warn('[AgentChangeTracker]', 'Failed to load older change history.', error);
  });
}

/** Project event-level history into granular UI entries without writing field rows. */
export async function listChangeLog(
  agentId: string,
  _environmentId?: string,
  _maxRows?: number,
  _trackingOrgUrl?: string,
  configId?: string,
  onOlderEntries?: (entries: ChangeLogEntry[]) => void,
  onOlderEntriesComplete?: () => void,
): Promise<ChangeLogEntry[]> {
  if (await shouldUseLocalStore()) return localListChangeLog(agentId);
  if (!configId) return [];
  const [historyPage, configs] = await Promise.all([
    readHistoryPage(configId),
    listTrackingConfigs(),
  ]);
  const events = await Promise.all(
    historyPage.rows.map((row) => mapHistoryEvent(row, agentId, configId)),
  );
  const config = configs.find((item) => item.id === configId);
  const latestAgentRename = events
    .filter((event) => {
      if (
        event.sourceTable !== SourceTable.Agent ||
        event.operation !== OperationCode.Update ||
        !event.changedColumns.some((column) => column.toLowerCase() === 'name')
      ) {
        return false;
      }
      const previousName = str(event.oldPayload, 'name')?.trim();
      const currentName = str(event.newPayload, 'name')?.trim();
      return Boolean(currentName && previousName !== currentName);
    })
    .sort((left, right) => (right.changedOn ?? '').localeCompare(left.changedOn ?? ''))[0];
  const renamedAgentName = latestAgentRename ? str(latestAgentRename.newPayload, 'name') : undefined;
  if (config && renamedAgentName && renamedAgentName !== config.agentName) {
    await syncTrackingConfigName(config, renamedAgentName).catch((error: unknown) => {
      console.warn('[AgentChangeTracker]', 'Failed to synchronize the renamed agent configuration.', error);
    });
  }
  if (onOlderEntries) {
    if (historyPage.nextSkipToken) {
      loadRemainingHistory(
        agentId,
        configId,
        config,
        historyPage.nextSkipToken,
        onOlderEntries,
        onOlderEntriesComplete,
      );
    } else {
      onOlderEntriesComplete?.();
    }
  }
  return projectHistoryEvents(events, config);
}

/** Agent deletion is represented by the central Agent state tombstone. */
export async function isTrackedAgentDeleted(config: TrackingConfig): Promise<boolean> {
  if (await shouldUseLocalStore()) {
    return localListChangeLog(config.agentId).some(
      (entry) => entry.changeType === ChangeType.Deleted && entry.componentType === ComponentType.Agent,
    );
  }
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    getTrackingOrgUrl(),
    ENTITY_SET.state,
    undefined,
    ACCEPT,
    undefined,
    undefined,
    'cat_isdeleted',
    `${CONFIG_LINK.lookupFilterField} eq ${config.id} and cat_sourcetablecode eq ${SourceTable.Agent}`,
    undefined,
    undefined,
    undefined,
    1,
  );
  return result.success && bool(rowsOf(result.data)[0] ?? {}, 'cat_isdeleted');
}

export function compareSaveGroups(left: SaveGroup, right: SaveGroup): number {
  const time = (left.changedOn ?? '').localeCompare(right.changedOn ?? '');
  return time || left.saveTransactionId.localeCompare(right.saveTransactionId);
}

export function groupBySaveTransaction(entries: ChangeLogEntry[]): SaveGroup[] {
  const groups = new Map<string, SaveGroup>();
  for (const entry of entries) {
    const key = entry.saveTransactionId || entry.eventId || entry.id;
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(entry);
      if ((entry.changedOn ?? '') > (existing.changedOn ?? '')) existing.changedOn = entry.changedOn;
      if (!existing.changedByName && entry.changedByName) existing.changedByName = entry.changedByName;
    } else {
      groups.set(key, {
        saveTransactionId: key,
        changedOn: entry.changedOn,
        changedByName: entry.changedByName,
        entries: [entry],
      });
    }
  }
  return Array.from(groups.values()).sort((left, right) => compareSaveGroups(right, left));
}

export function cleanSaveGroups(groups: SaveGroup[]): SaveGroup[] {
  return groups
    .map((group) => {
      const seen = new Set<string>();
      const entries = group.entries.filter((entry) => {
        const key = `${entry.eventId ?? entry.id}|${entry.fieldName ?? ''}|${entry.componentId ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { ...group, entries };
    })
    .filter((group) => group.entries.length > 0);
}

async function readStatePayload(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const inline = parseObject(row.cat_currentpayload);
  if (Object.keys(inline).length > 0 || !row.cat_currentpayloadfile) return inline;
  const id = str(row, PRIMARY_KEY.state);
  if (!id) return {};
  const result = await MicrosoftDataverseService.GetEntityFileImageFieldContentWithOrganization(
    '',
    getTrackingOrgUrl(),
    ENTITY_SET.state,
    id,
    'cat_currentpayloadfile',
    undefined,
  );
  if (!result.success || !result.data) return {};
  return parseObject(fromBase64(result.data));
}

/** Agent display metadata read from the central Agent tracked-state row. */
export async function getCentralAgentMetadata(configId: string): Promise<CentralAgentMetadata> {
  if (await shouldUseLocalStore()) return {};
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    getTrackingOrgUrl(),
    ENTITY_SET.state,
    undefined,
    ACCEPT,
    undefined,
    undefined,
    `${PRIMARY_KEY.state},cat_currentpayload,cat_currentpayloadfile`,
    `${CONFIG_LINK.lookupFilterField} eq ${configId} and cat_sourcetablecode eq ${SourceTable.Agent}`,
    undefined,
    undefined,
    undefined,
    1,
  );
  if (!result.success) return {};
  const row = rowsOf(result.data)[0];
  if (!row) return {};
  const payload = await readStatePayload(row);
  return {
    iconBase64: str(payload, 'iconbase64'),
    publishedOn: str(payload, 'publishedon'),
  };
}

/** Current component bodies come from central tracked state, not a config blob. */
export async function getComponentBodies(configId: string): Promise<Record<string, string>> {
  if (await shouldUseLocalStore()) return {};
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    getTrackingOrgUrl(),
    ENTITY_SET.state,
    'odata.maxpagesize=5000',
    ACCEPT,
    undefined,
    undefined,
    `${PRIMARY_KEY.state},cat_sourcerecordid,cat_currentpayload,cat_currentpayloadfile`,
    `${CONFIG_LINK.lookupFilterField} eq ${configId} and cat_sourcetablecode eq ${SourceTable.Component}`,
  );
  if (!result.success) return {};
  const output: Record<string, string> = {};
  for (const row of rowsOf(result.data)) {
    const id = str(row, 'cat_sourcerecordid');
    if (!id) continue;
    const payload = await readStatePayload(row);
    const body = valueText(payload.data ?? payload.content);
    if (body) output[id] = body;
  }
  return output;
}

export async function getAgentOwnership(agentId: string, orgUrl: string): Promise<AgentOwnership> {
  if (await shouldUseLocalStore()) return localGetAgentOwnership();
  return readAgentOwnership(agentId, orgUrl);
}

export async function getAgentComponentParents(
  agentId: string,
  orgUrl: string,
): Promise<Record<string, string>> {
  if (await shouldUseLocalStore()) return {};
  return readComponentParents(agentId, orgUrl);
}
