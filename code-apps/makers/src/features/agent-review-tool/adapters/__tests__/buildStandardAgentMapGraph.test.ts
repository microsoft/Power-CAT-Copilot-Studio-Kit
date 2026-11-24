import { describe, expect, it } from 'vitest';
import type { LocalStageAOutput } from '../../contracts/StageOutputs';
import { buildStandardAgentMapGraph } from '../buildStandardAgentMapGraph';

function snapshot(overrides: Partial<LocalStageAOutput> = {}): LocalStageAOutput {
  return {
    botId: 'agent-1',
    botName: 'Order agent',
    topicCount: 0,
    toolCount: 0,
    knowledgeCount: 0,
    testCaseCount: 0,
    localPatterns: [],
    topics: [],
    tools: [],
    knowledgeSources: [],
    orchestrationMode: 'generative',
    topicComponents: [],
    ...overrides,
  };
}

describe('buildStandardAgentMapGraph', () => {
  it('maps every retained Standard component category and keeps variables on topics', () => {
    const graph = buildStandardAgentMapGraph({
      stageA: snapshot({
        topicComponents: [{
          TopicName: 'Create order',
          TopicId: 'topic-1',
          SchemaName: 'synthetic.topic.createOrder',
          TriggerKind: 'OnRecognizedIntent',
          InputVariables: [{ VariableName: 'OrderId', VariableDescription: 'Order identifier.' }],
          OutputVariables: [{ VariableName: 'Result', VariableDescription: 'Created order.' }],
        }],
        toolDetails: [{ name: 'Create row', componentId: 'tool-1', toolType: 'connector' }],
        knowledgeDetails: [{ name: 'Order policy', componentId: 'knowledge-1', sourceType: 'SharePoint' }],
        connectedAgents: [{ name: 'Support agent', componentId: 'connected-1' }],
        childAgents: [{ name: 'Validation agent', componentId: 'child-1' }],
        entities: [{ name: 'Order entity', componentId: 'entity-1' }],
        configurationComponents: [{ name: 'Variables', componentId: 'config-1' }],
        testCaseDetails: [{ name: 'Create order test', componentId: 'test-1', input: 'Create 42', source: 'Manual' }],
        unknownComponents: [{ name: 'Future component', componentId: 'unknown-1', kind: 'FutureKind' }],
      }),
    });

    expect(new Set(graph.nodes.map(node => node.category))).toEqual(new Set([
      'agent',
      'topic',
      'tool',
      'knowledge',
      'connected-agent',
      'child-agent',
      'entity',
      'configuration',
      'test-case',
      'unknown',
    ]));
    const topic = graph.nodes.find(node => node.category === 'topic');
    expect(topic?.details['Input variables']).toEqual(['OrderId - Order identifier.']);
    expect(topic?.details['Output variables']).toEqual(['Result - Created order.']);
    const agent = graph.nodes.find(node => node.category === 'agent')!;
    expect(graph.edges.filter(edge => edge.source === agent.id)).toHaveLength(9);
  });

  it('uses an exact saved parent identity instead of attaching the child to the agent', () => {
    const graph = buildStandardAgentMapGraph({
      stageA: snapshot({
        topicComponents: [{ TopicName: 'Parent topic', TopicId: 'parent-1' }],
        entities: [{
          name: 'Nested entity',
          componentId: 'entity-1',
          parentComponentId: 'parent-1',
        }],
      }),
    });
    const parent = graph.nodes.find(node => node.componentId === 'parent-1')!;
    const child = graph.nodes.find(node => node.componentId === 'entity-1')!;

    expect(child.parentId).toBe(parent.id);
    expect(child.depth).toBe(2);
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: parent.id,
      target: child.id,
      relationship: 'contains',
      provenance: 'structural',
    }));
    expect(graph.edges).not.toContainEqual(expect.objectContaining({
      source: expect.stringMatching(/^agent:/),
      target: child.id,
    }));
  });

  it('creates an unresolved parent placeholder without dropping the child', () => {
    const graph = buildStandardAgentMapGraph({
      stageA: snapshot({
        entities: [{
          name: 'Nested entity',
          componentId: 'entity-1',
          parentComponentId: 'missing-parent',
        }],
      }),
    });
    const child = graph.nodes.find(node => node.componentId === 'entity-1')!;
    const placeholder = graph.nodes.find(node =>
      node.resolution === 'unresolved' && node.componentId === 'missing-parent')!;

    expect(placeholder).toBeDefined();
    expect(child.parentId).toBe(placeholder.id);
    expect(graph.edges.every(edge =>
      graph.nodes.some(node => node.id === edge.source)
      && graph.nodes.some(node => node.id === edge.target))).toBe(true);
  });

  it('uses only explicit connected-agent target metadata', () => {
    const graph = buildStandardAgentMapGraph({
      stageA: snapshot({
        childAgents: [{
          name: 'Known target',
          componentId: 'target-1',
          schemaName: 'synthetic.agent.known',
        }],
        connectedAgents: [
          {
            name: 'Known connection',
            componentId: 'connection-1',
            targetSchemaName: 'synthetic.agent.known',
          },
          {
            name: 'Missing connection',
            componentId: 'connection-2',
            targetId: 'missing-target',
          },
          {
            name: 'Name only matches Known target',
            componentId: 'connection-3',
            description: 'Uses Known target for orders.',
          },
        ],
      }),
    });
    const known = graph.nodes.find(node => node.componentId === 'target-1')!;
    const knownConnection = graph.nodes.find(node => node.componentId === 'connection-1')!;
    const missingConnection = graph.nodes.find(node => node.componentId === 'connection-2')!;
    const nameOnly = graph.nodes.find(node => node.componentId === 'connection-3')!;
    const targetEdges = graph.edges.filter(edge => edge.relationship === 'targets');

    expect(targetEdges).toContainEqual(expect.objectContaining({
      source: knownConnection.id,
      target: known.id,
      evidence: expect.stringContaining('synthetic.agent.known'),
    }));
    expect(targetEdges.some(edge => edge.source === nameOnly.id)).toBe(false);
    expect(missingConnection).toMatchObject({
      resolution: 'unresolved',
      targetAgentSchemaName: 'missing-target',
    });
    expect(graph.nodes.filter(node =>
      node.targetAgentSchemaName === 'missing-target')).toEqual([missingConnection]);
    expect(targetEdges.some(edge => edge.source === missingConnection.id)).toBe(false);
    expect(graph.edges).toContainEqual(expect.objectContaining({
      target: missingConnection.id,
      relationship: 'contains',
      resolution: 'unresolved',
    }));
  });

  it('collapses a configured connection and its saved ZIP target into one agent node', () => {
    const graph = buildStandardAgentMapGraph({
      stageA: snapshot({
        connectedAgents: [{
          name: 'HR connection',
          componentId: 'connection-1',
          targetSchemaName: 'synthetic.agent.hr',
        }],
      }),
      rootIconBase64: 'ROOT',
      connectedAgentTargets: [{
        schemaName: 'synthetic.agent.hr',
        name: 'HR Assistant',
        iconBase64: 'TARGET',
      }],
    });

    const root = graph.nodes.find(node => node.category === 'agent')!;
    const connection = graph.nodes.find(node => node.componentId === 'connection-1')!;

    expect(root.iconBase64).toBe('data:image/png;base64,ROOT');
    expect(graph.nodes.filter(node => node.category === 'connected-agent')).toHaveLength(1);
    expect(connection).toMatchObject({
      label: 'HR Assistant',
      iconBase64: 'data:image/png;base64,TARGET',
      targetAgentSchemaName: 'synthetic.agent.hr',
      resolution: 'resolved',
    });
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: root.id,
      target: connection.id,
      relationship: 'contains',
      resolution: 'resolved',
    }));
    expect(graph.edges.some(edge => edge.relationship === 'targets')).toBe(false);
  });

  it('keeps identities deterministic when source arrays are reordered', () => {
    const resources = [
      { name: 'Beta', componentId: 'tool-beta', toolType: 'connector' as const },
      { name: 'Alpha', componentId: 'tool-alpha', toolType: 'flow' as const },
    ];
    const forward = buildStandardAgentMapGraph({
      stageA: snapshot({ toolDetails: resources }),
    });
    const reversed = buildStandardAgentMapGraph({
      stageA: snapshot({ toolDetails: [...resources].reverse() }),
    });

    expect(forward.nodes.map(node => node.id).sort()).toEqual(
      reversed.nodes.map(node => node.id).sort(),
    );
    expect(forward.edges.map(edge => edge.id).sort()).toEqual(
      reversed.edges.map(edge => edge.id).sort(),
    );
  });

  it('deduplicates repeated saved components by stable identity', () => {
    const duplicate = {
      name: 'Create row',
      componentId: 'tool-1',
      toolType: 'connector' as const,
    };
    const graph = buildStandardAgentMapGraph({
      stageA: snapshot({ toolDetails: [duplicate, duplicate] }),
    });

    expect(graph.nodes.filter(node => node.componentId === 'tool-1')).toHaveLength(1);
    expect(graph.edges.filter(edge => edge.target.includes('tool-1'))).toHaveLength(1);
  });
});
