import { describe, expect, it } from 'vitest';
import type { DAPackageEvidence } from '../contracts/DAPackageReview';
import { parseDAZip } from '../utils/zipParser';
import { runDAPackageValidation } from '../utils/packageValidation';
import { readRuntimeFunctions, runtimeClaimsFunction } from '../utils/pluginRuntimeFunctions';
import { validatePackageContent } from '../utils/packageContentValidation';
import { makeDAPackage } from './daPackageFixture';

function apiDocument(names: string[]): string {
  return JSON.stringify({
    openapi: '3.0.1',
    info: { title: 'Synthetic API', version: '1.0.0' },
    paths: Object.fromEntries(names.map((operationId) => [
      `/${operationId}`, { get: { operationId } },
    ])),
  });
}

function runtime(url: string, selections?: string[]): Record<string, unknown> {
  return {
    type: 'OpenApi',
    auth: { type: 'None' },
    spec: { url },
    ...(selections ? { run_for_functions: selections } : {}),
  };
}

async function validatePlugin(plugin: Record<string, unknown>, files: Record<string, string> = {}) {
  const parsed = await parseDAZip(await makeDAPackage({
    agent: { actions: [{ id: 'synthetic-api', file: 'plugins/api.json' }] },
    files: { 'plugins/api.json': JSON.stringify({ schema_version: 'v2.4', ...plugin }), ...files },
  }));
  return runDAPackageValidation(parsed.manifest, parsed.packageEvidence);
}

function emptyEvidence(): DAPackageEvidence {
  return {
    rootManifestPath: 'manifest.json',
    declarativeAgentPath: 'declarativeAgent.json',
    documents: [],
    references: [],
    records: [],
  };
}

describe('runtime contract boundaries', () => {
  it.each(['OpenApi', 'LocalPlugin', 'RemoteMCPServer'])(
    'reports the required auth object when it is missing from %s',
    async (type) => {
      const result = await validatePlugin({
        runtimes: [{ type, spec: { url: 'operations.json' } }],
      }, { 'plugins/operations.json': apiDocument(['get_orders']) });
      expect(result.findings).toContainEqual(expect.objectContaining({
        ruleId: 'DA-PLUGIN-AUTH-TYPE', status: 'Fail',
        jsonPath: '$.runtimes[0].auth.type',
        recommendation: expect.stringContaining('Add auth.type'),
      }));
    },
  );

  it('infers functions when the plugin omits functions and runtime selections', async () => {
    const result = await validatePlugin({
      runtimes: [runtime('operations.json')],
    }, { 'plugins/operations.json': apiDocument(['get_orders']) });

    expect(result.status).toBe('valid');
    expect(result.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-PLUGIN-FUNCTIONS', status: 'Pass',
      explanation: expect.stringContaining('operationId'),
    }));
  });

  it('checks each runtime against its own API document', async () => {
    const result = await validatePlugin({
      functions: [{ name: 'get_orders' }, { name: 'get_weather' }],
      runtimes: [runtime('orders.json', ['get_orders']), runtime('weather.json', ['get_weather'])],
    }, {
      'plugins/orders.json': apiDocument(['get_orders']),
      'plugins/weather.json': apiDocument(['get_weather']),
    });
    expect(result.status).toBe('valid');

    const mismatch = await validatePlugin({
      functions: [{ name: 'get_orders' }],
      runtimes: [runtime('orders.json', ['get_orders']), runtime('weather.json', ['get_orders'])],
    }, {
      'plugins/orders.json': apiDocument(['get_orders']),
      'plugins/weather.json': apiDocument(['get_weather']),
    });
    expect(mismatch.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-PLUGIN-OPERATION-MATCH', status: 'Fail', jsonPath: '$.runtimes[1]',
    }));
  });

  it('detects overlap between wildcard and implicit runtime selections', async () => {
    const result = await validatePlugin({
      runtimes: [runtime('operations.json', ['get_*']), runtime('operations.json')],
    }, { 'plugins/operations.json': apiDocument(['get_orders']) });
    expect(result.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-PLUGIN-RUNTIME-CLAIMS', status: 'Fail',
      recommendation: expect.stringContaining('get_orders'),
    }));
  });

  it('treats wildcard patterns as case-sensitive and escapes regex characters', () => {
    expect(runtimeClaimsFunction({ run_for_functions: ['get_*'] }, 'get_orders', [])).toBe(true);
    expect(runtimeClaimsFunction({ run_for_functions: ['get_*'] }, 'Get_orders', [])).toBe(false);
    expect(runtimeClaimsFunction({ run_for_functions: ['get.+'] }, 'get_orders', [])).toBe(false);
    expect(runtimeClaimsFunction({}, 'get_orders', ['get_orders'])).toBe(true);
    expect(runtimeClaimsFunction({}, 'get_weather', ['get_orders'])).toBe(false);
  });

  it('reads inline descriptions in preference to a referenced API document', async () => {
    const result = await validatePlugin({
      functions: [{ name: 'get_orders' }],
      runtimes: [{
        type: 'OpenApi', auth: { type: 'None' },
        spec: { api_description: apiDocument(['get_orders']), url: 'unused.json' },
      }],
    });
    expect(result.status).toBe('valid');
    expect(result.findings.filter((finding) =>
      finding.ruleId === 'DA-PLUGIN-OPERATION-MATCH' && finding.status === 'Fail',
    )).toEqual([]);
  });

  it.each(['missing.json', 'https://api.contoso.invalid/openapi.json'])(
    'does not invent operation matches for an unavailable description: %s',
    async (url) => {
      const result = await validatePlugin({
        functions: [{ name: 'get_orders' }], runtimes: [runtime(url, ['get_orders'])],
      });
      expect(result.findings).toContainEqual(expect.objectContaining({
        ruleId: 'DA-PLUGIN-OPERATION-MATCH', status: 'Not assessed',
      }));
      expect(result.findings.filter((finding) =>
        finding.ruleId === 'DA-PLUGIN-OPERATION-MATCH' && finding.status === 'Fail',
      )).toEqual([]);
    },
  );

  it('handles malformed and cyclic inline YAML without recursive traversal', () => {
    const evidence = emptyEvidence();
    const malformed = readRuntimeFunctions({
      type: 'OpenApi', spec: { api_description: 'paths: [' },
    }, 0, 'plugins/api.json', evidence);
    expect(malformed.complete).toBe(false);
    const cyclic = readRuntimeFunctions({
      type: 'OpenApi',
      spec: { api_description: 'openapi: 3.0.1\npaths:\n  /loop: &loop\n    get: *loop\n' },
    }, 0, 'plugins/api.json', evidence);
    expect(cyclic.names).toEqual([]);
    expect(cyclic.source).toContain('$.runtimes[0].spec.api_description');
    expect(readRuntimeFunctions({ type: 'OpenApi' }, 0, 'plugins/api.json', evidence).source)
      .toBe('plugins/api.json');
  });
});

describe('package credential boundaries', () => {
  it('does not copy a connection password into an invalid-name suggestion', async () => {
    const password = ['repeat', 'repeat', 'repeat'].join('-');
    const result = await validatePlugin({
      functions: [{ name: password }],
      runtimes: [runtime('operations.json', [password])],
      Password: password,
    }, { 'plugins/operations.json': apiDocument(['get_orders']) });

    const text = JSON.stringify(result.findings);
    expect(text).not.toContain(password);
    expect(text).not.toContain(password.replaceAll('-', '_'));
    expect(text).toContain('function_name');
    expect(result.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-PACKAGE-CREDENTIAL', status: 'Fail',
    }));
  });

  it('does not copy a detected credential into another finding or a suggested function name', async () => {
    const token = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJzeW50aGV0aWMifQ', 'c2lnbmF0dXJlLXN5bnRoZXRpYw'].join('.');
    const entropyOnly = ['Qz8', 'vR2', 'mK9', 'tX4', 'wL7', 'pB1', 'nF6'].join('');
    const result = await validatePlugin({
      functions: [{ name: token }, { name: entropyOnly }],
      runtimes: [runtime('operations.json', [token, entropyOnly])],
      client_secret: entropyOnly,
    }, { 'plugins/operations.json': apiDocument(['get_orders']) });

    const text = JSON.stringify(result.findings);
    expect(text).not.toContain(token);
    expect(text).not.toContain(token.replaceAll('.', '_'));
    expect(text).not.toContain(entropyOnly);
    expect(text).toContain('[REDACTED]');
    expect(result.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-PACKAGE-CREDENTIAL', status: 'Fail',
    }));
  });

  it('excludes knowledge and skill documents but scans configuration', () => {
    const evidence = emptyEvidence();
    const credential = ['AKIA', 'IOSFODNN7', 'SYNTHAB'].join('');
    const text = `${credential} and \${{SYNTHETIC_SETTING}}`;
    evidence.documents.push(
      { kind: 'knowledge', path: 'knowledge.txt', status: 'text', text },
      { kind: 'skill-definition', path: 'skills/SKILL.md', status: 'text', text },
      { kind: 'skill-resource', path: 'skills/config.json', status: 'parsed', data: { text } },
    );
    const excluded = validatePackageContent(evidence);
    expect(excluded.every((finding) => finding.status === 'Pass')).toBe(true);

    evidence.documents.push({
      kind: 'plugin', path: 'plugins/config.json', status: 'parsed', data: { description: text },
    });
    const included = validatePackageContent(evidence);
    expect(included).toContainEqual(expect.objectContaining({
      ruleId: 'DA-PACKAGE-CREDENTIAL', status: 'Fail', sourceFile: 'plugins/config.json',
    }));
    expect(included).toContainEqual(expect.objectContaining({
      ruleId: 'DA-PACKAGE-PLACEHOLDER', status: 'Warning',
    }));
  });
});
