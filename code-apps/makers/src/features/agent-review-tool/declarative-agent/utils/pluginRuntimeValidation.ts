import type { DAPackageFinding } from '../contracts/DAPackageReview';
import { PACKAGE_GUIDANCE_DOCS } from '../contracts/learnDocs';
import { asObject, trimmedText, type JsonObject } from './jsonShape';
import { addPackageFinding } from './packageFindings';
import { documentLabel, withVerification } from './packageRemediation';

const RUNTIME_TYPES = ['OpenApi', 'LocalPlugin', 'RemoteMCPServer'];
const AUTH_TYPES = ['None', 'OAuthPluginVault', 'ApiKeyPluginVault'];
const GUIDANCE_URL = PACKAGE_GUIDANCE_DOCS.apiPluginManifest.url;

function authTypeFix(type: string, runtimeType: string, path: string): string {
  const correctCase = AUTH_TYPES.find((candidate) => candidate.toLowerCase() === type.toLowerCase());
  if (correctCase) return `Change ${path} from "${type}" to "${correctCase}".`;
  if (!type) return `Add auth.type at ${path}. Use None, OAuthPluginVault, or ApiKeyPluginVault, as appropriate for the runtime.`;
  if (type === 'DynamicClientRegistration') {
    return runtimeType === 'RemoteMCPServer'
      ? `Replace "${type}" at ${path} with "OAuthPluginVault". Register the OAuth configuration with Agents Toolkit or Teams Developer Portal, and set auth.reference_id to the configuration ID.`
      : `"${type}" is not supported for API plugins. Set ${path} to "OAuthPluginVault" and use the registered OAuth configuration ID in auth.reference_id.`;
  }
  return `Replace "${type}" at ${path} with None, OAuthPluginVault, or ApiKeyPluginVault, as appropriate for the runtime.`;
}

/** Checks runtime and authentication types and vault references for one plugin runtime. */
export function validatePluginRuntime(
  findings: DAPackageFinding[],
  runtime: JsonObject,
  index: number,
  sourceFile: string,
): void {
  const runtimeType = typeof runtime.type === 'string' ? runtime.type : '';
  const path = `$.runtimes[${index}]`;
  const label = documentLabel(sourceFile);
  if (!RUNTIME_TYPES.includes(runtimeType)) {
    const correctCase = RUNTIME_TYPES.find((candidate) => candidate.toLowerCase() === runtimeType.toLowerCase());
    addPackageFinding(findings, {
      ruleId: 'DA-PLUGIN-RUNTIME-TYPE',
      status: 'Fail',
      severity: 'High',
      sourceFile,
      jsonPath: `${path}.type`,
      evidence: runtimeType || '(missing)',
      explanation: 'The plugin runtime does not declare a supported, case-sensitive type.',
      recommendation: withVerification(
        `In ${label}: ${correctCase
          ? `Change ${path}.type from "${runtimeType}" to "${correctCase}".`
          : runtimeType
            ? `Replace "${runtimeType}" at ${path}.type with OpenApi, LocalPlugin, or RemoteMCPServer.`
            : `Add "type" at ${path}. Use "OpenApi", "LocalPlugin", or "RemoteMCPServer".`}`,
        'Confirm that each runtime type exactly matches its supported schema value and that its spec has the required settings.',
      ),
      guidanceUrl: GUIDANCE_URL,
    });
    return;
  }

  const auth = asObject(runtime.auth);
  const authType = typeof auth.type === 'string' ? auth.type : '';
  if (!AUTH_TYPES.includes(authType)) {
    addPackageFinding(findings, {
      ruleId: 'DA-PLUGIN-AUTH-TYPE',
      status: 'Fail',
      severity: 'High',
      sourceFile,
      jsonPath: `${path}.auth.type`,
      evidence: authType || '(missing)',
      explanation: 'The runtime has an unsupported or missing authentication type.',
      recommendation: withVerification(
        `In ${label}: ${authTypeFix(authType, runtimeType, `${path}.auth.type`)}`,
        'Confirm that auth.type exactly matches a supported type for this runtime, then test sign-in in the target environment.',
      ),
      guidanceUrl: GUIDANCE_URL,
    });
    return;
  }
  if (runtimeType === 'RemoteMCPServer' && authType === 'ApiKeyPluginVault') {
    addPackageFinding(findings, {
      ruleId: 'DA-PLUGIN-AUTH-COMPATIBILITY',
      status: 'Fail',
      severity: 'High',
      sourceFile,
      jsonPath: `${path}.auth.type`,
      evidence: 'RemoteMCPServer with ApiKeyPluginVault',
      explanation: 'MCP plugins do not support ApiKeyPluginVault authentication.',
      recommendation: withVerification(
        `In ${label}, replace ApiKeyPluginVault at ${path}.auth.type with "OAuthPluginVault" and register the OAuth configuration. Use "None" only if the MCP server is intended to allow anonymous access.`,
        'Confirm that the MCP server supports the selected sign-in method and that Copilot can discover and call its tools.',
      ),
      guidanceUrl: GUIDANCE_URL,
    });
    return;
  }
  if (authType !== 'None' && !trimmedText(auth.reference_id)) {
    addPackageFinding(findings, {
      ruleId: 'DA-PLUGIN-AUTH-REFERENCE',
      status: 'Warning',
      severity: 'Medium',
      sourceFile,
      jsonPath: `${path}.auth.reference_id`,
      evidence: `${authType} without a configuration reference`,
      explanation: 'The vault authentication configuration has no reference_id.',
      recommendation: withVerification(
        `Register the ${authType === 'OAuthPluginVault' ? 'OAuth' : 'API key'} configuration with Agents Toolkit or Teams Developer Portal. Put the returned configuration ID at ${path}.auth.reference_id in ${label}; do not put the secret itself in this field.`,
        'Confirm that reference_id identifies the authentication configuration for the target environment, then test an authenticated action.',
      ),
      guidanceUrl: GUIDANCE_URL,
    });
  }
}
