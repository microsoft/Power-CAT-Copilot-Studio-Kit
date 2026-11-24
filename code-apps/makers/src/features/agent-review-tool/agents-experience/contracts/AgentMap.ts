import type { AeTool, AgentsExperienceModel } from './AgentsExperienceModel';
import type { SkillBundleReviewResult } from './SkillBundle';
import type {
  CopilotReviewDisplayPayload,
  PersistedSkillBundleReview,
} from '../../contracts/ReviewResult';

export type AgentMapNodeCategory =
  | 'agent'
  | 'topic'
  | 'tool'
  | 'skill'
  | 'knowledge'
  | 'connected-agent'
  | 'child-agent'
  | 'entity'
  | 'configuration'
  | 'trigger'
  | 'evaluation-set'
  | 'test-case'
  | 'unknown';

export type AgentMapProvenance =
  | 'structural'
  | 'textual-exact'
  | 'textual-strong'
  /**
   * Asserted by the reviewing agent (workflow TASK 7), which reads the skill and
   * the agent's configured capabilities together. Unlike the textual kinds it
   * understands polarity ("do not copy file contents" is not a dependency) and
   * paraphrase, so it links capabilities a text matcher cannot see. It is also
   * the only kind a model can get wrong in ways evidence alone will not reveal,
   * so it is rendered as its own filterable class rather than folded into the
   * textual ones.
   */
  | 'model-inferred';

export type AgentMapResolution = 'resolved' | 'unresolved';

export type AgentMapDetailValue = string | number | boolean | string[];

export interface AgentMapNode {
  id: string;
  category: AgentMapNodeCategory;
  label: string;
  subtitle?: string;
  /** Parsed tool subtype used for exact MCP/connector presentation. */
  toolKind?: AeTool['kind'];
  schemaName?: string;
  componentId?: string;
  componentIdUnique?: string;
  targetAgentSchemaName?: string;
  /**
   * Per-agent icon from the `bots.iconbase64` column, as a data URL.
   *
   * Agents and connected agents each carry their own maker-chosen icon, which
   * is what the review grids show. Using it here makes a node recognisable at a
   * glance instead of every agent sharing one generic glyph.
   */
  iconBase64?: string;
  description?: string;
  parentId?: string;
  depth: number;
  details: Record<string, AgentMapDetailValue>;
  warnings: string[];
  resolution: AgentMapResolution;
  searchText: string;
}

export interface AgentMapEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  provenance: AgentMapProvenance;
  evidence: string;
  confidence: number;
  resolution: AgentMapResolution;
  sourceField?: string;
  directed: boolean;
  searchText: string;
}

export interface AgentMapDiagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  sourceId?: string;
}

export interface AgentMapGraph {
  nodes: AgentMapNode[];
  edges: AgentMapEdge[];
  diagnostics: AgentMapDiagnostic[];
  summary: {
    nodeCount: number;
    componentCount: number;
    edgeCount: number;
    unresolvedCount: number;
    skillReferenceCount: number;
    linkedSkillCount: number;
    unlinkedSkillCount: number;
  };
}

export interface AgentMapBuildInput {
  agentId: string;
  agentName: string;
  model: AgentsExperienceModel;
  /** Icon data URLs keyed by bot schema name, plus `root` for the agent itself. */
  agentIcons?: Record<string, string>;
  skillBundleReviews?: Array<SkillBundleReviewResult | PersistedSkillBundleReview>;
  expandedConnectedAgent?: AgentMapConnectedAgentExpansion;
}

/** A live, same-environment component snapshot resolved from ConnectedAgentTool.botSchemaName. */
export interface AgentMapConnectedAgentSnapshot {
  agentId: string;
  agentName: string;
  agentSchemaName: string;
  model: AgentsExperienceModel;
}

/** Associates a loaded target snapshot with the ConnectedAgentTool node that requested it. */
export interface AgentMapConnectedAgentExpansion {
  sourceNodeId: string;
  snapshot: AgentMapConnectedAgentSnapshot;
}

export interface AgentMapFilters {
  query: string;
  categories: ReadonlySet<AgentMapNodeCategory>;
  provenances: ReadonlySet<AgentMapProvenance>;
  includeUnresolved: boolean;
}

export interface FilteredAgentMapGraph {
  nodes: AgentMapNode[];
  edges: AgentMapEdge[];
  matchedNodeIds: ReadonlySet<string>;
  matchedEdgeIds: ReadonlySet<string>;
}

export interface AgentMapLayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AgentMapLayout {
  nodes: AgentMapLayoutNode[];
  algorithm: 'concentric-radial';
}

export interface CachedAgentMapInput {
  agentId: string;
  agentName: string;
  payload: CopilotReviewDisplayPayload;
  /** Icon data URLs keyed by bot schema name, plus `root` for the agent itself. */
  agentIcons?: Record<string, string>;
}
