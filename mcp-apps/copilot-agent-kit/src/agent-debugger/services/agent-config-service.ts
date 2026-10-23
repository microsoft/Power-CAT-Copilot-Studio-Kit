export type AgentToolType = "flow" | "mcp" | "connector" | "prompt" | "unknown";
export type AgentKnowledgeType =
  | "SharePoint"
  | "Web"
  | "Dataverse"
  | "File"
  | "Unknown";

export interface AgentConfigVariable {
  name: string;
  description?: string;
}

export interface AgentConfigTopic {
  topicName: string;
  modelName?: string;
  modelDescription?: string;
  inputVariables?: AgentConfigVariable[];
  outputVariables?: AgentConfigVariable[];
  status?: "Enabled" | "Disabled";
}

export interface AgentConfigTool {
  name: string;
  displayName?: string;
  description?: string;
  toolType: AgentToolType;
  status?: "Enabled" | "Disabled";
}

export interface AgentConfigKnowledge {
  name: string;
  sourceType: AgentKnowledgeType;
  url?: string;
  status?: "Enabled" | "Disabled";
}

export interface AgentConfigChildAgent {
  name: string;
  description?: string;
  status?: "Enabled" | "Disabled";
  relationship?: "Child" | "Connected";
}

export interface AgentConfigSkill {
  name: string;
  description?: string;
  status?: "Enabled" | "Disabled";
}

export interface AgentConfigSettings {
  language?: string;
  authenticationMode?: string;
  useModelKnowledge?: boolean;
  isSemanticSearchEnabled?: boolean;
  optInUseLatestModels?: boolean;
  orchestrationType?: string;
  isGenerativeDesigner?: boolean;
  isMemoryEnabled?: boolean;
}

export interface AgentConfig {
  botName: string;
  description?: string;
  settings?: AgentConfigSettings;
  instructions?: string;
  topics: AgentConfigTopic[];
  tools: AgentConfigTool[];
  knowledge: AgentConfigKnowledge[];
  childAgents: AgentConfigChildAgent[];
  skills: AgentConfigSkill[];
}
