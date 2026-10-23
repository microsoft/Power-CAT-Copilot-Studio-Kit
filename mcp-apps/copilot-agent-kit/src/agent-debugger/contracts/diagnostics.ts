export interface ConversationTranscriptJson {
  conversationId: string;
  recordCount: number;
  activityCount: number;
  records: Array<{
    conversationtranscriptid: string;
    name?: string;
    conversationstarttime?: string;
    createdon?: string;
    schematype?: string;
    schemaversion?: string;
    statecode?: number;
    content: Record<string, unknown> & { activities: Record<string, unknown>[] };
    metadata?: Record<string, unknown>;
  }>;
}

export interface UsageDiagnostics {
  reported: {
    copilotCredits?: number;
    aiBuilderCredits?: number;
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    tokenRecords: number;
    creditRecords: number;
    models: string[];
    source: "activity-usage" | "processed-token-observations" | "not-reported";
  };
  estimatedCredits?: number;
  confidence: "low" | "medium" | "none";
  groups: Array<{
    kind: string;
    label: string;
    count: number;
    rate: number;
    credits: number;
    confidence: "low" | "medium";
    evidence: string;
  }>;
  notes: string[];
}
