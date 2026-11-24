import { describe, expect, it } from 'vitest';
import type { BotComponent } from '../../contracts/ServiceContracts';
import { classifyComponent } from '../componentClassification';

const currentComponent = { componenttype: '9' };
const targetSchemaName = 'synthetic_FulfilmentAgent';
const targetId = '11111111-2222-3333-4444-555555555555';

describe('classifyComponent', () => {
  it.each(['0', '9', '999'])('recognizes a standard topic for component code %s', componenttype => {
    expect(classifyComponent({ componenttype }, {
      kind: 'AdaptiveDialog',
      beginDialog: { actions: [{ kind: 'InvokeConnectedAgentTaskAction' }] },
    })).toMatchObject({ category: 'topic', sourceKind: 'AdaptiveDialog' });
  });

  it.each(['InvokeFlowTaskAction', 'InvokeConnectorTaskAction', 'InvokeAIBuilderModelTaskAction',
    'InvokeExternalAgentTaskAction'])('keeps the ordinary %s action in tools', kind => {
    expect(classifyComponent(currentComponent, {
      kind: 'TaskDialog',
      action: { kind, botSchemaName: targetSchemaName },
    })).toEqual({ category: 'tool', sourceKind: 'TaskDialog' });
  });

  it.each(['ConnectorTool', 'McpTool', 'FlowTool', 'PromptTool', 'AIBuilderPromptTool'])(
    'recognizes the explicit current tool kind %s',
    kind => expect(classifyComponent(currentComponent, { kind }))
      .toEqual({ category: 'tool', sourceKind: kind }),
  );

  it('recognizes Variable as known configuration rather than an unknown callable', () => {
    expect(classifyComponent(currentComponent, {
      kind: 'Variable', name: 'sessionState', scope: 'User', isInput: true,
    })).toEqual({ category: 'configuration', sourceKind: 'Variable' });
  });

  it.each(['OnToolSelected', 'OnRecognizedIntent', 'OnRedirect', undefined])(
    'keeps AgentDialog a child agent, irrespective of trigger %s',
    kind => expect(classifyComponent(currentComponent, {
      kind: 'AgentDialog', beginDialog: { kind },
    })).toEqual({ category: 'child-agent', sourceKind: 'AgentDialog' }),
  );

  it('recognizes a connected invocation and preserves its target separately from its resource', () => {
    const component = Object.freeze({
      componenttype: '9', botcomponentid: 'invocation-resource',
      schemaname: 'synthetic_Parent.tool.Delegate', name: 'Delegate',
      botid: 'parent-agent-id',
    });
    const action = Object.freeze({
      kind: 'InvokeConnectedAgentTaskAction', botSchemaName: targetSchemaName,
      id: 'action-node-id',
    });
    const parsed = Object.freeze({ kind: 'TaskDialog', action });
    expect(classifyComponent(component, parsed)).toEqual({
      category: 'connected-agent', sourceKind: 'TaskDialog', targetSchemaName,
    });
    expect(component.schemaname).toBe('synthetic_Parent.tool.Delegate');
    expect(component.botcomponentid).toBe('invocation-resource');
    expect(action.botSchemaName).toBe(targetSchemaName);
  });

  it('recognizes a current connected tool rather than classifying every Tool suffix as a tool', () => {
    expect(classifyComponent(currentComponent, {
      kind: 'ConnectedAgentTool', botSchemaName: targetSchemaName,
    })).toEqual({ category: 'connected-agent', sourceKind: 'ConnectedAgentTool', targetSchemaName });
  });

  it.each(['TaskDialog', 'ConnectedAgentTool'])('preserves an explicit target ID for %s', kind => {
    const target = { botSchemaName: targetSchemaName, botId: targetId };
    const parsed = kind === 'TaskDialog'
      ? { kind, action: { kind: 'InvokeConnectedAgentTaskAction', ...target } }
      : { kind, ...target };
    expect(classifyComponent(currentComponent, parsed))
      .toEqual({ category: 'connected-agent', sourceKind: kind, targetSchemaName, targetId });
  });

  it('does not relabel a supplied target ID as a schema name', () => {
    expect(classifyComponent(currentComponent, {
      kind: 'ConnectedAgentTool', botId: targetId,
    })).toEqual({ category: 'connected-agent', sourceKind: 'ConnectedAgentTool', targetId });
  });

  it('preserves exact target schema spelling instead of normalizing identity', () => {
    const schema = '  synthetic_CaseSensitive-Agent \n';
    expect(classifyComponent(currentComponent, {
      kind: 'ConnectedAgentTool', botSchemaName: schema,
    }).targetSchemaName).toBe(schema);
  });

  it.each([null, undefined, '', ' \n', false, 12, {}, [], { value: targetSchemaName }].map(value => [value]))(
    'does not fabricate a target from malformed target fields: %j',
    value => {
      const result = classifyComponent(currentComponent, {
        kind: 'TaskDialog', botSchemaName: targetSchemaName,
        action: { kind: 'InvokeConnectedAgentTaskAction', botSchemaName: value, botId: value, id: targetId },
      });
      expect(result.category).toBe('connected-agent');
      expect(result.targetSchemaName).toBeUndefined();
      expect(result.targetId).toBeUndefined();
      expect(result.reason).toMatch(/target/i);
    },
  );

  it('does not use component identity or a nested unrelated field as a connected target', () => {
    const component = { ...currentComponent, botid: targetId, schemaname: targetSchemaName };
    const result = classifyComponent(component, {
      kind: 'ConnectedAgentTool', id: targetId, schemaName: targetSchemaName,
      metadata: { botSchemaName: targetSchemaName },
    });
    expect(result.category).toBe('connected-agent');
    expect(result.targetSchemaName).toBeUndefined();
    expect(result.targetId).toBeUndefined();
    expect(result.reason).toMatch(/target/i);
  });

  it('does not identify an agent from prose, a nested action or an MCP connection reference', () => {
    expect(classifyComponent(currentComponent, {
      kind: 'TaskDialog',
      modelDescription: 'InvokeConnectedAgentTaskAction',
      action: {
        kind: 'InvokeExternalAgentTaskAction',
        connectionReference: 'synthetic-mcp',
        metadata: { kind: 'InvokeConnectedAgentTaskAction', botSchemaName: targetSchemaName },
      },
    })).toEqual({ category: 'tool', sourceKind: 'TaskDialog' });
  });

  it.each(['ClosedListEntity', 'RegexEntity', 'ExternalEntity'])(
    'recognizes the entity kind %s on legacy, current and generic component records',
    kind => {
      for (const componenttype of ['3', '11', '9']) {
        expect(classifyComponent({ componenttype }, { kind }))
          .toEqual({ category: 'entity', sourceKind: kind });
      }
    },
  );

  it.each(['KnowledgeSourceConfiguration', 'FileAttachmentComponentMetadata'])(
    'recognizes known knowledge kind %s even on a generic component',
    kind => expect(classifyComponent(currentComponent, { kind, source: { kind: 'FutureSearchSource' } }))
      .toEqual({ category: 'knowledge', sourceKind: kind }),
  );

  it.each(['EvaluationSet', 'EvaluationData', 'MultiTurnEvaluationCase', 'SingleTurnEvaluationCase'])(
    'recognizes test kind %s without treating it as knowledge',
    kind => expect(classifyComponent(currentComponent, { kind }))
      .toEqual({ category: 'test', sourceKind: kind }),
  );

  it.each(['GptComponentMetadata', 'DefaultFeedbackCollection', 'NoFeedbackCollection',
    'ExternalTriggerConfiguration', 'WorkflowExternalTrigger'])(
    'recognizes metadata kind %s without searching its authored text for actions',
    kind => expect(classifyComponent(currentComponent, {
      kind, instructions: 'InvokeConnectedAgentTaskAction',
    })).toEqual({ category: 'metadata', sourceKind: kind }),
  );

  it.each([
    ['0', 'topic'],
    ['3', 'entity'], ['11', 'entity'],
    ['14', 'knowledge'], ['16', 'knowledge'],
    ['19', 'test'],
    ...['2', '5', '6', '7', '8', '10', '12', '15', '17', '18'].map(code => [code, 'metadata']),
  ])('uses unambiguous component code %s as %s when YAML is unavailable', (componenttype, category) => {
    for (const parsed of [null, {}]) {
      const result = classifyComponent({ componenttype }, parsed);
      expect(result.category).toBe(category);
      expect(result.reason).toMatch(/component type/i);
    }
  });

  it('accepts a runtime numeric Dataverse component code without modifying the record', () => {
    const component = { componenttype: 11 } as unknown as Pick<BotComponent, 'componenttype'>;
    expect(classifyComponent(component, null).category).toBe('entity');
    expect(component.componenttype).toBe(11);
  });

  it.each([undefined, null, '', 'kind: AdaptiveDialog', 42, true, [], [{ kind: 'AdaptiveDialog' }],
    {}, { kind: null }, { kind: [] }, { kind: 42 }, { kind: {} }, { kind: '' }, { kind: ' \n' }]
    .map(value => [value]))(
    'keeps malformed or unreadable type-9 metadata unknown: %j',
    parsed => {
      const result = classifyComponent(currentComponent, parsed);
      expect(result.category).toBe('unknown');
      expect(result.reason).toBeTruthy();
    },
  );

  it.each(['FutureDialog', 'FutureKnowledgeSource', 'HoloDeckTool', 'InlineAgentSkill',
    'KnowledgeSourceConfigurationExtra', 'taskdialog', ' TaskDialog '])(
    'preserves the unknown top-level kind %s rather than guessing knowledge or a tool',
    kind => {
      for (const componenttype of ['9', '16', '999']) {
        const result = classifyComponent({ componenttype }, { kind });
        expect(result.category).toBe('unknown');
        expect(result.sourceKind).toBe(kind);
        expect(result.reason).toContain(kind);
      }
    },
  );

  it.each(['1', '4', '9', '13', '999', '', 'BotTopic'])(
    'does not guess the category for ambiguous or unsupported component type %s',
    componenttype => expect(classifyComponent({ componenttype }, null).category).toBe('unknown'),
  );

  it.each([undefined, null, '', true, 42, [], [{ kind: 'InvokeConnectedAgentTaskAction' }],
    {}, { kind: null }, { kind: 42 }, { kind: 'FutureTaskAction' },
    { kind: 'invokeconnectedagenttaskaction' }].map(value => [value]))(
    'keeps a TaskDialog with unknown or malformed action metadata unassessed: %j',
    action => {
      const result = classifyComponent(currentComponent, {
        kind: 'TaskDialog', action, inputs: [{ kind: 'AutomaticTaskInput' }],
      });
      expect(result.category).toBe('unknown');
      expect(result.sourceKind).toBe('TaskDialog');
      expect(result.reason).toMatch(/action/i);
    },
  );

  it('does not follow aliases recursively or mutate parsed metadata', () => {
    const parsed: Record<string, unknown> = { kind: 'FutureDialog' };
    parsed.action = parsed;
    Object.freeze(parsed);
    const result = classifyComponent(currentComponent, parsed);
    expect(result.category).toBe('unknown');
    expect(parsed.action).toBe(parsed);
  });

  it('does not treat array properties or inherited properties as parsed component metadata', () => {
    const inherited = Object.create({ kind: 'AdaptiveDialog' }) as Record<string, unknown>;
    const array = Object.assign([], { kind: 'AdaptiveDialog' });
    expect(classifyComponent(currentComponent, inherited).category).toBe('unknown');
    expect(classifyComponent(currentComponent, array).category).toBe('unknown');
  });
});
