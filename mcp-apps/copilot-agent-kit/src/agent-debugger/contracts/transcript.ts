export interface Activity {
  id?: string;
  type: string;
  valueType?: string;
  timestamp?: string | number;
  timestampMs?: string | number;
  from?: {
    id?: string;
    role?: number | string;
    name?: string;
    aadObjectId?: string;
  };
  text?: string;
  speak?: string;
  value?: unknown;
  channelId?: string;
  channelData?: unknown;
  replyToId?: string;
  attachments?: unknown[];
  name?: string;
  /** Internal merge-tracking field — identifies which merged transcript segment this activity belongs to. */
  mergedSessionKey?: string;
}

export interface MCPServerInfo {
  name: string;
  description?: string;
  version: string;
  sessionId: string;
  protocolVersion: string;
  capabilities?: Record<string, unknown>;
  schemaName?: string;
}

export interface MCPTool {
  displayName: string;
  identifier: string;
  description: string;
  schemaName?: string;
  llmIdentifierPrefix?: string;
  inputs?: Array<{
    name: string;
    description: string;
    type: string;
    required?: boolean;
  }>;
}

export interface StepExecution {
  stepId: string;
  taskDialogId: string;
  thought?: string;
  type?: string;
  state?: number | string;
  hasRecommendations?: boolean;
  /** Populated from DynamicPlanStepBlocked.messageBlockedError — Responsible AI / content filter block. */
  blockedError?: { code: string; message: string; reasonCode?: string };
  arguments?: Record<string, unknown>;
  executionTime?: string;
  observation?: unknown;
  triggeredAt?: string;
  finishedAt?: string;
  /**
   * For nested plans: `${parentTaskDialogId}:${parentStepId}` of the step
   * that owns this sub-plan. Populated from
   * `DynamicPlanReceived.parentPlanStepIdentifier`. The UI can use this to
   * nest sub-steps under their parent agent step (e.g. UniversalSearchTool
   * inside a lightweight `cr7f9_*.agent.Agent` invocation).
   */
  parentStepKey?: string;
  /** Identifier of the plan this step belongs to. */
  planIdentifier?: string;
  /**
   * Step-level GenerativeAnswersSupportData payload — bound here when this
   * step is the producer (e.g. UniversalSearchTool or a Custom Prompt).
   * Avoids attributing the LLM summarization to the whole turn.
   */
  genAiSupportData?: unknown;
  /** Step-level token usage parsed from genAiSupportData (CapiResourceUsage). */
  tokenInfo?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    model?: string;
  };
  /** Step-level knowledge-source breakdown (searched/output/cited). */
  knowledgeSources?: KnowledgeSourcesDebugInfo;
  /**
   * Generative orchestration (new designer) only — human-readable tool name from
   * `ToolCallTrace:Started.value.toolDisplayName`. The Debug Panel prefers this
   * over the taskDialogId-derived title when present.
   */
  displayName?: string;
  /**
   * Generative orchestration only — explicit UI subtitle derived from
   * `toolKind` ("Tool" | "Knowledge" | "Connected agent"). Preferred over the
   * schema-heuristic {@link guessStepSubtitle} when present.
   */
  subtitle?: string;
  /** Generative orchestration only — raw `toolKind` ("tool" | "search" | "agent"). */
  toolKind?: string;
  /** Generative orchestration only — error message from a failed `ToolCallTrace:Failed`. */
  errorMessage?: string;
}

export interface KnowledgeSourcesDebugInfo {
  searched?: string[];
  output?: string[];
  cited?: string[];
  isKnowledgeSearched?: boolean;
  startedAt?: string;
  finishedAt?: string;
  executionTime?: string;
}

export interface TranscriptData {
  activities: Activity[];
}

export interface ProcessedTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  debugInfo?: ProcessedDebugInfo;
  activities: Activity[];
  userAction?: {
    action: string;
    id: string;
  };
  feedback?: {
    rating: "thumbsUp" | "thumbsDown";
    comment?: string;
  };
  /** Every feedback event captured for this response, in transcript order. */
  feedbackEvents?: Array<{
    rating: "thumbsUp" | "thumbsDown";
    comment?: string;
  }>;
}

export interface ProcessedDebugInfo {
  intent?: string;
  intentRecognition?: {
    intentTitle?: string;
    intentType?: number;
    triggerUtterance?: string;
    normalizedTriggerUtterance?: string;
    intentId?: string;
    intentScore?: {
      score?: number;
      properties?: Record<string, unknown>;
    };
    timestamp?: string;
  };
  variables?: Record<string, unknown>;
  ask?: string;
  thought?: string;
  stepType?: string;
  stepTypeName?: string;
  stepTypes?: Array<{
    type: string;
    typeName: string;
    thought?: string;
    timestamp?: string;
    taskDialogId?: string;
    state?: number;
  }>;
  plan?: {
    steps: string[];
    stepNames?: string[];
    planIdentifier: string;
    isFinalPlan: boolean;
  };
  planFinished?: {
    planId?: string;
  };
  connectedAgentInitialize?: {
    conversationId?: string;
    sessionId?: string;
    channelId?: string;
    userId?: string;
    planStepId?: string;
    botSchemaName?: string;
    parentBotSchemaName?: string;
    dialogSchemaName?: string;
  };
  connectedAgentCompleted?: {
    parentBotSchemaName?: string;
    connectedAgentBotSchemaName?: string;
  };
  arguments?: Record<string, unknown>;
  searchQuery?: string;
  searchKeywords?: string;
  knowledgeSources?: KnowledgeSourcesDebugInfo;
  genAiSupportData?: unknown;
  citations?: unknown;
  searchResults?: unknown;
  responseGeneratorData?: unknown;
  codeExecution?: unknown;
  executionTime?: string;
  stepFinishedContent?: Array<{ text: string; type: string }>;
  adaptiveCard?: unknown;
  genAiFeedback?: unknown;
  tokenInfo?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model?: string;
  };
  initialTopic?: {
    topicId: string;
    topicName?: string;
    dialogComponentId?: string;
  };
  timestamps?: Record<string, string>;

  mcpServerInfo?: MCPServerInfo;
  mcpServers?: MCPServerInfo[];
  mcpTools?: MCPTool[];
  stepExecutions?: StepExecution[];
}

export interface ProcessedTranscript {
  generalInfo: {
    durationMs: number;
    duration?: string;
    turnCount: number;
    outcome?: string;
  };
  turns: ProcessedTurn[];
  raw: TranscriptData;
}
