import type {
  AgentMapDiagnostic,
  AgentMapEdge,
  AgentMapGraph,
  AgentMapNode,
} from '../../contracts/AgentMap';
import {
  clipAgentMapText,
  createAgentMapId,
  withEdgeSearchText,
  withNodeSearchText,
} from './agentMapUtils';

export class AgentMapGraphBuilder {
  private readonly nodes = new Map<string, AgentMapNode>();
  private readonly edges = new Map<string, AgentMapEdge>();
  readonly diagnostics: AgentMapDiagnostic[] = [];

  addNode(node: Omit<AgentMapNode, 'searchText'>): string {
    if (!this.nodes.has(node.id)) this.nodes.set(node.id, withNodeSearchText(node));
    return node.id;
  }

  updateNode(
    id: string,
    update: Partial<Omit<AgentMapNode, 'id' | 'searchText'>>,
  ): boolean {
    const current = this.nodes.get(id);
    if (!current) return false;
    this.nodes.set(id, withNodeSearchText({ ...current, ...update }));
    return true;
  }

  addEdge(edge: Omit<AgentMapEdge, 'id' | 'searchText'>): void {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      this.diagnostics.push({
        code: 'edge-endpoint-missing',
        severity: 'warning',
        message: `Skipped ${edge.relationship} because an endpoint was unavailable.`,
        sourceId: edge.source,
      });
      return;
    }
    const evidence = clipAgentMapText(edge.evidence, 240) ?? edge.relationship;
    const identity = [
      edge.source,
      edge.target,
      edge.relationship,
      edge.provenance,
      evidence,
    ].join('|');
    const id = createAgentMapId('edge', identity);
    if (this.edges.has(id)) return;
    this.edges.set(id, withEdgeSearchText({
      ...edge,
      id,
      evidence,
      confidence: Math.max(0, Math.min(1, edge.confidence)),
    }));
  }

  finalize(): AgentMapGraph {
    const nodes = [...this.nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
    const edges = [...this.edges.values()].sort((left, right) => left.id.localeCompare(right.id));
    const skillReferenceEdges = edges.filter(edge =>
      edge.provenance === 'textual-exact' ||
      edge.provenance === 'textual-strong' ||
      edge.provenance === 'model-inferred');
    const linkedSkillIds = new Set(skillReferenceEdges.map(edge => edge.source));
    const skillNodes = nodes.filter(node => node.category === 'skill');

    return {
      nodes,
      edges,
      diagnostics: [...this.diagnostics],
      summary: {
        nodeCount: nodes.length,
        componentCount: nodes.filter(node => node.category !== 'agent').length,
        edgeCount: edges.length,
        unresolvedCount: nodes.filter(node => node.resolution === 'unresolved').length,
        skillReferenceCount: skillReferenceEdges.length,
        linkedSkillCount: skillNodes.filter(node => linkedSkillIds.has(node.id)).length,
        unlinkedSkillCount: skillNodes.filter(node => !linkedSkillIds.has(node.id)).length,
      },
    };
  }
}
