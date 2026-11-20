import type { SkillBundle } from '../../agents-experience/contracts/SkillBundle';
import {
  parseFrontmatter,
  readString,
} from '../../skills-automations/services/artifactUtils';
import type { DAManifest } from '../contracts/DAManifest';
import type {
  DAPackageEvidence,
  DAPackageFinding,
  DAPackageReference,
} from '../contracts/DAPackageReview';
import { PACKAGE_GUIDANCE_DOCS } from '../contracts/learnDocs';

const CUSTOM_SKILLS_URL = PACKAGE_GUIDANCE_DOCS.agentSkills.url;

export const DA_CUSTOM_SKILL_LIMITS = {
  skills: 8,
  files: 350,
  directoryDepth: 3,
  instructionCharacters: 20_000,
  packageBytes: 10 * 1024 * 1024,
} as const;

const SUPPORTED_EXTENSIONS = new Set([
  'bash',
  'bmp',
  'cjs',
  'config',
  'csv',
  'doc',
  'docm',
  'docx',
  'gif',
  'htm',
  'html',
  'ini',
  'jpeg',
  'jpg',
  'js',
  'json',
  'log',
  'md',
  'mjs',
  'mts',
  'pdf',
  'png',
  'ppt',
  'ppsm',
  'pptx',
  'py',
  'rtf',
  'sh',
  'tif',
  'ts',
  'tsv',
  'txt',
  'utf8',
  'xls',
  'xlsm',
  'xlsx',
  'xml',
  'yaml',
  'yml',
]);

const SCRIPT_EXTENSIONS = new Set([
  'bash',
  'cjs',
  'js',
  'mjs',
  'mts',
  'py',
  'sh',
  'ts',
]);

const NETWORK_ASSUMPTION =
  /\b(?:fetch\s*\(|axios\.|requests\.|urllib\.|httpx\.|https?:\/\/|new\s+WebSocket\b)/i;
const INSTALL_ASSUMPTION =
  /\b(?:pip|pip3)\b[\s"',[\]]{1,24}\binstall\b|\bpython\s+-m\s+pip\s+install\b|\bnpm\s+(?:install|i)\b|\bpnpm\s+(?:add|install)\b|\byarn\s+add\b|\bapt-get\s+install\b|\bbrew\s+install\b/i;
const AUTH_ASSUMPTION =
  /\b(?:authorization|bearer|defaultazurecredential|clientsecretcredential|msal|oauth|api[_-]?key|access[_-]?token)\b/i;

function normalizedFolder(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function uniqueFolders(values: string[]): string[] {
  const byLowerPath = new Map<string, string>();
  for (const value of values.map(normalizedFolder).filter(Boolean)) {
    if (!byLowerPath.has(value.toLowerCase())) {
      byLowerPath.set(value.toLowerCase(), value);
    }
  }
  return [...byLowerPath.values()];
}

function skillReferences(evidence: DAPackageEvidence): DAPackageReference[] {
  return evidence.references.filter((reference) => reference.kind === 'skill-definition');
}

function declaredFolder(reference: DAPackageReference): string | undefined {
  return reference.normalizedPath
    ? normalizedFolder(reference.normalizedPath)
    : undefined;
}

function skillFiles(evidence: DAPackageEvidence) {
  return evidence.documents.filter(
    (document) =>
      document.kind === 'skill-definition' ||
      document.kind === 'skill-resource',
  );
}

function relativeSkillPath(path: string, folder: string): string | undefined {
  const normalizedPath = path.replace(/\\/g, '/');
  const prefix = `${normalizedFolder(folder)}/`;
  return normalizedPath.toLowerCase().startsWith(prefix.toLowerCase())
    ? normalizedPath.slice(prefix.length)
    : undefined;
}

function addFinding(
  findings: DAPackageFinding[],
  finding: Omit<DAPackageFinding, 'method' | 'guidanceUrl'>,
): void {
  findings.push({
    ...finding,
    method: 'deterministic',
    guidanceUrl: CUSTOM_SKILLS_URL,
  });
}

function validateRegistrations(
  findings: DAPackageFinding[],
  manifest: DAManifest,
  evidence: DAPackageEvidence,
): string[] {
  const references = skillReferences(evidence);
  const appReferences = references.filter((reference) =>
    reference.jsonPath.startsWith('$.agentSkills'));
  const agentReferences = references.filter((reference) =>
    reference.jsonPath.startsWith('$.agent_skills'));
  const appFolders = appReferences.map(declaredFolder).filter((folder): folder is string => Boolean(folder));
  const agentFolders = agentReferences.map(declaredFolder).filter((folder): folder is string => Boolean(folder));
  const folders = uniqueFolders([...appFolders, ...agentFolders]);
  const hasSkills = references.length > 0 || folders.length > 0;

  addFinding(findings, {
    ruleId: 'DA-SKILL-VERSION',
    status: !hasSkills || manifest.schemaVersion === 'v1.9' ? 'Pass' : 'Fail',
    severity: hasSkills && manifest.schemaVersion !== 'v1.9' ? 'High' : undefined,
    sourceFile: evidence.declarativeAgentPath ?? 'declarativeAgent.json',
    jsonPath: '$.version',
    evidence: manifest.schemaVersion || '(missing)',
    explanation: !hasSkills
      ? 'The package declares no custom skills.'
      : manifest.schemaVersion === 'v1.9'
        ? 'The custom-skill package uses declarative-agent manifest version v1.9.'
        : 'Custom skills require declarative-agent manifest version v1.9.',
    recommendation: hasSkills && manifest.schemaVersion !== 'v1.9'
      ? 'Set version to v1.9 before you publish custom skills.'
      : '',
  });

  // The Agents Toolkit always lists an agent skill in agent_skills. It adds the
  // folder to manifest.json agentSkills only to expose the skill to other
  // Copilot surfaces, so agentSkills is optional.
  const agentFolderKeys = new Set(uniqueFolders(agentFolders).map((folder) => folder.toLowerCase()));
  const uniqueAppFolders = uniqueFolders(appFolders);
  const appOnlyFolders = uniqueAppFolders.filter((folder) => !agentFolderKeys.has(folder.toLowerCase()));
  const exposedCount = uniqueAppFolders.length - appOnlyFolders.length;
  const registrationUnreadable = hasSkills && appFolders.length === 0 && agentFolders.length === 0;
  const registrationWarning = hasSkills && appOnlyFolders.length > 0;
  addFinding(findings, {
    ruleId: 'DA-SKILL-REGISTRATION',
    status: registrationUnreadable ? 'Not assessed' : registrationWarning ? 'Warning' : 'Pass',
    severity: registrationWarning ? 'Medium' : undefined,
    sourceFile: evidence.declarativeAgentPath ?? 'declarativeAgent.json',
    jsonPath: '$.agent_skills',
    evidence: !hasSkills
      ? 'No custom-skill registrations.'
      : registrationWarning
        ? `Only in manifest.json agentSkills: ${appOnlyFolders.join(', ')}`
        : `App: ${appFolders.join(', ') || '(none)'}; agent: ${agentFolders.join(', ') || '(none)'}`,
    explanation: !hasSkills
      ? 'The package declares no custom skills.'
      : registrationUnreadable
        ? 'No custom-skill folder path can be read, so the registration check cannot run. DA-SKILL-FOLDER reports the paths.'
        : registrationWarning
        ? 'manifest.json agentSkills lists custom-skill folders that agent_skills in the declarative-agent manifest does not list. The Agents Toolkit always lists an agent skill in agent_skills.'
        : exposedCount === 0
          ? 'The declarative-agent manifest registers the custom skills in agent_skills. manifest.json agentSkills is optional and only exposes skills to other Copilot surfaces.'
          : `The declarative-agent manifest registers every custom skill in agent_skills. manifest.json agentSkills also exposes ${exposedCount} of them to other Copilot surfaces.`,
    recommendation: registrationWarning
      ? `If this agent must use these skills, add each folder to agent_skills in ${evidence.declarativeAgentPath ?? 'declarativeAgent.json'}: ${appOnlyFolders.join(', ')}. If a skill is only for other Copilot surfaces, no change is necessary.`
      : '',
  });

  const unresolved = references.filter((reference) => reference.status !== 'resolved');
  addFinding(findings, {
    ruleId: 'DA-SKILL-FOLDER',
    status: unresolved.length === 0 ? 'Pass' : 'Fail',
    severity: unresolved.length > 0 ? 'High' : undefined,
    sourceFile: unresolved[0]?.sourceFile ?? evidence.rootManifestPath,
    jsonPath: unresolved[0]?.jsonPath ?? '$.agentSkills',
    evidence: unresolved.length === 0
      ? `${folders.length} registered folder${folders.length === 1 ? '' : 's'} resolved.`
      : unresolved.map((reference) => reference.requestedPath || '(missing)').join(', '),
    explanation: unresolved.length === 0
      ? 'Every registered custom-skill folder exists in the package.'
      : 'One or more registered custom-skill folders are missing or unsafe.',
    recommendation: unresolved.length > 0
      ? 'Use a package-local folder path and include that folder in the app package.'
      : '',
  });

  const overLimit = folders.length > DA_CUSTOM_SKILL_LIMITS.skills;
  addFinding(findings, {
    ruleId: 'DA-SKILL-COUNT',
    status: overLimit ? 'Fail' : 'Pass',
    severity: overLimit ? 'High' : undefined,
    sourceFile: evidence.rootManifestPath,
    jsonPath: '$.agentSkills',
    evidence: `${folders.length} custom skill${folders.length === 1 ? '' : 's'}`,
    explanation: overLimit
      ? `The package exceeds the ${DA_CUSTOM_SKILL_LIMITS.skills}-skill limit.`
      : `The package is within the ${DA_CUSTOM_SKILL_LIMITS.skills}-skill limit.`,
    recommendation: overLimit
      ? `Reduce the package to ${DA_CUSTOM_SKILL_LIMITS.skills} custom skills or fewer.`
      : '',
  });

  return folders;
}

function validateSkillEntries(
  findings: DAPackageFinding[],
  evidence: DAPackageEvidence,
  folders: string[],
): void {
  const documents = skillFiles(evidence);
  for (const folder of folders) {
    const definitions = documents.filter((document) =>
      document.kind === 'skill-definition' &&
      relativeSkillPath(document.path, folder)?.toLowerCase() === 'skill.md');
    const validCount = definitions.length === 1;
    addFinding(findings, {
      ruleId: 'DA-SKILL-ENTRY',
      status: validCount ? 'Pass' : 'Fail',
      severity: validCount ? undefined : 'High',
      sourceFile: definitions[0]?.path ?? folder,
      jsonPath: '$',
      evidence: `${definitions.length} root SKILL.md file${definitions.length === 1 ? '' : 's'}`,
      explanation: validCount
        ? `${folder} contains one root SKILL.md file.`
        : `${folder} must contain exactly one root SKILL.md file.`,
      recommendation: validCount
        ? ''
        : 'Add one SKILL.md at the registered folder root and remove case-variant duplicates.',
    });

    if (!validCount) continue;
    const definition = definitions[0];
    const markdown = definition.text ?? '';
    const frontmatter = parseFrontmatter(markdown);
    const name = readString(frontmatter.data, 'name');
    const description = readString(frontmatter.data, 'description');
    const validFrontmatter = frontmatter.present &&
      !frontmatter.parseError &&
      Boolean(name) &&
      Boolean(description);
    addFinding(findings, {
      ruleId: 'DA-SKILL-FRONTMATTER',
      status: validFrontmatter ? 'Pass' : 'Fail',
      severity: validFrontmatter ? undefined : 'High',
      sourceFile: definition.path,
      jsonPath: '$',
      evidence: frontmatter.parseError
        ? `Invalid YAML: ${frontmatter.parseError}`
        : `name: ${name ?? '(missing)'}; description: ${description ? 'present' : '(missing)'}`,
      explanation: validFrontmatter
        ? 'SKILL.md has valid YAML frontmatter with name and description.'
        : 'SKILL.md must have valid YAML frontmatter with string name and description values.',
      recommendation: validFrontmatter
        ? ''
        : 'Add a valid YAML frontmatter block with string name and description values.',
    });

    const folderName = folder.split('/').pop() ?? '';
    const nameMatches = Boolean(name) && name === folderName;
    addFinding(findings, {
      ruleId: 'DA-SKILL-NAME',
      status: nameMatches ? 'Pass' : 'Fail',
      severity: nameMatches ? undefined : 'High',
      sourceFile: definition.path,
      jsonPath: '$.name',
      evidence: `Folder: ${folderName}; name: ${name ?? '(missing)'}`,
      explanation: nameMatches
        ? 'The frontmatter name matches the registered folder name.'
        : 'The frontmatter name does not match the registered folder name.',
      recommendation: nameMatches
        ? ''
        : `Set the frontmatter name to "${folderName}".`,
    });
  }
}

function validateLimitsAndFileTypes(
  findings: DAPackageFinding[],
  evidence: DAPackageEvidence,
  bundles: readonly SkillBundle[],
  folders: string[],
): void {
  const documents = skillFiles(evidence);
  const fileCountExceeded = documents.length > DA_CUSTOM_SKILL_LIMITS.files;
  addFinding(findings, {
    ruleId: 'DA-SKILL-FILE-COUNT',
    status: fileCountExceeded ? 'Fail' : 'Pass',
    severity: fileCountExceeded ? 'High' : undefined,
    sourceFile: evidence.rootManifestPath,
    jsonPath: '$.agentSkills',
    evidence: `${documents.length} custom-skill file${documents.length === 1 ? '' : 's'}`,
    explanation: fileCountExceeded
      ? `The custom skills exceed the ${DA_CUSTOM_SKILL_LIMITS.files}-file package limit.`
      : `The custom skills are within the ${DA_CUSTOM_SKILL_LIMITS.files}-file package limit.`,
    recommendation: fileCountExceeded
      ? `Reduce all custom-skill folders to ${DA_CUSTOM_SKILL_LIMITS.files} files or fewer.`
      : '',
  });

  const packageSize = evidence.packageSizeBytes ?? 0;
  const packageSizeExceeded = packageSize > DA_CUSTOM_SKILL_LIMITS.packageBytes;
  addFinding(findings, {
    ruleId: 'DA-SKILL-PACKAGE-SIZE',
    status: packageSizeExceeded ? 'Fail' : 'Pass',
    severity: packageSizeExceeded ? 'High' : undefined,
    sourceFile: evidence.rootManifestPath,
    jsonPath: '$',
    evidence: `${packageSize.toLocaleString()} bytes`,
    explanation: packageSizeExceeded
      ? 'The complete app package exceeds the 10 MB limit.'
      : 'The complete app package is within the 10 MB limit.',
    recommendation: packageSizeExceeded
      ? 'Remove or reduce package content until the complete app package is 10 MB or smaller.'
      : '',
  });

  for (const [index, bundle] of bundles.entries()) {
    const tooLong = bundle.skillMarkdown.length >= DA_CUSTOM_SKILL_LIMITS.instructionCharacters;
    const definition = documents.find((document) => {
      if (document.kind !== 'skill-definition' || !document.text) return false;
      const name = readString(parseFrontmatter(document.text).data, 'name');
      return name === bundle.skillSchemaName;
    });
    addFinding(findings, {
      ruleId: 'DA-SKILL-INSTRUCTION-LENGTH',
      status: tooLong ? 'Fail' : 'Pass',
      severity: tooLong ? 'High' : undefined,
      sourceFile: definition?.path
        ?? `${folders[index] ?? bundle.skillSchemaName}/SKILL.md`,
      jsonPath: '$',
      evidence: `${bundle.skillMarkdown.length.toLocaleString()} characters`,
      explanation: tooLong
        ? 'SKILL.md must contain fewer than 20,000 characters.'
        : 'SKILL.md is within the instruction-length limit.',
      recommendation: tooLong
        ? 'Move reference detail to supporting files and keep SKILL.md under 20,000 characters.'
        : '',
    });
  }

  const deepFiles: string[] = [];
  const unsupportedFiles: string[] = [];
  for (const document of documents) {
    const folder = folders.find((candidate) =>
      relativeSkillPath(document.path, candidate) !== undefined);
    if (!folder) continue;
    const relative = relativeSkillPath(document.path, folder) ?? document.path;
    const directoryDepth = Math.max(0, relative.split('/').length - 1);
    if (directoryDepth > DA_CUSTOM_SKILL_LIMITS.directoryDepth) {
      deepFiles.push(document.path);
    }
    if (!SUPPORTED_EXTENSIONS.has(extensionOf(relative))) {
      unsupportedFiles.push(document.path);
    }
  }

  addFinding(findings, {
    ruleId: 'DA-SKILL-DEPTH',
    status: deepFiles.length === 0 ? 'Pass' : 'Fail',
    severity: deepFiles.length > 0 ? 'High' : undefined,
    sourceFile: deepFiles[0] ?? evidence.rootManifestPath,
    jsonPath: '$',
    evidence: deepFiles.length === 0
      ? 'All custom-skill files are within three directory levels.'
      : deepFiles.join(', '),
    explanation: deepFiles.length === 0
      ? 'Custom-skill directory depth is supported.'
      : 'One or more custom-skill files exceed three directory levels.',
    recommendation: deepFiles.length > 0
      ? 'Move the listed files to a folder no more than three levels below the skill root.'
      : '',
  });
  addFinding(findings, {
    ruleId: 'DA-SKILL-FILE-TYPE',
    status: unsupportedFiles.length === 0 ? 'Pass' : 'Fail',
    severity: unsupportedFiles.length > 0 ? 'High' : undefined,
    sourceFile: unsupportedFiles[0] ?? evidence.rootManifestPath,
    jsonPath: '$',
    evidence: unsupportedFiles.length === 0
      ? 'All custom-skill files use supported file types.'
      : unsupportedFiles.join(', '),
    explanation: unsupportedFiles.length === 0
      ? 'Custom-skill file types are supported.'
      : 'One or more custom-skill files use unsupported file types.',
    recommendation: unsupportedFiles.length > 0
      ? 'Remove or convert the listed files to supported document, data, image, or script types.'
      : '',
  });
}

function validateCompatibilityAndSandbox(
  findings: DAPackageFinding[],
  manifest: DAManifest,
  evidence: DAPackageEvidence,
  bundles: readonly SkillBundle[],
): void {
  const hasSkills = skillReferences(evidence).length > 0;
  const hasEmbeddedKnowledge = manifest.capabilities.some((capability) =>
    capability.name.replace(/[\s_-]/g, '').toLowerCase().includes('embeddedknowledge'));
  const incompatible = hasSkills && hasEmbeddedKnowledge;
  addFinding(findings, {
    ruleId: 'DA-SKILL-KNOWLEDGE-COMPAT',
    status: incompatible ? 'Fail' : hasSkills ? 'Pass' : 'N/A',
    severity: incompatible ? 'High' : undefined,
    sourceFile: evidence.declarativeAgentPath ?? 'declarativeAgent.json',
    jsonPath: '$.capabilities',
    evidence: incompatible
      ? 'Custom skills and Embedded Knowledge are both declared.'
      : hasSkills
        ? 'Embedded Knowledge is not declared.'
        : 'No custom skills are declared.',
    explanation: incompatible
      ? 'Custom skills and Embedded Knowledge cannot currently be combined.'
      : hasSkills
        ? 'The package does not combine custom skills with Embedded Knowledge.'
        : 'The compatibility rule does not apply.',
    recommendation: incompatible
      ? 'Remove Embedded Knowledge or custom skills from this agent.'
      : '',
  });

  for (const bundle of bundles) {
    for (const resource of bundle.resources) {
      if (!SCRIPT_EXTENSIONS.has(resource.extension) || !resource.textContent) continue;
      const checks = [
        {
          ruleId: 'DA-SKILL-NETWORK',
          pattern: NETWORK_ASSUMPTION,
          explanation: 'The script assumes runtime network access, which the custom-skill sandbox does not provide.',
          recommendation: 'Bundle the required data or use supported agent capabilities outside the script.',
        },
        {
          ruleId: 'DA-SKILL-INSTALL',
          pattern: INSTALL_ASSUMPTION,
          explanation: 'The script assumes runtime package installation, which the custom-skill sandbox does not provide.',
          recommendation: 'Remove runtime installation and use only supported built-in packages.',
        },
        {
          ruleId: 'DA-SKILL-AUTH',
          pattern: AUTH_ASSUMPTION,
          explanation: 'The script assumes an authenticated call, which custom-skill scripts cannot make.',
          recommendation: 'Move authenticated operations to a supported agent action or connector.',
        },
      ] as const;
      for (const check of checks) {
        if (!check.pattern.test(resource.textContent)) continue;
        addFinding(findings, {
          ruleId: check.ruleId,
          status: 'Fail',
          severity: 'High',
          sourceFile: resource.originalPath,
          jsonPath: '$',
          evidence: `Unsupported runtime assumption detected in ${resource.normalizedPath}.`,
          explanation: check.explanation,
          recommendation: check.recommendation,
        });
      }
    }
  }
}

/**
 * Validates Microsoft 365 custom-skill package registration, limits, and sandbox compatibility.
 */
export function validateDACustomSkills(
  manifest: DAManifest,
  evidence: DAPackageEvidence,
  bundles: readonly SkillBundle[],
): DAPackageFinding[] {
  const findings: DAPackageFinding[] = [];
  const folders = validateRegistrations(findings, manifest, evidence);
  validateSkillEntries(findings, evidence, folders);
  validateLimitsAndFileTypes(findings, evidence, bundles, folders);
  validateCompatibilityAndSandbox(findings, manifest, evidence, bundles);
  return findings;
}
