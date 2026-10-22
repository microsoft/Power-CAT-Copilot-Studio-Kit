export type AgentMapNodeCategory =
  | "agent"
  | "tool"
  | "skill"
  | "topic"
  | "action"
  | "knowledge"
  | "connected-agent"
  | "trigger"
  | "evaluation-set"
  | "test-case"
  | "unknown";

export type AgentMapProvenance = "structural" | "textual-exact" | "textual-strong";

export interface AgentMapNode {
  id: string;
  category: AgentMapNodeCategory;
  label: string;
  subtitle: string;
  componentId?: string;
  componentIdUnique?: string;
  actionPath?: string;
  schemaName?: string;
  parentId?: string;
  depth?: number;
  targetAgentSchemaName?: string;
  iconBase64?: string;
  description?: string;
  details: Record<string, string | number | boolean | string[]>;
  warnings: string[];
}

export interface AgentMapEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  provenance: AgentMapProvenance;
  evidence: string;
  confidence: number;
}

export interface AgentMapDiagnostic {
  code: string;
  severity: "info" | "warning";
  message: string;
  sourceId?: string;
}

export interface AgentMapGraph {
  agent: {
    id: string;
    name: string;
    environmentId: string;
    environmentName: string;
  };
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
