import JSZip from 'jszip';
import type { BotComponent, CSZipBot, CSZipParseResult } from '../models/types.js';

/**
 * Converts a parsed ZIP bot to the metadata shape expected by Stage A.
 */
export function zipBotToMetadata(bot: CSZipBot): {
  botId: string;
  name: string;
  statusCode: number;
  componentIdUnique: string;
  iconBase64?: string;
} {
  return {
    botId: bot.schemaName,
    name: bot.name,
    statusCode: 1,
    componentIdUnique: bot.schemaName,
    iconBase64: bot.iconBase64,
  };
}

/**
 * Parse a Copilot Studio solution ZIP buffer into bot and component data.
 */
export async function parseCSZip(buffer: Buffer): Promise<CSZipParseResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error('Could not read ZIP file. Ensure the file is a valid .zip archive.');
  }

  if (!zip.files['[Content_Types].xml'] && !zip.files['solution.xml']) {
    throw new Error('Not a Copilot Studio solution ZIP: missing [Content_Types].xml or solution.xml.');
  }

  const bots: CSZipBot[] = [];
  const componentsBySchemaName: Record<string, BotComponent[]> = {};

  const botSchemaNames = new Set<string>();
  for (const filePath of Object.keys(zip.files)) {
    if (filePath.startsWith('bots/') && filePath.split('/').length === 3) {
      const schemaName = filePath.split('/')[1];
      if (schemaName) {
        botSchemaNames.add(schemaName);
      }
    }
  }

  for (const schemaName of botSchemaNames) {
    const botXmlPath = `bots/${schemaName}/bot.xml`;
    const configPath = `bots/${schemaName}/configuration.json`;

    if (!zip.files[botXmlPath]) {
      continue;
    }

    const xmlText = await zip.files[botXmlPath].async('string');
    const nameMatch = xmlText.match(/<name>([\s\S]*?)<\/name>/i);
    const iconMatch = xmlText.match(/<iconbase64>([\s\S]*?)<\/iconbase64>/i);
    const descriptionMatch = xmlText.match(/<description>([\s\S]*?)<\/description>/i);

    const name = nameMatch ? nameMatch[1].trim() : schemaName;
    const iconBase64 = iconMatch ? iconMatch[1].trim() : undefined;
    const description = descriptionMatch ? descriptionMatch[1].trim() : undefined;

    let generativeActionsEnabled = false;
    if (zip.files[configPath]) {
      try {
        const configText = await zip.files[configPath].async('string');
        const config = JSON.parse(configText) as Record<string, unknown>;
        const settings = config.settings as Record<string, unknown> | undefined;
        generativeActionsEnabled = settings?.GenerativeActionsEnabled === true;
      } catch {
        generativeActionsEnabled = false;
      }
    }

    bots.push({ schemaName, name, generativeActionsEnabled, iconBase64, description: description || undefined });
    componentsBySchemaName[schemaName] = [];
  }

  const botcomponentFolders = new Set<string>();
  for (const filePath of Object.keys(zip.files)) {
    if (filePath.startsWith('botcomponents/') && filePath.split('/').length === 3) {
      const folder = filePath.split('/')[1];
      if (folder) {
        botcomponentFolders.add(folder);
      }
    }
  }

  const singleBotFallback = botSchemaNames.size === 1 ? Array.from(botSchemaNames)[0] : null;

  for (const folder of botcomponentFolders) {
    let parentSchemaName = resolveParentSchemaName(folder, Array.from(botSchemaNames));

    if (!parentSchemaName) {
      if (singleBotFallback) {
        parentSchemaName = singleBotFallback;
      } else {
        continue;
      }
    }

    const xmlPath = `botcomponents/${folder}/botcomponent.xml`;
    const dataPath = `botcomponents/${folder}/data`;

    if (!zip.files[xmlPath]) {
      continue;
    }

    const xmlText = await zip.files[xmlPath].async('string');
    const componentTypeMatch = xmlText.match(/<componenttype>(\d+)<\/componenttype>/i);
    const nameMatch = xmlText.match(/<name>([\s\S]*?)<\/name>/i);
    const stateMatch = xmlText.match(/<statecode>(\d+)<\/statecode>/i);

    const componenttype = componentTypeMatch ? componentTypeMatch[1].trim() : '0';
    const name = nameMatch ? nameMatch[1].trim() : folder;
    const statecode = stateMatch ? stateMatch[1].trim() : '0';

    if (statecode !== '0') {
      continue;
    }

    let content = '';
    if (zip.files[dataPath]) {
      try {
        content = await zip.files[dataPath].async('string');
      } catch {
        content = '';
      }
    }

    const component: BotComponent = {
      botcomponentid: `zip-${parentSchemaName}-${folder}`,
      botid: parentSchemaName,
      componenttype,
      content,
      name,
      componentidunique: `zip-${folder}`,
      schemaname: folder,
    };

    if (!componentsBySchemaName[parentSchemaName]) {
      componentsBySchemaName[parentSchemaName] = [];
    }
    componentsBySchemaName[parentSchemaName].push(component);
  }

  return { bots, componentsBySchemaName };
}

function resolveParentSchemaName(folder: string, knownSchemaNames: string[]): string | null {
  const sorted = [...knownSchemaNames].sort((a, b) => b.length - a.length);
  for (const schemaName of sorted) {
    if (folder === schemaName || folder.startsWith(`${schemaName}.`)) {
      return schemaName;
    }
  }
  return null;
}
