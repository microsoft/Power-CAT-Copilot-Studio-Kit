export interface ConversationData {
  id: string;
  generalInfo: GeneralInfo;
  messages: Message[];
}

export interface GeneralInfo {
  numberOfSessions: number;
  numberOfTurns: number;
  globalOutcome: string;
  totalDuration: number;
  inactivityCounts: number;
  totalTokensUsed: number;
  model: string;
  modelName?: string;
  gptAnswerState: string;
  contentModeration: string;
  conversationStartTime?: string;
  channelId?: string;
  metadata?: string;
}

export interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  timestamp: string;
  debugInfo?: DebugInfo;
  adaptiveCard?: unknown;
}

export interface DebugInfo {
  topicDetails: TopicDetails;
  planDetails: PlanDetails;
  thoughtProcess: ThoughtProcess;
  searchQuery: SearchQuery | null;
  knowledgeSources: KnowledgeSource[];
  tokenUsage: TokenUsage;
  executionTime: ExecutionTime;
}

export interface TopicDetails {
  topicName: string;
  topicTrigger: string;
  recognitionType: string;
}

export interface PlanDetails {
  actionType: string;
  actionStatus: string;
  planFinished: boolean;
}

export interface ThoughtProcess {
  userIntent: string;
  selectedAction: string;
}

export interface SearchQuery {
  query: string;
  keywords: string[];
}

export interface KnowledgeSource {
  name: string;
  type: string;
  relevance: number;
  used: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ExecutionTime {
  totalResponseTime: number;
  knowledgeSearch: number;
  llmProcessing: number;
}
