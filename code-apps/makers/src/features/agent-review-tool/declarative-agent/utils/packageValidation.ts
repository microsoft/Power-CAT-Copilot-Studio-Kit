import type { SkillBundle } from '../../agents-experience/contracts/SkillBundle';
import type { DAManifest } from '../contracts/DAManifest';
import type {
  DAPackageEvidence,
  DAPackageFinding,
  DAPackageValidation,
} from '../contracts/DAPackageReview';
import { SCHEMA_LIMITS } from '../contracts/constants';
import { PACKAGE_GUIDANCE_DOCS } from '../contracts/learnDocs';
import { validateDACustomSkills } from './customSkillValidation';
import { asArray, asObject, isObject, trimmedText, type JsonObject } from './jsonShape';
import { validateManifestContract } from './manifestContractValidation';
import {
  createPackageCredentialRedactor,
  sanitizePackageFindings,
  validatePackageContent,
} from './packageContentValidation';
import { addPackageFinding as addFinding } from './packageFindings';
import { validatePluginContracts } from './pluginContractValidation';
import {
  countOf,
  documentLabel,
  httpsFormOf,
  httpsUrlRecommendation,
  quotedList,
  referenceRecommendation,
  shortenedTo,
  withVerification,
} from './packageRemediation';

const DA_SCHEMA_URL = PACKAGE_GUIDANCE_DOCS.declarativeAgentManifest.url;
const PLUGIN_SCHEMA_URL = PACKAGE_GUIDANCE_DOCS.apiPluginManifest.url;
const CONFIRMATION_URL = PACKAGE_GUIDANCE_DOCS.confirmationPrompts.url;
const LOCALIZATION_URL = PACKAGE_GUIDANCE_DOCS.localization.url;
const CONNECTED_AGENT_URL = PACKAGE_GUIDANCE_DOCS.connectedAgents.url;

function addLengthFinding(
  findings: DAPackageFinding[],
  ruleId: string,
  label: string,
  value: string,
  limit: number,
  sourceFile: string,
  jsonPath: string,
  options: { contentFile?: string; advice?: string; shortenedExample?: boolean } = {},
): void {
  const location = options.contentFile
    ? `${options.contentFile}, the file that ${jsonPath} in ${sourceFile} names`
    : `${jsonPath} in ${sourceFile}`;
  const shortened = options.shortenedExample && value.length > limit
    ? shortenedTo(value, limit)
    : '';
  addFinding(findings, {
    ruleId,
    status: value.length <= limit ? 'Pass' : 'Fail',
    severity: value.length <= limit ? undefined : 'High',
    sourceFile,
    jsonPath,
    evidence: `${value.length} characters`,
    explanation: value.length <= limit
      ? `${label} is within the ${limit.toLocaleString()}-character limit.`
      : `${label} has ${value.length.toLocaleString()} characters and exceeds the ${limit.toLocaleString()}-character limit.`,
    recommendation: value.length <= limit
      ? ''
      : withVerification(
          `Remove at least ${countOf(value.length - limit, 'character')} from ${label.toLowerCase()} at ${location}. It has ${value.length.toLocaleString()} characters; the limit is ${limit.toLocaleString()}.${options.advice ? ` ${options.advice}` : ''}`,
          `Count the characters again and confirm that there are ${limit.toLocaleString()} or fewer.`,
          shortened
            ? `"${shortened}" (${countOf(shortened.length, 'character')}, from the current ${label.toLowerCase()}).`
            : undefined,
        ),
    guidanceUrl: DA_SCHEMA_URL,
  });
}

function findPluginDocuments(evidence: DAPackageEvidence) {
  return evidence.documents.filter((document) => document.kind === 'plugin');
}

function findOpenApiDocuments(evidence: DAPackageEvidence) {
  return evidence.documents.filter((document) => document.kind === 'openapi');
}

function isAbsoluteHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function validateOpenApi(
  findings: DAPackageFinding[],
  evidence: DAPackageEvidence,
): void {
  const documents = findOpenApiDocuments(evidence);
  const externalReferences = evidence.references.filter(
    (reference) => reference.kind === 'openapi' && reference.status === 'external',
  );

  for (const document of documents) {
    if (document.status !== 'parsed' || !isObject(document.data)) continue;
    const spec = document.data;
    const insecureServers = asArray(spec.servers)
      .map(asObject)
      .map((server) => typeof server.url === 'string' ? server.url : '')
      .filter((url) => url && !url.toLowerCase().startsWith('https://'));

    if (insecureServers.length > 0) {
      const httpsServer = insecureServers.map(httpsFormOf).find(Boolean);
      addFinding(findings, {
        ruleId: 'DA-OPENAPI-HTTPS',
        status: 'Fail',
        severity: 'High',
        sourceFile: document.path,
        jsonPath: '$.servers',
        evidence: insecureServers.join(', '),
        explanation: 'The packaged OpenAPI description contains a non-HTTPS server URL.',
        recommendation: withVerification(
          `Remove these non-HTTPS server URLs from $.servers in ${document.path}, or change them to https:// URLs: ${insecureServers.join(', ')}.`,
          `Confirm that every url in $.servers starts with https:// and that the API responds at that address.`,
          httpsServer ? `"servers": [{ "url": "${httpsServer}" }]` : undefined,
        ),
        guidanceUrl: PLUGIN_SCHEMA_URL,
      });
    }

    // Copilot asks the user to confirm every non-GET operation by default.
    // Only an explicit false turns that prompt off.
    const paths = asObject(spec.paths);
    const confirmationDisabled: string[] = [];
    let firstDisabledOperation: { path: string; method: string } | undefined;
    for (const [path, pathValue] of Object.entries(paths)) {
      const operations = asObject(pathValue);
      for (const method of ['post', 'put', 'patch', 'delete']) {
        const operation = asObject(operations[method]);
        if (Object.keys(operation).length === 0) continue;
        if (operation['x-openai-isConsequential'] === false) {
          confirmationDisabled.push(`${method.toUpperCase()} ${path}`);
          firstDisabledOperation ??= { path, method };
        }
      }
    }

    addFinding(findings, {
      ruleId: 'DA-OPENAPI-CONSEQUENTIAL',
      status: confirmationDisabled.length === 0 ? 'Pass' : 'Fail',
      severity: confirmationDisabled.length === 0 ? undefined : 'High',
      sourceFile: document.path,
      jsonPath: '$.paths',
      evidence: confirmationDisabled.length === 0
        ? 'No packaged write operation sets x-openai-isConsequential to false.'
        : confirmationDisabled.join(', '),
      explanation: confirmationDisabled.length === 0
        ? 'Packaged write operations keep the Copilot confirmation prompt.'
        : 'One or more packaged write operations set x-openai-isConsequential to false, so Copilot does not ask the user to confirm them.',
      recommendation: confirmationDisabled.length === 0
        ? ''
        : withVerification(
            `Set "x-openai-isConsequential": true on these operations in ${document.path} so that Copilot asks the user to confirm before it runs them: ${confirmationDisabled.join(', ')}. The value false removes the confirmation prompt.`,
            'Confirm that no listed operation sets "x-openai-isConsequential" to false. Then run one of these operations in a test chat and confirm that Copilot asks for confirmation.',
            firstDisabledOperation
              ? `In ${document.path}, under paths["${firstDisabledOperation.path}"].${firstDisabledOperation.method}, change "x-openai-isConsequential" from false to true.`
              : undefined,
          ),
      guidanceUrl: CONFIRMATION_URL,
    });
  }

  if (externalReferences.length > 0) {
    addFinding(findings, {
      ruleId: 'DA-REMOTE-OPENAPI',
      status: 'Not assessed',
      sourceFile: externalReferences[0].sourceFile,
      jsonPath: externalReferences[0].jsonPath,
      evidence: externalReferences.map((reference) => reference.requestedPath).join(', '),
      explanation: 'The OpenAPI description is remote and is not contained in the uploaded package.',
      recommendation: 'Review the remote OpenAPI description separately before release.',
      guidanceUrl: PLUGIN_SCHEMA_URL,
    });
  }
}

function validatePlugins(
  findings: DAPackageFinding[],
  evidence: DAPackageEvidence,
): void {
  const plugins = findPluginDocuments(evidence);
  for (const document of plugins) {
    if (document.status !== 'parsed' || !isObject(document.data)) continue;
    const plugin = document.data;
    const schemaVersion = typeof plugin.schema_version === 'string'
      ? plugin.schema_version
      : '';
    const pluginLabel = documentLabel(document.path);
    addFinding(findings, {
      ruleId: 'DA-PLUGIN-VERSION',
      status: schemaVersion === 'v2.4' ? 'Pass' : 'Fail',
      severity: schemaVersion === 'v2.4' ? undefined : 'High',
      sourceFile: document.path,
      jsonPath: '$.schema_version',
      evidence: schemaVersion || '(missing)',
      explanation: schemaVersion === 'v2.4'
        ? 'The plugin uses the supported v2.4 schema.'
        : 'The plugin does not declare the supported v2.4 schema.',
      recommendation: schemaVersion === 'v2.4'
        ? ''
        : withVerification(
            schemaVersion
              ? `Change schema_version in ${pluginLabel} from "${schemaVersion}" to "v2.4", and update the plugin to the v2.4 schema.`
              : `Add "schema_version": "v2.4" to ${pluginLabel}.`,
            `Confirm that schema_version in ${pluginLabel} is "v2.4".`,
          ),
      guidanceUrl: PLUGIN_SCHEMA_URL,
    });

    for (const [runtimeIndex, runtimeValue] of asArray(plugin.runtimes).entries()) {
      const runtime = asObject(runtimeValue);
      const runtimeType = typeof runtime.type === 'string' ? runtime.type : '';
      const spec = asObject(runtime.spec);
      const runtimeUrl = typeof spec.url === 'string' ? spec.url : '';

      if (runtimeType === 'OpenApi' && /^https?:\/\//i.test(runtimeUrl)) {
        addFinding(findings, {
          ruleId: 'DA-PLUGIN-RUNTIME-HTTPS',
          status: isAbsoluteHttpsUrl(runtimeUrl) ? 'Pass' : 'Fail',
          severity: isAbsoluteHttpsUrl(runtimeUrl) ? undefined : 'High',
          sourceFile: document.path,
          jsonPath: `$.runtimes[${runtimeIndex}].spec.url`,
          evidence: runtimeUrl,
          explanation: isAbsoluteHttpsUrl(runtimeUrl)
            ? 'The remote OpenAPI description uses HTTPS.'
            : 'The remote OpenAPI description does not use a valid HTTPS URL.',
          recommendation: isAbsoluteHttpsUrl(runtimeUrl)
            ? ''
            : httpsUrlRecommendation(
                runtimeUrl,
                `$.runtimes[${runtimeIndex}].spec.url`,
                pluginLabel,
                'OpenAPI description',
              ),
          guidanceUrl: PLUGIN_SCHEMA_URL,
        });
      }

      if (runtimeType !== 'RemoteMCPServer') continue;
      addFinding(findings, {
        ruleId: 'DA-MCP-ENDPOINT',
        status: isAbsoluteHttpsUrl(runtimeUrl) ? 'Pass' : 'Fail',
        severity: isAbsoluteHttpsUrl(runtimeUrl) ? undefined : 'High',
        sourceFile: document.path,
        jsonPath: `$.runtimes[${runtimeIndex}].spec.url`,
        evidence: runtimeUrl || '(missing)',
        explanation: isAbsoluteHttpsUrl(runtimeUrl)
          ? 'The remote MCP server uses an absolute HTTPS URL.'
          : 'The remote MCP server does not use a valid absolute HTTPS URL.',
        recommendation: isAbsoluteHttpsUrl(runtimeUrl)
          ? ''
          : httpsUrlRecommendation(
              runtimeUrl,
              `$.runtimes[${runtimeIndex}].spec.url`,
              pluginLabel,
              'MCP server',
            ),
        guidanceUrl: PLUGIN_SCHEMA_URL,
      });

      const functions = asArray(plugin.functions).map(asObject);
      const runForFunctions = asArray(runtime.run_for_functions);
      const dynamicDiscovery = functions.length === 0 && runForFunctions.includes('*');

      if (dynamicDiscovery) {
        addFinding(findings, {
          ruleId: 'DA-MCP-DYNAMIC-TOOLS',
          status: 'Not assessed',
          sourceFile: document.path,
          jsonPath: `$.runtimes[${runtimeIndex}]`,
          evidence: 'functions is empty and run_for_functions contains "*".',
          explanation: 'Dynamic MCP discovery is supported, but the available tools require a live connection.',
          recommendation: 'Test tool discovery and permissions in the target environment.',
          guidanceUrl: PLUGIN_SCHEMA_URL,
        });
      } else {
        const description = asObject(spec.mcp_tool_description);
        const descriptionFile = typeof description.file === 'string'
          ? description.file.trim()
          : '';
        const inlineTools = asArray(description.tools);
        const hasFile = descriptionFile.length > 0;
        const hasInlineTools = inlineTools.length > 0;
        const descriptionReference = evidence.references.find(
          (reference) =>
            reference.kind === 'mcp-tools' &&
            reference.sourceFile === document.path &&
            reference.requestedPath === descriptionFile,
        );
        const descriptionDocument = evidence.documents.find(
          (candidate) =>
            candidate.kind === 'mcp-tools' &&
            candidate.path === descriptionReference?.normalizedPath,
        );
        const hasValidFile = hasFile &&
          descriptionDocument?.status === 'parsed' &&
          asArray(asObject(descriptionDocument.data).tools).length > 0;
        const hasExactlyOneDescription =
          (hasValidFile && !hasInlineTools) || (!hasFile && hasInlineTools);
        const hasConflictingDescriptions = hasFile && hasInlineTools;
        const pinnedToolNames = [
          ...functions.map((fn) => trimmedText(fn.name)),
          ...runForFunctions.map(trimmedText),
        ].filter((name, index, names) => name && name !== '*' && names.indexOf(name) === index);
        addFinding(findings, {
          ruleId: 'DA-MCP-TOOL-DESCRIPTION',
          status: hasExactlyOneDescription
            ? 'Pass'
            : hasFile || hasConflictingDescriptions
              ? 'Fail'
              : 'Warning',
          severity: hasExactlyOneDescription
            ? undefined
            : hasFile || hasConflictingDescriptions
              ? 'High'
              : 'Medium',
          sourceFile: document.path,
          jsonPath: `$.runtimes[${runtimeIndex}].spec.mcp_tool_description`,
          evidence: hasFile
            ? `file: ${descriptionFile}`
            : hasInlineTools
              ? `${inlineTools.length} inline tool description${inlineTools.length === 1 ? '' : 's'}`
              : '(missing)',
          explanation: hasExactlyOneDescription
            ? 'The pinned MCP tools have one packaged tool-description source.'
            : hasConflictingDescriptions
              ? 'The MCP tool description contains both file and tools, but only one is allowed.'
              : hasFile
                ? 'The packaged MCP tool-description file is missing, invalid, or contains no tools.'
              : 'Pinned MCP tools do not include a packaged mcp_tool_description.',
          recommendation: hasExactlyOneDescription
            ? ''
            : hasConflictingDescriptions
              ? withVerification(
                  `Remove either file or tools from $.runtimes[${runtimeIndex}].spec.mcp_tool_description in ${pluginLabel}. Keep only one tool-description source.`,
                  `Confirm that mcp_tool_description has file or tools, but not both.`,
                  `Keep "file": "${descriptionFile}" and remove "tools".`,
                )
              : hasFile
                ? withVerification(
                    `Make sure that "${descriptionReference?.normalizedPath ?? descriptionFile}" is in the package, is valid JSON, and has a non-empty tools array.`,
                    `Open "${descriptionReference?.normalizedPath ?? descriptionFile}" and confirm that it parses as JSON and that tools has at least one entry.`,
                  )
              : withVerification(
                  `Add mcp_tool_description to $.runtimes[${runtimeIndex}].spec in ${pluginLabel}, with a package-local file or an inline tools array for the pinned tools. To let Copilot discover the tools at run time instead, set functions to [] and run_for_functions to ["*"].`,
                  `Confirm that mcp_tool_description has file or tools, or that functions is [] and run_for_functions is ["*"].`,
                  pinnedToolNames.length > 0
                    ? `Add "mcp_tool_description": { "tools": [ … ] } with one entry for each pinned tool: ${quotedList(pinnedToolNames)}. Copy each name, description, and inputSchema from the tools/list response of the MCP server.`
                    : undefined,
                ),
          guidanceUrl: PLUGIN_SCHEMA_URL,
        });
      }
    }
  }
}

function collectLocalizationKeys(value: unknown, keys: Set<string>): void {
  if (typeof value === 'string') {
    const match = /^\[\[([a-zA-Z_][a-zA-Z0-9_]*)\]\]$/.exec(value);
    if (match) keys.add(match[1]);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLocalizationKeys(item, keys);
    return;
  }
  if (!isObject(value)) return;
  for (const child of Object.values(value)) collectLocalizationKeys(child, keys);
}

function validateLocalization(
  findings: DAPackageFinding[],
  evidence: DAPackageEvidence,
): void {
  const appDocument = evidence.documents.find(
    (document) => document.kind === 'app-manifest' && document.status === 'parsed',
  );
  const appManifest = asObject(appDocument?.data);
  const localizationInfo = asObject(appManifest.localizationInfo);
  const defaultLanguageTag = typeof localizationInfo.defaultLanguageTag === 'string'
    ? localizationInfo.defaultLanguageTag.trim()
    : '';
  const defaultLanguageFile = typeof localizationInfo.defaultLanguageFile === 'string'
    ? localizationInfo.defaultLanguageFile.trim()
    : '';
  const additionalLanguages = asArray(localizationInfo.additionalLanguages).map(asObject);

  const tokenKeys = new Set<string>();
  for (const document of evidence.documents) {
    if (
      document.status === 'parsed' &&
      (document.kind === 'declarative-agent' || document.kind === 'plugin')
    ) {
      collectLocalizationKeys(document.data, tokenKeys);
    }
  }

  if (Object.keys(localizationInfo).length === 0 && tokenKeys.size === 0) {
    return;
  }

  const invalidLanguageIndexes = additionalLanguages.flatMap((language, index) =>
    typeof language.languageTag !== 'string' ||
    !language.languageTag.trim() ||
    typeof language.file !== 'string' ||
    !language.file.trim()
      ? [index]
      : [],
  );
  const languageTags = additionalLanguages
    .map((language) => typeof language.languageTag === 'string'
      ? language.languageTag.trim().toLowerCase()
      : '')
    .filter(Boolean);
  const duplicateLanguageTags = [...new Set(languageTags.filter(
    (languageTag, index) => languageTags.indexOf(languageTag) !== index,
  ))];
  const configErrors: string[] = [];
  const configActions: string[] = [];
  const addDefaultFileAction =
    'Add localizationInfo.defaultLanguageFile with the package path of the default language file.';
  if (!defaultLanguageTag) {
    configErrors.push('defaultLanguageTag is missing');
    configActions.push('Add localizationInfo.defaultLanguageTag, for example "en".');
  }
  if (additionalLanguages.length > 0 && !defaultLanguageFile) {
    configErrors.push('defaultLanguageFile is required when additional languages are declared');
    configActions.push(addDefaultFileAction);
  }
  if (invalidLanguageIndexes.length > 0) {
    configErrors.push('one or more additional languages are missing languageTag or file');
    configActions.push(`Add the missing languageTag or file to ${invalidLanguageIndexes
      .map((index) => `localizationInfo.additionalLanguages[${index}]`)
      .join(', ')}.`);
  }
  if (duplicateLanguageTags.length > 0) {
    configErrors.push(`duplicate language tags: ${duplicateLanguageTags.join(', ')}`);
    configActions.push(`Remove the duplicate language tag${
      duplicateLanguageTags.length === 1 ? '' : 's'
    }: ${duplicateLanguageTags.join(', ')}. Each additional language needs a unique languageTag.`);
  }
  if (tokenKeys.size > 0 && !defaultLanguageFile) {
    configErrors.push('tokenized agent strings require a default language file');
    configActions.push(addDefaultFileAction);
  }
  const localizationSource = appDocument?.path ?? evidence.rootManifestPath;

  addFinding(findings, {
    ruleId: 'DA-LOCALIZATION-CONFIG',
    status: configErrors.length === 0 ? 'Pass' : 'Fail',
    severity: configErrors.length === 0 ? undefined : 'High',
    sourceFile: localizationSource,
    jsonPath: '$.localizationInfo',
    evidence: configErrors.length === 0
      ? `${1 + additionalLanguages.length} configured language${
          additionalLanguages.length === 0 ? '' : 's'
        }`
      : configErrors.join('; '),
    explanation: configErrors.length === 0
      ? 'The app localization configuration is complete.'
      : 'The app localization configuration is incomplete or ambiguous.',
    recommendation: configErrors.length === 0
      ? ''
      : withVerification(
          `In ${localizationSource}: ${[...new Set(configActions)].join(' ')}`,
          'Confirm that localizationInfo has defaultLanguageTag, has defaultLanguageFile when the package has additional languages or [[tokens]], and has a unique languageTag and a file for each additional language.',
        ),
    guidanceUrl: LOCALIZATION_URL,
  });

  if (tokenKeys.size === 0) {
    addFinding(findings, {
      ruleId: 'DA-LOCALIZATION-KEYS',
      status: 'N/A',
      sourceFile: evidence.declarativeAgentPath,
      jsonPath: '$',
      evidence: 'No tokenized declarative-agent or plugin strings.',
      explanation: 'The package does not use localized agent or plugin string tokens.',
      recommendation: '',
      guidanceUrl: LOCALIZATION_URL,
    });
    return;
  }

  const localizationDocuments = evidence.documents.filter(
    (document) => document.kind === 'localization' && document.status === 'parsed',
  );
  if (localizationDocuments.length === 0) {
    addFinding(findings, {
      ruleId: 'DA-LOCALIZATION-KEYS',
      status: 'Fail',
      severity: 'High',
      sourceFile: appDocument?.path ?? evidence.rootManifestPath,
      jsonPath: '$.localizationInfo',
      evidence: [...tokenKeys].join(', '),
      explanation: 'Tokenized agent strings are present, but no localization file was parsed.',
      recommendation: withVerification(
        `Add a default language file to the package and set localizationInfo.defaultLanguageFile in ${localizationSource} to its path. In that file, add a non-empty localizationKeys value for each token: ${[...tokenKeys].join(', ')}.`,
        'Open the default language file and confirm that localizationKeys has a non-empty value for each token.',
      ),
      guidanceUrl: LOCALIZATION_URL,
    });
    return;
  }

  for (const document of localizationDocuments) {
    const localizationKeys = asObject(asObject(document.data).localizationKeys);
    const missingKeys = [...tokenKeys].filter((key) => {
      const value = localizationKeys[key];
      return typeof value !== 'string' || !value.trim();
    });
    addFinding(findings, {
      ruleId: 'DA-LOCALIZATION-KEYS',
      status: missingKeys.length === 0 ? 'Pass' : 'Fail',
      severity: missingKeys.length === 0 ? undefined : 'High',
      sourceFile: document.path,
      jsonPath: '$.localizationKeys',
      evidence: missingKeys.length === 0
        ? `${tokenKeys.size} required localization key${tokenKeys.size === 1 ? '' : 's'} present`
        : `Missing: ${missingKeys.join(', ')}`,
      explanation: missingKeys.length === 0
        ? 'The localization file defines every token used by the agent and its plugins.'
        : 'The localization file does not define every token used by the agent and its plugins.',
      recommendation: missingKeys.length === 0
        ? ''
        : withVerification(
            `Add ${missingKeys.length === 1 ? 'a non-empty value' : 'non-empty values'} for ${missingKeys.join(', ')} to localizationKeys in ${document.path}.`,
            `Open ${document.path} and confirm that localizationKeys has a non-empty value for each listed key.`,
            `In ${document.path}, add "${missingKeys[0]}": "…" under localizationKeys, with the text in the language of that file.`,
          ),
      guidanceUrl: LOCALIZATION_URL,
    });
  }
}

function validateEmbeddedKnowledge(
  findings: DAPackageFinding[],
  manifest: DAManifest,
  sourceFile: string,
): void {
  for (const [index, capabilityValue] of manifest.capabilities.entries()) {
    const capability = asObject(capabilityValue);
    if (capability.name !== 'EmbeddedKnowledge') continue;
    const files = asArray(capability.files);
    const validCount = files.length > 0 && files.length <= 10;
    const filesPath = `$.capabilities[${index}].files`;
    const extraFiles = files.slice(10)
      .map((file) => trimmedText(typeof file === 'string' ? file : asObject(file).file))
      .filter(Boolean);
    addFinding(findings, {
      ruleId: 'DA-EMBEDDED-KNOWLEDGE-FILES',
      status: validCount ? 'Pass' : 'Fail',
      severity: validCount ? undefined : 'High',
      sourceFile,
      jsonPath: filesPath,
      evidence: `${files.length} embedded knowledge file${files.length === 1 ? '' : 's'}`,
      explanation: validCount
        ? 'The EmbeddedKnowledge capability contains between 1 and 10 files.'
        : 'The EmbeddedKnowledge capability must contain between 1 and 10 files.',
      recommendation: validCount
        ? ''
        : withVerification(
            files.length === 0
              ? `Add 1 to 10 package-local files to ${filesPath}, or remove the EmbeddedKnowledge capability from ${sourceFile}.`
              : `Remove ${countOf(files.length - 10, 'file')} from ${filesPath} in ${sourceFile}. If the agent needs more files, put them in SharePoint or OneDrive and use the OneDriveAndSharePoint capability.`,
            `Confirm that ${filesPath} has 1 to 10 entries and that each file is in the package.`,
            extraFiles.length > 0 ? `Remove ${quotedList(extraFiles)} from ${filesPath}.` : undefined,
          ),
      guidanceUrl: DA_SCHEMA_URL,
    });
  }
}

function validateUserOverrides(
  findings: DAPackageFinding[],
  manifestDocument: JsonObject,
  sourceFile: string,
): void {
  if (manifestDocument.user_overrides === undefined) return;
  const overrides = asArray(manifestDocument.user_overrides).map(asObject);
  const overrideProblems = overrides.flatMap((override, index) => {
    const path = typeof override.path === 'string' ? override.path.trim() : '';
    const actions = asArray(override.allowed_actions);
    const fixes: string[] = [];
    if (!path) fixes.push('add a path that targets a capability');
    if (actions.length === 0 || actions.some((action) => action !== 'remove')) {
      fixes.push('set allowed_actions to ["remove"]');
    }
    return fixes.length > 0 ? [`$.user_overrides[${index}]: ${fixes.join(' and ')}`] : [];
  });
  const needsPathExample = overrideProblems.some((problem) => problem.includes('add a path'));
  const valid = overrides.length > 0 && overrideProblems.length === 0;
  addFinding(findings, {
    ruleId: 'DA-USER-OVERRIDES',
    status: valid ? 'Pass' : 'Fail',
    severity: valid ? undefined : 'High',
    sourceFile,
    jsonPath: '$.user_overrides',
    evidence: overrideProblems.length === 0
      ? `${overrides.length} valid user override${overrides.length === 1 ? '' : 's'}`
      : `${overrideProblems.length} invalid user override${overrideProblems.length === 1 ? '' : 's'}`,
    explanation: valid
      ? 'Each user override identifies a capability and only allows the remove action.'
      : 'Each user override must contain a capability path and only the remove action.',
    recommendation: valid
      ? ''
      : withVerification(
          overrideProblems.length === 0
            ? `Add at least one override to $.user_overrides in ${sourceFile}, or remove the user_overrides property.`
            : `Correct these user overrides in ${sourceFile}: ${overrideProblems.join('; ')}.${
                needsPathExample
                  ? ` Target a capability by name, for example $.capabilities[?(@.name == 'WebSearch')].`
                  : ''
              }`,
          'Confirm that each entry in $.user_overrides has a path and allowed_actions: ["remove"].',
        ),
    guidanceUrl: DA_SCHEMA_URL,
  });
}

function validateEditorialAnswersObject(
  findings: DAPackageFinding[],
  editorialAnswers: JsonObject,
  sourceFile: string,
  jsonPath: string,
): void {
  const url = typeof editorialAnswers.url === 'string' ? editorialAnswers.url.trim() : '';
  const hasAnswers = Array.isArray(editorialAnswers.answers);
  const answers = asArray(editorialAnswers.answers).map(asObject);
  const shapeValid = Boolean(url) !== hasAnswers;
  const answerProblems = answers.flatMap((answer, index) => {
    const question = typeof answer.question === 'string' ? answer.question.trim() : '';
    const response = typeof answer.answer === 'string' ? answer.answer.trim() : '';
    const thresholds = asObject(answer.similarity_thresholds);
    const fixes: string[] = [];
    if (!question) fixes.push('add a question');
    if (!response) fixes.push('add an answer');
    if (Object.keys(thresholds).length > 0) {
      const min = thresholds.min;
      const max = thresholds.max;
      if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        Number(min) < 0 ||
        Number(max) > 10 ||
        Number(min) > Number(max)
      ) {
        fixes.push('set similarity_thresholds min and max to whole numbers from 0 to 10, with min not more than max');
      }
    }
    return fixes.length > 0 ? [`${jsonPath}.answers[${index}]: ${fixes.join(' and ')}`] : [];
  });
  const valid = shapeValid && answers.length <= 300 && answerProblems.length === 0;
  const editorialFixes: string[] = [];
  if (url && hasAnswers) editorialFixes.push(`Keep either url or answers in ${jsonPath}, but not both.`);
  if (!url && !hasAnswers) editorialFixes.push(`Add url or answers to ${jsonPath}.`);
  if (answers.length > 300) {
    editorialFixes.push(`Remove ${countOf(answers.length - 300, 'answer')} from ${jsonPath}.answers. The limit is 300.`);
  }
  if (answerProblems.length > 0) {
    editorialFixes.push(`Correct these answers: ${answerProblems.join('; ')}.`);
  }

  addFinding(findings, {
    ruleId: 'DA-EDITORIAL-ANSWERS',
    status: valid ? 'Pass' : 'Fail',
    severity: valid ? undefined : 'High',
    sourceFile,
    jsonPath,
    evidence: url || `${answers.length} inline answer${answers.length === 1 ? '' : 's'}`,
    explanation: valid
      ? 'The editorial answers configuration has a valid source and valid answer entries.'
      : 'Editorial answers must contain either url or answers, with no more than 300 valid question-answer pairs.',
    recommendation: valid
      ? ''
      : withVerification(
          `In ${sourceFile}: ${editorialFixes.join(' ')}`,
          `Confirm that ${jsonPath} has url or answers but not both, that it has 300 or fewer answers, and that each answer has a question and an answer.`,
        ),
    guidanceUrl: DA_SCHEMA_URL,
  });
}

function validateAdvancedManifestFields(
  findings: DAPackageFinding[],
  manifest: DAManifest,
  evidence: DAPackageEvidence,
): void {
  const daDocument = evidence.documents.find(
    (document) => document.kind === 'declarative-agent' && document.status === 'parsed',
  );
  const daManifest = asObject(daDocument?.data);
  const sourceFile = daDocument?.path ?? evidence.declarativeAgentPath ?? 'declarativeAgent.json';

  validateEmbeddedKnowledge(findings, manifest, sourceFile);
  validateUserOverrides(findings, daManifest, sourceFile);

  if (isObject(daManifest.editorial_answers)) {
    const editorialAnswers = daManifest.editorial_answers;
    const url = typeof editorialAnswers.url === 'string' ? editorialAnswers.url.trim() : '';
    const hasInlineAnswers = Array.isArray(editorialAnswers.answers);
    if (/^https?:\/\//i.test(url) && !hasInlineAnswers) {
      addFinding(findings, {
        ruleId: 'DA-EDITORIAL-ANSWERS',
        status: 'Not assessed',
        sourceFile,
        jsonPath: '$.editorial_answers.url',
        evidence: url,
        explanation: 'The editorial answers document is remote and is not contained in the package.',
        recommendation: 'Review the remote editorial answers document separately before release.',
        guidanceUrl: DA_SCHEMA_URL,
      });
    } else if (!url || hasInlineAnswers) {
      validateEditorialAnswersObject(
        findings,
        editorialAnswers,
        sourceFile,
        '$.editorial_answers',
      );
    }
  }

  for (const document of evidence.documents) {
    if (
      document.kind === 'editorial-answers' &&
      document.status === 'parsed' &&
      isObject(document.data)
    ) {
      validateEditorialAnswersObject(findings, document.data, document.path, '$');
    }
  }

  for (const [index, workerValue] of asArray(daManifest.worker_agents).entries()) {
    const worker = asObject(workerValue);
    const hasId = typeof worker.id === 'string' && worker.id.trim().length > 0;
    const hasFile = typeof worker.file === 'string' && worker.file.trim().length > 0;
    const valid = hasId !== hasFile;
    addFinding(findings, {
      ruleId: 'DA-WORKER-AGENT-REFERENCE',
      status: valid ? 'Pass' : 'Fail',
      severity: valid ? undefined : 'High',
      sourceFile,
      jsonPath: `$.worker_agents[${index}]`,
      evidence: hasId ? `id: ${String(worker.id)}` : hasFile ? `file: ${String(worker.file)}` : '(missing)',
      explanation: valid
        ? 'The worker agent uses exactly one supported reference.'
        : 'A worker agent must specify either id or file, but not both.',
      recommendation: valid
        ? ''
        : withVerification(
            hasId
              ? `Keep only one of id or file in $.worker_agents[${index}] in ${sourceFile}, and remove the other.`
              : `Add id or file to $.worker_agents[${index}] in ${sourceFile}.`,
            `Confirm that $.worker_agents[${index}] has exactly one of id or file.`,
          ),
      guidanceUrl: CONNECTED_AGENT_URL,
    });
  }
}

/**
 * Runs deterministic static validation over a parsed v1.8 package.
 */
export function runDAPackageValidation(
  manifest: DAManifest,
  evidence: DAPackageEvidence,
  skillBundles: readonly SkillBundle[] = [],
): DAPackageValidation {
  const findings: DAPackageFinding[] = [];
  const daPath = evidence.declarativeAgentPath ?? 'declarativeAgent.json';
  const supportedVersion = manifest.schemaVersion === 'v1.8' ||
    manifest.schemaVersion === 'v1.9';

  addFinding(findings, {
    ruleId: manifest.schemaVersion ? 'DA-VERSION-SUPPORTED' : 'DA-VERSION-REQUIRED',
    status: supportedVersion ? 'Pass' : 'Fail',
    severity: supportedVersion ? undefined : 'High',
    sourceFile: daPath,
    jsonPath: '$.version',
    evidence: manifest.schemaVersion || '(missing)',
    explanation: supportedVersion
      ? `The declarative-agent manifest declares supported version ${manifest.schemaVersion}.`
      : manifest.schemaVersion
        ? `The declarative-agent manifest declares unsupported version ${manifest.schemaVersion}.`
        : 'The required declarative-agent version is missing.',
    recommendation: supportedVersion
      ? ''
      : withVerification(
          manifest.schemaVersion
            ? `Change "version" in ${daPath} from "${manifest.schemaVersion}" to "v1.8", and update the manifest to the v1.8 schema. Use "v1.9" only when the package has custom skills.`
            : `Add "version": "v1.8" to ${daPath}. Use "v1.9" only when the package has custom skills.`,
          `Confirm that $.version in ${daPath} is "v1.8", or "v1.9" for a package with custom skills.`,
        ),
    guidanceUrl: DA_SCHEMA_URL,
  });

  addLengthFinding(
    findings,
    'DA-NAME-LENGTH',
    'Agent name',
    manifest.name,
    SCHEMA_LIMITS.NAME_MAX_LENGTH,
    daPath,
    '$.name',
    { shortenedExample: true },
  );
  addLengthFinding(
    findings,
    'DA-DESCRIPTION-LENGTH',
    'Agent description',
    manifest.description,
    SCHEMA_LIMITS.DESCRIPTION_MAX_LENGTH,
    daPath,
    '$.description',
  );
  addLengthFinding(
    findings,
    'DA-INSTRUCTIONS-LENGTH',
    'Agent instructions',
    manifest.instructions,
    SCHEMA_LIMITS.INSTRUCTIONS_MAX_LENGTH,
    daPath,
    '$.instructions',
    {
      contentFile: evidence.references.find(
        (reference) => reference.kind === 'instructions' && reference.status === 'resolved',
      )?.normalizedPath,
      advice: 'Remove repeated rules and long examples first. Keep behavior rules in the instructions. Do not move them to knowledge files: Copilot uses knowledge to ground answers and does not guarantee that it follows knowledge content as instructions.',
    },
  );

  for (const [ruleId, label, value, path] of [
    ['DA-NAME-REQUIRED', 'Agent name', manifest.name, '$.name'],
    ['DA-DESCRIPTION-REQUIRED', 'Agent description', manifest.description, '$.description'],
    ['DA-INSTRUCTIONS-REQUIRED', 'Agent instructions', manifest.instructions, '$.instructions'],
  ] as const) {
    addFinding(findings, {
      ruleId,
      status: value.trim() ? 'Pass' : 'Fail',
      severity: value.trim() ? undefined : 'High',
      sourceFile: daPath,
      jsonPath: path,
      evidence: value.trim() ? 'Present' : '(missing)',
      explanation: value.trim() ? `${label} is present.` : `${label} is required.`,
      recommendation: value.trim()
        ? ''
        : withVerification(
            `Add ${label.toLowerCase()} at ${path} in ${daPath}.`,
            `Confirm that ${path} has text that is not only spaces.`,
          ),
      guidanceUrl: DA_SCHEMA_URL,
    });
  }

  const starterCount = manifest.conversationStarters.length;
  const starterExcess = starterCount - SCHEMA_LIMITS.STARTERS_MAX_COUNT;
  const excessStarterNames = starterExcess > 0
    ? manifest.conversationStarters
      .slice(-starterExcess)
      .map((starter) => trimmedText(asObject(starter).title) || trimmedText(asObject(starter).text))
      .filter(Boolean)
    : [];
  addFinding(findings, {
    ruleId: 'DA-STARTERS-COUNT',
    status: starterCount === 0
      ? 'N/A'
      : starterCount <= SCHEMA_LIMITS.STARTERS_MAX_COUNT ? 'Pass' : 'Fail',
    severity: starterCount > SCHEMA_LIMITS.STARTERS_MAX_COUNT ? 'High' : undefined,
    sourceFile: daPath,
    jsonPath: '$.conversation_starters',
    evidence: `${starterCount} conversation starter${starterCount === 1 ? '' : 's'}`,
    explanation: starterCount === 0
      ? 'Conversation starters are optional and none are declared.'
      : starterCount <= SCHEMA_LIMITS.STARTERS_MAX_COUNT
        ? `The package is within the ${SCHEMA_LIMITS.STARTERS_MAX_COUNT}-starter limit.`
        : `The package exceeds the ${SCHEMA_LIMITS.STARTERS_MAX_COUNT}-starter limit.`,
    recommendation: starterExcess > 0
      ? withVerification(
          `Remove ${countOf(starterExcess, 'conversation starter')} from $.conversation_starters in ${daPath}. Keep the starters for the most common tasks.`,
          `Count the entries in $.conversation_starters and confirm that there are ${SCHEMA_LIMITS.STARTERS_MAX_COUNT} or fewer.`,
          excessStarterNames.length > 0
            ? `Remove ${starterExcess === 1 ? 'the last starter' : `the last ${starterExcess} starters`}: ${quotedList(excessStarterNames)}. If ${starterExcess === 1 ? 'it is for a common task, remove a different starter' : 'they are for common tasks, remove different starters'}.`
            : undefined,
        )
      : '',
    guidanceUrl: DA_SCHEMA_URL,
  });

  const actionCount = manifest.actions.length;
  const actionExcess = actionCount - SCHEMA_LIMITS.ACTIONS_MAX_COUNT;
  const excessActionIds = actionExcess > 0
    ? manifest.actions.slice(-actionExcess).map((action) => trimmedText(asObject(action).id)).filter(Boolean)
    : [];
  addFinding(findings, {
    ruleId: 'DA-ACTIONS-COUNT',
    status: actionCount === 0
      ? 'N/A'
      : actionCount <= SCHEMA_LIMITS.ACTIONS_MAX_COUNT ? 'Pass' : 'Fail',
    severity: actionCount > SCHEMA_LIMITS.ACTIONS_MAX_COUNT ? 'High' : undefined,
    sourceFile: daPath,
    jsonPath: '$.actions',
    evidence: `${actionCount} action${actionCount === 1 ? '' : 's'}`,
    explanation: actionCount === 0
      ? 'Actions are optional and none are declared.'
      : actionCount <= SCHEMA_LIMITS.ACTIONS_MAX_COUNT
        ? `The package is within the ${SCHEMA_LIMITS.ACTIONS_MAX_COUNT}-action limit.`
        : `The package exceeds the ${SCHEMA_LIMITS.ACTIONS_MAX_COUNT}-action limit.`,
    recommendation: actionExcess > 0
      ? withVerification(
          `Remove ${countOf(actionExcess, 'action')} from $.actions in ${daPath}, or combine related operations into one plugin.`,
          `Count the entries in $.actions and confirm that there are ${SCHEMA_LIMITS.ACTIONS_MAX_COUNT} or fewer.`,
          excessActionIds.length > 0
            ? `Move the operations of ${quotedList(excessActionIds)} into a related plugin. Then remove ${actionExcess === 1 ? 'that action' : 'those actions'} from $.actions.`
            : undefined,
        )
      : '',
    guidanceUrl: DA_SCHEMA_URL,
  });

  for (const reference of evidence.references) {
    if (reference.kind === 'skill-definition') {
      continue;
    }
    if (reference.status === 'resolved') {
      continue;
    }
    if (
      reference.status === 'external' &&
      (reference.kind === 'openapi' || reference.kind === 'editorial-answers')
    ) {
      continue;
    }
    const referenceRuleId = reference.kind === 'plugin'
      ? 'DA-ACTION-REFERENCE'
      : reference.kind === 'localization'
        ? 'DA-LOCALIZATION-REFERENCE'
        : reference.kind === 'mcp-tools'
          ? 'DA-MCP-TOOL-DESCRIPTION-REFERENCE'
          : reference.kind === 'worker-agent'
            ? 'DA-WORKER-AGENT-REFERENCE'
            : 'DA-PACKAGE-REFERENCE';
    addFinding(findings, {
      ruleId: referenceRuleId,
      status: 'Fail',
      severity: 'High',
      sourceFile: reference.sourceFile,
      jsonPath: reference.jsonPath,
      evidence: reference.requestedPath || '(missing reference)',
      explanation: reference.error ?? 'The package reference could not be resolved.',
      recommendation: referenceRecommendation(reference),
      guidanceUrl: reference.kind === 'plugin' ? PLUGIN_SCHEMA_URL : DA_SCHEMA_URL,
    });
  }

  validateLocalization(findings, evidence);
  validateAdvancedManifestFields(findings, manifest, evidence);
  validatePlugins(findings, evidence);
  validateOpenApi(findings, evidence);
  const redact = createPackageCredentialRedactor(evidence);
  findings.push(...validateManifestContract(evidence));
  findings.push(...validatePluginContracts(evidence, redact));
  findings.push(...validatePackageContent(evidence));
  findings.push(...validateDACustomSkills(manifest, evidence, skillBundles));

  const hasFailure = findings.some((finding) => finding.status === 'Fail');
  const hasWarning = findings.some((finding) => finding.status === 'Warning');
  return {
    status: hasFailure ? 'invalid' : hasWarning ? 'valid-with-warnings' : 'valid',
    schemaVersion: manifest.schemaVersion,
    findings: sanitizePackageFindings(findings, evidence, redact),
  };
}
