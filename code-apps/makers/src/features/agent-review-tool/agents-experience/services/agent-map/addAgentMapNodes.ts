import type { AgentMapBuildInput } from '../../contracts/AgentMap';
import { AgentMapGraphBuilder } from './graphBuilderState';
import {
  addRootEdge,
  type AgentMapNodeContext,
} from './agentMapNodeContext';
import { addAgentMapReviewNodes } from './addAgentMapReviewNodes';
import {
  clipAgentMapText,
  createAgentMapId,
  humanizeAgentMapKind,
} from './agentMapUtils';

/** Add the centered bot and every parsed Microsoft Copilot botcomponent as a direct surrounding node. */
export function addAgentMapNodes(
  input: AgentMapBuildInput,
  builder: AgentMapGraphBuilder,
): AgentMapNodeContext {
  const { model } = input;
  const componentCount =
    model.tools.length +
    model.skills.length +
    model.connectedAgents.length +
    model.knowledge.length +
    model.triggers.length +
    model.evaluationSets.length +
    model.testCases.length +
    model.unknownKinds.length;
  const rootId = createAgentMapId('agent', input.agentId || input.agentName);

  builder.addNode({
    id: rootId,
    category: 'agent',
    label: input.agentName,
    subtitle: model.agentSettings.modelSeries ?? 'Microsoft Copilot agent',
    componentId: input.agentId || undefined,
    iconBase64: input.agentIcons?.root,
    description: clipAgentMapText(model.agentSettings.instructions),
    depth: 0,
    details: {
      'Component count': componentCount,
      Instructions: clipAgentMapText(model.agentSettings.instructions, 1_200) ?? 'Not captured',
      'Model series': model.agentSettings.modelSeries ?? 'Not captured',
      'Web search': model.agentSettings.enableWebSearch ?? 'Not captured',
      Memory: model.agentSettings.enableMemory ?? false,
      Tools: model.tools.length,
      Skills: model.skills.length,
      Knowledge: model.knowledge.length,
      'Connected agents': model.connectedAgents.length,
      Triggers: model.triggers.length,
      'Evaluation sets': model.evaluationSets.length,
      'Test cases': model.testCases.length,
      'Unknown components': model.unknownKinds.length,
    },
    warnings: model.agentSettings.instructions.trim() ? [] : ['Instructions are empty.'],
    resolution: 'resolved',
  });

  const context: AgentMapNodeContext = {
    rootId,
    capabilities: [],
    skills: [],
  };

  model.tools.forEach(tool => {
    const id = createAgentMapId(
      'tool',
      tool.componentIdUnique ?? tool.componentId ?? tool.schemaname,
    );
    const label = tool.displayName ?? tool.name;
    builder.addNode({
      id,
      category: 'tool',
      label,
      subtitle: tool.kind === 'McpTool' ? 'MCP tool' : 'Connector tool',
      toolKind: tool.kind,
      schemaName: tool.schemaname,
      componentId: tool.componentId,
      componentIdUnique: tool.componentIdUnique,
      description: clipAgentMapText(tool.description),
      parentId: rootId,
      depth: 1,
      details: {
        'Tool kind': tool.kind,
        Authentication: tool.authMode ?? 'Not captured',
        Connector: tool.connectorId ?? 'Not captured',
        Operation: tool.operationId ?? 'Not captured',
        'Connection reference': tool.connectionReference ?? 'Not captured',
      },
      warnings: tool.connectionReference ? [] : ['Connection reference is missing.'],
      resolution: 'resolved',
    });
    addRootEdge(builder, rootId, id);
    context.capabilities.push({
      id,
      label,
      schemaName: tool.schemaname,
      componentId: tool.componentId,
      componentIdUnique: tool.componentIdUnique,
      category: 'tool',
    });
  });

  model.skills.forEach(skill => {
    const id = createAgentMapId(
      'skill',
      skill.componentIdUnique ?? skill.componentId ?? skill.schemaname,
    );
    builder.addNode({
      id,
      category: 'skill',
      label: skill.frontmatterName ?? skill.name,
      subtitle: skill.source === 'zip-bundle' ? 'Skill bundle' : 'Inline skill',
      schemaName: skill.schemaname,
      componentId: skill.componentId,
      componentIdUnique: skill.componentIdUnique,
      description: clipAgentMapText(skill.frontmatterDescription),
      parentId: rootId,
      depth: 1,
      details: {
        Source: skill.source,
        'Supporting resources': skill.resourceCount,
        'Bundle marker': skill.bundleMarker ?? 'None',
      },
      warnings: [],
      resolution: 'resolved',
    });
    addRootEdge(builder, rootId, id);
    context.skills.push({ id, skill });
  });

  model.knowledge.forEach(source => {
    const id = createAgentMapId(
      'knowledge',
      source.componentIdUnique ?? source.componentId ?? source.schemaname,
    );
    builder.addNode({
      id,
      category: 'knowledge',
      label: source.name,
      subtitle: humanizeAgentMapKind(source.sourceKind ?? 'Knowledge source'),
      schemaName: source.schemaname,
      componentId: source.componentId,
      componentIdUnique: source.componentIdUnique,
      parentId: rootId,
      depth: 1,
      details: { 'Source kind': source.sourceKind ?? 'Not captured' },
      warnings: [],
      resolution: 'resolved',
    });
    addRootEdge(builder, rootId, id);
    context.capabilities.push({
      id,
      label: source.name,
      schemaName: source.schemaname,
      componentId: source.componentId,
      componentIdUnique: source.componentIdUnique,
      category: 'knowledge',
    });
  });

  model.connectedAgents.forEach(agent => {
    const id = createAgentMapId(
      'connected-agent',
      agent.componentIdUnique ?? agent.componentId ?? agent.schemaname,
    );
    builder.addNode({
      id,
      category: 'connected-agent',
      label: agent.displayName ?? agent.name,
      subtitle: 'Connected agent',
      schemaName: agent.schemaname,
      componentId: agent.componentId,
      componentIdUnique: agent.componentIdUnique,
      targetAgentSchemaName: agent.botSchemaName,
      // Each connected agent has its own maker-chosen icon, keyed by the bot
      // schema name it points at.
      iconBase64: agent.botSchemaName
        ? input.agentIcons?.[agent.botSchemaName.toLowerCase()]
        : undefined,
      description: clipAgentMapText(agent.description),
      parentId: rootId,
      depth: 1,
      details: {
        'Target schema': agent.botSchemaName ?? 'Not captured',
        'History type': agent.historyTypeKind ?? 'Not captured',
      },
      warnings: agent.botSchemaName ? [] : ['Target agent schema is missing.'],
      resolution: agent.botSchemaName ? 'resolved' : 'unresolved',
    });
    addRootEdge(builder, rootId, id);
  });

  addAgentMapReviewNodes(input, builder, context);
  return context;
}
