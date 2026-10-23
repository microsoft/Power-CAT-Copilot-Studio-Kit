export type FlowStep = {
  key: string;
  kind: "mcp" | "step" | "genai" | "vars" | "intent" | "error" | "code" | "thinking" | "trace";
  title: string;
  subtitle: string;
  duration?: string;
  statusText?: string;
  taskDialogId?: string;
  stepId?: string;
  mcpServerSchemaName?: string;
  mcpToolIdentifier?: string;
  mcpServerDisplayName?: string;
  activityIndex?: number;
  /** Raw NodeTraceData activities grouped into one logical topic execution. */
  activityIndices?: number[];
  traceActivities?: Array<{
    activityIndex: number;
    nodeType?: string;
    nodeId?: string;
    topic?: string;
    outcome?: string;
    reason?: string;
    startTime?: string;
    endTime?: string;
  }>;
  thought?: string;
  description?: string;
  modelDescription?: string;
  triggerQueries?: string[];
  errorCode?: string;
  errorSubCode?: string;
  errorMessage?: string;
  codePreview?: string;
  codeResponse?: string;
  codeInputs?: Record<string, unknown>;
  finishedState?: string;
  blockedError?: { code: string; message: string; reasonCode?: string };
  genAiSupportData?: unknown;
  tokenInfo?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    model?: string;
  };
  parentStepKey?: string;
  hasDetail?: boolean;
};
