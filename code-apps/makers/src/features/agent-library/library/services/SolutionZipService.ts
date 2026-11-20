/**
 * SolutionZipService — Downloads and rewrites solution ZIPs for agent template instantiation.
 *
 * Responsibilities:
 * 1. Download solution ZIPs via the cat_DownloadSolutionBasedOnUrl Custom API.
 * 2. Parse ZIP metadata: agent name, schema, description, instructions, topics, tools, GUIDs.
 * 3. Rewrite ZIPs with user edits (name, description, instructions) + new GUIDs + renamed schema.
 */

import JSZip from 'jszip';
import type { AgentTemplate, PowerAppsClient } from '../contracts/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SolutionMetadata {
  solutionName: string;
  solutionUniqueName: string;
  solutionVersion: string;
  publisherUniqueName: string;
  publisherPrefix: string;
  /** Display name of the bot/agent found in the ZIP */
  agentName: string;
  /** Schema name of the bot (e.g. cr8a3_myAgent) */
  agentSchemaName: string;
  /** GPT component description */
  agentDescription: string;
  /** GPT component instructions (from YAML data file) */
  agentInstructions: string;
  /** Custom topics (componenttype 9, non-system) */
  topics: string[];
  /** Tools / connectors — Power Automate flows from Workflows/ */
  tools: string[];
  /** All files in the ZIP */
  fileList: string[];
  /** All GUIDs found across ZIP files (deduplicated, lowercase) */
  guids: string[];
}

export interface RewriteOptions {
  /** New schema name for the bot (e.g. "cat_hrpolicyagent2") */
  newAgentSchemaName: string;
  /** Unique solution name (e.g. "HRPolicyBenefitsQA_1711814400000") */
  newSolutionUniqueName: string;
  /** Publisher prefix (e.g. "cat") — used in solution.xml rewrite */
  targetPublisherPrefix: string;
  /**
   * Optional SharePoint site URL to inject into knowledge YAML data files.
   * When provided, every file matching `botcomponents/&#42;.knowledge.SharePointSearchSource.&#42;/data`
   * gets its `site:` attribute replaced with this URL. When omitted, knowledge
   * YAML files are left untouched (template ZIP's default site URL is preserved).
   */
  sharePointUrl?: string;
}

/**
 * Path of the YAML data file inside a SharePoint knowledge component folder.
 * Example: `botcomponents/crd9b_myCompanyPolicy.knowledge.SharePointSearchSource.0/data`
 */
const SP_KNOWLEDGE_DATA_PATH = /^botcomponents\/[^/]+\.knowledge\.SharePointSearchSource\.[^/]+\/data$/i;

/**
 * Replace the value of the top-level `site:` key in a knowledge YAML data file.
 * Returns content unchanged if no `site:` line is present.
 */
export function updateYamlSiteUrl(content: string, newSiteUrl: string): string {
  // Match `site:` at the start of a line followed by whatever value
  // (handles both quoted and unquoted scalar forms).
  const SITE_LINE = /^(\s*site:\s*).*$/m;
  if (!SITE_LINE.test(content)) return content;
  return content.replace(SITE_LINE, `$1${newSiteUrl}`);
}

// ---------------------------------------------------------------------------
// GUID regex — matches 8-4-4-4-12 hex patterns (case-insensitive)
// ---------------------------------------------------------------------------

const GUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// ---------------------------------------------------------------------------
// System topic suffixes to exclude when collecting custom topics
// ---------------------------------------------------------------------------

const SYSTEM_TOPIC_SUFFIXES = new Set([
  'ConversationStart',
  'EndofConversation',
  'Escalate',
  'Fallback',
  'MultipleTopicsMatched',
  'OnError',
  'ResetConversation',
  'Signin',
  'StartOver',
  'Greeting',
  'Goodbye',
  'ThankYou',
  'Search',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Downloads a solution ZIP from a public URL via the cat_DownloadSolutionBasedOnUrl
 * Custom API (server-side, bypasses browser CSP restrictions).
 *
 * @param url - The public URL of the solution ZIP.
 * @returns Base64-encoded ZIP content.
 */
export async function downloadSolutionAsBase64(client: PowerAppsClient, url: string): Promise<string> {
  interface DownloadResponse {
    cat_DownloadSolutionOutput?: string;
  }

  const result = await client.executeAsync<
    { organization: string; actionName: string; item: { cat_SolutionUrl: string } },
    DownloadResponse
  >({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'PerformUnboundActionWithOrganization',
      parameters: {
        organization: 'current',
        actionName: 'cat_DownloadSolutionBasedOnUrl',
        item: { cat_SolutionUrl: url },
      },
    },
  });

  const zipBase64 = result.data?.cat_DownloadSolutionOutput;
  if (!zipBase64) {
    throw new Error(`cat_DownloadSolutionBasedOnUrl returned empty output for: ${url}`);
  }
  return zipBase64;
}

/**
 * Resolves the base64-encoded ZIP for an agent template, regardless of source.
 *
 * - Consumer-injected templates supply raw bytes via `getZipBytes` (e.g. a
 *   Dataverse file column) — these are loaded and re-encoded as base64.
 * - Built-in templates download from their `zipUrl` via the Custom API.
 *
 * @throws if the template has neither `getZipBytes` nor `zipUrl`.
 */
export async function resolveTemplateZipBase64(
  client: PowerAppsClient,
  item: Pick<AgentTemplate, 'zipUrl' | 'getZipBytes'>,
): Promise<string> {
  if (item.getZipBytes) {
    const bytes = await item.getZipBytes();
    const zip = await JSZip.loadAsync(bytes);
    return zip.generateAsync({ type: 'base64' });
  }
  if (item.zipUrl) {
    return downloadSolutionAsBase64(client, item.zipUrl);
  }
  throw new Error('Agent template has neither zipUrl nor getZipBytes.');
}

/**
 * Loads a base64-encoded solution ZIP and returns the JSZip instance with parsed metadata.
 *
 * @param base64 - Base64 string of the solution ZIP.
 */
export async function parseSolutionZipFromBase64(
  base64: string,
): Promise<{ zip: JSZip; metadata: SolutionMetadata }> {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  return extractMetadataFromZip(zip);
}

/**
 * Extracts all metadata from a loaded JSZip instance:
 * solution.xml (name, version, publisher), bot.xml (agent name + schema),
 * GPT botcomponent.xml (description), GPT data YAML (instructions),
 * botcomponent.xml type-9 entries (topics + tools), workflow JSON (tools),
 * and all GUIDs across all text files.
 */
export async function extractMetadataFromZip(
  zip: JSZip,
): Promise<{ zip: JSZip; metadata: SolutionMetadata }> {
  const fileList = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
  const parser = new DOMParser();

  // ── solution.xml ──────────────────────────────────────────────────────────
  const solutionXmlFile = zip.file('solution.xml');
  if (!solutionXmlFile) {
    throw new Error('Invalid solution ZIP: solution.xml not found');
  }
  const solutionXmlText = await solutionXmlFile.async('string');
  const solutionDoc = parser.parseFromString(solutionXmlText, 'application/xml');

  const getElText = (parent: Document | Element, tag: string): string => {
    const el = parent.getElementsByTagName(tag)[0];
    return el?.textContent?.trim() ?? '';
  };

  // LocalizedName uses a `description` attribute, not text content
  const localizedNameEl = solutionDoc.getElementsByTagName('LocalizedName')[0];
  const solutionName = localizedNameEl?.getAttribute('description') ?? '';
  const solutionUniqueName = getElText(solutionDoc, 'UniqueName');
  const solutionVersion = getElText(solutionDoc, 'Version');

  const publisherEl = solutionDoc.getElementsByTagName('Publisher')[0];
  const publisherUniqueName = publisherEl ? getElText(publisherEl, 'UniqueName') : '';
  const publisherPrefix = publisherEl ? getElText(publisherEl, 'CustomizationPrefix') : '';

  // ── Extract solution-owned component GUIDs from solution.xml ─────────────
  // Only these GUIDs should be remapped during rewrite. Platform/system GUIDs
  // (AI templates, system topics, etc.) must NOT be remapped.
  const solutionOwnedGuids = new Set<string>();

  // Collect GUIDs from RootComponent elements (solution-owned components)
  const rootComponents = solutionDoc.getElementsByTagName('RootComponent');
  for (let i = 0; i < rootComponents.length; i++) {
    const schemaName = rootComponents[i].getAttribute('schemaName') ?? '';
    const id = rootComponents[i].getAttribute('id') ?? '';
    if (id) {
      const guidMatch = id.match(GUID_REGEX);
      if (guidMatch) {
        for (const g of guidMatch) solutionOwnedGuids.add(g.toLowerCase());
      }
    }
    if (schemaName) {
      const guidMatch = schemaName.match(GUID_REGEX);
      if (guidMatch) {
        for (const g of guidMatch) solutionOwnedGuids.add(g.toLowerCase());
      }
    }
  }

  // Collect GUIDs embedded in file/folder paths (these are component folder names)
  for (const fileName of fileList) {
    const pathGuids = fileName.match(GUID_REGEX);
    if (pathGuids) {
      for (const g of pathGuids) solutionOwnedGuids.add(g.toLowerCase());
    }
  }

  console.log(`[SolutionZipService] Solution-owned GUIDs: ${solutionOwnedGuids.size} (from solution.xml + file paths)`);

  // ── Scan all text files ───────────────────────────────────────────────────
  const allGuids = solutionOwnedGuids; // Use solution-owned GUIDs only
  let agentName = '';
  let agentSchemaName = '';
  let agentDescription = '';
  let agentInstructions = '';
  const topics: string[] = [];
  const tools: string[] = [];

  for (const fileName of fileList) {
    const zipEntry = zip.file(fileName);
    if (!zipEntry) continue;

    let content: string;
    try {
      content = await zipEntry.async('string');
    } catch {
      // Binary file — skip GUID scanning
      continue;
    }

    // bot.xml → agent display name + schema name
    if (fileName.endsWith('/bot.xml')) {
      const botDoc = parser.parseFromString(content, 'application/xml');
      const botEl = botDoc.getElementsByTagName('bot')[0];
      if (botEl) {
        const schemaAttr = botEl.getAttribute('schemaname');
        if (schemaAttr && !agentSchemaName) {
          agentSchemaName = schemaAttr;
        }
        const nameEl = botEl.getElementsByTagName('name')[0];
        if (nameEl?.textContent && !agentName) {
          agentName = nameEl.textContent.trim();
        }
      }
    }

    // GPT botcomponent.xml (type 15) → description
    if (fileName.endsWith('/botcomponent.xml') && !agentDescription) {
      const compDoc = parser.parseFromString(content, 'application/xml');
      const typeEl = compDoc.getElementsByTagName('componenttype')[0];
      if (typeEl?.textContent?.trim() === '15') {
        const descEl = compDoc.getElementsByTagName('description')[0];
        if (descEl?.textContent) {
          agentDescription = descEl.textContent.trim();
        }
      }
    }

    // GPT data YAML → instructions (file named `data` inside a *.gpt.* folder)
    if (
      !agentInstructions &&
      fileName.endsWith('/data') &&
      fileName.split('/').some((s) => s.includes('.gpt.'))
    ) {
      const parsed = parseGptDataYaml(content);
      if (parsed) {
        agentInstructions = parsed;
      }
    }

    // botcomponent.xml type 9 → custom topics + action tools
    if (fileName.endsWith('/botcomponent.xml')) {
      const compDoc = parser.parseFromString(content, 'application/xml');
      const typeEl = compDoc.getElementsByTagName('componenttype')[0];
      if (typeEl?.textContent?.trim() === '9') {
        const compEl = compDoc.getElementsByTagName('botcomponent')[0];
        const schemaName = compEl?.getAttribute('schemaname') ?? '';
        const nameEl = compDoc.getElementsByTagName('name')[0];
        const compName = nameEl?.textContent?.trim() ?? '';

        if (schemaName.includes('.action.')) {
          if (compName) tools.push(compName);
        } else {
          const suffix = schemaName.split('.').pop() ?? '';
          if (compName && !SYSTEM_TOPIC_SUFFIXES.has(suffix)) {
            topics.push(compName);
          }
        }
      }
    }

    // Workflow JSON → connector/operation tools (OpenApiConnection actions)
    if (/\/(Workflows|workflows)\/.+\.json$/.test(fileName)) {
      try {
        const wf = JSON.parse(content) as {
          properties?: { definition?: { actions?: Record<string, unknown> } };
        };
        const actions = wf?.properties?.definition?.actions ?? {};
        for (const action of Object.values(actions)) {
          const act = action as {
            type?: string;
            inputs?: { host?: { operationId?: string; apiId?: string } };
          };
          if (act.type === 'OpenApiConnection') {
            const opId = act.inputs?.host?.operationId ?? '';
            const apiId = act.inputs?.host?.apiId ?? '';
            const label = `${connectorDisplayName(apiId)} — ${actionDisplayLabel(opId)}`;
            if (!tools.includes(label)) tools.push(label);
          } else if (act.type === 'Response') {
            if (!tools.includes('Respond to agent')) tools.push('Respond to agent');
          }
        }
      } catch {
        // Unparseable workflow — skip
      }
    }
  }

  // Fallback: extract agent name from customizations.xml if bot.xml parse missed it
  if (!agentName) {
    const custFile = zip.file('customizations.xml');
    if (custFile) {
      const custText = await custFile.async('string');
      const custDoc = parser.parseFromString(custText, 'application/xml');
      const botNodes = custDoc.getElementsByTagName('bot');
      if (botNodes.length > 0) {
        const nameAttr = botNodes[0].getAttribute('name');
        if (nameAttr) agentName = nameAttr;
        const schemaAttr = botNodes[0].getAttribute('schemaname');
        if (schemaAttr) agentSchemaName = schemaAttr;
      }
    }
  }

  return {
    zip,
    metadata: {
      solutionName,
      solutionUniqueName,
      solutionVersion,
      publisherUniqueName,
      publisherPrefix,
      agentName: agentName || solutionUniqueName,
      agentSchemaName,
      agentDescription,
      agentInstructions,
      topics,
      tools,
      fileList,
      guids: Array.from(allGuids),
    },
  };
}

/**
 * Creates a new solution ZIP from the original, applying:
 * - All GUIDs remapped to fresh UUIDs
 * - Schema names replaced throughout (paths + content)
 * - Agent display name replaced in bot.xml and across all files
 * - Description replaced in GPT botcomponent.xml (type 15)
 * - Instructions replaced in GPT data YAML file
 * - solution.xml rewritten with new unique name, display name, and publisher prefix
 * - File paths renamed to reflect new schema name and new GUIDs
 *
 * @param zip - The original loaded JSZip.
 * @param originalMeta - Metadata extracted from the original ZIP.
 * @param options - User-supplied rewrite options.
 * @returns Blob of the rewritten ZIP with DEFLATE compression.
 */
export async function rewriteSolutionZip(
  zip: JSZip,
  originalMeta: SolutionMetadata,
  options: RewriteOptions,
): Promise<Blob> {
  const newZip = new JSZip();

  const oldSchemaName = originalMeta.agentSchemaName;
  const newSchemaName = options.newAgentSchemaName;
  const schemaChanged = oldSchemaName && newSchemaName && oldSchemaName !== newSchemaName;
  const fileList = Object.keys(zip.files).filter((f) => !zip.files[f].dir);

  console.log('[SolutionZipService] Rewriting ZIP:', {
    schemaRenamed: schemaChanged ? `${oldSchemaName} → ${newSchemaName}` : 'unchanged',
    newSolutionUniqueName: options.newSolutionUniqueName,
    filesCount: fileList.length,
  });

  for (const fileName of fileList) {
    const zipEntry = zip.file(fileName);
    if (!zipEntry) continue;

    let content: string;
    try {
      content = await zipEntry.async('string');
    } catch {
      // Binary file — copy as-is with renamed path
      const binary = await zipEntry.async('uint8array');
      const newPath = schemaChanged ? replaceAll(fileName, oldSchemaName, newSchemaName) : fileName;
      newZip.file(newPath, binary);
      continue;
    }

    // Step 1: Replace schema name throughout (handles both the bot schema base and
    //         all derived component schema names, e.g. cat_agentX.topic.Foo → new_agentY.topic.Foo)
    if (schemaChanged) {
      content = replaceAll(content, oldSchemaName, newSchemaName);
    }

    // Step 1b: Update bot display name in bot.xml if schema changed
    //   Schema: cat_PlanMyDay → cat_PlanMyDay2 → suffix is "2"
    //   Bot name: "Plan My Day (Autonomous)" → "Plan My Day (Autonomous) 2"
    if (schemaChanged && fileName.endsWith('/bot.xml')) {
      const suffix = newSchemaName.replace(oldSchemaName, ''); // e.g., "2" or "3"
      const originalName = originalMeta.agentName;
      if (suffix && originalName) {
        const updatedName = `${originalName} ${suffix}`;
        content = content.replace(
          new RegExp(`<name>${escapeRegex(originalName)}</name>`),
          `<name>${updatedName}</name>`,
        );
        console.log('[SolutionZipService] Updated bot name:', originalName, '→', updatedName);
      }
    }

    // Step 2: Rewrite solution.xml metadata (UniqueName, publisher prefix)
    if (fileName === 'solution.xml') {
      content = rewriteSolutionXml(content, originalMeta, options);
    }

    // Step 2b: Override SharePoint site URL in knowledge YAML, if a URL was supplied
    if (options.sharePointUrl && SP_KNOWLEDGE_DATA_PATH.test(fileName)) {
      const updated = updateYamlSiteUrl(content, options.sharePointUrl);
      if (updated !== content) {
        console.log('[SolutionZipService] Rewrote SharePoint site URL in', fileName);
        content = updated;
      }
    }

    // Step 3: Write to new ZIP with renamed path (folder names embed schema name)
    const newPath = schemaChanged ? replaceAll(fileName, oldSchemaName, newSchemaName) : fileName;
    newZip.file(newPath, content);
  }

  console.log('[SolutionZipService] Rewrite complete:', {
    filesProcessed: fileList.length,
    schemaRenamed: schemaChanged ? `${oldSchemaName} → ${newSchemaName}` : 'unchanged',
  });

  return await newZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/**
 * Converts a Blob to a base64 string using FileReader.
 *
 * @param blob - The Blob to convert.
 * @returns Base64 string (no data-URL prefix).
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:application/zip;base64," prefix
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the `instructions` value from a GPT data YAML string.
 * Returns the raw instructions text, or empty string if not found.
 */
function parseGptDataYaml(yamlContent: string): string {
  const lines = yamlContent.split('\n');
  let inInstructions = false;
  const instrLines: string[] = [];

  for (const line of lines) {
    if (line.trimEnd().startsWith('instructions:')) {
      inInstructions = true;
      // Handle inline scalar: `instructions: some text`
      const inlineMatch = line.match(/^instructions:\s*(.+)$/);
      if (inlineMatch && !inlineMatch[1].trim().startsWith('|-') && !inlineMatch[1].trim().startsWith('|')) {
        return inlineMatch[1].trim();
      }
      continue;
    }

    if (inInstructions) {
      // Block scalar lines are indented; non-indented non-empty line ends the block
      if (line.startsWith('  ') || line.trim() === '') {
        instrLines.push(line.replace(/^ {2}/, ''));
      } else {
        break;
      }
    }
  }

  return instrLines.join('\n').trimEnd();
}

/**
 * Replaces the `instructions` block in a GPT data YAML with new content.
 * Handles both `instructions: |` and `instructions: |-` block scalar styles.
 */
export function updateYamlInstructions(content: string, newInstructions: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimEnd().startsWith('instructions:')) {
      // Write replacement block using block chomping scalar
      result.push('instructions: |-');
      for (const instrLine of newInstructions.split('\n')) {
        result.push(`  ${instrLine}`);
      }
      // Skip all old block lines (indented or blank continuation)
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (l.startsWith('  ') || l.trim() === '') {
          i++;
        } else {
          break;
        }
      }
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

/**
 * Replaces all occurrences of `search` in `text` with `replacement`.
 * Uses split/join to avoid regex escaping.
 */
export function replaceAll(text: string, search: string, replacement: string): string {
  return text.split(search).join(replacement);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces all GUIDs in `content` using the provided map.
 * Preserves the original casing of each matched GUID (upper/lower).
 */
export function applyGuidMap(content: string, guidMap: Map<string, string>): string {
  return content.replace(GUID_REGEX, (match) => {
    const lower = match.toLowerCase();
    const replacement = guidMap.get(lower);
    if (!replacement) return match;
    // Preserve uppercase style if the original was all-uppercase
    return match === match.toUpperCase() ? replacement.toUpperCase() : replacement;
  });
}

/**
 * Rewrites a ZIP file path by replacing the old schema name with the new one,
 * then remapping any GUIDs embedded in the path (e.g. Workflow file names).
 */
export function rewritePath(
  filePath: string,
  oldSchemaName: string,
  newSchemaName: string,
  guidMap?: Map<string, string>,
): string {
  let result = filePath;
  if (oldSchemaName && newSchemaName && oldSchemaName !== newSchemaName) {
    result = replaceAll(result, oldSchemaName, newSchemaName);
  }
  if (guidMap) {
    result = applyGuidMap(result, guidMap);
  }
  return result;
}

/**
 * XML-escapes the five characters that are illegal in XML text content.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Rewrites the solution.xml document with new unique name, display name,
 * and publisher prefix. Uses DOMParser/XMLSerializer for correctness.
 */
function rewriteSolutionXml(
  xmlContent: string,
  originalMeta: SolutionMetadata,
  options: RewriteOptions,
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'application/xml');

  // UniqueName — update the solution's UniqueName (first in document order, before Publisher's)
  const uniqueNameEl = doc.getElementsByTagName('UniqueName')[0];
  if (uniqueNameEl) {
    uniqueNameEl.textContent = options.newSolutionUniqueName;
  }

  // LocalizedName — update only the solution's LocalizedNames (direct child of SolutionManifest),
  // not the publisher's LocalizedNames. Iterating all LocalizedName elements would overwrite
  // the publisher display name with the solution unique name.
  const solutionManifestEl = doc.getElementsByTagName('SolutionManifest')[0];
  if (solutionManifestEl) {
    for (let i = 0; i < solutionManifestEl.childNodes.length; i++) {
      const child = solutionManifestEl.childNodes[i] as Element;
      if (child.nodeType === 1 && child.tagName === 'LocalizedNames') {
        const lnEls = child.getElementsByTagName('LocalizedName');
        for (let j = 0; j < lnEls.length; j++) {
          lnEls[j].setAttribute('description', options.newSolutionUniqueName);
        }
        break;
      }
    }
  }

  // Publisher — restore original UniqueName (Step 1's schema replaceAll may have corrupted it
  // if the publisher's unique name matched the agent schema name) and update the prefix.
  const publisherEl = doc.getElementsByTagName('Publisher')[0];
  if (publisherEl) {
    const pubUniqueNameEl = publisherEl.getElementsByTagName('UniqueName')[0];
    if (pubUniqueNameEl && originalMeta.publisherUniqueName) {
      pubUniqueNameEl.textContent = originalMeta.publisherUniqueName;
    }
    const prefixEl = publisherEl.getElementsByTagName('CustomizationPrefix')[0];
    if (prefixEl) prefixEl.textContent = options.targetPublisherPrefix;
  }

  const serializer = new XMLSerializer();
  let result = serializer.serializeToString(doc);

  // Ensure XML declaration is present
  if (!result.startsWith('<?xml')) {
    result = '<?xml version="1.0" encoding="utf-8"?>\n' + result;
  }

  return result;
}

/**
 * Returns a human-readable connector name from an OpenAPI connector API ID.
 */
function connectorDisplayName(apiId: string): string {
  if (apiId.includes('wordonlinebusiness')) return 'Word Online (Business)';
  if (apiId.includes('office365')) return 'Office 365';
  if (apiId.includes('sharepoint')) return 'SharePoint';
  if (apiId.includes('commondataserviceforapps')) return 'Microsoft Dataverse';
  return apiId.replace(/.*\/shared_/, '').replace(/_/g, ' ');
}

/**
 * Converts a camelCase or underscore_separated operation ID into a
 * human-readable title-cased label.
 */
function actionDisplayLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

