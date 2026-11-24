/**
 * Reads an agent's current, live state from its source environment so the diff
 * engine can compare it to the stored snapshot.
 *
 * Two sources are combined into one flat list of {@link ComponentState}:
 *  1. Every `botcomponent` of the bot (tools, topics, knowledge, triggers,
 *     instructions) — the authored YAML in the `data` column is the diff body.
 *  2. The `bot.configuration` (+ authentication) JSON, flattened into one unit
 *     per setting (Code Interpreter, Reasoning, knowledge, …) so a single toggle
 *     produces a single precise change event.
 */

import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import {
  ComponentType,
  refineComponentType,
  type AgentModifier,
  type AgentOwnership,
  type ComponentState,
  type LiveState,
} from '../contracts/change-tracker';
import { fnv1a, flattenSettings, settingLabel, normalizeBody } from './diff-engine';

const ACCEPT = 'application/json';
const MODIFIED_BY_FMT = '_modifiedby_value@OData.Community.Display.V1.FormattedValue';
const CREATED_BY_FMT = '_createdby_value@OData.Community.Display.V1.FormattedValue';
const OWNER_FMT = '_ownerid_value@OData.Community.Display.V1.FormattedValue';
const PARENT_FMT = '_parentbotcomponentid_value@OData.Community.Display.V1.FormattedValue';
const AUTH_MODE_FMT = 'authenticationmode@OData.Community.Display.V1.FormattedValue';
const STATECODE_FMT = 'statecode@OData.Community.Display.V1.FormattedValue';
const STATUSCODE_FMT = 'statuscode@OData.Community.Display.V1.FormattedValue';
const PUBLISHED_ON_FMT = 'publishedon@OData.Community.Display.V1.FormattedValue';
const LANGUAGE_FMT = 'language@OData.Community.Display.V1.FormattedValue';
const SUPPORTED_LANGUAGES_FMT = 'supportedlanguages@OData.Community.Display.V1.FormattedValue';
const AUTH_NONE_LABEL = 'No authentication';

const BOTCOMPONENT_SELECT = [
  'botcomponentid',
  'name',
  'schemaname',
  'componenttype',
  'data',
  'description',
  'createdon',
  'modifiedon',
  '_modifiedby_value',
].join(',');

/** Matches a locale-suffixed schema name (e.g. `…topic.Greeting.fi-FI`). */
const LOCALE_SUFFIX = /\.[a-z]{2}-[A-Z]{2}$/;

/**
 * Matches the system voice/telephony topics Copilot Studio auto-provisions when
 * "Enable voice" is toggled on (Settings > Voice). They are platform scaffolding
 * owned by the Voice toggle — not authored content — so tracking them as Topic
 * additions turns a single setting change into a burst of noisy, confusing cards
 * (e.g. the OnSilence "Are you still there?" YAML). They are suppressed here and
 * the toggle itself is surfaced as the friendly "Voice" setting instead (see
 * SETTING_LABELS / SUPPRESSED_SETTING_PATHS in diff-engine).
 */
const VOICE_SYSTEM_TOPIC = /\.topic\.(Silence|UnrecognizedSpeech|AnsweringMachineDetection|UnknownDtmfKey)$/;

/**
 * The trigger kinds authored into the four voice system topics' YAML. A stored
 * baseline snapshot keeps no schema name, so these locale-proof body markers let
 * the capture path recognise and drop voice topics that a pre-suppression
 * snapshot still contains — otherwise, now that the live read omits them (see
 * VOICE_SYSTEM_TOPIC), the first capture after this change would diff them as
 * phantom "removed" topics. One user action (enabling Voice) then stays a single
 * "Voice" setting change on both new and previously-baselined agents.
 */
const VOICE_SYSTEM_TOPIC_BODY =
  /\bkind:\s*(OnSilence|OnUnrecognizedSpeech|OnAnsweringMachineDetected|OnUnknownDtmfKey)\b/;

/** True when a stored component body is one of the auto-provisioned voice topics. */
export function isVoiceSystemTopicBody(body: string | undefined): boolean {
  return !!body && VOICE_SYSTEM_TOPIC_BODY.test(body);
}

/**
 * Display names of the four voice system topics (en-US). Used only as a fallback
 * to recognise change-log rows whose topic has no body-bearing (`data`) row in
 * the fetched window — the body trigger-kind marker (isVoiceSystemTopicBody) is
 * the primary, locale-proof signal.
 */
const VOICE_SYSTEM_TOPIC_NAMES: ReadonlySet<string> = new Set(
  ['Silence detection', 'Speech unrecognized', 'Answering Machine Detection', 'Unknown dial pad press'].map((n) =>
    n.toLowerCase(),
  ),
);

/** True when a component display name matches a known voice system topic. */
export function isVoiceSystemTopicName(name: string | undefined): boolean {
  return !!name && VOICE_SYSTEM_TOPIC_NAMES.has(name.trim().toLowerCase());
}

function normalizeOrg(url: string): string {
  return url.trim().replace(/\/+$/g, '');
}

function rowsOf(data: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const value = (data as { value?: unknown } | undefined)?.value;
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(row: Record<string, unknown>, key: string): number | undefined {
  const v = row[key];
  return typeof v === 'number' ? v : undefined;
}

/**
 * Classify a Copilot Studio botcomponent into a {@link ComponentType}. The
 * schema-name segment is authoritative (Dataverse types many components as
 * "Topic (V2)"); the numeric componenttype is the fallback.
 */
export function classifyComponent(
  componentType: number | undefined,
  schemaName: string | undefined,
): ComponentType {
  const schema = (schemaName ?? '').toLowerCase();
  // Skills (new-designer Skills panel) are typed by Dataverse as componenttype 9
  // (same as Tools), so the `.skill.` schema segment must be checked explicitly.
  if (schema.includes('.skill.')) return ComponentType.Skill;
  if (schema.includes('.action.') || schema.includes('.tool.')) return ComponentType.Tool;
  // `.file.` covers file-based knowledge sources uploaded in the new agent
  // designer (e.g. `<agent>.file.<name>`), which carry no `.knowledge.` segment.
  if (schema.includes('.knowledge.') || schema.includes('.datasource.') || schema.includes('.file.'))
    return ComponentType.Knowledge;
  if (schema.includes('.gpt.') || schema.includes('.instructions.')) return ComponentType.Instructions;
  if (schema.includes('.trigger.')) return ComponentType.Trigger;
  if (schema.includes('.childagent.') || schema.includes('.agent.')) return ComponentType.ChildAgent;
  if (schema.includes('.topic.')) return ComponentType.Topic;
  switch (componentType) {
    case 0:
    case 9:
      return ComponentType.Topic;
    case 15:
      return ComponentType.Instructions;
    case 16:
      return ComponentType.Knowledge;
    case 14:
      // New-designer file knowledge source (Dataverse componenttype 14).
      return ComponentType.Knowledge;
    case 18:
      return ComponentType.Settings;
    case 5:
    case 17:
      return ComponentType.Trigger;
    case 1:
    case 13:
      return ComponentType.Tool;
    case 19:
      // Copilot Studio evaluation/test-set components (test sets + their test
      // cases). refineComponentType still overrides from the YAML `kind`
      // (EvaluationData/EvaluationSet) when present; this is the fallback so an
      // unrecognised kind is still labelled "Evaluation" rather than "Other".
      return ComponentType.Evaluation;
    default:
      return ComponentType.Other;
  }
}

/** A readable component name from the row's name, falling back to the schema. */
function componentName(row: Record<string, unknown>): string {
  const name = str(row, 'name');
  if (name) return name;
  const schema = str(row, 'schemaname') ?? '';
  const seg = schema.split('.').pop() ?? schema;
  return seg || 'Component';
}

/** Read all meaningful botcomponents of the bot as tracked component states. */
async function readBotComponents(agentId: string, org: string): Promise<ComponentState[]> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    org,
    'botcomponents',
    'odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=5000',
    ACCEPT,
    undefined,
    undefined,
    BOTCOMPONENT_SELECT,
    `_parentbotid_value eq ${agentId}`,
    'schemaname asc',
  );
  if (!result.success) return [];

  return rowsOf(result.data)
    .filter((row) => !LOCALE_SUFFIX.test(str(row, 'schemaname') ?? ''))
    .filter((row) => !VOICE_SYSTEM_TOPIC.test(str(row, 'schemaname') ?? ''))
    .map((row) => {
      const body = normalizeBody(str(row, 'data') ?? '');
      return {
        key: String(row['botcomponentid'] ?? componentName(row)),
        componentId: str(row, 'botcomponentid'),
        componentType: refineComponentType(
          classifyComponent(num(row, 'componenttype'), str(row, 'schemaname')),
          body,
        ),
        componentName: componentName(row),
        body,
        description: str(row, 'description'),
        hash: fnv1a(body),
        createdOn: str(row, 'createdon'),
        modifiedOn: str(row, 'modifiedon'),
        modifiedByName: str(row, MODIFIED_BY_FMT),
        modifiedById: str(row, '_modifiedby_value'),
      } satisfies ComponentState;
    });
}

/**
 * Read the full, untruncated authored YAML (`data`) of a single botcomponent.
 * Used by the timeline's "View YAML" dialog to show the complete current
 * definition for components whose change row stored no body (e.g. baseline
 * creations).
 */
export async function readComponentYaml(componentId: string, orgUrl: string): Promise<string> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    normalizeOrg(orgUrl),
    'botcomponents',
    'odata.maxpagesize=1',
    ACCEPT,
    undefined,
    undefined,
    'botcomponentid,data',
    `botcomponentid eq ${componentId}`,
  );
  if (!result.success) return '';
  const row = rowsOf(result.data)[0];
  return (row && str(row, 'data')) ?? '';
}


function parseJson(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Map the bot `authenticationmode` Dataverse formatted value to the label
 * Copilot Studio shows in its Security/Authentication settings, so the timeline
 * reads the way the maker sees it.
 */
function authModeLabel(formatted: string | undefined): string {
  const v = (formatted ?? '').toLowerCase();
  if (!v || v.includes('none')) return AUTH_NONE_LABEL;
  if (v.includes('integrated') || v.includes('teams')) return 'Authenticate with Microsoft';
  if (v.includes('aad') || v.includes('azureactivedirectory') || v.includes('manual') || v.includes('oauth')) {
    return 'Authenticate manually';
  }
  return formatted ?? AUTH_NONE_LABEL;
}

/** Read the bot's settings (flattened) plus its agent-level last-modifier. */
async function readBot(agentId: string, org: string): Promise<{ settings: ComponentState[]; agent: AgentModifier }> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    org,
    'bots',
    'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    ACCEPT,
    undefined,
    undefined,
    'botid,name,statecode,statuscode,configuration,authenticationconfiguration,authenticationmode,iconbase64,publishedon,language,supportedlanguages,modifiedon,_modifiedby_value,createdon,_createdby_value,_ownerid_value',
    `botid eq ${agentId}`,
  );
  if (!result.success) return { settings: [], agent: {} };
  const row = rowsOf(result.data)[0];
  if (!row) return { settings: [], agent: {} };

  const modifiedOn = str(row, 'modifiedon');
  const modifiedByName = str(row, MODIFIED_BY_FMT);
  const modifiedById = str(row, '_modifiedby_value');
  const agent: AgentModifier = {
    modifiedOn,
    modifiedByName,
    modifiedById,
    createdOn: str(row, 'createdon'),
    createdByName: str(row, CREATED_BY_FMT),
    createdById: str(row, '_createdby_value'),
    ownerName: str(row, OWNER_FMT),
    ownerId: str(row, '_ownerid_value'),
  };
  const config = parseJson(str(row, 'configuration')) ?? {};
  const auth = parseJson(str(row, 'authenticationconfiguration'));
  const merged: Record<string, unknown> = { ...(config as Record<string, unknown>) };
  if (auth && typeof auth === 'object') merged.authenticationConfiguration = auth;

  const stamp = { modifiedOn, modifiedByName, modifiedById };
  const settings: ComponentState[] = flattenSettings(merged).map((leaf) => ({
    key: `settings::${leaf.path}`,
    componentType: ComponentType.Settings,
    componentName: settingLabel(leaf.path),
    body: leaf.value,
    hash: fnv1a(leaf.value),
    ...stamp,
  }));

  // Authentication mode is a scalar bot column, not part of the configuration
  // JSON, so surface it explicitly to track auth changes (e.g. switching between
  // "No authentication" and "Authenticate with Microsoft"). The companion
  // `authenticationtrigger` column is intentionally NOT tracked: on its own it
  // isn't meaningful to a reader and only adds a noisy second card next to the
  // real authentication change.
  const authMode = authModeLabel(str(row, AUTH_MODE_FMT));
  settings.push({
    key: 'settings::authentication.mode',
    componentType: ComponentType.Settings,
    componentName: 'Authentication',
    body: authMode,
    hash: fnv1a(authMode),
    ...stamp,
  });

  // Agent status (activate/deactivate) is an agent-level field the Bot Settings
  // flow tracks and no botcomponent mirrors, so baseline it under the exact
  // label the flow writes; a real change then reconciles as "Updated" instead of
  // being suppressed as an un-baselined setting, and the initial re-dump matches
  // the baseline so only genuine edits surface.
  //
  // Baseline the authoritative bot name under the exact label emitted by the
  // capture flow. The flow re-dumps this value on unrelated bot updates (such
  // as an icon change), so omitting it makes the first dump look like a rename.
  const agentName = str(row, 'name') ?? '';
  settings.push({
    key: 'settings::bot.name',
    componentType: ComponentType.Agent,
    componentName: 'Agent name',
    body: agentName,
    hash: fnv1a(agentName),
    ...stamp,
  });

  const statusLabel = str(row, STATECODE_FMT) ?? (num(row, 'statecode') === 1 ? 'Inactive' : 'Active');
  settings.push({
    key: 'settings::bot.status',
    componentType: ComponentType.Settings,
    componentName: 'Agent status',
    body: statusLabel,
    hash: fnv1a(statusLabel),
    ...stamp,
  });

  // The status reason (`statuscode`) is the agent-level signal that flips when an
  // agent is blocked / deprovisioned by an admin, loses its license, or fails to
  // provision (Provisioned -> Deprovisioned / MissingLicense / ProvisionFailed).
  // It is distinct from the Active/Inactive `statecode` surfaced above as
  // "Agent status": deactivating an agent and blocking it can both read as
  // Inactive, so only the status reason distinguishes a block from a routine
  // deactivation. Baseline it under its own label so the first sighting is the
  // running baseline (hidden) and a later transition surfaces as "Updated".
  const statusReasonLabel =
    str(row, STATUSCODE_FMT) ?? (num(row, 'statuscode') !== undefined ? String(num(row, 'statuscode')) : '');
  settings.push({
    key: 'settings::bot.statusreason',
    componentType: ComponentType.Settings,
    componentName: 'Agent status reason',
    body: statusReasonLabel,
    hash: fnv1a(statusReasonLabel),
    ...stamp,
  });

  // The agent icon lives in the `iconbase64` bot column (a base64 PNG) — the
  // exact value the capture flow reports as the "Agent icon" setting. Baseline
  // it under that same label so an icon swap surfaces as a real change: without
  // a baseline entry the settings reconciliation treats every icon "Created"
  // row as an un-diffable bot-level dump and hides it, so icon edits went
  // unnoticed. The body is capped when serialized, so only its leading bytes are
  // stored; a changed image differs within those bytes and reads as Updated.
  const iconBase64 = str(row, 'iconbase64') ?? '';
  if (iconBase64) {
    settings.push({
      key: 'settings::bot.icon',
      componentType: ComponentType.Agent,
      componentName: 'Agent icon',
      body: iconBase64,
      hash: fnv1a(iconBase64),
      ...stamp,
    });
  }

  // Publishing is an agent-level event the Bot Settings flow records as the
  // "Published on" setting (the bot.publishedon timestamp). Baseline it under
  // the exact label + formatted value the flow writes so the initial re-dump
  // matches the baseline and only a genuine (re)publish after tracking started
  // surfaces as "Updated". An unpublished agent baselines an empty value, so its
  // first publish still reads as a real change. Without this baseline entry the
  // settings reconciliation hides every publish as an un-diffable bot-level dump.
  const publishedOn = str(row, PUBLISHED_ON_FMT) ?? str(row, 'publishedon') ?? '';
  settings.push({
    key: 'settings::bot.publishedon',
    componentType: ComponentType.Agent,
    componentName: 'Published on',
    body: publishedOn,
    hash: fnv1a(publishedOn),
    ...stamp,
  });

  // Languages (Settings > Languages). The bot carries the primary language in the
  // `language` picklist (LCID; formatted value e.g. "English") and the secondary
  // "supported" languages in the `supportedlanguages` multi-select picklist
  // (comma-separated LCIDs; formatted value e.g. "Hindi; English (United
  // Kingdom)"). Both are agent-level columns no botcomponent mirrors, so baseline
  // them under the exact labels the Bot Settings flow writes (see
  // Deploy-BotSettingsFlow.py) — the first sighting is the running baseline
  // (hidden) and a later language add/remove/change surfaces as "Updated". An
  // agent with no secondary languages baselines an empty value, so adding the
  // first one still reads as a real change.
  const primaryLanguage = str(row, LANGUAGE_FMT) ?? (num(row, 'language') !== undefined ? String(num(row, 'language')) : '');
  settings.push({
    key: 'settings::bot.language',
    componentType: ComponentType.Settings,
    componentName: 'Primary language',
    body: primaryLanguage,
    hash: fnv1a(primaryLanguage),
    ...stamp,
  });

  const secondaryLanguages = str(row, SUPPORTED_LANGUAGES_FMT) ?? str(row, 'supportedlanguages') ?? '';
  settings.push({
    key: 'settings::bot.supportedlanguages',
    componentType: ComponentType.Settings,
    componentName: 'Secondary languages',
    body: secondaryLanguages,
    hash: fnv1a(secondaryLanguages),
    ...stamp,
  });

  return { settings, agent };
}

/**
 * Read the agent's full current state (components + settings) plus the agent's
 * own last-modifier. The two reads run concurrently; either failing degrades
 * gracefully to the other's results.
 */
export async function readLiveState(agentId: string, orgUrl: string): Promise<LiveState> {
  const org = normalizeOrg(orgUrl);
  const [components, bot] = await Promise.all([
    readBotComponents(agentId, org),
    readBot(agentId, org),
  ]);
  return { states: [...bot.settings, ...components], agent: bot.agent };
}

/**
 * Read just the agent's creator and owner from its `bots` record. Used to
 * surface "who owns the agent" without a full live-state read.
 */
export async function readAgentOwnership(agentId: string, orgUrl: string): Promise<AgentOwnership> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    normalizeOrg(orgUrl),
    'bots',
    'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    ACCEPT,
    undefined,
    undefined,
    'botid,createdon,_createdby_value,_ownerid_value,iconbase64,publishedon',
    `botid eq ${agentId}`,
  );
  if (!result.success) return {};
  const row = rowsOf(result.data)[0];
  if (!row) return {};
  return {
    createdOn: str(row, 'createdon'),
    createdByName: str(row, CREATED_BY_FMT),
    createdById: str(row, '_createdby_value'),
    ownerName: str(row, OWNER_FMT),
    ownerId: str(row, '_ownerid_value'),
    publishedOn: str(row, 'publishedon'),
    iconBase64: str(row, 'iconbase64'),
  };
}

/**
 * Map every botcomponent that lives under a child agent to that child agent's
 * display name, keyed by the component's id. Copilot Studio nests a child
 * agent's tools and knowledge as root-level botcomponents linked back to the
 * child agent via `_parentbotcomponentid_value`; this lets the UI tag those
 * changes as belonging to the child agent.
 */
export async function readComponentParents(agentId: string, orgUrl: string): Promise<Record<string, string>> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    normalizeOrg(orgUrl),
    'botcomponents',
    'odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=5000',
    ACCEPT,
    undefined,
    undefined,
    ['botcomponentid', 'name', 'schemaname', 'componenttype', '_parentbotcomponentid_value'].join(','),
    `_parentbotid_value eq ${agentId}`,
    'schemaname asc',
  );
  if (!result.success) return {};

  const rows = rowsOf(result.data);
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = str(row, 'botcomponentid');
    if (id) byId.set(id, row);
  }

  const out: Record<string, string> = {};
  for (const row of rows) {
    const id = str(row, 'botcomponentid');
    const parentId = str(row, '_parentbotcomponentid_value');
    if (!id || !parentId) continue;
    const parent = byId.get(parentId);
    if (!parent) continue;
    const parentType = classifyComponent(num(parent, 'componenttype'), str(parent, 'schemaname'));
    if (parentType === ComponentType.ChildAgent) {
      out[id] = str(parent, 'name') ?? str(row, PARENT_FMT) ?? 'Child agent';
    }
  }
  return out;
}
