import { describe, expect, it } from 'vitest';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel';
import type { SkillBundleReviewResult } from '../contracts/SkillBundle';
import {
  buildAgentMapGraph,
  getCachedAgentMapGraph,
} from '../services/agent-map/buildAgentMapGraph';

function createModel(skillMarkdown = [
  '---',
  'name: travel-helper',
  'description: Uses Weather lookup and ZAVA Visual Standards.',
  '---',
  '# Steps',
  '1. Call Weather lookup before suggesting travel dates.',
  '2. Check ZAVA Visual Standards before answering.',
  '3. Pass store questions to Store Ops Assistant.',
].join('\n')): AgentsExperienceModel {
  return {
    agentSettings: {
      instructions: 'Help the user plan safe travel.',
      modelSeries: 'Sonnet46',
      enableWebSearch: false,
      enableMemory: true,
      raw: {},
    },
    tools: [{
      name: 'Weather lookup',
      displayName: 'Weather lookup',
      description: 'Gets a forecast.',
      kind: 'ConnectorTool',
      connectorId: 'shared_weather',
      operationId: 'GetForecast',
      connectionReference: 'weather-connection',
      schemaname: 'tool.weather',
      componentId: 'tool-id',
      componentIdUnique: 'tool-unique',
    }],
    skills: [{
      name: 'travel-helper',
      schemaname: 'skill.travel',
      markdown: skillMarkdown,
      frontmatterName: 'travel-helper',
      frontmatterDescription: 'Uses Weather lookup and ZAVA Visual Standards.',
      body: skillMarkdown,
      componentId: 'skill-id',
      componentIdUnique: 'skill-unique',
      source: 'inline-markdown',
      resourceCount: 0,
    }],
    connectedAgents: [{
      name: 'Store Ops Assistant',
      displayName: 'Store Ops Assistant',
      botSchemaName: 'bot.store-ops',
      schemaname: 'connected.store-ops',
      componentId: 'connected-id',
      componentIdUnique: 'connected-unique',
    }],
    knowledge: [{
      name: 'ZAVA Visual Standards',
      sourceKind: 'SharePointSearchSource',
      schemaname: 'knowledge.visual-standards',
      componentId: 'knowledge-id',
      componentIdUnique: 'knowledge-unique',
    }],
    evaluationSets: [{
      name: 'Travel checks',
      displayName: 'Travel checks',
      graders: ['GeneralQualityGrader'],
      id: 'set-id',
      schemaname: 'evaluation.travel',
      componentId: 'set-id',
      componentIdUnique: 'set-unique',
    }],
    testCases: [{
      name: 'Forecast request',
      input: 'What is the weather tomorrow?',
      schemaname: 'case.forecast',
      setId: 'set-id',
      componentId: 'case-id',
      componentIdUnique: 'case-unique',
    }],
    multiTurnCases: [],
    triggers: [{
      name: 'Travel request trigger',
      kind: 'ExternalTriggerConfiguration',
      schemaname: 'trigger.travel',
      flowId: 'flow-travel',
      componentId: 'trigger-id',
      componentIdUnique: 'trigger-unique',
    }],
    unknownKinds: [{
      schemaname: 'future.component',
      kind: 'FutureCapability',
      componenttype: '9',
      warning: 'Unknown kind retained for review.',
      componentId: 'unknown-id',
      componentIdUnique: 'unknown-unique',
    }],
  };
}

describe('agent map graph builder', () => {
  it('preserves the configured tool kind for MCP-specific presentation', () => {
    const model = createModel();
    model.tools.push({
      name: 'Store catalog server',
      displayName: 'Store catalog server',
      description: 'Queries the store catalog through MCP.',
      kind: 'McpTool',
      connectionReference: 'catalog-connection',
      schemaname: 'tool.catalog-mcp',
      componentId: 'mcp-tool-id',
      componentIdUnique: 'mcp-tool-unique',
    });

    const graph = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model,
    });
    const connectorTool = graph.nodes.find(node => node.schemaName === 'tool.weather');
    const mcpTool = graph.nodes.find(node => node.schemaName === 'tool.catalog-mcp');

    expect(connectorTool).toMatchObject({
      category: 'tool',
      subtitle: 'Connector tool',
      toolKind: 'ConnectorTool',
    });
    expect(mcpTool).toMatchObject({
      category: 'tool',
      subtitle: 'MCP tool',
      toolKind: 'McpTool',
    });
  });

  it('connects every Microsoft Copilot botcomponent directly to the centered bot', () => {
    const graph = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model: createModel(),
    });
    const root = graph.nodes.find(node => node.category === 'agent');
    const components = graph.nodes.filter(node => node.category !== 'agent');
    const rootEdges = graph.edges.filter(edge =>
      edge.source === root?.id && edge.provenance === 'structural');

    expect(root).toBeDefined();
    expect(components).toHaveLength(8);
    expect(components.every(node => node.parentId === root?.id)).toBe(true);
    expect(new Set(rootEdges.map(edge => edge.target))).toEqual(
      new Set(components.map(node => node.id)),
    );
    expect(graph.summary.componentCount).toBe(components.length);
    expect(graph.nodes.some(node =>
      ['settings', 'topic', 'action', 'resource'].includes(node.category))).toBe(false);
  });

  it('links skills only to exactly named configured tools and knowledge sources', () => {
    const graph = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model: createModel(),
    });
    const skill = graph.nodes.find(node => node.schemaName === 'skill.travel');
    const tool = graph.nodes.find(node => node.schemaName === 'tool.weather');
    const knowledge = graph.nodes.find(
      node => node.schemaName === 'knowledge.visual-standards',
    );
    const connectedAgent = graph.nodes.find(
      node => node.schemaName === 'connected.store-ops',
    );
    const references = graph.edges.filter(edge => edge.source === skill?.id);

    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: tool?.id,
        relationship: 'possibly references tool',
        provenance: 'textual-exact',
        confidence: 1,
        evidence: expect.stringContaining('Uses Weather lookup'),
      }),
      expect.objectContaining({
        target: knowledge?.id,
        relationship: 'possibly references knowledge',
        provenance: 'textual-exact',
        confidence: 1,
        evidence: expect.stringContaining('ZAVA Visual Standards'),
      }),
    ]));
    expect(references.some(edge => edge.target === connectedAgent?.id)).toBe(false);
    expect(graph.summary.skillReferenceCount).toBe(2);
    expect(graph.summary.linkedSkillCount).toBe(1);
    expect(graph.summary.unlinkedSkillCount).toBe(0);
  });

  it('expands a resolved connected agent with its botcomponents as nested structural nodes', () => {
    const model = createModel();
    const base = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model,
    });

    const connectedAgent = base.nodes.find(node => node.schemaName === 'connected.store-ops');
    const childModel = createModel('Use Weather lookup.');
    childModel.connectedAgents = [];
    childModel.knowledge = [];
    childModel.evaluationSets = [];
    childModel.testCases = [];
    childModel.triggers = [];
    childModel.unknownKinds = [];

    const expanded = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model,
      expandedConnectedAgent: {
        sourceNodeId: connectedAgent?.id ?? '',
        snapshot: {
          agentId: 'store-ops-id',
          agentName: 'Store Ops Assistant',
          agentSchemaName: 'bot.store-ops',
          model: childModel,
        },
      },
    });
    const nested = expanded.nodes.filter(node => node.depth === 2);

    expect(connectedAgent).toBeDefined();
    expect(nested).toHaveLength(2);
    expect(nested.every(node => node.parentId === connectedAgent?.id)).toBe(true);
    expect(expanded.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: connectedAgent?.id,
        target: nested[0]?.id,
        relationship: 'has component',
        provenance: 'structural',
      }),
    ]));
    expect(expanded.nodes.find(node => node.id === connectedAgent?.id)?.details).toEqual(
      expect.objectContaining({
        'Resolved agent ID': 'store-ops-id',
        'Loaded components': 2,
      }),
    );
  });

  it('labels unavailable bundle evidence as live for connected-agent snapshots', () => {
    const model = createModel();
    const base = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model,
    });
    const connectedAgent = base.nodes.find(node => node.schemaName === 'connected.store-ops');
    const childModel = createModel('<!-- bic:bundle=store.bundle -->');
    childModel.skills[0] = {
      ...childModel.skills[0],
      source: 'zip-bundle',
      bundleMarker: 'store.bundle',
    };
    childModel.connectedAgents = [];

    const graph = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model,
      expandedConnectedAgent: {
        sourceNodeId: connectedAgent?.id ?? '',
        snapshot: {
          agentId: 'store-ops-id',
          agentName: 'Store Ops Assistant',
          agentSchemaName: 'bot.store-ops',
          model: childModel,
        },
      },
    });

    expect(graph.diagnostics).toContainEqual(expect.objectContaining({
      code: 'skill-reference-evidence-not-captured',
      message: expect.stringContaining('live connected-agent snapshot'),
    }));
    expect(graph.diagnostics.some(item => item.message.includes('predates'))).toBe(false);
  });

  it('does not create links for partial, short, implied, or absent names', () => {
    const model = createModel([
      '---',
      'name: travel-helper',
      'description: Travel planning.',
      '---',
      '# Steps',
      '1. Use Weather for the forecast.',
      '2. Search the standards documentation.',
      '3. Use AI when appropriate.',
    ].join('\n'));
    model.tools.push({
      name: 'AI',
      displayName: 'AI',
      kind: 'ConnectorTool',
      schemaname: 'tool.ai',
      componentId: 'ai-id',
      componentIdUnique: 'ai-unique',
    });
    const graph = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model,
    });

    expect(graph.edges.filter(edge => edge.provenance === 'textual-exact')).toHaveLength(0);
    expect(graph.summary.linkedSkillCount).toBe(0);
    expect(graph.summary.unlinkedSkillCount).toBe(1);
  });

  it('uses persisted bundle evidence when raw SKILL.md is not in the saved model', () => {
    const model = createModel('<!-- bic:bundle=travel.bundle -->');
    model.skills[0] = {
      ...model.skills[0],
      body: '',
      source: 'zip-bundle',
      bundleMarker: 'travel.bundle',
    };
    const bundleReview: SkillBundleReviewResult = {
      status: 'complete',
      mode: 'deep',
      skillName: 'travel-helper',
      skillSchemaName: 'skill.travel',
      deterministicFindings: [],
      blocked: false,
      capabilityReferences: [{
        category: 'tool',
        targetSchemaName: 'tool.weather',
        targetComponentId: 'tool-id',
        targetComponentIdUnique: 'tool-unique',
        matchedName: 'Weather lookup',
        lineNumber: 8,
        evidence: '8. Call Weather lookup before planning.',
      }],
    };
    const graph = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model,
      skillBundleReviews: [bundleReview],
    });

    expect(graph.edges).toContainEqual(expect.objectContaining({
      relationship: 'possibly references tool',
      provenance: 'textual-exact',
      evidence: expect.stringContaining('SKILL.md line 8'),
    }));
    expect(graph.diagnostics.some(item =>
      item.code === 'skill-reference-evidence-not-captured')).toBe(false);
  });

  it('revalidates persisted evidence before drawing an inferred relationship', () => {
    const model = createModel('<!-- bic:bundle=travel.bundle -->');
    model.tools[0] = {
      ...model.tools[0],
      name: 'Copy file',
      displayName: 'Copy file',
      schemaname: 'tool.copy-file',
    };
    model.skills[0] = {
      ...model.skills[0],
      body: '',
      source: 'zip-bundle',
      bundleMarker: 'travel.bundle',
    };
    const bundleReview: SkillBundleReviewResult = {
      status: 'complete',
      mode: 'deep',
      skillName: 'travel-helper',
      skillSchemaName: 'skill.travel',
      deterministicFindings: [],
      blocked: false,
      capabilityReferences: [{
        category: 'tool',
        targetSchemaName: 'tool.copy-file',
        targetComponentId: 'tool-id',
        targetComponentIdUnique: 'tool-unique',
        matchedName: 'Copy file',
        matchKind: 'exact',
        lineNumber: 8,
        evidence: '8. Do not copy file contents into the reply.',
      }],
    };

    const graph = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model,
      skillBundleReviews: [bundleReview],
    });

    expect(graph.edges.filter(edge => edge.provenance === 'textual-exact')).toHaveLength(0);
    expect(graph.diagnostics).toContainEqual(expect.objectContaining({
      code: 'skill-reference-evidence-rejected',
      severity: 'info',
    }));
  });

  it('reports old bundle reviews without inventing relationships', () => {
    const model = createModel('<!-- bic:bundle=travel.bundle -->');
    model.skills[0] = {
      ...model.skills[0],
      body: '',
      source: 'zip-bundle',
      bundleMarker: 'travel.bundle',
    };
    const graph = buildAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      model,
    });

    expect(graph.edges.filter(edge => edge.provenance === 'textual-exact')).toHaveLength(0);
    expect(graph.diagnostics).toContainEqual(expect.objectContaining({
      code: 'skill-reference-evidence-not-captured',
      severity: 'info',
    }));
  });

  it('reuses graph identity for the same review payload object', () => {
    const payload = {
      model: createModel(),
      findings: [],
      skillEvaluations: [],
      coverage: [],
      score: { grounded: 0, passed: 0, warnings: 0, errors: 0, evaluated: 0 },
    };
    const first = getCachedAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      payload,
    });
    const second = getCachedAgentMapGraph({
      agentId: 'agent-id',
      agentName: 'Travel agent',
      payload,
    });

    expect(second).toBe(first);
  });
});
