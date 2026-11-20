import { describe, expect, it } from 'vitest';
import type { DAPackageFinding, DAPackageValidation } from '../contracts/DAPackageReview';
import { parseDAZip } from '../utils/zipParser';
import { runDAPackageValidation } from '../utils/packageValidation';
import { makeDAPackage, type DAPackageOptions } from './daPackageFixture';

const NEW_RULES = [
  'DA-CAPABILITIES-DUPLICATE',
  'DA-STARTER-DEPENDS-ON',
  'DA-PLUGIN-FUNCTION-NAME',
  'DA-PLUGIN-RUNTIME-TYPE',
  'DA-PLUGIN-AUTH-TYPE',
  'DA-PLUGIN-AUTH-COMPATIBILITY',
  'DA-PLUGIN-AUTH-REFERENCE',
  'DA-PLUGIN-RUNTIME-CLAIMS',
  'DA-PLUGIN-OPERATION-MATCH',
  'DA-PLUGIN-RESPONSE-SEMANTICS',
  'DA-PLUGIN-FUNCTIONS',
  'DA-PACKAGE-PLACEHOLDER',
  'DA-PACKAGE-CREDENTIAL',
];

async function validate(options: DAPackageOptions = {}): Promise<DAPackageValidation> {
  const parsed = await parseDAZip(await makeDAPackage(options));
  const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);
  expectActionable(validation);
  return validation;
}

function isProblem(finding: DAPackageFinding): boolean {
  return finding.status === 'Fail' || finding.status === 'Warning';
}

/** Every new problem says what to change and how to confirm it; pass rows need no action. */
function expectActionable(validation: DAPackageValidation): void {
  for (const finding of validation.findings.filter((candidate) => NEW_RULES.includes(candidate.ruleId))) {
    if (isProblem(finding)) {
      expect(finding.recommendation, finding.ruleId).toMatch(/\S.* How to verify: \S/);
      expect(finding.method, finding.ruleId).toBe('deterministic');
    } else if (finding.status === 'Pass') {
      expect(finding.recommendation, finding.ruleId).toBe('');
    }
  }
}

function problemsFor(validation: DAPackageValidation, ruleId: string): DAPackageFinding[] {
  return validation.findings.filter((finding) => finding.ruleId === ruleId && isProblem(finding));
}

function findingFor(
  validation: DAPackageValidation,
  ruleId: string,
  predicate: (finding: DAPackageFinding) => boolean = () => true,
): DAPackageFinding {
  const finding = problemsFor(validation, ruleId).find(predicate);
  expect(finding, `${ruleId} should report a problem`).toBeDefined();
  return finding as DAPackageFinding;
}

function passFor(validation: DAPackageValidation, ruleId: string): DAPackageFinding {
  const finding = validation.findings.find(
    (candidate) => candidate.ruleId === ruleId && candidate.status === 'Pass',
  );
  expect(finding, `${ruleId} should pass`).toBeDefined();
  return finding as DAPackageFinding;
}

function hasRule(validation: DAPackageValidation, ruleId: string): boolean {
  return validation.findings.some((finding) => finding.ruleId === ruleId);
}

function ordersOpenApi(paths?: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    openapi: '3.0.1',
    info: { title: 'Contoso orders', version: '1.0.0' },
    servers: [{ url: 'https://api.contoso.invalid' }],
    paths: paths ?? {
      '/orders': {
        get: { operationId: 'listOrders', summary: 'List the open orders.' },
        post: {
          operationId: 'createOrder',
          summary: 'Create one order.',
          'x-openai-isConsequential': true,
        },
      },
    },
    ...extra,
  });
}

function ordersPlugin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 'v2.4',
    name_for_human: 'Contoso orders',
    description_for_human: 'Lists and creates Contoso orders.',
    functions: [
      {
        name: 'listOrders',
        description: 'List the open orders.',
        capabilities: { response_semantics: { data_path: '$.items' } },
      },
      { name: 'createOrder', description: 'Create one order.' },
    ],
    runtimes: [{
      type: 'OpenApi',
      auth: { type: 'None' },
      spec: { url: 'openapi.json' },
      run_for_functions: ['listOrders', 'createOrder'],
    }],
    ...overrides,
  };
}

function withOrdersPlugin(
  pluginOverrides: Record<string, unknown> = {},
  openApi = ordersOpenApi(),
): DAPackageOptions {
  return {
    agent: { actions: [{ id: 'orders', file: 'plugins/orders.json' }] },
    files: {
      'plugins/orders.json': JSON.stringify(ordersPlugin(pluginOverrides)),
      'plugins/openapi.json': openApi,
    },
  };
}

function mcpRuntime(functionNames: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'RemoteMCPServer',
    auth: { type: 'None' },
    spec: {
      url: 'https://mcp.contoso.invalid/mcp',
      mcp_tool_description: {
        tools: functionNames.map((name) => ({ name, description: `Synthetic ${name} tool.` })),
      },
    },
    run_for_functions: functionNames,
    ...extra,
  };
}

function openApiRuntime(functionNames: string[], auth: unknown): Record<string, unknown> {
  return {
    type: 'OpenApi',
    auth,
    spec: { url: 'openapi.json' },
    run_for_functions: functionNames,
  };
}

describe('declarative-agent manifest contract rules', () => {
  it('names each duplicated capability and the entries to merge', async () => {
    const validation = await validate({
      agent: {
        capabilities: [
          { name: 'WebSearch' },
          { name: 'CodeInterpreter' },
          { name: 'WebSearch', sites: [{ url: 'https://learn.contoso.invalid' }] },
        ],
      },
    });

    const duplicate = findingFor(validation, 'DA-CAPABILITIES-DUPLICATE');
    expect(duplicate).toMatchObject({
      status: 'Fail',
      severity: 'High',
      sourceFile: 'declarativeAgent.json',
      jsonPath: '$.capabilities',
    });
    expect(duplicate.recommendation).toContain('WebSearch');
    expect(duplicate.recommendation).toContain('$.capabilities[0]');
    expect(duplicate.recommendation).toContain('$.capabilities[2]');
    expect(duplicate.recommendation).not.toContain('CodeInterpreter');
    expect(duplicate.recommendation).not.toContain('$.capabilities[1]');
  });

  it('passes unique capabilities and adds no row when no capability is declared', async () => {
    const unique = await validate({
      agent: { capabilities: [{ name: 'WebSearch' }, { name: 'CodeInterpreter' }] },
    });
    passFor(unique, 'DA-CAPABILITIES-DUPLICATE');

    expect(hasRule(await validate(), 'DA-CAPABILITIES-DUPLICATE')).toBe(false);
  });

  it('lists each conversation-starter dependency that Copilot cannot meet', async () => {
    const validation = await validate({
      agent: {
        capabilities: [{ name: 'WebSearch' }, { name: 'CodeInterpreter' }],
        conversation_starters: [
          { text: 'Search the web', depends_on: [{ name: 'capabilities', id: 'WebSearch' }] },
          { text: 'Chart the data', depends_on: [{ name: 'capabilities', id: 'codeinterpreter' }] },
          { text: 'Draw a logo', depends_on: [{ name: 'capabilities', id: 'GraphicArt' }] },
          { text: 'Search again', depends_on: [{ name: 'capability', id: 'WebSearch' }] },
          { text: 'Not a list', depends_on: { name: 'capabilities', id: 'WebSearch' } },
          { text: 'Missing id', depends_on: [{ name: 'capabilities' }] },
          {
            text: 'Twice',
            depends_on: [
              { name: 'capabilities', id: 'WebSearch' },
              { name: 'capabilities', id: 'WebSearch' },
            ],
          },
        ],
      },
    });

    const dependsOn = findingFor(validation, 'DA-STARTER-DEPENDS-ON');
    expect(dependsOn).toMatchObject({ status: 'Warning', severity: 'Medium' });
    const text = dependsOn.recommendation;
    expect(text).toContain('$.conversation_starters[1].depends_on[0].id');
    expect(text).toContain('"CodeInterpreter"');
    expect(text).toContain('$.conversation_starters[2].depends_on[0]');
    expect(text).toContain('GraphicArt');
    expect(text).toContain('$.conversation_starters[3].depends_on[0].name');
    expect(text).toContain('"capabilities"');
    expect(text).toContain('$.conversation_starters[4].depends_on');
    expect(text).toContain('$.conversation_starters[5].depends_on[0].id');
    expect(text).toContain('$.conversation_starters[6].depends_on[1]');
    expect(text).not.toContain('$.conversation_starters[0]');
  });

  it('passes valid starter dependencies and adds no row without dependencies', async () => {
    const valid = await validate({
      agent: {
        capabilities: [{ name: 'WebSearch' }],
        conversation_starters: [{
          text: 'Search the web',
          depends_on: [{ name: 'capabilities', id: 'WebSearch' }],
        }],
      },
    });
    passFor(valid, 'DA-STARTER-DEPENDS-ON');

    const withoutDependencies = await validate({
      agent: { conversation_starters: [{ title: 'Orders', text: 'Show my orders' }] },
    });
    expect(hasRule(withoutDependencies, 'DA-STARTER-DEPENDS-ON')).toBe(false);
  });
});

describe('declarative-agent plugin contract rules', () => {
  it('adds no problem for a consistent API plugin and records one pass row for it', async () => {
    const validation = await validate(withOrdersPlugin());

    for (const ruleId of NEW_RULES) {
      expect(problemsFor(validation, ruleId), ruleId).toEqual([]);
    }
    const pass = passFor(validation, 'DA-PLUGIN-FUNCTIONS');
    expect(pass.sourceFile).toBe('plugins/orders.json');
    expect(pass.explanation).toContain('operationId');
    expect(validation.status).toBe('valid');
  });

  it('suggests a valid name for each function name that is not allowed', async () => {
    const validation = await validate(withOrdersPlugin({
      functions: [
        { name: 'list-orders', description: 'List the open orders.' },
        { name: 'createOrder', description: 'Create one order.' },
        { name: '', description: 'A function without a name.' },
      ],
      runtimes: [openApiRuntime(['createOrder'], { type: 'None' })],
    }));

    const names = findingFor(validation, 'DA-PLUGIN-FUNCTION-NAME');
    expect(names).toMatchObject({
      status: 'Fail',
      severity: 'High',
      sourceFile: 'plugins/orders.json',
      jsonPath: '$.functions',
    });
    expect(names.recommendation).toContain('$.functions[0].name');
    expect(names.recommendation).toContain('"list_orders"');
    expect(names.recommendation).toContain('$.functions[2].name');
    expect(names.recommendation).not.toContain('$.functions[1]');
    expect(names.recommendation).toContain('run_for_functions');
    expect(hasRule(validation, 'DA-PLUGIN-FUNCTIONS')).toBe(false);
  });

  it('gives the exact value for each runtime type that Copilot does not accept', async () => {
    const validation = await validate(withOrdersPlugin({
      runtimes: [
        { type: 'openapi', auth: { type: 'None' }, spec: { url: 'openapi.json' }, run_for_functions: ['listOrders'] },
        { auth: { type: 'None' }, spec: { url: 'openapi.json' }, run_for_functions: ['createOrder'] },
        { type: 'LocalServer', run_for_functions: [] },
      ],
    }));

    const runtimeTypes = problemsFor(validation, 'DA-PLUGIN-RUNTIME-TYPE');
    expect(runtimeTypes).toHaveLength(3);
    for (const finding of runtimeTypes) {
      expect(finding).toMatchObject({ status: 'Fail', severity: 'High' });
    }
    expect(findingFor(validation, 'DA-PLUGIN-RUNTIME-TYPE', (finding) => finding.jsonPath === '$.runtimes[0].type')
      .recommendation).toContain('from "openapi" to "OpenApi"');
    const missing = findingFor(validation, 'DA-PLUGIN-RUNTIME-TYPE', (finding) => finding.jsonPath === '$.runtimes[1].type');
    expect(missing.recommendation).toContain('Add "type"');
    expect(missing.recommendation).toContain('"RemoteMCPServer"');
    const unknown = findingFor(validation, 'DA-PLUGIN-RUNTIME-TYPE', (finding) => finding.jsonPath === '$.runtimes[2].type');
    expect(unknown.recommendation).toContain('"LocalServer"');
    expect(unknown.recommendation).toContain('OpenApi, LocalPlugin, or RemoteMCPServer');
  });

  it('explains each auth setting that the runtime does not support', async () => {
    const validation = await validate({
      agent: { actions: [{ id: 'mixed', file: 'plugins/mixed.json' }] },
      files: {
        'plugins/mixed.json': JSON.stringify({
          schema_version: 'v2.4',
          functions: ['get_weather', 'get_news', 'listOrders', 'createOrder', 'getStatus']
            .map((name) => ({ name })),
          runtimes: [
            mcpRuntime(['get_weather'], { auth: { type: 'DynamicClientRegistration' } }),
            mcpRuntime(['get_news'], { auth: { type: 'ApiKeyPluginVault', reference_id: 'contoso-key' } }),
            openApiRuntime(['listOrders'], { type: 'DynamicClientRegistration' }),
            openApiRuntime(['createOrder'], { type: 'oauthpluginvault', reference_id: 'contoso-oauth' }),
            openApiRuntime(['getStatus'], {}),
          ],
        }),
        'plugins/openapi.json': ordersOpenApi({
          '/orders': {
            get: { operationId: 'listOrders' },
            post: { operationId: 'createOrder', 'x-openai-isConsequential': true },
          },
          '/status': { get: { operationId: 'getStatus' } },
        }),
      },
    });

    const mcpDcr = findingFor(validation, 'DA-PLUGIN-AUTH-TYPE', (finding) => finding.jsonPath === '$.runtimes[0].auth.type');
    expect(mcpDcr).toMatchObject({ status: 'Fail', severity: 'High', sourceFile: 'plugins/mixed.json' });
    expect(mcpDcr.recommendation).toContain('"OAuthPluginVault"');
    expect(mcpDcr.recommendation).toContain('reference_id');
    expect(mcpDcr.recommendation).toContain('Agents Toolkit');

    const apiKeyOnMcp = findingFor(validation, 'DA-PLUGIN-AUTH-COMPATIBILITY');
    expect(apiKeyOnMcp).toMatchObject({ status: 'Fail', severity: 'High', jsonPath: '$.runtimes[1].auth.type' });
    expect(apiKeyOnMcp.recommendation).toContain('ApiKeyPluginVault');
    expect(apiKeyOnMcp.recommendation).toContain('OAuthPluginVault');

    expect(findingFor(validation, 'DA-PLUGIN-AUTH-TYPE', (finding) => finding.jsonPath === '$.runtimes[2].auth.type')
      .recommendation).toContain('not supported for API plugins');
    expect(findingFor(validation, 'DA-PLUGIN-AUTH-TYPE', (finding) => finding.jsonPath === '$.runtimes[3].auth.type')
      .recommendation).toContain('from "oauthpluginvault" to "OAuthPluginVault"');
    expect(findingFor(validation, 'DA-PLUGIN-AUTH-TYPE', (finding) => finding.jsonPath === '$.runtimes[4].auth.type')
      .recommendation).toContain('Add auth.type');
    expect(problemsFor(validation, 'DA-PLUGIN-AUTH-TYPE')).toHaveLength(4);
    expect(problemsFor(validation, 'DA-PLUGIN-AUTH-REFERENCE')).toEqual([]);
  });

  it('asks for the auth configuration ID when a vault auth type has none', async () => {
    const validation = await validate(withOrdersPlugin({
      runtimes: [openApiRuntime(['listOrders', 'createOrder'], { type: 'OAuthPluginVault', reference_id: '  ' })],
    }));

    const reference = findingFor(validation, 'DA-PLUGIN-AUTH-REFERENCE');
    expect(reference).toMatchObject({
      status: 'Warning',
      severity: 'Medium',
      jsonPath: '$.runtimes[0].auth.reference_id',
    });
    expect(reference.recommendation).toContain('Agents Toolkit');
    expect(reference.recommendation).toContain('Teams Developer Portal');
  });

  it('names a function that more than one runtime claims', async () => {
    const validation = await validate({
      agent: { actions: [{ id: 'news', file: 'plugins/news.json' }] },
      files: {
        'plugins/news.json': JSON.stringify({
          schema_version: 'v2.4',
          functions: [{ name: 'get_news' }, { name: 'get_weather' }],
          runtimes: [mcpRuntime(['get_news', 'get_weather']), mcpRuntime(['get_news'])],
        }),
      },
    });

    const claims = findingFor(validation, 'DA-PLUGIN-RUNTIME-CLAIMS');
    expect(claims).toMatchObject({ status: 'Fail', severity: 'High', sourceFile: 'plugins/news.json' });
    expect(claims.recommendation).toContain('get_news');
    expect(claims.recommendation).toContain('$.runtimes[0]');
    expect(claims.recommendation).toContain('$.runtimes[1]');
    expect(claims.recommendation).not.toContain('get_weather');
  });

  it('lists the operationIds when a function has no matching OpenAPI operation', async () => {
    const validation = await validate(withOrdersPlugin({
      functions: [{ name: 'listOrders' }, { name: 'createorder' }, { name: 'deleteOrder' }],
      runtimes: [openApiRuntime(['listOrders', 'createorder', 'deleteOrder'], { type: 'None' })],
    }));

    const operation = findingFor(validation, 'DA-PLUGIN-OPERATION-MATCH');
    expect(operation).toMatchObject({
      status: 'Fail',
      severity: 'High',
      sourceFile: 'plugins/orders.json',
      jsonPath: '$.runtimes[0]',
    });
    expect(operation.recommendation).toContain('"createorder"');
    expect(operation.recommendation).toContain('"createOrder"');
    expect(operation.recommendation).toContain('deleteOrder');
    expect(operation.recommendation).toContain('createOrder, listOrders');
    expect(operation.recommendation).toContain('plugins/openapi.json');
    expect(operation.recommendation).not.toContain('"listOrders" to');
  });

  it('does not guess operationIds when the OpenAPI paths use $ref', async () => {
    const validation = await validate(withOrdersPlugin({}, ordersOpenApi({
      '/orders': { $ref: '#/components/pathItems/orders' },
    })));

    expect(problemsFor(validation, 'DA-PLUGIN-OPERATION-MATCH')).toEqual([]);
    expect(validation.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-PLUGIN-OPERATION-MATCH',
      status: 'Not assessed',
      sourceFile: 'plugins/orders.json',
    }));
    expect(passFor(validation, 'DA-PLUGIN-FUNCTIONS').explanation).not.toContain('operationId');
  });

  it('lists each response_semantics object without a data_path', async () => {
    const validation = await validate(withOrdersPlugin({
      functions: [
        {
          name: 'listOrders',
          capabilities: { response_semantics: { static_template: { type: 'AdaptiveCard' } } },
        },
        { name: 'createOrder', capabilities: { response_semantics: { data_path: ' ' } } },
      ],
    }));

    const semantics = problemsFor(validation, 'DA-PLUGIN-RESPONSE-SEMANTICS');
    expect(semantics).toHaveLength(1);
    expect(semantics[0]).toMatchObject({ status: 'Fail', severity: 'High', jsonPath: '$.functions' });
    expect(semantics[0].recommendation).toContain('$.functions[0].capabilities.response_semantics.data_path');
    expect(semantics[0].recommendation).toContain('$.functions[1].capabilities.response_semantics.data_path');
    expect(semantics[0].recommendation).toContain('"$.items"');
  });

  it('names the inline plugin when an inline plugin has a problem', async () => {
    const validation = await validate({
      agent: {
        actions: [{
          id: 'inline-weather',
          plugin: {
            schema_version: 'v2.4',
            functions: [{ name: 'get weather' }],
            runtimes: [mcpRuntime(['get weather'])],
          },
        }],
      },
    });

    const name = findingFor(validation, 'DA-PLUGIN-FUNCTION-NAME');
    expect(name.sourceFile).toBe('declarativeAgent.json#$.actions[0].plugin');
    expect(name.recommendation).toContain('the inline plugin at $.actions[0].plugin in declarativeAgent.json');
    expect(name.recommendation).toContain('"get_weather"');
  });
});

describe('declarative-agent package content safety', () => {
  it('lists the Agents Toolkit placeholders that were not replaced', async () => {
    const validation = await validate({
      agent: {
        instructions: "$[file('instructions.txt')]",
        actions: [{ id: 'orders', file: 'plugins/orders.json' }],
      },
      files: {
        'plugins/orders.json': JSON.stringify(ordersPlugin({
          runtimes: [openApiRuntime(['listOrders', 'createOrder'], {
            type: 'OAuthPluginVault',
            reference_id: '${{CONTOSO_OAUTH_ID}}',
          })],
        })),
        'plugins/openapi.json': ordersOpenApi(),
      },
    });

    const placeholder = findingFor(validation, 'DA-PACKAGE-PLACEHOLDER');
    expect(placeholder).toMatchObject({ status: 'Warning', severity: 'High' });
    expect(placeholder.recommendation).toContain('$.instructions in declarativeAgent.json');
    expect(placeholder.recommendation).toContain("$[file('instructions.txt')]");
    expect(placeholder.recommendation).toContain('$.runtimes[0].auth.reference_id in plugins/orders.json');
    expect(placeholder.recommendation).toContain('${{CONTOSO_OAUTH_ID}}');
    expect(placeholder.recommendation).toContain('appPackage/build');
  });

  it('reports each credential type and location without the value', async () => {
    const accessKeyId = ['AKIA', 'IOSFODNN7', 'SYNTHAB'].join('');
    const webToken = [
      'eyJ', 'hbGciOiJIUzI1NiJ9', '.',
      'eyJzdWIiOiJzeW50aGV0aWMifQ', '.',
      'c2lnbmF0dXJlLXN5bnRoZXRpYw',
    ].join('');
    const highEntropy = ['Qz8', 'vR2', 'mK9', 'tX4', 'wL7', 'pB1', 'nF6'].join('');
    const validation = await validate({
      agent: { actions: [{ id: 'orders', file: 'plugins/orders.json' }] },
      files: {
        'plugins/orders.json': JSON.stringify(ordersPlugin({
          description_for_model: `Send the header Authorization: Bearer ${webToken} with each call.`,
        })),
        'plugins/openapi.json': ordersOpenApi(undefined, {
          info: {
            title: 'Contoso orders',
            version: '1.0.0',
            description: `Use the access key ${accessKeyId} for the sandbox.`,
          },
          'x-contoso-settings': { client_secret: highEntropy },
        }),
      },
    });

    const credentials = problemsFor(validation, 'DA-PACKAGE-CREDENTIAL');
    expect(credentials).toHaveLength(2);
    const known = credentials.find((finding) => finding.status === 'Fail') as DAPackageFinding;
    expect(known.severity).toBe('High');
    expect(known.recommendation).toContain('an AWS access key identifier');
    expect(known.recommendation).toContain('$.info.description in plugins/openapi.json');
    expect(known.recommendation).toContain('a JSON Web Token');
    expect(known.recommendation).toContain('$.description_for_model in plugins/orders.json');
    expect(known.recommendation).toContain('auth.reference_id');
    const entropyOnly = credentials.find((finding) => finding.status === 'Warning') as DAPackageFinding;
    expect(entropyOnly.severity).toBe('High');
    expect(entropyOnly.recommendation)
      .toContain("$['x-contoso-settings'].client_secret in plugins/openapi.json");
    expect(entropyOnly.recommendation).not.toContain('$.info.description');

    const serialized = JSON.stringify(validation.findings);
    for (const value of [accessKeyId, webToken, highEntropy]) {
      expect(serialized).not.toContain(value);
    }
  });

  it('keeps the base package valid and states what the safety checks covered', async () => {
    const validation = await validate();

    expect(validation.status).toBe('valid');
    expect(passFor(validation, 'DA-PACKAGE-PLACEHOLDER').explanation).toContain('Agents Toolkit');
    const credential = passFor(validation, 'DA-PACKAGE-CREDENTIAL');
    expect(credential.explanation).toMatch(/knowledge/i);
    expect(credential.explanation).toMatch(/skill/i);
  });
});
