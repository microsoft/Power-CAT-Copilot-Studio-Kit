import { DEFAULT_PROMPT_ENVIRONMENT } from "../../tools/target-selection.js";

export const DEFAULT_DEBUGGER_ENVIRONMENT = DEFAULT_PROMPT_ENVIRONMENT;

export interface DebuggerEnvironmentRef {
  id: string;
  name: string;
  url?: string;
}

export interface DebuggerAgentRef {
  id: string;
  name: string;
  componentIdUnique?: string;
}

export interface DebuggerSelectionInput {
  environmentId?: string;
  environmentName?: string;
  agentId?: string;
  agentName?: string;
  conversationId?: string;
  startedAfter?: string;
  startedBefore?: string;
}
