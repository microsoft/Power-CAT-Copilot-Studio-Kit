/**
 * csZipParser.ts
 *
 * Parses a Copilot Studio Power Platform solution ZIP and extracts
 * structured bot metadata and bot components, mirroring the Dataverse
 * bots and botcomponents table structure.
 *
 * ZIP layout (Power Platform solution format):
 *   bots/{schemaName}/bot.xml              → bot display name, icon, template
 *   bots/{schemaName}/configuration.json  → GenerativeActionsEnabled flag, harness settings
 *   botcomponents/{schemaName}.{type}.{label}/botcomponent.xml  → componenttype, name, statecode
 *   botcomponents/{schemaName}.{type}.{label}/data              → YAML content (same as botcomponent.content in Dataverse)
 *   botcomponents/{schemaName}.file.{label}/filedata/{path}      → Copilot skill resource bytes
 *
 * Detection: presence of [Content_Types].xml or solution.xml at ZIP root.
 */

import JSZip from 'jszip';
import type { BotComponent } from '../../contracts/ServiceContracts';
import type { AgentHarnessKind, BotMetadata } from '../../contracts/ReviewResult';
import type { SkillResourceRow } from '../../agents-experience/contracts/SkillBundle';
import { detectAgentHarness } from '../../agents-experience/services/detection';

/**
 * A bot extracted from the solution ZIP bots/ folder.
 */
export interface CSZipBot {
  /** Schema name (unique identifier, e.g. "blank_agent_n18rn") */
  schemaName: string;
  /** Bot record identifier from bot.xml, falling back to schemaName. */
  botId: string;
  /** Stable component identifier from bot.xml, falling back to schemaName. */
  componentIdUnique: string;
  /** Display name from bot.xml <name> */
  name: string;
  /**
   * Whether this bot is eligible for review. An unsupported harness agent is eligible, so the
   * review start can show the unsupported harness message (issue 947).
   */
  generativeActionsEnabled: boolean;
  /** Harness kind from configuration.json and the bot.xml template (issue 947). */
  harness: AgentHarnessKind;
  /** Raw bot configuration consumed by the Copilot review parser. */
  configuration: string;
  /** Icon as base64 string (from bot.xml <iconbase64>, optional) */
  iconBase64?: string;
  /** Agent description from bot.xml <description>, optional */
  description?: string;
  /**
   * Agent authentication mode from bot.xml <authenticationmode>. Undefined when the element
   * is missing or is not a whole number.
   */
  authenticationMode?: number;
  /** Agent template from bot.xml <template>. Undefined when the element is missing or empty. */
  template?: string;
}

/**
 * Full parse result from a CS solution ZIP.
 */
export interface CSZipParseResult {
  /** All bots found in the ZIP (filtered to generative-AI-enabled before use) */
  bots: CSZipBot[];
  /** BotComponent arrays keyed by bot schemaName — mirrors Dataverse botcomponents */
  componentsBySchemaName: Record<string, BotComponent[]>;
  /** Embedded type-14 file resources keyed by bot schemaName. */
  resourcesBySchemaName: Record<string, CSZipResource[]>;
}

/** A type-14 skill resource and its in-memory ZIP bytes. */
export interface CSZipResource {
  row: SkillResourceRow;
  bytes: Uint8Array;
}

/**
 * Converts a CSZipBot to the BotMetadata interface expected by StageAService.
 */
export function zipBotToMetadata(bot: CSZipBot): BotMetadata {
  const useExportedIdentifiers = bot.harness === 'copilot';
  return {
    botId: useExportedIdentifiers ? bot.botId : bot.schemaName,
    name: bot.name,
    statusCode: 1,
    componentIdUnique: useExportedIdentifiers ? bot.componentIdUnique : bot.schemaName,
    iconBase64: bot.iconBase64,
    harness: bot.harness,
  };
}

function xmlValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return undefined;
  // Remove tags until none is left (CodeQL js/incomplete-multi-character-sanitization). One pass gives the same result.
  let value = match[1];
  let previous: string;
  do {
    previous = value;
    value = value.replace(/<[^>]+>/g, '');
  } while (value !== previous);
  value = value.trim();
  return value || undefined;
}

function xmlAttribute(xml: string, element: string, attribute: string): string | undefined {
  const match = xml.match(new RegExp(`<${element}\\b[^>]*\\b${attribute}=["']([^"']+)["']`, 'i'));
  return match?.[1]?.trim() || undefined;
}

function normalizeIdentifier(value: string | undefined, fallback: string): string {
  return value?.replace(/^\{|\}$/g, '').trim() || fallback;
}

/**
 * Parses a Copilot Studio solution ZIP into structured bot + component data.
 *
 * @param file - The solution ZIP file selected by the user
 * @returns Structured parse result with all bots and their components
 * @throws Error if the file is not a valid CS solution ZIP
 */
export async function parseCSZip(file: File): Promise<CSZipParseResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('Could not read ZIP file. Ensure the file is a valid .zip archive.');
  }

  // Verify it's a CS solution ZIP
  if (!zip.files['[Content_Types].xml'] && !zip.files['solution.xml']) {
    throw new Error('Not a Copilot Studio solution ZIP: missing [Content_Types].xml or solution.xml.');
  }

  const bots: CSZipBot[] = [];
  const componentsBySchemaName: Record<string, BotComponent[]> = {};
  const resourcesBySchemaName: Record<string, CSZipResource[]> = {};

  // ── Step 1: Parse bots/ folder ──
  // Collect unique bot schemaNames from bots/{schemaName}/ subfolders
  const botSchemaNames = new Set<string>();
  for (const filePath of Object.keys(zip.files)) {
    if (filePath.startsWith('bots/') && filePath.split('/').length === 3) {
      const schemaName = filePath.split('/')[1];
      if (schemaName) botSchemaNames.add(schemaName);
    }
  }

  for (const schemaName of botSchemaNames) {
    const botXmlPath = `bots/${schemaName}/bot.xml`;
    const configPath = `bots/${schemaName}/configuration.json`;

    if (!zip.files[botXmlPath]) continue;

    // Parse bot.xml — extract metadata and stable identifiers.
    const xmlText = await zip.files[botXmlPath].async('string');
    const nameMatch = xmlText.match(/<name>([\s\S]*?)<\/name>/i);
    const iconMatch = xmlText.match(/<iconbase64>([\s\S]*?)<\/iconbase64>/i);
    const descriptionMatch = xmlText.match(/<description>([\s\S]*?)<\/description>/i);

    const name = nameMatch ? nameMatch[1].trim() : schemaName;
    const iconBase64 = iconMatch ? iconMatch[1].trim() : undefined;
    const description = descriptionMatch ? descriptionMatch[1].trim() : undefined;

    const botId = normalizeIdentifier(
      xmlAttribute(xmlText, 'bot', 'botid') ?? xmlValue(xmlText, 'botid'),
      schemaName,
    );
    const componentIdUnique = normalizeIdentifier(
      xmlValue(xmlText, 'componentidunique'),
      schemaName,
    );
    const authModeText = xmlValue(xmlText, 'authenticationmode');
    const authenticationMode = authModeText && /^\d+$/.test(authModeText) ? Number(authModeText) : undefined;
    const template = xmlValue(xmlText, 'template');

    // Parse configuration.json. Microsoft Copilot agents and unsupported harness agents are
    // eligible even when the standard GenerativeActionsEnabled flag is absent (issue 947).
    let generativeActionsEnabled = false;
    let configuration = '';
    if (zip.files[configPath]) {
      try {
        configuration = await zip.files[configPath].async('string');
        const config = JSON.parse(configuration) as Record<string, unknown>;
        const settings = config.settings as Record<string, unknown> | undefined;
        generativeActionsEnabled = settings?.GenerativeActionsEnabled === true;
      } catch {
        // Missing or malformed config — treat as non-generative
      }
    }

    const harness = detectAgentHarness(configuration, template).kind;
    generativeActionsEnabled = generativeActionsEnabled || harness !== 'standard';

    bots.push({
      schemaName,
      botId,
      componentIdUnique,
      name,
      generativeActionsEnabled,
      harness,
      configuration,
      iconBase64,
      description: description || undefined,
      authenticationMode,
      template,
    });
    componentsBySchemaName[schemaName] = [];
    resourcesBySchemaName[schemaName] = [];
  }

  // ── Step 2: Parse botcomponents/ folder ──
  // Folder naming: botcomponents/{schemaName}.{type}.{label}/
  // e.g. botcomponents/blank_agent_n18rn.topic.HRRecruitment/
  const botcomponentFolders = new Set<string>();
  for (const filePath of Object.keys(zip.files)) {
    if (filePath.startsWith('botcomponents/') && filePath.split('/').length === 3) {
      const folder = filePath.split('/')[1];
      if (folder) botcomponentFolders.add(folder);
    }
  }

  // When there is exactly one bot in the ZIP, unmatched folders (component collections)
  // are assigned to it. With multiple bots, unmatched folders are skipped — there is no
  // reliable way to know which bot they belong to without reading the full solution manifest.
  const singleBotFallback = botSchemaNames.size === 1
    ? Array.from(botSchemaNames)[0]
    : null;

  for (const folder of botcomponentFolders) {
    // Resolve parent bot schemaName — longest matching prefix from known bots
    let parentSchemaName = resolveParentSchemaName(folder, Array.from(botSchemaNames));

    // Component collection components use their own schema name prefix (not the bot's).
    // Fall back to the single bot when there is no direct match.
    if (!parentSchemaName) {
      if (singleBotFallback) {
        parentSchemaName = singleBotFallback;
      } else {
        continue;
      }
    }

    const xmlPath = `botcomponents/${folder}/botcomponent.xml`;
    const dataPath = `botcomponents/${folder}/data`;

    if (!zip.files[xmlPath]) continue;

    const xmlText = await zip.files[xmlPath].async('string');

    // Extract fields from botcomponent.xml
    const componentTypeMatch = xmlText.match(/<componenttype>(\d+)<\/componenttype>/i);
    const nameMatch = xmlText.match(/<name>([\s\S]*?)<\/name>/i);
    const stateMatch = xmlText.match(/<statecode>(\d+)<\/statecode>/i);

    const componenttype = componentTypeMatch ? componentTypeMatch[1].trim() : '0';
    const name = nameMatch ? nameMatch[1].trim() : folder;
    const statecode = stateMatch ? stateMatch[1].trim() : '0';

    // Skip inactive components (statecode != 0)
    if (statecode !== '0') continue;

    // Read YAML content from data file — this IS the botcomponent.content field
    let content = '';
    if (zip.files[dataPath]) {
      try {
        content = await zip.files[dataPath].async('string');
      } catch {
        // No content — component will be counted but YAML parsing skipped
      }
    }

    const exportedBotcomponentid = normalizeIdentifier(
      xmlAttribute(xmlText, 'botcomponent', 'botcomponentid') ?? xmlValue(xmlText, 'botcomponentid'),
      `zip-${parentSchemaName}-${folder}`,
    );
    const exportedComponentidunique = normalizeIdentifier(
      xmlValue(xmlText, 'componentidunique'),
      `zip-${folder}`,
    );
    const parentbotcomponentid = normalizeIdentifier(
      xmlAttribute(xmlText, 'parentbotcomponentid', 'botcomponentid')
        ?? xmlValue(xmlText, 'parentbotcomponentid'),
      '',
    );
    const parentbotid = normalizeIdentifier(
      xmlAttribute(xmlText, 'parentbotid', 'botid') ?? xmlValue(xmlText, 'parentbotid'),
      parentSchemaName,
    );
    const isCopilotBot = bots.find((bot) => bot.schemaName === parentSchemaName)?.harness === 'copilot';
    const botcomponentid = isCopilotBot
      ? exportedBotcomponentid
      : `zip-${parentSchemaName}-${folder}`;
    const componentidunique = isCopilotBot
      ? exportedComponentidunique
      : `zip-${folder}`;

    const component: BotComponent = {
      botcomponentid,
      botid: parentSchemaName,
      componenttype,
      content,
      name,
      componentidunique,
      schemaname: folder,
      parentbotid: parentbotid || undefined,
      parentbotcomponentid: parentbotcomponentid || undefined,
    };

    if (!componentsBySchemaName[parentSchemaName]) {
      componentsBySchemaName[parentSchemaName] = [];
    }
    componentsBySchemaName[parentSchemaName].push(component);

    if (componenttype === '14') {
      const filePrefix = `botcomponents/${folder}/filedata/`;
      const fileEntry = Object.entries(zip.files).find(
        ([path, entry]) => path.startsWith(filePrefix) && !entry.dir,
      );
      if (fileEntry) {
        const [filePath, entry] = fileEntry;
        const resourcePath = filePath.slice(filePrefix.length);
        component.filedata_name = resourcePath;
        const bytes = await entry.async('uint8array');
        resourcesBySchemaName[parentSchemaName].push({
          row: {
            botcomponentid,
            componentidunique,
            parentbotid,
            parentbotcomponentid,
            name: resourcePath,
            schemaname: folder,
            componenttype: 14,
            componentstate: Number(xmlValue(xmlText, 'componentstate') ?? 0),
            statecode: Number(statecode),
            statuscode: Number(xmlValue(xmlText, 'statuscode') ?? 1),
            versionnumber: Number(xmlValue(xmlText, 'versionnumber') ?? 0),
            modifiedon: xmlValue(xmlText, 'modifiedon') ?? '',
            filedata: xmlValue(xmlText, 'filedata'),
            filedata_name: resourcePath,
          },
          bytes,
        });
      }
    }
  }

  return { bots, componentsBySchemaName, resourcesBySchemaName };
}

/**
 * Resolves the parent bot schemaName from a botcomponent folder name.
 *
 * Botcomponent folders follow the pattern: {botSchemaName}.{rest}
 * e.g. "blank_agent_n18rn.topic.HRRecruitment" → "blank_agent_n18rn"
 *
 * Uses longest-prefix matching to handle schemaNames that contain dots.
 */
function resolveParentSchemaName(folder: string, knownSchemaNames: string[]): string | null {
  // Sort by length descending — longest match wins
  const sorted = [...knownSchemaNames].sort((a, b) => b.length - a.length);
  for (const schemaName of sorted) {
    if (folder === schemaName || folder.startsWith(`${schemaName}.`)) {
      return schemaName;
    }
  }
  return null;
}
