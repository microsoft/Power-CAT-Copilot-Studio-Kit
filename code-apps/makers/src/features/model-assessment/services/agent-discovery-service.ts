/**
 * Copilot Studio agents in the app's environment, read through the
 * commondataserviceforapps connector, and registration of tracked agents.
 */

import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { listDataverseRows } from '../../../shared/services/dataversePaging';
import { ENTITY_SET, type KitSettingsVM } from '../contracts/model-assessment';
import { kitSettingsItem } from './model-assessment-service';
import { parseAgentConfiguration, parseModelNameHint } from './model-parser';

const ACCEPT = 'application/json';

/**
 * Sentinel the Dataverse connector resolves to the app's own host environment.
 * Mirrors the `CURRENT_ORG` convention used across this app's features (the bare
 * current-environment operations fail under local play with "Invalid
 * organization URL 'null'").
 */
export const CURRENT_ENV = 'current';

/** cat_sourcestatuscode = Active (global choice base 3353500xx). */
const SOURCE_STATUS_ACTIVE = 335350001;
const CHANGE_TYPE_BASELINE = 335350001;

/** A live Copilot Studio agent discovered from a `bots` table. */
export interface DiscoveredAgent {
  botId: string;
  name: string;
  schema: string;
  iconBase64?: string;
  /** Copilot harness agent (model in bot.configuration; no Kit test automation). */
  harness?: boolean;
}

/** Outcome of an add attempt, distinguishing an already-tracked duplicate. */
export interface AddAgentResult {
  success: boolean;
  duplicate: boolean;
  modelUnavailable?: boolean;
}

type Row = Record<string, unknown>;

function isHarness(configuration: unknown): boolean {
  try {
    return parseAgentConfiguration(configuration).isHarness;
  } catch {
    return false;
  }
}

function mapDiscoveredAgents(rows: Row[]): DiscoveredAgent[] {
  return rows
    .map((row) => ({
      botId: typeof row['botid'] === 'string' ? row['botid'] : '',
      name: (typeof row['name'] === 'string' && row['name']) || 'Unnamed agent',
      schema: typeof row['schemaname'] === 'string' ? row['schemaname'] : '',
      iconBase64:
        typeof row['iconbase64'] === 'string' && row['iconbase64'].length > 0
          ? row['iconbase64']
          : undefined,
      harness: isHarness(row['configuration']),
    }))
    .filter((agent) => agent.botId.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listBots(organization: string): Promise<DiscoveredAgent[]> {
  const rows = await listDataverseRows(organization, 'bots', {
    select: 'botid,name,schemaname,configuration,iconbase64',
    filter: 'statecode eq 0',
    orderby: 'name asc',
  });
  return mapDiscoveredAgents(rows);
}

async function getAgentCurrentModel(agent: DiscoveredAgent): Promise<string | undefined> {
  return getLiveAgentModel(agent.botId);
}

/**
 * Read the model an agent is configured with right now in Copilot Studio (the
 * same detection the tracked-agent row was seeded with). Read-only: the stored
 * cat_currentmodel is the orchestrator's baseline for change detection and is
 * only advanced by an assessment run.
 */
export async function getLiveAgentModel(botId: string): Promise<string | undefined> {
  const bot = await MicrosoftDataverseService.ListRecordsWithOrganization(
    CURRENT_ENV, 'bots', undefined, ACCEPT, undefined, undefined,
    'configuration', `botid eq ${botId}`, undefined, undefined, undefined, 1,
  );
  if (!bot.success) return undefined;
  const bots = (bot.data as { value?: Row[] } | undefined)?.value ?? [];
  if (bots.length !== 1) return undefined;
  const configuration = parseAgentConfiguration(bots[0]['configuration']);
  if (configuration.isHarness) return configuration.model;

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    CURRENT_ENV,
    'botcomponents',
    undefined,
    ACCEPT,
    undefined,
    undefined,
    'data',
    `_parentbotid_value eq ${botId} and componenttype eq 15`,
    'modifiedon desc',
    undefined,
    undefined,
    10,
  );
  if (!result.success) return undefined;
  const rows = (result.data as { value?: Row[] } | undefined)?.value ?? [];
  return rows
    .map((row) => parseModelNameHint(row['data']))
    .find((model): model is string => Boolean(model));
}

/** Agent icons (bots.iconbase64) as data URLs, keyed by lower-case bot id. */
export async function getAgentIcons(): Promise<Record<string, string>> {
  const rows = await listDataverseRows(CURRENT_ENV, 'bots', {
    select: 'botid,iconbase64',
    filter: 'statecode eq 0',
  });
  const icons: Record<string, string> = {};
  for (const row of rows) {
    const id = row['botid'];
    const icon = typeof row['iconbase64'] === 'string' ? row['iconbase64'].trim() : '';
    if (typeof id === 'string' && icon) {
      icons[id.toLowerCase()] = icon.startsWith('data:') ? icon : `data:image/png;base64,${icon}`;
    }
  }
  return icons;
}

/** Assessable agents in the app's own environment. */
export const listAgentsInCurrentEnv = (): Promise<DiscoveredAgent[]> => listBots(CURRENT_ENV);

/**
 * Add a discovered agent to the tracked-agent table, capturing its current
 * model and initial history atomically. The `cat_agentkey` alternate key (cat_copilotagentid) makes this
 * idempotent — a repeat add surfaces as `duplicate`, not a hard error.
 */
export async function addTrackedAgent(agent: DiscoveredAgent, kit?: KitSettingsVM): Promise<AddAgentResult> {
  const currentModel = await getAgentCurrentModel(agent);
  if (!currentModel) {
    return { success: false, duplicate: false, modelUnavailable: true };
  }
  const result = await MicrosoftDataverseService.CreateRecordWithOrganization(
    'return=representation',
    ACCEPT,
    CURRENT_ENV,
    ENTITY_SET.trackedAgent,
    {
      cat_name: agent.name,
      cat_copilotagentid: agent.botId,
      cat_schemaname: agent.schema,
      cat_sourcestatuscode: SOURCE_STATUS_ACTIVE,
      cat_currentmodel: currentModel,
      ...(kit ? kitSettingsItem(kit) : {}),
      cat_TrackedAgent_ModelHistory: [{
        cat_name: `Baseline - ${currentModel}`,
        cat_changetypecode: CHANGE_TYPE_BASELINE,
        cat_currentmodel: currentModel,
      }],
    },
  );
  if (result.success) return { success: true, duplicate: false };
  const message = String(result.error ?? '').toLowerCase();
  const duplicate = message.includes('duplicate') || message.includes('cat_agentkey');
  return { success: false, duplicate };
}
