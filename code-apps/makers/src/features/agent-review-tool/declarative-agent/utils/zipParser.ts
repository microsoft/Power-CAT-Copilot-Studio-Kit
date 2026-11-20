import JSZip from 'jszip';
import { load as parseYaml } from 'js-yaml';
import type { SkillBundle } from '../../agents-experience/contracts/SkillBundle';
import type {
  UploadedArtifact,
  UploadedFile,
} from '../../skills-automations/contracts/ArtifactReview';
import {
  parseFrontmatter,
  readString,
} from '../../skills-automations/services/artifactUtils';
import { toSkillBundle } from '../../skills-automations/services/uploadBundleAdapter';
import { redactSecrets } from '../../agents-experience/services/skill/resourceScanners';
import type {
  DAAction,
  DACustomSkillRegistrations,
  DAManifest,
} from '../contracts/DAManifest';
import type {
  DAEvidenceRecord,
  DAPackageDocument,
  DAPackageDocumentKind,
  DAPackageEvidence,
  DAPackageReference,
} from '../contracts/DAPackageReview';

interface ParseResult {
  manifest: DAManifest;
  packageEvidence: DAPackageEvidence;
  skillBundles: SkillBundle[];
  warning?: string;
}

interface JsonObject {
  [key: string]: unknown;
}

const MAX_EVIDENCE_CHARS = 16_000;
const SENSITIVE_KEY = /(?:authorization|token|secret|password|api[_-]?key|client[_-]?secret|connection[_-]?string)/i;
const SKILL_TEXT_EXTENSIONS = new Set([
  'bash',
  'cfg',
  'cjs',
  'config',
  'csv',
  'htm',
  'html',
  'ini',
  'js',
  'json',
  'log',
  'markdown',
  'md',
  'mjs',
  'mts',
  'py',
  'rtf',
  'sh',
  'ts',
  'tsv',
  'txt',
  'utf8',
  'xml',
  'yaml',
  'yml',
]);

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }
  if (typeof value === 'string') return redactSecrets(value);
  if (!isObject(value)) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeValue(child, seen),
  ]));
}

function toEvidenceContent(value: unknown): string {
  const content = typeof value === 'string'
    ? redactSecrets(value)
    : JSON.stringify(sanitizeValue(value));
  return content.length <= MAX_EVIDENCE_CHARS
    ? content
    : `${content.slice(0, MAX_EVIDENCE_CHARS)}\n[truncated]`;
}

function evidenceId(sourceFile: string, jsonPath: string): string {
  return `${sourceFile}#${jsonPath}`;
}

function addEvidence(
  evidence: DAPackageEvidence,
  sourceFile: string,
  jsonPath: string,
  value: unknown,
  status: DAEvidenceRecord['status'] = 'available',
  error?: string,
): void {
  const id = evidenceId(sourceFile, jsonPath);
  const record: DAEvidenceRecord = {
    evidenceId: id,
    kind: 'json-value',
    sourceFile,
    jsonPath,
    content: toEvidenceContent(value),
    status,
    error,
  };
  const index = evidence.records.findIndex((candidate) => candidate.evidenceId === id);
  if (index >= 0) evidence.records[index] = record;
  else evidence.records.push(record);
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Resolves a package-local reference relative to its source file and rejects
 * absolute paths or traversal outside the ZIP root.
 */
export function resolvePackagePath(
  sourceFile: string,
  requestedPath: string,
): { path?: string; error?: string } {
  const raw = requestedPath.trim().replace(/\\/g, '/');
  const decoded = decodePath(raw).replace(/\\/g, '/');
  if (!raw || decoded.includes('\0')) return { error: 'The reference path is empty or invalid.' };
  if (
    decoded.startsWith('/') ||
    /^[a-zA-Z]:\//.test(decoded) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decoded)
  ) {
    return { error: 'Absolute and external paths are not package-local references.' };
  }

  const sourceParts = sourceFile.replace(/\\/g, '/').split('/').slice(0, -1);
  const result = [...sourceParts];
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (result.length === 0) {
        return { error: 'The reference escapes the package root.' };
      }
      result.pop();
      continue;
    }
    result.push(part);
  }

  return result.length > 0
    ? { path: result.join('/') }
    : { error: 'The reference does not resolve to a package file.' };
}

function parseStructuredText(text: string, path: string): unknown {
  if (/\.ya?ml$/i.test(path)) return parseYaml(text);
  return JSON.parse(text) as unknown;
}

function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function isTextSkillFile(path: string): boolean {
  return SKILL_TEXT_EXTENSIONS.has(extensionOf(path));
}

async function hashText(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function skillFolder(value: unknown): string {
  return typeof value === 'string'
    ? value
    : asString(asObject(value).folder);
}

function buildManifest(
  appManifest: JsonObject,
  daJson: JsonObject,
  iconBase64: string | null,
  pluginFiles: Record<string, unknown>,
  actions: DAAction[],
  instructions: string,
  customSkills?: DACustomSkillRegistrations,
): DAManifest {
  const appName = asObject(appManifest.name);
  const appDescription = asObject(appManifest.description);
  const developer = asObject(appManifest.developer);

  return {
    appId: asString(appManifest.id),
    appVersion: asString(appManifest.version),
    manifestVersion: asString(appManifest.manifestVersion),
    shortName: asString(appName.short),
    fullName: asString(appName.full),
    shortDescription: asString(appDescription.short),
    fullDescription: asString(appDescription.full),
    developerName: asString(developer.name),
    accentColor: asString(appManifest.accentColor),
    iconBase64,
    pluginFiles,
    schemaVersion: asString(daJson.version),
    daId: asString(daJson.id),
    name: asString(daJson.name),
    description: asString(daJson.description),
    instructions,
    capabilities: asArray(daJson.capabilities) as DAManifest['capabilities'],
    actions,
    conversationStarters: asArray(daJson.conversation_starters) as DAManifest['conversationStarters'],
    customSkills,
  };
}

/**
 * Parses an uploaded Microsoft 365 app package into the legacy manifest view
 * and a lossless, traceable package-evidence model.
 */
export async function parseDAZip(file: File): Promise<ParseResult> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const byPath = new Map(entries.map((entry) => [entry.name.replace(/\\/g, '/'), entry]));
  const byLowerPath = new Map(entries.map((entry) => [entry.name.replace(/\\/g, '/').toLowerCase(), entry]));

  const findEntry = (path: string) =>
    byPath.get(path) ?? byLowerPath.get(path.toLowerCase());

  const rootEntry = findEntry('manifest.json')
    ?? entries.find((entry) => entry.name.replace(/\\/g, '/').endsWith('/manifest.json'));
  if (!rootEntry) {
    throw new Error('manifest.json not found in the uploaded package.');
  }

  const rootManifestPath = rootEntry.name.replace(/\\/g, '/');
  let appManifest: JsonObject;
  try {
    appManifest = asObject(parseStructuredText(await rootEntry.async('text'), rootManifestPath));
  } catch (error) {
    throw new Error(`manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const packageEvidence: DAPackageEvidence = {
    rootManifestPath,
    documents: [{
      path: rootManifestPath,
      kind: 'app-manifest',
      status: 'parsed',
      data: appManifest,
    }],
    references: [],
    records: [],
  };
  addEvidence(packageEvidence, rootManifestPath, '$', appManifest);

  const copilotAgents = asObject(appManifest.copilotAgents);
  const declarativeAgents = asArray(copilotAgents.declarativeAgents).map(asObject);
  if (declarativeAgents.length === 0) {
    throw new Error(
      'Invalid DA package: manifest.json does not reference any declarative agents.',
    );
  }

  const requestedDAPath = asString(declarativeAgents[0].file);
  if (!requestedDAPath) {
    throw new Error(
      'Invalid DA package: copilotAgents.declarativeAgents[0].file is empty.',
    );
  }

  const resolvedDAPath = resolvePackagePath(rootManifestPath, requestedDAPath);
  if (!resolvedDAPath.path) {
    throw new Error(
      `Invalid DA package: declarative-agent reference is unsafe. ${resolvedDAPath.error ?? ''}`.trim(),
    );
  }

  const daEntry = findEntry(resolvedDAPath.path);
  if (!daEntry) {
    throw new Error(
      `Invalid DA package: Referenced DA file "${requestedDAPath}" not found in ZIP.`,
    );
  }

  const daPath = daEntry.name.replace(/\\/g, '/');
  let daJson: JsonObject;
  try {
    daJson = asObject(parseStructuredText(await daEntry.async('text'), daPath));
  } catch (error) {
    throw new Error(
      `Invalid DA package: Referenced DA file "${requestedDAPath}" is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  packageEvidence.references.push({
    sourceFile: rootManifestPath,
    jsonPath: '$.copilotAgents.declarativeAgents[0].file',
    requestedPath: requestedDAPath,
    normalizedPath: daPath,
    kind: 'declarative-agent',
    status: 'resolved',
  });
  packageEvidence.declarativeAgentPath = daPath;
  packageEvidence.documents.push({
    path: daPath,
    kind: 'declarative-agent',
    status: 'parsed',
    data: daJson,
  });

  const daSourcePath = daPath;
  for (const [path, value] of [
    ['$.version', daJson.version],
    ['$.id', daJson.id],
    ['$.name', daJson.name],
    ['$.description', daJson.description],
    ['$.capabilities', daJson.capabilities],
    ['$.conversation_starters', daJson.conversation_starters],
    ['$.actions', daJson.actions],
    ['$.user_overrides', daJson.user_overrides],
    ['$.editorial_answers', daJson.editorial_answers],
    ['$.worker_agents', daJson.worker_agents],
  ] as const) {
    if (value !== undefined) addEvidence(packageEvidence, daSourcePath, path, value);
  }

  let instructions = '';
  if (typeof daJson.instructions === 'string') {
    instructions = daJson.instructions;
    addEvidence(packageEvidence, daSourcePath, '$.instructions', instructions);
  } else if (isObject(daJson.instructions)) {
    const requestedPath = asString(daJson.instructions.file ?? daJson.instructions.url);
    const reference: DAPackageReference = {
      sourceFile: daSourcePath,
      jsonPath: '$.instructions',
      requestedPath,
      kind: 'instructions',
      status: 'missing',
    };
    if (/^https?:\/\//i.test(requestedPath)) {
      reference.status = 'external';
      reference.error = 'Remote instructions were not retrieved from the uploaded package.';
    } else {
      const resolved = resolvePackagePath(daSourcePath, requestedPath);
      reference.normalizedPath = resolved.path;
      reference.error = resolved.error;
      reference.status = resolved.error ? 'unsafe' : 'missing';
      const entry = resolved.path ? findEntry(resolved.path) : undefined;
      if (entry) {
        instructions = await entry.async('text');
        reference.status = 'resolved';
        reference.normalizedPath = entry.name.replace(/\\/g, '/');
        packageEvidence.documents.push({
          path: reference.normalizedPath,
          kind: 'instructions',
          status: 'text',
          text: instructions,
        });
      } else if (!reference.error) {
        reference.error = 'The referenced instructions file is missing.';
      }
    }
    packageEvidence.references.push(reference);
    addEvidence(
      packageEvidence,
      reference.normalizedPath ?? daSourcePath,
      '$.instructions',
      instructions,
      reference.status === 'resolved' ? 'available' : 'unavailable',
      reference.error,
    );
  }

  const resolveSkillRegistrations = (
    sourceFile: string,
    jsonPath: string,
    values: unknown,
  ): string[] => {
    const folders: string[] = [];
    for (const [index, value] of asArray(values).entries()) {
      const requestedPath = skillFolder(value);
      const reference: DAPackageReference = {
        sourceFile,
        jsonPath: `${jsonPath}[${index}].folder`,
        requestedPath,
        kind: 'skill-definition',
        status: 'missing',
      };
      const resolved = resolvePackagePath(sourceFile, requestedPath);
      reference.normalizedPath = resolved.path;
      reference.error = resolved.error;
      reference.status = resolved.error ? 'unsafe' : 'missing';
      if (resolved.path) {
        const normalized = resolved.path.replace(/\/+$/, '');
        const prefix = `${normalized.toLowerCase()}/`;
        const hasFiles = entries.some((entry) =>
          entry.name.replace(/\\/g, '/').toLowerCase().startsWith(prefix));
        if (hasFiles) {
          reference.status = 'resolved';
          folders.push(normalized);
        } else {
          reference.error = 'The registered custom-skill folder is missing.';
        }
      }
      packageEvidence.references.push(reference);
    }
    return folders;
  };

  const appSkillFolders = resolveSkillRegistrations(
    rootManifestPath,
    '$.agentSkills',
    appManifest.agentSkills,
  );
  const agentSkillFolders = resolveSkillRegistrations(
    daSourcePath,
    '$.agent_skills',
    daJson.agent_skills,
  );
  const customSkills = appSkillFolders.length > 0 || agentSkillFolders.length > 0
    ? {
        appFolders: appSkillFolders,
        agentFolders: agentSkillFolders,
      }
    : undefined;

  const packageSizeBytes = typeof file.size === 'number'
    ? file.size
    : file instanceof Uint8Array
      ? file.byteLength
      : 0;
  packageEvidence.packageSizeBytes = packageSizeBytes;
  const folderByLowerPath = new Map<string, string>();
  for (const folder of [...appSkillFolders, ...agentSkillFolders]) {
    if (!folderByLowerPath.has(folder.toLowerCase())) {
      folderByLowerPath.set(folder.toLowerCase(), folder);
    }
  }

  const skillBundles: SkillBundle[] = [];
  for (const folder of folderByLowerPath.values()) {
    const prefix = `${folder.toLowerCase()}/`;
    const folderEntries = entries.filter((entry) =>
      entry.name.replace(/\\/g, '/').toLowerCase().startsWith(prefix));
    const files: UploadedFile[] = [];

    for (const entry of folderEntries) {
      const path = entry.name.replace(/\\/g, '/');
      const bytes = await entry.async('uint8array');
      const isText = isTextSkillFile(path);
      const decoded = isText ? new TextDecoder().decode(bytes) : undefined;
      const isBinary = !isText || decoded?.slice(0, 4096).includes('\u0000') === true;
      const text = isBinary ? undefined : decoded;
      files.push({
        path,
        bytes: bytes.byteLength,
        text,
        isBinary,
      });

      const relativePath = path.slice(folder.length).replace(/^\/+/, '');
      const isSkillDefinition = relativePath.toLowerCase() === 'skill.md';
      packageEvidence.documents.push({
        path,
        kind: isSkillDefinition ? 'skill-definition' : 'skill-resource',
        status: text !== undefined ? 'text' : 'binary',
        text: text !== undefined ? toEvidenceContent(text) : undefined,
      });
    }

    const artifact: UploadedArtifact = {
      fileName: `${folder.split('/').pop() ?? 'custom-skill'}.zip`,
      files,
      compressedBytes: packageSizeBytes,
      uncompressedBytes: files.reduce((total, entry) => total + entry.bytes, 0),
      rootFolderName: folder,
      hash: await hashText(
        files
          .map((entry) => `${entry.path}\u0000${entry.bytes}\u0000${entry.text ?? '[binary]'}`)
          .join('\u0001'),
      ),
    };
    const bundle = toSkillBundle({ artifact });
    bundle.agentInstructions = instructions;
    skillBundles.push(bundle);
  }

  const siblingDescriptions = skillBundles.map((bundle) => ({
    name: bundle.skillName,
    description: readString(parseFrontmatter(bundle.skillMarkdown).data, 'description'),
  }));
  for (const bundle of skillBundles) {
    bundle.parentDescription = asString(daJson.description);
    bundle.siblingDescriptions = siblingDescriptions.filter(
      (sibling) => sibling.name !== bundle.skillName,
    );
  }

  const pluginFiles: Record<string, unknown> = {};
  const actions: DAAction[] = [];

  const readReferencedDocument = async (
    sourceFile: string,
    jsonPath: string,
    requestedPath: string,
    kind: DAPackageDocumentKind,
  ): Promise<DAPackageDocument | undefined> => {
    const reference: DAPackageReference = {
      sourceFile,
      jsonPath,
      requestedPath,
      kind,
      status: 'missing',
    };

    if (/^https?:\/\//i.test(requestedPath)) {
      reference.status = 'external';
      reference.error = 'Remote content was not retrieved from the uploaded package.';
      packageEvidence.references.push(reference);
      return undefined;
    }

    const resolved = resolvePackagePath(sourceFile, requestedPath);
    reference.normalizedPath = resolved.path;
    reference.error = resolved.error;
    reference.status = resolved.error ? 'unsafe' : 'missing';
    if (!resolved.path) {
      packageEvidence.references.push(reference);
      return undefined;
    }

    const entry = findEntry(resolved.path);
    if (!entry) {
      reference.error = 'The referenced package file is missing.';
      packageEvidence.references.push(reference);
      return undefined;
    }

    const path = entry.name.replace(/\\/g, '/');
    reference.normalizedPath = path;
    const text = await entry.async('text');
    try {
      const data = kind === 'knowledge' ? undefined : parseStructuredText(text, path);
      const document: DAPackageDocument = kind === 'knowledge'
        ? { path, kind, status: 'text', text: toEvidenceContent(text) }
        : { path, kind, status: 'parsed', data };
      reference.status = 'resolved';
      packageEvidence.references.push(reference);
      packageEvidence.documents.push(document);
      addEvidence(packageEvidence, path, '$', data ?? text);
      return document;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reference.status = 'invalid';
      reference.error = message;
      packageEvidence.references.push(reference);
      const document: DAPackageDocument = { path, kind, status: 'invalid', error: message };
      packageEvidence.documents.push(document);
      addEvidence(packageEvidence, path, '$', '', 'invalid', message);
      return document;
    }
  };

  const readPluginDependencies = async (plugin: JsonObject, pluginPath: string): Promise<void> => {
    const runtimes = asArray(plugin.runtimes).map(asObject);
    for (const [runtimeIndex, runtime] of runtimes.entries()) {
      const runtimeType = asString(runtime.type);
      const spec = asObject(runtime.spec);
      const specUrl = asString(spec.url);
      if (runtimeType === 'OpenApi' && specUrl && typeof spec.api_description !== 'string') {
        await readReferencedDocument(
          pluginPath,
          `$.runtimes[${runtimeIndex}].spec.url`,
          specUrl,
          'openapi',
        );
      }
      if (runtimeType === 'RemoteMCPServer') {
        const toolDescriptionFile = asString(asObject(spec.mcp_tool_description).file);
        if (toolDescriptionFile) {
          await readReferencedDocument(
            pluginPath,
            `$.runtimes[${runtimeIndex}].spec.mcp_tool_description.file`,
            toolDescriptionFile,
            'mcp-tools',
          );
        }
      }
    }
  };

  for (const [index, rawAction] of asArray(daJson.actions).entries()) {
    const action = asObject(rawAction);
    const id = asString(action.id) || `action-${index + 1}`;
    const requestedPath = typeof rawAction === 'string'
      ? rawAction
      : asString(action.file);
    const inlinePlugin = isObject(action.plugin)
      ? action.plugin
      : isObject(rawAction) && (
        action.schema_version !== undefined ||
        action.runtimes !== undefined ||
        action.functions !== undefined
      )
        ? action
        : undefined;

    if (inlinePlugin) {
      const path = `${daSourcePath}#$.actions[${index}].plugin`;
      actions.push({ id, file: '', inline: true });
      pluginFiles[path] = inlinePlugin;
      packageEvidence.documents.push({
        path,
        kind: 'plugin',
        status: 'parsed',
        data: inlinePlugin,
      });
      addEvidence(packageEvidence, daSourcePath, `$.actions[${index}].plugin`, inlinePlugin);
      await readPluginDependencies(inlinePlugin, path);
      continue;
    }

    actions.push({ id, file: requestedPath });
    if (!requestedPath) {
      packageEvidence.references.push({
        sourceFile: daSourcePath,
        jsonPath: `$.actions[${index}]`,
        requestedPath: '',
        kind: 'plugin',
        status: 'invalid',
        error: 'The action does not contain a plugin file or inline plugin manifest.',
      });
      continue;
    }

    const document = await readReferencedDocument(
      daSourcePath,
      `$.actions[${index}].file`,
      requestedPath,
      'plugin',
    );
    if (document?.status === 'parsed' && isObject(document.data)) {
      pluginFiles[document.path] = document.data;
      await readPluginDependencies(document.data, document.path);
    }
  }

  const localizationInfo = asObject(appManifest.localizationInfo);
  if (Object.keys(localizationInfo).length > 0) {
    addEvidence(packageEvidence, rootManifestPath, '$.localizationInfo', localizationInfo);
  }
  const defaultLanguageFile = asString(localizationInfo.defaultLanguageFile);
  if (defaultLanguageFile) {
    await readReferencedDocument(
      rootManifestPath,
      '$.localizationInfo.defaultLanguageFile',
      defaultLanguageFile,
      'localization',
    );
  }
  const additionalLanguages = asArray(localizationInfo.additionalLanguages).map(asObject);
  for (const [index, localization] of additionalLanguages.entries()) {
    const requestedPath = asString(localization.file);
    if (requestedPath) {
      await readReferencedDocument(
        rootManifestPath,
        `$.localizationInfo.additionalLanguages[${index}].file`,
        requestedPath,
        'localization',
      );
    }
  }

  const editorialAnswers = asObject(daJson.editorial_answers);
  const editorialAnswersUrl = asString(editorialAnswers.url);
  if (editorialAnswersUrl) {
    await readReferencedDocument(
      daSourcePath,
      '$.editorial_answers.url',
      editorialAnswersUrl,
      'editorial-answers',
    );
  }

  for (const [index, workerValue] of asArray(daJson.worker_agents).entries()) {
    const worker = asObject(workerValue);
    const requestedPath = asString(worker.file);
    if (requestedPath) {
      await readReferencedDocument(
        daSourcePath,
        `$.worker_agents[${index}].file`,
        requestedPath,
        'worker-agent',
      );
    }
  }

  for (const [capabilityIndex, capabilityValue] of asArray(daJson.capabilities).entries()) {
    const capability = asObject(capabilityValue);
    for (const [fileIndex, requestedPathValue] of asArray(capability.files).entries()) {
      const requestedPath = typeof requestedPathValue === 'string'
        ? requestedPathValue
        : asString(asObject(requestedPathValue).file);
      if (requestedPath) {
        await readReferencedDocument(
          daSourcePath,
          `$.capabilities[${capabilityIndex}].files[${fileIndex}]`,
          requestedPath,
          'knowledge',
        );
      }
    }
  }

  const icons = asObject(appManifest.icons);
  const colorPath = asString(icons.color);
  let iconBase64: string | null = null;
  if (colorPath) {
    const resolved = resolvePackagePath(rootManifestPath, colorPath);
    const iconEntry = resolved.path ? findEntry(resolved.path) : undefined;
    if (iconEntry) {
      iconBase64 = `data:image/png;base64,${await iconEntry.async('base64')}`;
    }
  }

  const manifest = buildManifest(
    appManifest,
    daJson,
    iconBase64,
    pluginFiles,
    actions,
    instructions,
    customSkills,
  );

  const warnings: string[] = [];
  if (!iconBase64) warnings.push('color.png icon was not found; a default icon will be used.');
  if (declarativeAgents.length > 1) {
    warnings.push(
      `Multiple Declarative Agents found in ZIP (${declarativeAgents.length}). Evaluating the first entry only.`,
    );
  }
  if (packageEvidence.references.some((reference) => reference.status !== 'resolved' && reference.status !== 'external')) {
    warnings.push('One or more package references could not be parsed.');
  }

  return {
    manifest,
    packageEvidence,
    skillBundles,
    warning: warnings.length > 0 ? warnings.join(' ') : undefined,
  };
}
