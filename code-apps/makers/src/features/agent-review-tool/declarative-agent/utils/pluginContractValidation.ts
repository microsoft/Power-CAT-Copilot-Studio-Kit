import type { DAPackageEvidence, DAPackageFinding } from '../contracts/DAPackageReview';
import { PACKAGE_GUIDANCE_DOCS } from '../contracts/learnDocs';
import { asArray, asObject, isObject, trimmedText, type JsonObject } from './jsonShape';
import { createPackageCredentialRedactor } from './packageContentValidation';
import { addPackageFinding } from './packageFindings';
import { documentLabel, withVerification } from './packageRemediation';
import { readRuntimeFunctions, runtimeClaimsFunction, type RuntimeFunctions } from './pluginRuntimeFunctions';
import { validatePluginRuntime } from './pluginRuntimeValidation';

const GUIDANCE_URL = PACKAGE_GUIDANCE_DOCS.apiPluginManifest.url;
const FUNCTION_NAME = /^[A-Za-z0-9_]+$/;

function validateFunctions(
  findings: DAPackageFinding[], plugin: JsonObject, sourceFile: string, redact: (text: string) => string,
): void {
  const functions = asArray(plugin.functions).map(asObject);
  const fixes: string[] = [];
  const semantics: string[] = [];
  const seen = new Set<string>();
  functions.forEach((fn, index) => {
    const name = typeof fn.name === 'string' ? fn.name : '';
    const path = `$.functions[${index}]`;
    if (!FUNCTION_NAME.test(name)) {
      const suggested = redact(name) !== name
        ? 'function_name'
        : name.replace(/[^A-Za-z0-9_]/g, '_');
      fixes.push(name
        ? `Change ${path}.name from "${name}" to a valid unique name, such as "${suggested}".`
        : `Add a valid unique name at ${path}.name.`);
    } else if (seen.has(name)) {
      fixes.push(`Remove or rename the duplicate "${name}" at ${path}.name.`);
    }
    seen.add(name);
    const capabilities = asObject(fn.capabilities);
    if (capabilities.response_semantics !== undefined &&
      !trimmedText(asObject(capabilities.response_semantics).data_path)) {
      semantics.push(`${path}.capabilities.response_semantics.data_path`);
    }
  });
  if (fixes.length > 0) {
    addPackageFinding(findings, {
      ruleId: 'DA-PLUGIN-FUNCTION-NAME',
      status: 'Fail', severity: 'High', sourceFile, jsonPath: '$.functions',
      evidence: fixes.join(' '),
      explanation: 'One or more function names are missing, repeated, or contain characters that are not allowed.',
      recommendation: withVerification(
        `In ${documentLabel(sourceFile)}: ${fixes.join(' ')} Update the matching run_for_functions entries and the OpenAPI operationId or MCP tool name together.`,
        'Confirm that each function name is unique and contains only letters, digits, or underscores, and that all runtime references use the same name.',
      ),
      guidanceUrl: GUIDANCE_URL,
    });
  }
  if (semantics.length > 0) {
    addPackageFinding(findings, {
      ruleId: 'DA-PLUGIN-RESPONSE-SEMANTICS',
      status: 'Fail', severity: 'High', sourceFile, jsonPath: '$.functions',
      evidence: semantics.join(', '),
      explanation: 'A response_semantics object has no non-empty data_path.',
      recommendation: withVerification(
        `In ${documentLabel(sourceFile)}, set the JSONPath of the response data at ${semantics.join(', ')}. For a response with an items array, use "data_path": "$.items"; otherwise use the path of the actual response data.`,
        'Run each affected function with test data and confirm that data_path selects the results that the response template must render.',
      ),
      guidanceUrl: GUIDANCE_URL,
    });
  }
}

function validateOperationMatch(
  findings: DAPackageFinding[], plugin: JsonObject, runtime: JsonObject, index: number,
  resolved: RuntimeFunctions, sourceFile: string,
): boolean {
  if (runtime.type !== 'OpenApi') return false;
  const path = `$.runtimes[${index}]`;
  if (!resolved.complete) {
    addPackageFinding(findings, {
      ruleId: 'DA-PLUGIN-OPERATION-MATCH',
      status: 'Not assessed', sourceFile, jsonPath: path,
      evidence: resolved.source,
      explanation: resolved.reason ?? 'The OpenAPI operations could not be read from the package.',
      recommendation: 'Resolve the OpenAPI references and validate function names against the complete API description before release.',
      guidanceUrl: GUIDANCE_URL,
    });
    return false;
  }
  const names = asArray(plugin.functions).map((fn) => trimmedText(asObject(fn).name)).filter(Boolean);
  const explicitClaims = asArray(runtime.run_for_functions)
    .filter((value): value is string => typeof value === 'string' && !value.includes('*'));
  const bound = runtime.run_for_functions === undefined
    ? asArray(plugin.runtimes).length === 1 ? names : names.filter((name) => resolved.names.includes(name))
    : names.filter((name) => runtimeClaimsFunction(runtime, name, resolved.names));
  const missing = [...new Set([...bound, ...explicitClaims])].filter((name) => !resolved.names.includes(name));
  if (missing.length > 0) {
    const fixes = missing.map((name) => {
      const correctCase = resolved.names.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
      return correctCase
        ? `Change "${name}" to "${correctCase}" in functions and run_for_functions.`
        : `Remove "${name}" from this runtime, or add an API operation with exactly this operationId.`;
    });
    addPackageFinding(findings, {
      ruleId: 'DA-PLUGIN-OPERATION-MATCH',
      status: 'Fail', severity: 'High', sourceFile, jsonPath: path,
      evidence: `Unmatched functions: ${missing.join(', ')}; API description: ${resolved.source}`,
      explanation: 'One or more functions bound to an OpenAPI runtime have no matching operationId.',
      recommendation: withVerification(
        `In ${documentLabel(sourceFile)}: ${fixes.join(' ')} The operationIds in ${resolved.source} are: ${resolved.names.join(', ') || '(none)'}.`,
        'Confirm that each function bound to this runtime exactly matches an operationId in its API description.',
      ),
      guidanceUrl: GUIDANCE_URL,
    });
  }
  return true;
}

function validateRuntimeClaims(
  findings: DAPackageFinding[], plugin: JsonObject, runtimes: JsonObject[],
  resolved: RuntimeFunctions[], sourceFile: string,
): void {
  const names = new Set([
    ...asArray(plugin.functions).map((fn) => trimmedText(asObject(fn).name)),
    ...resolved.flatMap((runtime) => runtime.names),
    ...runtimes.flatMap((runtime) => asArray(runtime.run_for_functions)
      .filter((value): value is string => typeof value === 'string' && !value.includes('*'))),
  ].filter(Boolean));
  const duplicates: string[] = [];
  for (const name of names) {
    const owners = runtimes.flatMap((runtime, index) =>
      runtimeClaimsFunction(runtime, name, resolved[index].names) ? [`$.runtimes[${index}]`] : [],
    );
    if (owners.length > 1) duplicates.push(`"${name}": ${owners.join(', ')}`);
  }
  if (duplicates.length === 0) return;
  addPackageFinding(findings, {
    ruleId: 'DA-PLUGIN-RUNTIME-CLAIMS',
    status: 'Fail', severity: 'High', sourceFile, jsonPath: '$.runtimes',
    evidence: duplicates.join('; '),
    explanation: 'More than one runtime declares support for the same function.',
    recommendation: withVerification(
      `In ${documentLabel(sourceFile)}, keep one runtime for each of these functions: ${duplicates.join('; ')}. Change run_for_functions so that explicit names and wildcard selections do not overlap.`,
      'Confirm that each function is served by one runtime, including runtimes that omit run_for_functions or use wildcards.',
    ),
    guidanceUrl: GUIDANCE_URL,
  });
}

/** Checks plugin function contracts against their own runtime and package evidence. */
export function validatePluginContracts(
  evidence: DAPackageEvidence,
  redact: (text: string) => string = createPackageCredentialRedactor(evidence),
): DAPackageFinding[] {
  const findings: DAPackageFinding[] = [];
  for (const document of evidence.documents) {
    if (document.kind !== 'plugin' || document.status !== 'parsed' || !isObject(document.data)) continue;
    const plugin = document.data;
    const start = findings.length;
    validateFunctions(findings, plugin, document.path, redact);
    const runtimes = asArray(plugin.runtimes).map(asObject);
    const resolved = runtimes.map((runtime, index) =>
      readRuntimeFunctions(runtime, index, document.path, evidence),
    );
    let operationsAssessed = false;
    runtimes.forEach((runtime, index) => {
      validatePluginRuntime(findings, runtime, index, document.path);
      operationsAssessed = validateOperationMatch(
        findings, plugin, runtime, index, resolved[index], document.path,
      ) || operationsAssessed;
    });
    validateRuntimeClaims(findings, plugin, runtimes, resolved, document.path);
    const problems = findings.slice(start).some((finding) => finding.status === 'Fail' || finding.status === 'Warning');
    const allOpenApiAssessed = operationsAssessed &&
      runtimes.every((runtime, index) => runtime.type !== 'OpenApi' || resolved[index].complete);
    if (!problems) {
      addPackageFinding(findings, {
        ruleId: 'DA-PLUGIN-FUNCTIONS',
        status: 'Pass', sourceFile: document.path, jsonPath: '$.functions',
        evidence: `${asArray(plugin.functions).length} declared functions; ${runtimes.length} runtimes`,
        explanation: allOpenApiAssessed
          ? 'The static plugin contract checks passed, including exact operationId matches in packaged API descriptions.'
          : 'The available static function and runtime checks passed. This does not confirm remote operation matching or runtime behavior.',
        recommendation: '',
        guidanceUrl: GUIDANCE_URL,
      });
    }
  }
  return findings;
}
