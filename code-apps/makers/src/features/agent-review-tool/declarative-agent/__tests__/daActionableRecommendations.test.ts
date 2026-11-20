import { describe, expect, it } from 'vitest';
import type { DAPackageFinding, DAPackageValidation } from '../contracts/DAPackageReview';
import { parseDAZip } from '../utils/zipParser';
import { runDAPackageValidation } from '../utils/packageValidation';
import { splitRecommendation, withVerification } from '../utils/packageRemediation';
import { makeDAPackage, type DAPackageOptions } from './daPackageFixture';

async function validate(options: DAPackageOptions = {}): Promise<DAPackageValidation> {
  const parsed = await parseDAZip(await makeDAPackage(options));
  return runDAPackageValidation(parsed.manifest, parsed.packageEvidence);
}

function findingFor(
  validation: DAPackageValidation,
  ruleId: string,
  predicate: (finding: DAPackageFinding) => boolean = () => true,
): DAPackageFinding {
  const finding = validation.findings.find(
    (candidate) =>
      candidate.ruleId === ruleId &&
      (candidate.status === 'Fail' || candidate.status === 'Warning') &&
      predicate(candidate),
  );
  expect(finding, `${ruleId} should report a problem`).toBeDefined();
  return finding as DAPackageFinding;
}

const mcpPlugin = (mcpToolDescription?: Record<string, unknown>) => JSON.stringify({
  schema_version: 'v2.4',
  functions: [{ name: 'get_weather' }],
  runtimes: [{
    type: 'RemoteMCPServer',
    run_for_functions: ['get_weather'],
    spec: {
      url: 'https://example.invalid/mcp',
      ...(mcpToolDescription ? { mcp_tool_description: mcpToolDescription } : {}),
    },
  }],
});

describe('actionable declarative-agent package recommendations', () => {
  it('gives every failed or warned check a fix and a verification step', async () => {
    const validation = await validate({
      agent: {
        version: 'v1.6',
        name: 'n'.repeat(103),
        conversation_starters: Array.from({ length: 13 }, (_, index) => ({
          title: `Starter ${index}`,
          text: `Do task ${index}`,
        })),
        actions: [
          { id: 'missing-plugin', file: 'plugins/missing.json' },
          { id: 'broken-plugin', file: 'plugins/broken.json' },
          { id: 'http-plugin', file: 'plugins/http.json' },
        ],
        capabilities: [{ name: 'EmbeddedKnowledge', files: [] }],
        user_overrides: [{ path: '', allowed_actions: ['add'] }],
        worker_agents: [{ id: 'worker-1', file: 'workers/worker.json' }],
      },
      files: {
        'plugins/broken.json': '{ invalid JSON',
        'plugins/http.json': JSON.stringify({
          schema_version: 'v2.3',
          runtimes: [{
            type: 'RemoteMCPServer',
            spec: { url: 'http://example.invalid/mcp' },
          }],
        }),
        'workers/worker.json': JSON.stringify({ id: 'worker-1' }),
      },
    });

    const problems = validation.findings.filter(
      (finding) => finding.status === 'Fail' || finding.status === 'Warning',
    );
    expect(problems.length).toBeGreaterThanOrEqual(10);
    for (const finding of problems) {
      expect(finding.recommendation, finding.ruleId).toMatch(/\S.* How to verify: \S/);
    }
    for (const finding of validation.findings.filter((candidate) => candidate.status === 'Pass')) {
      expect(finding.recommendation, finding.ruleId).toBe('');
    }
  });

  it('states how many characters to remove and keeps behavior rules in the instructions', async () => {
    const validation = await validate({
      agent: {
        name: 'n'.repeat(103),
        instructions: 'i'.repeat(8005),
      },
    });

    const name = findingFor(validation, 'DA-NAME-LENGTH');
    expect(name.recommendation).toContain('Remove at least 3 characters from agent name');
    expect(name.recommendation).toContain('$.name in declarativeAgent.json');
    expect(name.status).toBe('Fail');
    expect(name.severity).toBe('High');

    const instructions = findingFor(validation, 'DA-INSTRUCTIONS-LENGTH');
    expect(instructions.recommendation).toContain('Remove at least 5 characters');
    expect(instructions.recommendation).toContain('Keep behavior rules in the instructions');
    expect(instructions.recommendation).toContain('How to verify:');
  });

  it('names the instructions file when the instructions are loaded from a file', async () => {
    const validation = await validate({
      agent: { instructions: { file: 'prompts/instructions.md' } },
      files: { 'prompts/instructions.md': 'i'.repeat(8002) },
    });

    const instructions = findingFor(validation, 'DA-INSTRUCTIONS-LENGTH');
    expect(instructions.recommendation).toContain('prompts/instructions.md');
    expect(instructions.sourceFile).toBe('declarativeAgent.json');
  });

  it('gives the current and the target manifest versions', async () => {
    const agentVersion = findingFor(await validate({ agent: { version: 'v1.6' } }), 'DA-VERSION-SUPPORTED');
    expect(agentVersion.recommendation).toContain('from "v1.6" to "v1.8"');

    const pluginVersion = findingFor(await validate({
      agent: { actions: [{ id: 'old-plugin', file: 'plugins/old.json' }] },
      files: { 'plugins/old.json': JSON.stringify({ schema_version: 'v2.2', runtimes: [] }) },
    }), 'DA-PLUGIN-VERSION');
    expect(pluginVersion.recommendation).toContain('from "v2.2" to "v2.4"');
    expect(pluginVersion.recommendation).toContain('plugins/old.json');
  });

  it('states how many starters and actions to remove', async () => {
    const validation = await validate({
      agent: {
        conversation_starters: Array.from({ length: 13 }, (_, index) => ({
          title: `Starter ${index}`,
          text: `Do task ${index}`,
        })),
        actions: Array.from({ length: 12 }, (_, index) => ({
          id: `inline-${index}`,
          plugin: { schema_version: 'v2.4', runtimes: [] },
        })),
      },
    });

    expect(findingFor(validation, 'DA-STARTERS-COUNT').recommendation)
      .toContain('Remove 1 conversation starter');
    expect(findingFor(validation, 'DA-ACTIONS-COUNT').recommendation)
      .toContain('Remove 2 actions');
    expect(findingFor(validation, 'DA-ACTIONS-COUNT').recommendation)
      .toContain('combine related operations into one plugin');
  });

  it('explains the fix for each kind of unresolved reference', async () => {
    const validation = await validate({
      agent: {
        actions: [
          { id: 'missing-plugin', file: 'plugins/missing.json' },
          { id: 'unsafe-plugin', file: '../outside.json' },
          { id: 'broken-plugin', file: 'plugins/broken.json' },
        ],
      },
      files: { 'plugins/broken.json': '{ invalid JSON' },
    });

    expect(findingFor(validation, 'DA-ACTION-REFERENCE', (finding) => finding.jsonPath === '$.actions[0].file')
      .recommendation).toContain('Add "plugins/missing.json" to the package');
    expect(findingFor(validation, 'DA-ACTION-REFERENCE', (finding) => finding.jsonPath === '$.actions[1].file')
      .recommendation).toContain('Do not use an absolute path, a URL, or ".."');
    expect(findingFor(validation, 'DA-ACTION-REFERENCE', (finding) => finding.jsonPath === '$.actions[2].file')
      .recommendation).toContain('Correct the syntax of "plugins/broken.json"');
  });

  it('lists the localization settings and keys to add', async () => {
    const validation = await validate({
      app: {
        localizationInfo: {
          additionalLanguages: [
            { languageTag: 'fr', file: 'locales/fr.json' },
            { languageTag: 'fr', file: 'locales/fr-2.json' },
            { languageTag: 'de' },
          ],
        },
      },
      agent: { name: '[[DA_Name]]', description: '[[DA_Description]]' },
      files: {
        'locales/fr.json': JSON.stringify({ localizationKeys: { DA_Name: 'Agent Contoso' } }),
        'locales/fr-2.json': JSON.stringify({ localizationKeys: { DA_Name: 'Agent Contoso' } }),
      },
    });

    const config = findingFor(validation, 'DA-LOCALIZATION-CONFIG');
    expect(config.recommendation).toContain('Add localizationInfo.defaultLanguageTag');
    expect(config.recommendation).toContain('Add localizationInfo.defaultLanguageFile');
    expect(config.recommendation).toContain('localizationInfo.additionalLanguages[2]');
    expect(config.recommendation).toContain('Remove the duplicate language tag: fr');

    const keys = findingFor(validation, 'DA-LOCALIZATION-KEYS', (finding) => finding.sourceFile === 'locales/fr.json');
    expect(keys.recommendation).toContain('DA_Description');
    expect(keys.recommendation).toContain('locales/fr.json');
    expect(keys.recommendation).not.toContain('DA_Name,');
  });

  it('names the invalid entries in advanced manifest fields', async () => {
    const validation = await validate({
      agent: {
        capabilities: [{
          name: 'EmbeddedKnowledge',
          files: Array.from({ length: 12 }, (_, index) => `knowledge/file-${index}.txt`),
        }],
        user_overrides: [
          { path: '$.capabilities[0]', allowed_actions: ['remove'] },
          { path: '', allowed_actions: ['remove'] },
          { path: '$.capabilities[0]', allowed_actions: ['add'] },
        ],
        editorial_answers: {
          answers: [
            { question: 'What is Contoso?', answer: 'A sample company.' },
            { question: '', answer: 'Missing question.' },
          ],
        },
        worker_agents: [{ id: 'worker-1', file: 'workers/worker.json' }, {}],
      },
      files: {
        ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
          `knowledge/file-${index}.txt`,
          'Synthetic knowledge.',
        ])),
        'workers/worker.json': JSON.stringify({ id: 'worker-1' }),
      },
    });

    const knowledge = findingFor(validation, 'DA-EMBEDDED-KNOWLEDGE-FILES');
    expect(knowledge.recommendation).toContain('Remove 2 files from $.capabilities[0].files');

    const overrides = findingFor(validation, 'DA-USER-OVERRIDES');
    expect(overrides.recommendation).toContain('$.user_overrides[1]');
    expect(overrides.recommendation).toContain('$.user_overrides[2]');
    expect(overrides.recommendation).not.toContain('$.user_overrides[0]');

    const editorial = findingFor(validation, 'DA-EDITORIAL-ANSWERS');
    expect(editorial.recommendation).toContain('answers[1]');
    expect(editorial.recommendation).not.toContain('answers[0]');

    expect(findingFor(validation, 'DA-WORKER-AGENT-REFERENCE', (finding) => finding.jsonPath === '$.worker_agents[0]')
      .recommendation).toContain('Keep only one of id or file in $.worker_agents[0]');
    expect(findingFor(validation, 'DA-WORKER-AGENT-REFERENCE', (finding) => finding.jsonPath === '$.worker_agents[1]')
      .recommendation).toContain('Add id or file to $.worker_agents[1]');
  });

  it('asks for at least one embedded knowledge file or removal of the capability', async () => {
    const validation = await validate({
      agent: { capabilities: [{ name: 'EmbeddedKnowledge', files: [] }] },
    });

    expect(findingFor(validation, 'DA-EMBEDDED-KNOWLEDGE-FILES').recommendation)
      .toContain('Add 1 to 10 package-local files to $.capabilities[0].files, or remove the EmbeddedKnowledge capability');
  });

  const openApiPackage = (paths: Record<string, unknown>) => validate({
    agent: { actions: [{ id: 'api-plugin', file: 'plugins/api.json' }] },
    files: {
      'plugins/api.json': JSON.stringify({
        schema_version: 'v2.4',
        functions: [{ name: 'createOrder' }],
        runtimes: [{
          type: 'OpenApi',
          run_for_functions: ['createOrder'],
          spec: { url: 'openapi.json' },
        }],
      }),
      'plugins/openapi.json': JSON.stringify({
        openapi: '3.0.1',
        servers: [{ url: 'http://api.contoso.invalid' }, { url: 'https://api.contoso.invalid' }],
        paths,
      }),
    },
  });

  it('lists the non-HTTPS servers and the write operations that turn off confirmation', async () => {
    const validation = await openApiPackage({
      '/orders': {
        post: { operationId: 'createOrder', 'x-openai-isConsequential': false },
        get: { operationId: 'listOrders', 'x-openai-isConsequential': false },
      },
      '/orders/{id}': {
        put: { operationId: 'updateOrder' },
        delete: { operationId: 'cancelOrder', 'x-openai-isConsequential': true },
      },
    });

    const https = findingFor(validation, 'DA-OPENAPI-HTTPS');
    expect(https.recommendation).toContain('http://api.contoso.invalid');
    expect(splitRecommendation(https.recommendation).action).not.toContain('https://api.contoso.invalid');
    expect(https.recommendation).toContain('plugins/openapi.json');
    expect(splitRecommendation(https.recommendation).example)
      .toBe('"servers": [{ "url": "https://api.contoso.invalid" }]');

    const consequential = findingFor(validation, 'DA-OPENAPI-CONSEQUENTIAL');
    expect(consequential.evidence).toBe('POST /orders');
    expect(consequential.recommendation).not.toContain('GET /orders');
    expect(consequential.recommendation).not.toContain('PUT /orders/{id}');
    expect(consequential.recommendation).not.toContain('DELETE /orders/{id}');
    expect(consequential.recommendation).toContain('"x-openai-isConsequential": true');
    expect(splitRecommendation(consequential.recommendation).example)
      .toBe('In plugins/openapi.json, under paths["/orders"].post, change "x-openai-isConsequential" from false to true.');
  });

  it('passes write operations that keep the default confirmation', async () => {
    // Copilot asks the user to confirm every non-GET operation unless the
    // operation sets x-openai-isConsequential to false.
    const validation = await openApiPackage({
      '/orders': {
        post: { operationId: 'createOrder' },
        get: { operationId: 'listOrders', 'x-openai-isConsequential': false },
      },
      '/orders/{id}': {
        patch: { operationId: 'updateOrder', 'x-openai-isConsequential': true },
        delete: { operationId: 'cancelOrder' },
      },
    });

    const consequential = validation.findings.find(
      (finding) => finding.ruleId === 'DA-OPENAPI-CONSEQUENTIAL',
    );
    expect(consequential?.status).toBe('Pass');
    expect(consequential?.severity).toBeUndefined();
    expect(consequential?.recommendation).toBe('');
    expect(consequential?.evidence)
      .toBe('No packaged write operation sets x-openai-isConsequential to false.');
  });

  it('gives one fix for each MCP endpoint and tool-description problem', async () => {
    const insecure = await validate({
      agent: { actions: [{ id: 'mcp', file: 'plugins/mcp.json' }] },
      files: {
        'plugins/mcp.json': JSON.stringify({
          schema_version: 'v2.4',
          runtimes: [{ type: 'RemoteMCPServer', spec: { url: 'http://example.invalid/mcp' } }],
        }),
      },
    });
    expect(findingFor(insecure, 'DA-MCP-ENDPOINT').recommendation)
      .toContain('from "http://example.invalid/mcp" to the absolute https:// URL');
    expect(splitRecommendation(findingFor(insecure, 'DA-MCP-ENDPOINT').recommendation).example)
      .toBe('"url": "https://example.invalid/mcp"');

    const conflicting = await validate({
      agent: { actions: [{ id: 'mcp', file: 'plugins/mcp.json' }] },
      files: {
        'plugins/mcp.json': mcpPlugin({
          file: 'mcp-tools.json',
          tools: [{ name: 'get_weather', description: 'Get weather.' }],
        }),
        'plugins/mcp-tools.json': JSON.stringify({ tools: [{ name: 'get_weather' }] }),
      },
    });
    expect(findingFor(conflicting, 'DA-MCP-TOOL-DESCRIPTION').recommendation)
      .toContain('Remove either file or tools');
    expect(splitRecommendation(findingFor(conflicting, 'DA-MCP-TOOL-DESCRIPTION').recommendation).example)
      .toBe('Keep "file": "mcp-tools.json" and remove "tools".');

    const emptyFile = await validate({
      agent: { actions: [{ id: 'mcp', file: 'plugins/mcp.json' }] },
      files: {
        'plugins/mcp.json': mcpPlugin({ file: 'mcp-tools.json' }),
        'plugins/mcp-tools.json': JSON.stringify({ tools: [] }),
      },
    });
    expect(findingFor(emptyFile, 'DA-MCP-TOOL-DESCRIPTION').recommendation)
      .toContain('non-empty tools array');

    const missing = await validate({
      agent: { actions: [{ id: 'mcp', file: 'plugins/mcp.json' }] },
      files: { 'plugins/mcp.json': mcpPlugin() },
    });
    const missingDescription = findingFor(missing, 'DA-MCP-TOOL-DESCRIPTION');
    expect(missingDescription.status).toBe('Warning');
    expect(missingDescription.recommendation).toContain('run_for_functions to ["*"]');
    expect(splitRecommendation(missingDescription.recommendation).example)
      .toContain('one entry for each pinned tool: "get_weather".');
  });
});

describe('agent-specific examples in package recommendations', () => {
  it('puts the example between the fix and the verification step', () => {
    const text = withVerification('Do X.', 'Check X.', 'Use "abc".');
    expect(text).toBe('Do X. Example: Use "abc". How to verify: Check X.');
    expect(splitRecommendation(text)).toEqual({ action: 'Do X.', example: 'Use "abc".', verify: 'Check X.' });
    expect(withVerification('Do X.', 'Check X.', '  ')).toBe('Do X. How to verify: Check X.');
  });

  it('keeps unlabeled text and lowercase "for example" in the action', () => {
    expect(splitRecommendation('Rename the topic, for example: "Orders".'))
      .toEqual({ action: 'Rename the topic, for example: "Orders".' });
    expect(splitRecommendation('Do X. How to verify: Check X.')).toEqual({ action: 'Do X.', verify: 'Check X.' });
    expect(splitRecommendation('')).toEqual({ action: '' });
  });

  it('reads an AI recommendation with the parts in a different order', () => {
    expect(splitRecommendation('Add a refund rule. Example: "Ask for the order number."'))
      .toEqual({ action: 'Add a refund rule.', example: '"Ask for the order number."' });
    expect(splitRecommendation('Add a refund rule. How to verify: Ask a refund question. Example: "Ask for the order number."'))
      .toEqual({
        action: 'Add a refund rule.',
        verify: 'Ask a refund question.',
        example: '"Ask for the order number."',
      });
  });

  it('uses the names, text, and values of the reviewed agent', async () => {
    const longName = 'Zava store operations assistant for regional managers and shift leads '.repeat(2).trim();
    const validation = await validate({
      agent: {
        name: longName,
        conversation_starters: Array.from({ length: 14 }, (_, index) => ({
          title: `Starter ${index}`,
          text: `Do task ${index}`,
        })),
        actions: Array.from({ length: 11 }, (_, index) => ({
          id: `inline-${index}`,
          plugin: { schema_version: 'v2.4', runtimes: [] },
        })),
        capabilities: [{
          name: 'EmbeddedKnowledge',
          files: Array.from({ length: 12 }, (_, index) => `knowledge/file-${index}.txt`),
        }],
      },
      files: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
        `knowledge/file-${index}.txt`,
        'Synthetic knowledge.',
      ])),
    });

    const nameExample = splitRecommendation(findingFor(validation, 'DA-NAME-LENGTH').recommendation).example ?? '';
    const shortName = /^"(.+)" \((\d+) characters, from the current agent name\)\.$/.exec(nameExample);
    expect(shortName, nameExample).not.toBeNull();
    const [, shortened, length] = shortName as RegExpExecArray;
    expect(longName.startsWith(shortened)).toBe(true);
    expect(longName[shortened.length]).toBe(' ');
    expect(shortened.length).toBeLessThanOrEqual(100);
    expect(Number(length)).toBe(shortened.length);

    expect(splitRecommendation(findingFor(validation, 'DA-STARTERS-COUNT').recommendation).example)
      .toBe('Remove the last 2 starters: "Starter 12", "Starter 13". If they are for common tasks, remove different starters.');
    expect(splitRecommendation(findingFor(validation, 'DA-ACTIONS-COUNT').recommendation).example)
      .toBe('Move the operations of "inline-10" into a related plugin. Then remove that action from $.actions.');
    expect(splitRecommendation(findingFor(validation, 'DA-EMBEDDED-KNOWLEDGE-FILES').recommendation).example)
      .toBe('Remove "knowledge/file-10.txt", "knowledge/file-11.txt" from $.capabilities[0].files.');
  });

  it('names the missing localization key and the local file for a reference', async () => {
    const localized = await validate({
      app: {
        localizationInfo: {
          defaultLanguageTag: 'en',
          defaultLanguageFile: 'locales/en.json',
        },
      },
      agent: { name: '[[DA_Name]]', description: '[[DA_Description]]' },
      files: {
        'locales/en.json': JSON.stringify({ localizationKeys: { DA_Name: 'Zava Assistant' } }),
      },
    });
    expect(splitRecommendation(findingFor(localized, 'DA-LOCALIZATION-KEYS').recommendation).example)
      .toBe('In locales/en.json, add "DA_Description": "…" under localizationKeys, with the text in the language of that file.');

    const unsafe = await validate({
      agent: { actions: [{ id: 'unsafe-plugin', file: '../outside.json' }] },
    });
    expect(splitRecommendation(findingFor(unsafe, 'DA-ACTION-REFERENCE').recommendation).example)
      .toBe('Put outside.json in the package next to declarativeAgent.json, and set the value to "outside.json".');
  });

  it('gives no example when the package has no value to show', async () => {
    const validation = await validate({ agent: { version: 'v1.6', instructions: 'i'.repeat(8005) } });
    expect(splitRecommendation(findingFor(validation, 'DA-VERSION-SUPPORTED').recommendation).example).toBeUndefined();
    expect(splitRecommendation(findingFor(validation, 'DA-INSTRUCTIONS-LENGTH').recommendation).example).toBeUndefined();

    const missingPlugin = await validate({
      agent: { actions: [{ id: 'missing-plugin', file: 'plugins/missing.json' }] },
    });
    expect(splitRecommendation(findingFor(missingPlugin, 'DA-ACTION-REFERENCE').recommendation).example)
      .toBeUndefined();
  });
});
