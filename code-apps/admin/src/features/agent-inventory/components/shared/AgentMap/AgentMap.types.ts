export type AgentMapNodeCategory =
  | 'agent'
  | 'tool'
  | 'prompt'
  | 'http-action'
  | 'connection'
  | 'classic-data-source'
  | 'skill'
  | 'knowledge'
  | 'connected-agent'
  | 'trigger'
  | 'evaluation'
  | 'unknown';

export type AgentMapStatus = 'default' | 'warning' | 'error' | 'success';
export type AgentMapEdgeStyle = 'solid' | 'dashed' | 'dotted';
export type AgentMapMetadataValue = string | number | boolean | null;

export interface AgentMapNode {
  id: string;
  label: string;
  category: AgentMapNodeCategory;
  subtitle?: string;
  description?: string;
  status?: AgentMapStatus;
  depth?: number;
  metadata?: Record<string, AgentMapMetadataValue>;
}

export interface AgentMapEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  directed?: boolean;
  style?: AgentMapEdgeStyle;
  status?: AgentMapStatus;
  metadata?: Record<string, AgentMapMetadataValue>;
}

export interface AgentMapData {
  version: 1;
  title?: string;
  description?: string;
  sourceLabel?: string;
  nodes: AgentMapNode[];
  edges: AgentMapEdge[];
}

export interface ValidatedAgentMapData {
  data?: AgentMapData;
  errors: string[];
  warnings: string[];
}

export interface AgentMapProps {
  data: AgentMapData;
  ariaLabel?: string;
}
