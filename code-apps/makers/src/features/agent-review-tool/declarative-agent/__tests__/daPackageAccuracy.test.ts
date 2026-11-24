import { describe, expect, it } from 'vitest';
import { parseDAZip } from '../utils/zipParser';
import { runDAPackageValidation } from '../utils/packageValidation';
import { makeDAPackage as makePackage } from './daPackageFixture';

describe('declarative-agent v1.8 package parsing', () => {
  it('uses version rather than $schema as the authoritative version', async () => {
    const parsed = await parseDAZip(await makePackage());

    expect(parsed.manifest.schemaVersion).toBe('v1.8');
    expect(parsed.packageEvidence.references).toContainEqual(expect.objectContaining({
      sourceFile: 'manifest.json',
      jsonPath: '$.copilotAgents.declarativeAgents[0].file',
      requestedPath: 'declarativeAgent.json',
      status: 'resolved',
    }));
  });

  it('rejects a missing declarative-agent file before semantic evaluation', async () => {
    await expect(parseDAZip(await makePackage({
      app: {
        copilotAgents: {
          declarativeAgents: [{ id: 'missing-agent', file: 'missing.json' }],
        },
      },
    }))).rejects.toThrow(/Referenced DA file "missing\.json" not found/i);
  });

  it('does not silently default a missing version to v1.6', async () => {
    const parsed = await parseDAZip(await makePackage({ agent: { version: undefined } }));
    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);

    expect(parsed.manifest.schemaVersion).toBe('');
    expect(validation.status).toBe('invalid');
    expect(validation.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-VERSION-REQUIRED',
      status: 'Fail',
      sourceFile: 'declarativeAgent.json',
      jsonPath: '$.version',
    }));
  });

  it('retains invalid referenced plugins as explicit package evidence', async () => {
    const parsed = await parseDAZip(await makePackage({
      agent: {
        actions: [{ id: 'broken-plugin', file: 'plugins/broken.json' }],
      },
      files: {
        'plugins/broken.json': '{ invalid JSON',
      },
    }));
    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);

    expect(parsed.packageEvidence.references).toContainEqual(expect.objectContaining({
      requestedPath: 'plugins/broken.json',
      normalizedPath: 'plugins/broken.json',
      status: 'invalid',
    }));
    expect(validation.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-ACTION-REFERENCE',
      status: 'Fail',
      sourceFile: 'declarativeAgent.json',
      jsonPath: '$.actions[0].file',
    }));
  });

  it('rejects a referenced path that escapes the package root', async () => {
    const parsed = await parseDAZip(await makePackage({
      agent: {
        actions: [{ id: 'unsafe-plugin', file: '../outside.json' }],
      },
    }));

    expect(parsed.packageEvidence.references).toContainEqual(expect.objectContaining({
      requestedPath: '../outside.json',
      status: 'unsafe',
    }));
  });

  it('retains inline plugin manifests without inventing a file reference', async () => {
    const inlinePlugin = {
      schema_version: 'v2.4',
      name_for_human: 'Inline action',
      runtimes: [{
        type: 'RemoteMCPServer',
        auth: { type: 'None' },
        spec: { url: 'https://example.invalid/mcp' },
      }],
    };
    const parsed = await parseDAZip(await makePackage({
      agent: {
        actions: [{ id: 'inline-plugin', plugin: inlinePlugin }],
      },
    }));

    expect(parsed.manifest.actions).toContainEqual(expect.objectContaining({
      id: 'inline-plugin',
      inline: true,
    }));
    expect(parsed.packageEvidence.documents).toContainEqual(expect.objectContaining({
      path: 'declarativeAgent.json#$.actions[0].plugin',
      kind: 'plugin',
      status: 'parsed',
      data: inlinePlugin,
    }));
  });

  it('resolves a pinned MCP description referenced by an inline plugin', async () => {
    const parsed = await parseDAZip(await makePackage({
      agent: {
        actions: [{
          id: 'inline-mcp',
          plugin: {
            schema_version: 'v2.4',
            functions: [{ name: 'lookup' }],
            runtimes: [{
              type: 'RemoteMCPServer',
              run_for_functions: ['lookup'],
              spec: {
                url: 'https://example.invalid/mcp',
                mcp_tool_description: { file: 'mcp-tools.json' },
              },
            }],
          },
        }],
      },
      files: {
        'mcp-tools.json': JSON.stringify({
          tools: [{ name: 'lookup', description: 'Look up synthetic data.' }],
        }),
      },
    }));
    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);

    expect(validation.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-MCP-TOOL-DESCRIPTION',
      status: 'Pass',
      sourceFile: 'declarativeAgent.json#$.actions[0].plugin',
    }));
  });

  it('retains default and additional localization files as package evidence', async () => {
    const parsed = await parseDAZip(await makePackage({
      app: {
        localizationInfo: {
          defaultLanguageTag: 'en',
          defaultLanguageFile: 'locales/en.json',
          additionalLanguages: [{ languageTag: 'fr', file: 'locales/fr.json' }],
        },
      },
      agent: {
        name: '[[DA_Name]]',
        description: '[[DA_Description]]',
      },
      files: {
        'locales/en.json': JSON.stringify({
          localizationKeys: {
            DA_Name: 'Contoso agent',
            DA_Description: 'Helps with Contoso work.',
          },
        }),
        'locales/fr.json': JSON.stringify({
          localizationKeys: {
            DA_Name: 'Agent Contoso',
            DA_Description: 'Aide avec le travail Contoso.',
          },
        }),
      },
    }));
    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);

    expect(parsed.packageEvidence.documents.filter((document) => document.kind === 'localization'))
      .toHaveLength(2);
    expect(validation.findings.find((finding) => finding.ruleId === 'DA-LOCALIZATION-KEYS'))
      .toMatchObject({ status: 'Pass' });
  });

  it('fails missing localization files and token values', async () => {
    const parsed = await parseDAZip(await makePackage({
      app: {
        localizationInfo: {
          defaultLanguageTag: 'en',
          defaultLanguageFile: 'locales/en.json',
          additionalLanguages: [{ languageTag: 'fr', file: 'locales/missing.json' }],
        },
      },
      agent: {
        name: '[[DA_Name]]',
        description: '[[DA_Description]]',
      },
      files: {
        'locales/en.json': JSON.stringify({
          localizationKeys: { DA_Name: 'Contoso agent' },
        }),
      },
    }));
    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);

    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'DA-LOCALIZATION-REFERENCE',
        status: 'Fail',
      }),
      expect.objectContaining({
        ruleId: 'DA-LOCALIZATION-KEYS',
        status: 'Fail',
        sourceFile: 'locales/en.json',
      }),
    ]));
  });

  it('retains packaged MCP tool descriptions for pinned tools', async () => {
    const parsed = await parseDAZip(await makePackage({
      agent: {
        actions: [{
          id: 'mcp-plugin',
          file: 'plugins/mcp.json',
        }],
      },
      files: {
        'plugins/mcp.json': JSON.stringify({
          schema_version: 'v2.4',
          functions: [{ name: 'get_weather' }],
          runtimes: [{
            type: 'RemoteMCPServer',
            run_for_functions: ['get_weather'],
            spec: {
              url: 'https://example.invalid/mcp',
              mcp_tool_description: { file: 'mcp-tools.json' },
            },
          }],
        }),
        'plugins/mcp-tools.json': JSON.stringify({
          tools: [{ name: 'get_weather', description: 'Get current weather.' }],
        }),
      },
    }));
    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);

    expect(parsed.packageEvidence.documents).toContainEqual(expect.objectContaining({
      path: 'plugins/mcp-tools.json',
      kind: 'mcp-tools',
      status: 'parsed',
    }));
    expect(validation.findings.find((finding) => finding.ruleId === 'DA-MCP-TOOL-DESCRIPTION'))
      .toMatchObject({ status: 'Pass' });
  });

  it('fails a pinned MCP tool-description file that cannot be parsed', async () => {
    const parsed = await parseDAZip(await makePackage({
      agent: {
        actions: [{ id: 'mcp-plugin', file: 'plugins/mcp.json' }],
      },
      files: {
        'plugins/mcp.json': JSON.stringify({
          schema_version: 'v2.4',
          functions: [{ name: 'get_weather' }],
          runtimes: [{
            type: 'RemoteMCPServer',
            run_for_functions: ['get_weather'],
            spec: {
              url: 'https://example.invalid/mcp',
              mcp_tool_description: { file: 'mcp-tools.json' },
            },
          }],
        }),
        'plugins/mcp-tools.json': '{ invalid JSON',
      },
    }));
    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);

    expect(validation.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-MCP-TOOL-DESCRIPTION',
      status: 'Fail',
      sourceFile: 'plugins/mcp.json',
    }));
  });
});

describe('declarative-agent v1.8 deterministic limits', () => {
  it('accepts the stable v1.8 boundaries', async () => {
    const parsed = await parseDAZip(await makePackage({
      agent: {
        name: 'n'.repeat(100),
        description: 'd'.repeat(1000),
        instructions: 'i'.repeat(8000),
        conversation_starters: Array.from({ length: 12 }, (_, index) => ({
          title: `Starter ${index}`,
          text: `Do task ${index}`,
        })),
        actions: Array.from({ length: 10 }, (_, index) => ({
          id: `inline-${index}`,
          plugin: {
            schema_version: 'v2.4',
            name_for_human: `Action ${index}`,
            runtimes: [{
              type: 'RemoteMCPServer',
              auth: { type: 'None' },
              spec: { url: 'https://example.invalid/mcp' },
            }],
          },
        })),
      },
    }));

    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);

    expect(validation.findings).not.toContainEqual(expect.objectContaining({ status: 'Fail' }));
    expect(validation.findings.find((finding) => finding.ruleId === 'DA-STARTERS-COUNT'))
      .toMatchObject({ status: 'Pass' });
    expect(validation.findings.find((finding) => finding.ruleId === 'DA-ACTIONS-COUNT'))
      .toMatchObject({ status: 'Pass' });
  });

  it('fails values above stable v1.8 limits', async () => {
    const parsed = await parseDAZip(await makePackage({
      agent: {
        name: 'n'.repeat(101),
        description: 'd'.repeat(1001),
        instructions: 'i'.repeat(8001),
        conversation_starters: Array.from({ length: 13 }, (_, index) => ({
          title: `Starter ${index}`,
          text: `Do task ${index}`,
        })),
        actions: Array.from({ length: 11 }, (_, index) => ({
          id: `inline-${index}`,
          plugin: { schema_version: 'v2.4', runtimes: [] },
        })),
      },
    }));

    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);
    const failedRules = validation.findings
      .filter((finding) => finding.status === 'Fail')
      .map((finding) => finding.ruleId);

    expect(failedRules).toEqual(expect.arrayContaining([
      'DA-NAME-LENGTH',
      'DA-DESCRIPTION-LENGTH',
      'DA-INSTRUCTIONS-LENGTH',
      'DA-STARTERS-COUNT',
      'DA-ACTIONS-COUNT',
    ]));
  });

  it('marks absent optional starters and actions as not applicable', async () => {
    const parsed = await parseDAZip(await makePackage());
    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);

    expect(validation.findings.find((finding) => finding.ruleId === 'DA-STARTERS-COUNT'))
      .toMatchObject({ status: 'N/A' });
    expect(validation.findings.find((finding) => finding.ruleId === 'DA-ACTIONS-COUNT'))
      .toMatchObject({ status: 'N/A' });
    expect(validation.status).toBe('valid');
  });

  it('validates advanced v1.8 fields without semantic scoring', async () => {
    const parsed = await parseDAZip(await makePackage({
      agent: {
        capabilities: [{
          name: 'EmbeddedKnowledge',
          files: ['knowledge/guide.txt'],
        }],
        user_overrides: [{
          path: '$.capabilities[0]',
          allowed_actions: ['remove'],
        }],
        editorial_answers: {
          answers: [{
            question: 'What is Contoso?',
            answer: 'Contoso is a sample company.',
            similarity_thresholds: { min: 2, max: 8 },
          }],
        },
        worker_agents: [{ id: 'worker-1' }],
      },
      files: {
        'knowledge/guide.txt': 'Synthetic knowledge.',
      },
    }));
    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);
    const statuses = new Map(
      validation.findings.map((finding) => [finding.ruleId, finding.status]),
    );

    expect(statuses.get('DA-EMBEDDED-KNOWLEDGE-FILES')).toBe('Pass');
    expect(statuses.get('DA-USER-OVERRIDES')).toBe('Pass');
    expect(statuses.get('DA-EDITORIAL-ANSWERS')).toBe('Pass');
    expect(statuses.get('DA-WORKER-AGENT-REFERENCE')).toBe('Pass');
  });

  it('fails invalid advanced v1.8 field combinations and limits', async () => {
    const parsed = await parseDAZip(await makePackage({
      agent: {
        capabilities: [{ name: 'EmbeddedKnowledge', files: [] }],
        user_overrides: [{
          path: '$.capabilities[0]',
          allowed_actions: ['add'],
        }],
        editorial_answers: {
          url: 'https://example.invalid/editorial.json',
          answers: [{
            question: 'Question',
            answer: 'Answer',
            similarity_thresholds: { min: 9, max: 3 },
          }],
        },
        worker_agents: [{ id: 'worker-1', file: 'workers/worker.json' }],
      },
      files: {
        'workers/worker.json': JSON.stringify({ id: 'worker-1' }),
      },
    }));
    const validation = runDAPackageValidation(parsed.manifest, parsed.packageEvidence);
    const failedRules = validation.findings
      .filter((finding) => finding.status === 'Fail')
      .map((finding) => finding.ruleId);

    expect(failedRules).toEqual(expect.arrayContaining([
      'DA-EMBEDDED-KNOWLEDGE-FILES',
      'DA-USER-OVERRIDES',
      'DA-EDITORIAL-ANSWERS',
      'DA-WORKER-AGENT-REFERENCE',
    ]));
  });
});
