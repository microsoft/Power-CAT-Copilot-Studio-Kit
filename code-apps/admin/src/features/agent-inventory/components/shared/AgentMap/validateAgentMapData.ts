import type {
  AgentMapData,
  AgentMapEdge,
  AgentMapMetadataValue,
  AgentMapNode,
  ValidatedAgentMapData,
} from './AgentMap.types';

function hasDisplaySafeMetadata(
  metadata: Record<string, AgentMapMetadataValue> | undefined,
): boolean {
  return !metadata || Object.values(metadata).every(value =>
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean');
}

function findInvalidNode(node: AgentMapNode, index: number): string | undefined {
  if (!node.id.trim()) return `Node ${index + 1} has an empty ID.`;
  if (!node.label.trim()) return `Node "${node.id}" has an empty label.`;
  if ((node.depth ?? 0) < 0) return `Node "${node.id}" has an invalid depth.`;
  if (!hasDisplaySafeMetadata(node.metadata)) {
    return `Node "${node.id}" contains unsupported metadata.`;
  }
  return undefined;
}

function findInvalidEdge(edge: AgentMapEdge, index: number): string | undefined {
  if (!edge.id.trim()) return `Relationship ${index + 1} has an empty ID.`;
  if (!edge.source.trim() || !edge.target.trim()) {
    return `Relationship "${edge.id}" has an empty endpoint.`;
  }
  if (!hasDisplaySafeMetadata(edge.metadata)) {
    return `Relationship "${edge.id}" contains unsupported metadata.`;
  }
  return undefined;
}

/** Validate serializable map data and remove relationships with missing endpoints. */
export function validateAgentMapData(data: AgentMapData): ValidatedAgentMapData {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (data.version !== 1) errors.push(`Unsupported Agent Map version: ${data.version}.`);

  const nodeIds = new Set<string>();
  data.nodes.forEach((node, index) => {
    const error = findInvalidNode(node, index);
    if (error) errors.push(error);
    if (nodeIds.has(node.id)) errors.push(`Duplicate node ID: "${node.id}".`);
    nodeIds.add(node.id);
  });

  const edgeIds = new Set<string>();
  data.edges.forEach((edge, index) => {
    const error = findInvalidEdge(edge, index);
    if (error) errors.push(error);
    if (edgeIds.has(edge.id)) errors.push(`Duplicate relationship ID: "${edge.id}".`);
    edgeIds.add(edge.id);
  });

  if (errors.length > 0) return { errors, warnings };

  const edges = data.edges.filter(edge => {
    const valid = nodeIds.has(edge.source) && nodeIds.has(edge.target);
    if (!valid) warnings.push(`Relationship "${edge.id}" was omitted because an endpoint is missing.`);
    return valid;
  });

  return {
    data: { ...data, nodes: [...data.nodes], edges },
    errors,
    warnings,
  };
}
