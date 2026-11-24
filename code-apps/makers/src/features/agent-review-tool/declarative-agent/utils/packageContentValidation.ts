import {
  createCredentialRedactor,
  findCredentialMatches,
  type CredentialMatch,
} from '../../skills-automations/services/secretScanner';
import type { DAPackageDocumentKind, DAPackageEvidence, DAPackageFinding } from '../contracts/DAPackageReview';
import { PACKAGE_GUIDANCE_DOCS } from '../contracts/learnDocs';
import { visitJsonStrings } from './jsonShape';
import { addPackageFinding } from './packageFindings';
import { withVerification } from './packageRemediation';

const SCANNED_KINDS = new Set<DAPackageDocumentKind>([
  'app-manifest', 'declarative-agent', 'plugin', 'openapi', 'mcp-tools',
  'instructions', 'localization', 'editorial-answers', 'worker-agent',
]);
const TOOLKIT_PLACEHOLDER = /\$\{\{[^{}\r\n]+\}\}|\$\[file\((?:'[^'\r\n]+'|"[^"\r\n]+")\)\]/g;

interface LocatedCredential {
  sourceFile: string;
  jsonPath: string;
  match: CredentialMatch;
}

interface PackageString {
  text: string;
  sourceFile: string;
  jsonPath: string;
  key?: string;
}

function packageStrings(evidence: DAPackageEvidence): { strings: PackageString[]; documentCount: number } {
  const strings: PackageString[] = [];
  const documents = evidence.documents.filter(
    (document) => SCANNED_KINDS.has(document.kind) &&
      (document.status === 'parsed' || document.status === 'text'),
  );
  for (const document of documents) {
    const scan = (text: string, path: string, key?: string): void => {
      strings.push({ text, sourceFile: document.path, jsonPath: path, key });
    };
    if (document.status === 'parsed') visitJsonStrings(document.data, scan);
    else if (document.text !== undefined) scan(document.text, '$');
  }
  return { strings, documentCount: documents.length };
}

/** Builds one credential redactor for package contract checks and their output. */
export function createPackageCredentialRedactor(
  evidence: DAPackageEvidence,
): (text: string) => string {
  const { strings } = packageStrings(evidence);
  return createCredentialRedactor(strings.flatMap(
    ({ text, key }) => key ? [text, `${key}=${text}`] : [text],
  ));
}

/** Removes detected credential values from all package findings, not only credential rows. */
export function sanitizePackageFindings(
  findings: DAPackageFinding[],
  evidence: DAPackageEvidence,
  redact: (text: string) => string = createPackageCredentialRedactor(evidence),
): DAPackageFinding[] {
  const redactOptional = (text: string | undefined) => text === undefined ? undefined : redact(text);
  return findings.map((finding) => ({
    ...finding,
    sourceFile: redactOptional(finding.sourceFile),
    jsonPath: redactOptional(finding.jsonPath),
    evidence: redactOptional(finding.evidence),
    explanation: redact(finding.explanation),
    recommendation: redact(finding.recommendation),
  }));
}

/** Scans package configuration and instructions, but not knowledge or skill files. */
export function validatePackageContent(evidence: DAPackageEvidence): DAPackageFinding[] {
  const findings: DAPackageFinding[] = [];
  const placeholders: string[] = [];
  const credentials: LocatedCredential[] = [];
  const { strings, documentCount } = packageStrings(evidence);
  for (const { text, sourceFile, jsonPath, key } of strings) {
    for (const placeholder of new Set(text.match(TOOLKIT_PLACEHOLDER) ?? [])) {
      placeholders.push(`${jsonPath} in ${sourceFile}: ${placeholder}`);
    }
    const matches = findCredentialMatches(text);
    const fieldMatches = key && matches.length === 0
      ? findCredentialMatches(`${key}=${text}`)
      : matches;
    for (const match of fieldMatches) credentials.push({ sourceFile, jsonPath, match });
  }
  const sourceFile = evidence.declarativeAgentPath ?? evidence.rootManifestPath;
  addPackageFinding(findings, {
    ruleId: 'DA-PACKAGE-PLACEHOLDER',
    status: placeholders.length > 0 ? 'Warning' : 'Pass',
    severity: placeholders.length > 0 ? 'High' : undefined,
    sourceFile,
    jsonPath: '$',
    evidence: placeholders.length > 0 ? placeholders.join('; ') : `${documentCount} parsed configuration and instruction files`,
    explanation: placeholders.length > 0
      ? 'The package contains Agents Toolkit values that were not resolved during the build.'
      : 'No unresolved Agents Toolkit placeholders were found in the parsed configuration and instruction files.',
    recommendation: placeholders.length > 0
      ? withVerification(
          `Build the app package with Agents Toolkit, then upload the compiled ZIP from appPackage/build rather than the source files. Resolve these values: ${placeholders.join('; ')}.`,
          'Open the built ZIP and confirm that each listed value is resolved. For file placeholders, confirm that the referenced file content is included.',
        )
      : '',
    guidanceUrl: PACKAGE_GUIDANCE_DOCS.declarativeAgentManifest.url,
  });

  for (const entropyOnly of [false, true]) {
    const matches = credentials.filter((credential) => credential.match.entropyOnly === entropyOnly);
    if (matches.length === 0) continue;
    const locations = matches.map(
      (credential) => `${credential.match.label} at ${credential.jsonPath} in ${credential.sourceFile}`,
    );
    addPackageFinding(findings, {
      ruleId: 'DA-PACKAGE-CREDENTIAL',
      status: entropyOnly ? 'Warning' : 'Fail',
      severity: 'High',
      sourceFile: matches[0].sourceFile,
      jsonPath: matches[0].jsonPath,
      evidence: locations.join('; '),
      explanation: entropyOnly
        ? 'A credential-named field has a possible secret. The entropy check alone does not confirm that it is a credential.'
        : 'The package configuration or instructions contain values that match credential patterns. The values are not shown.',
      recommendation: withVerification(
        `${entropyOnly ? 'Check whether these values are credentials; if they are, remove and rotate them' : 'Remove these credentials and rotate or revoke them'}: ${locations.join('; ')}. Configure plugin authentication with the appropriate vault and auth.reference_id rather than a password or key in the package.`,
        'Inspect each listed location in the built package, confirm that no credential value remains, and test the configured authentication in the target environment.',
      ),
      guidanceUrl: PACKAGE_GUIDANCE_DOCS.apiPluginManifest.url,
    });
  }
  if (credentials.length === 0) {
    addPackageFinding(findings, {
      ruleId: 'DA-PACKAGE-CREDENTIAL',
      status: 'Pass',
      sourceFile,
      jsonPath: '$',
      evidence: `${documentCount} parsed configuration and instruction files`,
      explanation: 'No credential pattern was found in the parsed configuration and instruction files. Knowledge and skill files were not scanned by this check; this is not a complete security assessment.',
      recommendation: '',
      guidanceUrl: PACKAGE_GUIDANCE_DOCS.apiPluginManifest.url,
    });
  }
  return findings;
}
