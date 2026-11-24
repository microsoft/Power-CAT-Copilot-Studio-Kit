import { describe, expect, it } from 'vitest';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel';
import { analyzeSkillCapabilityReferences } from '../services/skill/skillCapabilityReferences';

function modelWithCapabilities(): AgentsExperienceModel {
  return {
    agentSettings: { instructions: '', raw: {} },
    tools: [{
      name: 'Planogram Archive',
      displayName: 'Planogram Archive',
      kind: 'ConnectorTool',
      schemaname: 'tool.planogram',
      componentId: 'tool-planogram',
      componentIdUnique: 'tool-planogram-unique',
    }],
    skills: [],
    connectedAgents: [{
      name: 'Store Ops Assistant',
      displayName: 'Store Ops Assistant',
      schemaname: 'connected.store-ops',
      botSchemaName: 'bot.store-ops',
    }],
    knowledge: [{
      name: 'ZAVA Visual Standards',
      sourceKind: 'SharePointSearchSource',
      schemaname: 'knowledge.visual-standards',
      componentId: 'knowledge-standards',
      componentIdUnique: 'knowledge-standards-unique',
    }],
    evaluationSets: [],
    testCases: [],
    multiTurnCases: [],
    triggers: [],
    unknownKinds: [],
  };
}

describe('skill capability reference analysis', () => {
  it('captures exact prose references with stable targets and line evidence', () => {
    const analysis = analyzeSkillCapabilityReferences([
      '# Steps',
      '1. Pull the layout from the planogram archive.',
      '2. Check it against ZAVA Visual Standards.',
    ].join('\n'), modelWithCapabilities());

    expect(analysis.references).toEqual([
      expect.objectContaining({
        category: 'tool',
        targetSchemaName: 'tool.planogram',
        matchedName: 'Planogram Archive',
        lineNumber: 2,
        evidence: '1. Pull the layout from the planogram archive.',
      }),
      expect.objectContaining({
        category: 'knowledge',
        targetSchemaName: 'knowledge.visual-standards',
        lineNumber: 3,
      }),
    ]);
    expect(analysis.issues).toHaveLength(0);
  });

  it('rejects partial names, longer tokens, and connected-agent references', () => {
    const analysis = analyzeSkillCapabilityReferences([
      'Use Planogram for the layout.',
      'Do not use Planogram ArchiveBackup.',
      'Pass the request to Store Ops Assistant.',
    ].join('\n'), modelWithCapabilities());

    expect(analysis.references).toHaveLength(0);
  });

  it('withholds duplicate configured names rather than selecting a target', () => {
    const model = modelWithCapabilities();
    model.tools.push({
      ...model.tools[0],
      schemaname: 'tool.planogram-copy',
      componentId: 'tool-planogram-copy',
      componentIdUnique: 'tool-planogram-copy-unique',
    });
    const analysis = analyzeSkillCapabilityReferences(
      'Call Planogram Archive before planning.',
      model,
    );

    expect(analysis.references).toHaveLength(0);
    expect(analysis.issues).toEqual([
      expect.objectContaining({
        code: 'ambiguous-capability-name',
        matchedName: 'Planogram Archive',
        candidateSchemaNames: ['tool.planogram', 'tool.planogram-copy'],
      }),
    ]);
  });

  it('does not auto-link short common capability names', () => {
    const model = modelWithCapabilities();
    model.tools = [{
      ...model.tools[0],
      name: 'AI',
      displayName: 'AI',
      schemaname: 'tool.ai',
    }];

    expect(analyzeSkillCapabilityReferences('Use AI.', model).references).toHaveLength(0);
  });

  it.each([
    ['Copy file', 'Copy file naming conventions from the brand style guide.'],
    ['Copy file', 'Copy file naming conventions for tool authors.'],
    ['Create item', 'Create item descriptions that are clear and factual.'],
    ['Add attachment', 'Never add attachment types the customer cannot open.'],
    ['Add a row into a table', 'Add a row into a table examples to the guide.'],
    ['Send a Draft message', 'Send a Draft message templates are documented below.'],
  ])('does not infer an action-style tool from ordinary prose: %s', (toolName, markdown) => {
    const model = modelWithCapabilities();
    model.tools = [{
      ...model.tools[0],
      name: toolName,
      displayName: toolName,
      schemaname: `tool.${toolName.toLocaleLowerCase().replace(/\s+/g, '-')}`,
    }];

    expect(analyzeSkillCapabilityReferences(markdown, model).references).toHaveLength(0);
  });

  it('accepts an action-style tool only when the prose explicitly identifies tool use', () => {
    const model = modelWithCapabilities();
    model.tools = [{
      ...model.tools[0],
      name: 'Copy file',
      displayName: 'Copy file',
      schemaname: 'tool.copy-file',
    }];

    const analysis = analyzeSkillCapabilityReferences(
      'After approval, use the `Copy file` tool to place the asset in the archive.',
      model,
    );

    expect(analysis.references).toEqual([
      expect.objectContaining({
        category: 'tool',
        targetSchemaName: 'tool.copy-file',
        matchedName: 'Copy file',
        matchKind: 'exact',
      }),
    ]);
  });

  it('skips unsupported occurrences and retains a later explicit tool reference', () => {
    const model = modelWithCapabilities();
    model.tools = [{
      ...model.tools[0],
      name: 'Copy file',
      displayName: 'Copy file',
      schemaname: 'tool.copy-file',
    }];

    const analysis = analyzeSkillCapabilityReferences([
      'Copy file naming conventions from the brand style guide.',
      'Invoke the Copy file tool after approval.',
    ].join('\n'), model);

    expect(analysis.references).toEqual([
      expect.objectContaining({
        targetSchemaName: 'tool.copy-file',
        lineNumber: 2,
      }),
    ]);
  });

  it('rejects exact tool and knowledge names in clearly negated instructions', () => {
    const analysis = analyzeSkillCapabilityReferences([
      'Do not use Planogram Archive for temporary layouts.',
      'Never consult ZAVA Visual Standards for personal requests.',
    ].join('\n'), modelWithCapabilities());

    expect(analysis.references).toHaveLength(0);
  });

  it('retains a later positive reference after a negated occurrence', () => {
    const analysis = analyzeSkillCapabilityReferences([
      'Do not use Planogram Archive for temporary layouts.',
      'Use Planogram Archive for approved layouts.',
    ].join('\n'), modelWithCapabilities());

    expect(analysis.references).toEqual([
      expect.objectContaining({
        targetSchemaName: 'tool.planogram',
        lineNumber: 2,
      }),
    ]);
  });

  it('captures the ZAVA shortened knowledge title as a strong unique reference', () => {
    const model = modelWithCapabilities();
    model.knowledge[0] = {
      ...model.knowledge[0],
      name: 'ZAVA-Visual-Merchandising-Standards-v4.2.docx',
    };

    const analysis = analyzeSkillCapabilityReferences(
      '3. Check the layout against the ZAVA visual standards.',
      model,
    );

    expect(analysis.references).toEqual([
      expect.objectContaining({
        category: 'knowledge',
        targetSchemaName: 'knowledge.visual-standards',
        matchKind: 'strong',
        lineNumber: 1,
      }),
    ]);
  });

  it('rejects a strong shortened knowledge title in a clearly negated instruction', () => {
    const model = modelWithCapabilities();
    model.knowledge[0] = {
      ...model.knowledge[0],
      name: 'ZAVA-Visual-Merchandising-Standards-v4.2.docx',
    };

    const analysis = analyzeSkillCapabilityReferences(
      'Do not check the layout against the ZAVA visual standards.',
      model,
    );

    expect(analysis.references).toHaveLength(0);
  });

  it('withholds a shortened knowledge title when it identifies multiple sources', () => {
    const model = modelWithCapabilities();
    model.knowledge = [
      {
        ...model.knowledge[0],
        name: 'ZAVA-Visual-Merchandising-Standards-v4.2.docx',
      },
      {
        ...model.knowledge[0],
        name: 'ZAVA-Visual-Safety-Standards-v2.pdf',
        schemaname: 'knowledge.visual-safety',
        componentId: 'knowledge-safety',
        componentIdUnique: 'knowledge-safety-unique',
      },
    ];

    const analysis = analyzeSkillCapabilityReferences(
      'Check the layout against the ZAVA visual standards.',
      model,
    );

    expect(analysis.references).toHaveLength(0);
    expect(analysis.issues).toEqual([
      expect.objectContaining({
        code: 'ambiguous-capability-name',
        matchKind: 'strong',
        candidateSchemaNames: [
          'knowledge.visual-safety',
          'knowledge.visual-standards',
        ],
      }),
    ]);
  });

  it('withholds one phrase when different token subsets qualify multiple sources', () => {
    const model = modelWithCapabilities();
    model.knowledge = [
      {
        ...model.knowledge[0],
        name: 'ZAVA-Visual-Merchandising-Standards-v4.2.docx',
      },
      {
        ...model.knowledge[0],
        name: 'ZAVA-Visual-Safety-Standards-v2.pdf',
        schemaname: 'knowledge.visual-safety',
        componentId: 'knowledge-safety',
        componentIdUnique: 'knowledge-safety-unique',
      },
    ];

    const analysis = analyzeSkillCapabilityReferences(
      'Check the ZAVA visual merchandising safety standards.',
      model,
    );

    expect(analysis.references).toHaveLength(0);
    expect(analysis.issues).toEqual([
      expect.objectContaining({
        code: 'ambiguous-capability-name',
        matchKind: 'strong',
        candidateSchemaNames: [
          'knowledge.visual-safety',
          'knowledge.visual-standards',
        ],
      }),
    ]);
  });
});
