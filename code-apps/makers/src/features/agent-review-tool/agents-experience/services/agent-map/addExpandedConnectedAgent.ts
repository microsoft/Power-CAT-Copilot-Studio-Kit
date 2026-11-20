import type { AgentMapBuildInput } from '../../contracts/AgentMap';
import { addAgentMapNodes } from './addAgentMapNodes';
import { addAgentMapRelationships } from './addAgentMapRelationships';
import { createAgentMapId } from './agentMapUtils';
import { AgentMapGraphBuilder } from './graphBuilderState';

/** Merge a bounded, one-level connected-agent component snapshot into the reviewed graph. */
export function addExpandedConnectedAgent(
  input: AgentMapBuildInput,
  builder: AgentMapGraphBuilder,
): void {
  const expansion = input.expandedConnectedAgent;
  if (!expansion) return;

  const childInput: AgentMapBuildInput = {
    agentId: expansion.snapshot.agentId,
    agentName: expansion.snapshot.agentName,
    model: expansion.snapshot.model,
  };
  const childBuilder = new AgentMapGraphBuilder();
  const childContext = addAgentMapNodes(childInput, childBuilder);
  addAgentMapRelationships(childInput, childBuilder, childContext, 'live-connected-agent');
  const childGraph = childBuilder.finalize();
  const childRoot = childGraph.nodes.find(node => node.id === childContext.rootId);
  if (!childRoot) return;

  const updated = builder.updateNode(expansion.sourceNodeId, {
    resolution: 'resolved',
    warnings: [],
    details: {
      'Target schema': expansion.snapshot.agentSchemaName,
      'Resolved agent ID': expansion.snapshot.agentId,
      'Loaded components': childGraph.summary.componentCount,
      'Target model series': expansion.snapshot.model.agentSettings.modelSeries ?? 'Not captured',
      'Target instructions':
        expansion.snapshot.model.agentSettings.instructions.trim() || 'Not captured',
      'Snapshot source': 'Loaded from the source environment on selection',
    },
  });
  if (!updated) {
    builder.diagnostics.push({
      code: 'connected-agent-source-node-missing',
      severity: 'warning',
      sourceId: expansion.sourceNodeId,
      message: 'The selected connected-agent component was no longer present in the graph.',
    });
    return;
  }

  const idMap = new Map<string, string>([[childRoot.id, expansion.sourceNodeId]]);
  childGraph.nodes
    .filter(node => node.id !== childRoot.id)
    .forEach(node => {
      idMap.set(
        node.id,
        createAgentMapId(`expanded-${node.category}`, `${expansion.sourceNodeId}|${node.id}`),
      );
    });

  childGraph.nodes
    .filter(node => node.id !== childRoot.id)
    .forEach(node => {
      const id = idMap.get(node.id);
      if (!id) return;
      builder.addNode({
        ...node,
        id,
        parentId: node.parentId ? idMap.get(node.parentId) ?? expansion.sourceNodeId : expansion.sourceNodeId,
        depth: node.depth + 1,
        details: {
          ...node.details,
          'Snapshot source': `Connected agent ${expansion.snapshot.agentName}`,
        },
      });
    });

  childGraph.edges.forEach(edge => {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!source || !target) return;
    builder.addEdge({
      ...edge,
      source,
      target,
      evidence: edge.provenance === 'structural'
        ? `This botcomponent was loaded from connected agent ${expansion.snapshot.agentName}.`
        : edge.evidence,
      sourceField: edge.provenance === 'structural'
        ? 'ConnectedAgentTool.botSchemaName'
        : edge.sourceField,
    });
  });

  childGraph.diagnostics.forEach(diagnostic => {
    builder.diagnostics.push({
      ...diagnostic,
      sourceId: diagnostic.sourceId
        ? idMap.get(diagnostic.sourceId) ?? expansion.sourceNodeId
        : expansion.sourceNodeId,
    });
  });
}
