import type {
  LocalStageAOutput,
  ResourceDetail,
  StageBTopicComponent,
  TestCaseDetail,
  ToolDetail,
  KnowledgeDetail,
} from '../contracts/StageOutputs';
import type {
  AgentMapDetailValue,
  AgentMapGraph,
  AgentMapNode,
  AgentMapNodeCategory,
} from '../agents-experience/contracts/AgentMap';
import type { ReviewAgentMapTarget } from '../contracts/ReviewResult';
import { AgentMapGraphBuilder } from '../agents-experience/services/agent-map/graphBuilderState';
import {
  createAgentMapId,
  normalizeAgentMapKey,
} from '../agents-experience/services/agent-map/agentMapUtils';
import { toAgentMapIconDataUrl } from '../agents-experience/services/agent-map/agentMapIconData';

export interface StandardAgentMapBuildInput {
  stageA: LocalStageAOutput;
  rootIconBase64?: string;
  connectedAgentTargets?: readonly ReviewAgentMapTarget[];
}

interface StandardMapSource {
  category: Exclude<AgentMapNodeCategory, 'agent' | 'skill' | 'trigger' | 'evaluation-set'>;
  name: string;
  componentId?: string;
  schemaName?: string;
  parentComponentId?: string;
  targetId?: string;
  targetSchemaName?: string;
  description?: string;
  kind?: string;
  details: Record<string, AgentMapDetailValue>;
  warnings: string[];
}

interface MutableMapNode extends Omit<AgentMapNode, 'searchText'> {
  source?: StandardMapSource;
}

function detailRecord(
  entries: Array<[string, AgentMapDetailValue | null | undefined]>,
): Record<string, AgentMapDetailValue> {
  return Object.fromEntries(entries.filter((entry): entry is [string, AgentMapDetailValue] => {
    const value = entry[1];
    return value !== undefined
      && value !== null
      && (!Array.isArray(value) || value.length > 0)
      && value !== '';
  }));
}

function variableDetails(
  variables: StageBTopicComponent['InputVariables'],
): string[] | undefined {
  if (!variables?.length) return undefined;
  return variables.map(variable =>
    variable.VariableDescription
      ? `${variable.VariableName} - ${variable.VariableDescription}`
      : variable.VariableName);
}

function topicSource(topic: StageBTopicComponent): StandardMapSource {
  const warnings = [
    topic.ParseStatus === 'unavailable' ? 'The saved topic configuration could not be read.' : '',
    topic.ModelDescriptionStatus === 'unavailable'
      ? 'The saved topic description could not be read.'
      : '',
  ].filter(Boolean);
  return {
    category: 'topic',
    name: topic.TopicName,
    componentId: topic.TopicId,
    schemaName: topic.SchemaName,
    description: topic.ModelDescription,
    details: detailRecord([
      ['Trigger kind', topic.TriggerKind],
      ['Model name', topic.ModelName],
      ['Input variables', variableDetails(topic.InputVariables)],
      ['Output variables', variableDetails(topic.OutputVariables)],
      ['Trigger queries', topic.triggerQueries],
    ]),
    warnings,
  };
}

function resourceSource(
  category: StandardMapSource['category'],
  resource: ResourceDetail,
  extraDetails: Array<[string, AgentMapDetailValue | null | undefined]> = [],
): StandardMapSource {
  return {
    category,
    name: resource.name,
    componentId: resource.componentId,
    schemaName: resource.schemaName,
    parentComponentId: resource.parentComponentId,
    targetId: resource.targetId,
    targetSchemaName: resource.targetSchemaName,
    description: resource.description,
    kind: resource.kind,
    details: detailRecord([
      ['Kind', resource.kind],
      ['Target schema name', resource.targetSchemaName],
      ['Target ID', resource.targetId],
      ...extraDetails,
    ]),
    warnings: resource.reason ? [resource.reason] : [],
  };
}

function toolSource(tool: ToolDetail): StandardMapSource {
  return resourceSource('tool', tool, [
    ['Display name', tool.displayName],
    ['Tool type', tool.toolType],
  ]);
}

function knowledgeSource(knowledge: KnowledgeDetail): StandardMapSource {
  return resourceSource('knowledge', knowledge, [
    ['Source type', knowledge.sourceType],
    ['URL', knowledge.url],
  ]);
}

function testCaseSource(testCase: TestCaseDetail): StandardMapSource {
  return resourceSource('test-case', testCase, [
    ['Input', testCase.input],
    ['Source', testCase.source],
  ]);
}

function addLegacyNames(
  sources: StandardMapSource[],
  category: StandardMapSource['category'],
  names: readonly string[],
): void {
  const retainedNames = new Set(
    sources
      .filter(source => source.category === category)
      .map(source => normalizeAgentMapKey(source.name)),
  );
  names.forEach(name => {
    if (!retainedNames.has(normalizeAgentMapKey(name))) {
      sources.push({
        category,
        name,
        details: {},
        warnings: ['Only the component name was retained in this saved review.'],
      });
    }
  });
}

function sourceIdentity(source: StandardMapSource): string {
  return [
    source.category,
    source.componentId
      ? `component:${source.componentId}`
      : source.schemaName
        ? `schema:${source.schemaName}`
        : `name:${source.kind ?? ''}:${source.name}`,
  ].join('|');
}

const SOURCE_CATEGORY_PRIORITY: readonly StandardMapSource['category'][] = [
  'topic',
  'tool',
  'knowledge',
  'connected-agent',
  'child-agent',
  'entity',
  'configuration',
  'test-case',
  'unknown',
];

function sourceDeduplicationKey(source: StandardMapSource): string {
  if (source.componentId) {
    return `component:${normalizeAgentMapKey(source.componentId)}`;
  }
  if (source.schemaName) {
    return `schema:${normalizeAgentMapKey(source.schemaName)}`;
  }
  return sourceIdentity(source);
}

function mergeDuplicateSource(
  retained: StandardMapSource,
  duplicate: StandardMapSource,
): StandardMapSource {
  return {
    category: retained.category,
    name: retained.name || duplicate.name,
    componentId: retained.componentId ?? duplicate.componentId,
    schemaName: retained.schemaName ?? duplicate.schemaName,
    parentComponentId: retained.parentComponentId ?? duplicate.parentComponentId,
    targetId: retained.targetId ?? duplicate.targetId,
    targetSchemaName: retained.targetSchemaName ?? duplicate.targetSchemaName,
    description: retained.description ?? duplicate.description,
    kind: retained.kind ?? duplicate.kind,
    details: { ...duplicate.details, ...retained.details },
    warnings: [...new Set([...retained.warnings, ...duplicate.warnings])],
  };
}

function deduplicateSources(sources: StandardMapSource[]): StandardMapSource[] {
  const ordered = [...sources].sort((left, right) =>
    sourceDeduplicationKey(left).localeCompare(sourceDeduplicationKey(right))
    || SOURCE_CATEGORY_PRIORITY.indexOf(left.category)
      - SOURCE_CATEGORY_PRIORITY.indexOf(right.category)
    || left.name.localeCompare(right.name));
  const retained = new Map<string, StandardMapSource>();
  ordered.forEach(source => {
    const key = sourceDeduplicationKey(source);
    const existing = retained.get(key);
    retained.set(key, existing ? mergeDuplicateSource(existing, source) : source);
  });
  return [...retained.values()];
}

function createSources(stageA: LocalStageAOutput): StandardMapSource[] {
  const sources: StandardMapSource[] = [
    ...stageA.topicComponents.map(topicSource),
    ...(stageA.toolDetails ?? []).map(toolSource),
    ...(stageA.knowledgeDetails ?? []).map(knowledgeSource),
    ...(stageA.connectedAgents ?? []).map(resource =>
      resourceSource('connected-agent', resource)),
    ...(stageA.childAgents ?? []).map(resource => resourceSource('child-agent', resource)),
    ...(stageA.entities ?? []).map(resource => resourceSource('entity', resource)),
    ...(stageA.configurationComponents ?? []).map(resource =>
      resourceSource('configuration', resource)),
    ...(stageA.testCaseDetails ?? []).map(testCaseSource),
    ...(stageA.unknownComponents ?? []).map(resource => resourceSource('unknown', resource)),
  ];
  addLegacyNames(sources, 'topic', stageA.topics);
  addLegacyNames(sources, 'tool', stageA.tools);
  addLegacyNames(sources, 'knowledge', stageA.knowledgeSources);
  return deduplicateSources(sources).sort((left, right) =>
    sourceIdentity(left).localeCompare(sourceIdentity(right))
    || left.name.localeCompare(right.name));
}

function createSourceNodes(
  sources: StandardMapSource[],
  rootId: string,
  connectedAgentTargets: ReadonlyMap<string, ReviewAgentMapTarget>,
): MutableMapNode[] {
  return sources.map(source => {
    const identity = sourceIdentity(source);
    const targetIdentity = source.category === 'connected-agent'
      ? source.targetSchemaName
      : source.category === 'child-agent'
        ? source.schemaName
        : undefined;
    const target = targetIdentity
      ? connectedAgentTargets.get(normalizeAgentMapKey(targetIdentity))
      : undefined;
    return {
      id: createAgentMapId(source.category, identity),
      category: source.category,
      label: target?.name || source.name || 'Unnamed component',
      subtitle: source.kind,
      schemaName: source.schemaName,
      componentId: source.componentId,
      targetAgentSchemaName: source.targetSchemaName
        ?? (source.category === 'connected-agent' ? source.targetId : undefined),
      iconBase64: toAgentMapIconDataUrl(target?.iconBase64),
      description: source.description,
      parentId: rootId,
      depth: 1,
      details: source.details,
      warnings: source.warnings,
      resolution: 'resolved',
      source,
    };
  });
}

function indexExactIdentities(nodes: MutableMapNode[]): Map<string, string> {
  const index = new Map<string, string>();
  nodes.forEach(node => {
    [node.componentId, node.schemaName].filter(Boolean).forEach(identity => {
      const key = normalizeAgentMapKey(identity!);
      if (!index.has(key)) index.set(key, node.id);
    });
  });
  return index;
}

function findRetainedConnectedAgentTarget(
  node: MutableMapNode,
  identityIndex: ReadonlyMap<string, string>,
): { id: string; identity: string } | undefined {
  const identities = [node.source?.targetId, node.source?.targetSchemaName].filter(
    (identity): identity is string => Boolean(identity),
  );
  for (const identity of identities) {
    const id = identityIndex.get(normalizeAgentMapKey(identity));
    if (id && id !== node.id) return { id, identity };
  }
  return undefined;
}

/** Build a deterministic graph from saved Standard Review Stage A data only. */
export function buildStandardAgentMapGraph({
  stageA,
  rootIconBase64,
  connectedAgentTargets = [],
}: StandardAgentMapBuildInput): AgentMapGraph {
  const builder = new AgentMapGraphBuilder();
  const rootId = createAgentMapId('agent', stageA.botId || stageA.botName);
  const connectedAgentTargetIndex = new Map(
    connectedAgentTargets.map(target => [
      normalizeAgentMapKey(target.schemaName),
      target,
    ]),
  );
  const root: MutableMapNode = {
    id: rootId,
    category: 'agent',
    label: stageA.botName || 'Unnamed agent',
    componentId: stageA.botId || undefined,
    iconBase64: toAgentMapIconDataUrl(rootIconBase64),
    description: stageA.agentDescription,
    depth: 0,
    details: detailRecord([
      ['Orchestration mode', stageA.orchestrationMode],
      ['Source', stageA.source],
      ['Language', stageA.agentSettings?.language],
      ['Authentication', stageA.agentSettings?.authenticationMode],
      ['Model knowledge', stageA.agentSettings?.useModelKnowledge],
      ['Semantic search', stageA.agentSettings?.isSemanticSearchEnabled],
      ['Latest models', stageA.agentSettings?.optInUseLatestModels],
    ]),
    warnings: stageA.configurationAvailable === false
      ? ['The saved source configuration was unavailable.']
      : [],
    resolution: stageA.configurationAvailable === false ? 'unresolved' : 'resolved',
  };

  const nodes = createSourceNodes(
    createSources(stageA),
    rootId,
    connectedAgentTargetIndex,
  );
  const identityIndex = indexExactIdentities(nodes);
  const parentPlaceholders = new Map<string, MutableMapNode>();

  nodes.forEach(node => {
    const parentIdentity = node.source?.parentComponentId;
    if (!parentIdentity) return;
    const parentId = identityIndex.get(normalizeAgentMapKey(parentIdentity));
    if (parentId && parentId !== node.id) {
      node.parentId = parentId;
      return;
    }
    const parentKey = normalizeAgentMapKey(parentIdentity);
    let placeholder = parentPlaceholders.get(parentKey);
    if (!placeholder) {
      placeholder = {
        id: createAgentMapId('unknown-parent', parentIdentity),
        category: 'unknown',
        label: `Unresolved parent ${parentIdentity}`,
        componentId: parentIdentity,
        parentId: rootId,
        depth: 1,
        details: { 'Saved parent ID': parentIdentity },
        warnings: ['The saved parent component was not retained in this review.'],
        resolution: 'unresolved',
      };
      parentPlaceholders.set(parentKey, placeholder);
      identityIndex.set(parentKey, placeholder.id);
    }
    node.parentId = placeholder.id;
  });
  nodes.push(...parentPlaceholders.values());

  const nodeById = new Map<string, MutableMapNode>([
    [root.id, root],
    ...nodes.map(node => [node.id, node] as const),
  ]);
  const resolveDepth = (node: MutableMapNode, visiting = new Set<string>()): number => {
    if (!node.parentId) return node.category === 'agent' ? 0 : 1;
    if (visiting.has(node.id)) {
      node.warnings = [...node.warnings, 'A parent cycle was retained as an unresolved hierarchy.'];
      node.parentId = rootId;
      return 1;
    }
    const parent = nodeById.get(node.parentId);
    if (!parent) return 1;
    const next = new Set(visiting).add(node.id);
    return resolveDepth(parent, next) + 1;
  };
  nodes.forEach(node => { node.depth = resolveDepth(node); });

  const targetIdentityIndex = indexExactIdentities(nodes);
  nodes
    .filter(node => node.category === 'connected-agent' && node.source)
    .forEach(node => {
      const targetIdentity = node.source?.targetSchemaName || node.source?.targetId;
      if (!targetIdentity || findRetainedConnectedAgentTarget(node, targetIdentityIndex)) return;
      const connectedAgentTarget = connectedAgentTargetIndex.get(
        normalizeAgentMapKey(node.source?.targetSchemaName || targetIdentity),
      );
      if (connectedAgentTarget) return;
      node.resolution = 'unresolved';
      node.warnings = [
        ...node.warnings,
        'The saved connected-agent target was not retained in this review.',
      ];
    });

  builder.addNode(root);
  nodes.forEach(node => {
    const graphNode = { ...node };
    delete graphNode.source;
    builder.addNode(graphNode);
  });
  nodes.forEach(node => {
    if (!node.parentId) return;
    builder.addEdge({
      source: node.parentId,
      target: node.id,
      relationship: 'contains',
      provenance: 'structural',
      evidence: node.source?.parentComponentId
        ? `Saved parent component ID: ${node.source.parentComponentId}`
        : 'Retained as a top-level component in the saved review.',
      confidence: 1,
      resolution: node.resolution,
      sourceField: node.source?.parentComponentId ? 'parentComponentId' : undefined,
      directed: true,
    });
  });

  nodes
    .filter(node => node.category === 'connected-agent' && node.source)
    .forEach(node => {
      const target = findRetainedConnectedAgentTarget(node, targetIdentityIndex);
      if (!target) return;
      const resolution = nodeById.get(target.id)?.resolution ?? 'resolved';
      builder.addEdge({
        source: node.id,
        target: target.id,
        relationship: 'targets',
        provenance: 'structural',
        evidence: `Saved target identity: ${target.identity}`,
        confidence: 1,
        resolution,
        sourceField: target.identity === node.source?.targetId
          ? 'targetId'
          : 'targetSchemaName',
        directed: true,
      });
    });

  (stageA.parsingErrors ?? []).forEach((message, index) => {
    builder.diagnostics.push({
      code: `standard-parse-${index + 1}`,
      severity: 'warning',
      message,
      sourceId: rootId,
    });
  });
  nodes.forEach(node => {
    node.warnings.forEach((message, index) => {
      builder.diagnostics.push({
        code: `standard-node-${node.id}-${index + 1}`,
        severity: node.resolution === 'unresolved' ? 'warning' : 'info',
        message,
        sourceId: node.id,
      });
    });
  });

  return builder.finalize();
}
