import type { DAPackageEvidence, DAPackageFinding } from '../contracts/DAPackageReview';
import { PACKAGE_GUIDANCE_DOCS } from '../contracts/learnDocs';
import { asArray, asObject, trimmedText } from './jsonShape';
import { addPackageFinding } from './packageFindings';
import { withVerification } from './packageRemediation';

const GUIDANCE_URL = PACKAGE_GUIDANCE_DOCS.declarativeAgentManifest.url;

function dependencyProblems(
  value: unknown,
  path: string,
  capabilityNames: readonly string[],
): string[] {
  if (!Array.isArray(value)) return [`Make ${path} an array of dependency objects.`];
  const fixes: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const dependency = asObject(entry);
    const entryPath = `${path}[${index}]`;
    const name = trimmedText(dependency.name);
    const id = trimmedText(dependency.id);
    if (name !== 'capabilities') {
      fixes.push(`Set ${entryPath}.name to "capabilities".`);
    }
    if (!id) {
      fixes.push(`Add the name of a declared capability at ${entryPath}.id.`);
    } else if (!capabilityNames.includes(id)) {
      const correctCase = capabilityNames.find((candidate) => candidate.toLowerCase() === id.toLowerCase());
      fixes.push(correctCase
        ? `Change ${entryPath}.id from "${id}" to "${correctCase}"; capability names are case-sensitive.`
        : `Remove ${entryPath}, or declare the "${id}" capability that this starter needs.`);
    }
    const identity = JSON.stringify([name, id]);
    if (seen.has(identity)) fixes.push(`Remove the duplicate dependency at ${entryPath}.`);
    seen.add(identity);
  }
  return fixes;
}

/** Checks capability uniqueness and the dependencies of conversation starters. */
export function validateManifestContract(evidence: DAPackageEvidence): DAPackageFinding[] {
  const document = evidence.documents.find(
    (candidate) => candidate.kind === 'declarative-agent' && candidate.status === 'parsed',
  );
  if (!document) return [];
  const manifest = asObject(document.data);
  const findings: DAPackageFinding[] = [];
  const capabilities = asArray(manifest.capabilities);
  const names = capabilities.map((capability) => trimmedText(asObject(capability).name));

  if (capabilities.length > 0) {
    const duplicates = [...new Set(names.filter((name, index) => name && names.indexOf(name) !== index))];
    const locations = duplicates.map((name) => {
      const paths = names.flatMap((candidate, index) => candidate === name ? [`$.capabilities[${index}]`] : []);
      return `"${name}": ${paths.join(', ')}`;
    });
    addPackageFinding(findings, {
      ruleId: 'DA-CAPABILITIES-DUPLICATE',
      status: duplicates.length > 0 ? 'Fail' : 'Pass',
      severity: duplicates.length > 0 ? 'High' : undefined,
      sourceFile: document.path,
      jsonPath: '$.capabilities',
      evidence: locations.length > 0 ? locations.join('; ') : `${capabilities.length} capability entries`,
      explanation: duplicates.length > 0
        ? 'The manifest declares the same capability more than once.'
        : 'Each declared capability has a unique name.',
      recommendation: duplicates.length > 0
        ? withVerification(
            `In ${document.path}, merge the settings of these repeated capabilities into one entry for each name, then remove the extra entries: ${locations.join('; ')}.`,
            'Confirm that each capability name occurs once in $.capabilities.',
          )
        : '',
      guidanceUrl: GUIDANCE_URL,
    });
  }

  let dependencyCount = 0;
  const fixes: string[] = [];
  asArray(manifest.conversation_starters).forEach((value, index) => {
    const starter = asObject(value);
    if (starter.depends_on === undefined) return;
    dependencyCount += 1;
    fixes.push(...dependencyProblems(starter.depends_on, `$.conversation_starters[${index}].depends_on`, names));
  });
  if (dependencyCount > 0) {
    addPackageFinding(findings, {
      ruleId: 'DA-STARTER-DEPENDS-ON',
      status: fixes.length > 0 ? 'Warning' : 'Pass',
      severity: fixes.length > 0 ? 'Medium' : undefined,
      sourceFile: document.path,
      jsonPath: '$.conversation_starters',
      evidence: fixes.length > 0 ? fixes.join(' ') : `${dependencyCount} starters with declared dependencies`,
      explanation: fixes.length > 0
        ? 'One or more starter dependencies are invalid or do not identify a declared capability.'
        : 'The starter dependencies identify declared capabilities without duplicates.',
      recommendation: fixes.length > 0
        ? withVerification(
            `In ${document.path}: ${fixes.join(' ')}`,
            'Confirm that each depends_on value is an array with unique entries, each name is "capabilities", and each id exactly matches a declared capability name.',
          )
        : '',
      guidanceUrl: GUIDANCE_URL,
    });
  }
  return findings;
}
