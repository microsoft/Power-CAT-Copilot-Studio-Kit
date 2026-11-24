import { load as parseYaml } from 'js-yaml';
import type { DAPackageEvidence } from '../contracts/DAPackageReview';
import { asArray, asObject, isObject, trimmedText, type JsonObject } from './jsonShape';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

export interface RuntimeFunctions {
  names: string[];
  complete: boolean;
  source: string;
  reason?: string;
}

function openApiFunctions(data: unknown, source: string): RuntimeFunctions {
  if (!isObject(data) || !isObject(data.paths)) {
    return { names: [], complete: false, source, reason: 'The OpenAPI description has no readable paths object.' };
  }
  const names = new Set<string>();
  let hasReferences = false;
  for (const value of Object.values(data.paths)) {
    const path = asObject(value);
    if (path.$ref !== undefined) hasReferences = true;
    for (const method of HTTP_METHODS) {
      const operation = asObject(path[method]);
      if (operation.$ref !== undefined) hasReferences = true;
      const name = trimmedText(operation.operationId);
      if (name) names.add(name);
    }
  }
  return {
    names: [...names].sort(),
    complete: !hasReferences,
    source,
    reason: hasReferences ? 'OpenAPI path or operation references were not resolved by this static check.' : undefined,
  };
}

/** Reads the functions described by a runtime without fetching remote files. */
export function readRuntimeFunctions(
  runtime: JsonObject,
  index: number,
  sourceFile: string,
  evidence: DAPackageEvidence,
): RuntimeFunctions {
  const spec = asObject(runtime.spec);
  if (runtime.type === 'OpenApi' && typeof spec.api_description === 'string') {
    const source = `${sourceFile}#$.runtimes[${index}].spec.api_description`;
    try {
      return openApiFunctions(parseYaml(spec.api_description), source);
    } catch (error) {
      return {
        names: [], complete: false, source,
        reason: `The inline OpenAPI description could not be parsed: ${error instanceof Error ? error.name : 'parse error'}.`,
      };
    }
  }
  const kind = runtime.type === 'OpenApi' ? 'openapi' : 'mcp-tools';
  const referencePath = runtime.type === 'OpenApi'
    ? `$.runtimes[${index}].spec.url`
    : `$.runtimes[${index}].spec.mcp_tool_description.file`;
  const reference = evidence.references.find(
    (candidate) => candidate.kind === kind &&
      candidate.sourceFile === sourceFile && candidate.jsonPath === referencePath,
  );
  const document = evidence.documents.find(
    (candidate) => candidate.kind === kind && candidate.path === reference?.normalizedPath &&
      candidate.status === 'parsed',
  );
  if (runtime.type === 'OpenApi') {
    return document
      ? openApiFunctions(document.data, document.path)
      : {
          names: [], complete: false, source: reference?.normalizedPath || trimmedText(spec.url) || sourceFile,
          reason: 'The OpenAPI description is not available as parsed package evidence.',
        };
  }
  if (runtime.type === 'RemoteMCPServer') {
    const description = asObject(spec.mcp_tool_description);
    const tools = document ? asObject(document.data).tools : description.tools;
    return {
      names: asArray(tools).map((tool) => trimmedText(asObject(tool).name)).filter(Boolean),
      complete: Array.isArray(tools),
      source: document?.path ?? sourceFile,
      reason: Array.isArray(tools) ? undefined : 'MCP tool names require a packaged description or live discovery.',
    };
  }
  return { names: [], complete: false, source: sourceFile };
}

/** Matches the wildcard syntax accepted by run_for_functions, with literal names otherwise. */
export function runtimeClaimsFunction(runtime: JsonObject, name: string, describedNames: readonly string[]): boolean {
  if (runtime.run_for_functions === undefined) return describedNames.includes(name);
  return asArray(runtime.run_for_functions).some((pattern) => {
    if (typeof pattern !== 'string') return false;
    const expression = pattern.split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`).test(name);
  });
}
