/**
 * Payload shapes of the `value` property on classic-orchestration transcript
 * activities (messages, traces, events and invokes), as read by the transcript
 * parsers.
 *
 * Each interface describes a well-formed event. The parsers still check a
 * property before they read it, because a transcript can be partial or come
 * from an older service version.
 */

import type { Activity, ProcessedDebugInfo, ProcessedTurn } from "./transcript";

/** A Bot Framework message attachment. */
export interface ActivityAttachment {
  contentType?: string;
  content?: unknown;
}

/** An {@link Activity} with its attachments typed. */
export type ActivityWithAttachments = Omit<Activity, "attachments"> & {
  attachments?: ActivityAttachment[];
};

/** An {@link Activity} whose `value` has a known payload shape. */
export type ActivityWithValue<TValue> = Omit<Activity, "value"> & {
  value?: TValue;
};

/** `value` of a user message sent from a card action (for example a button). */
export type CardActionValue = NonNullable<ProcessedTurn["userAction"]>;

/** `value` of an old-style `feedback` event. */
export type FeedbackEventValue = NonNullable<ProcessedTurn["feedback"]>;

/** `value` of a `message/submitAction` invoke (new-style feedback). */
export interface SubmitActionInvokeValue {
  actionName?: string;
  /** For feedback: `{ reaction: "like" | "dislike", feedback: { feedbackText } }`. */
  actionValue?: Record<string, unknown>;
}

/** `value` of an `IntentRecognition` trace: the topic that the user message triggered. */
export interface IntentRecognitionValue {
  intentTitle?: string;
  intentId?: string;
}

/** `value` of a `DynamicServerInitialize` event (MCP server handshake). */
export interface DynamicServerInitializeValue {
  dialogSchemaName?: string;
  initializationResult: {
    protocolVersion?: string;
    capabilities?: Record<string, unknown>;
    serverInfo?: { name?: string; description?: string; version?: string };
    sessionInfo?: { id?: string };
  };
}

/** Type descriptor of an MCP tool input, for example `{ $kind: "String" }`. */
export interface McpTypeDescriptor {
  $kind?: string;
}

/** One tool listed by a `DynamicServerToolsList` event. */
export interface McpToolDefinition {
  displayName: string;
  identifier: string;
  description: string;
  schemaName?: string;
  llmIdentifierPrefix?: string;
  inputs?: Array<{
    name: string;
    description: string;
    /** A type descriptor, or a plain type name in older payloads. */
    type?: McpTypeDescriptor | string;
    isRequired?: boolean;
  }>;
}

/** `value` of a `DynamicServerToolsList` event (tools offered by an MCP server). */
export interface DynamicServerToolsListValue {
  toolsList: McpToolDefinition[];
}

/** `value` of a `DynamicPlanReceived` event: the orchestrator's plan. */
export interface DynamicPlanReceivedValue {
  steps: string[];
  planIdentifier: string;
  isFinalPlan: boolean;
  /** On a nested plan: the identifier of the step that owns the plan. */
  parentPlanStepIdentifier?: string;
}

/** `value` of a `DynamicPlanReceivedDebug` event. */
export interface DynamicPlanReceivedDebugValue {
  /** The user question the plan answers. */
  ask?: string;
}

/** `value` of a `DynamicPlanFinished` event. */
export interface DynamicPlanFinishedValue {
  planId?: string;
}

/** `value` of a `DynamicPlanStepTriggered` event: a plan step started. */
export interface DynamicPlanStepTriggeredValue {
  taskDialogId: string;
  stepId: string;
  planIdentifier?: string;
  thought?: string;
  /** Step kind, for example "CustomTopic", "KnowledgeSource" or "Agent". */
  type: string;
  state?: number;
  hasRecommendations?: boolean;
}

/** `value` of a `DynamicPlanStepBindUpdate` event: inputs bound to a step. */
export interface DynamicPlanStepBindUpdateValue {
  taskDialogId: string;
  stepId?: string;
  /** Step inputs keyed by name. Knowledge searches set the search fields. */
  arguments?: {
    search_query?: string;
    search_keywords?: string;
    [name: string]: unknown;
  };
}

/** Model usage that an AI Builder prompt step reports in its observation. */
export type PredictionOutput = {
  modelName?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

/** Result of a finished plan step. */
export interface StepObservation {
  search_result?: { Text?: { CitationSources?: unknown } };
  content?: Array<{ text: string; type: string }>;
  predictionOutput?: PredictionOutput;
}

/** `value` of a `DynamicPlanStepFinished` event: a plan step completed. */
export interface DynamicPlanStepFinishedValue {
  taskDialogId: string;
  stepId?: string;
  state?: number | string;
  executionTime?: string;
  observation?: StepObservation;
}

/** `value` of a `DynamicPlanStepBlocked` event (for example a content filter block). */
export interface DynamicPlanStepBlockedValue {
  taskDialogId: string;
  stepId?: string;
  executionTime?: string;
  /** Error details: `code`, `message` and `exception.reasonCode`. */
  messageBlockedError?: Record<string, unknown>;
}

/** `value` of a `VariableAssignment` trace. */
export interface VariableAssignmentValue {
  name: string;
  newValue?: unknown;
}

/** `value` of a `ConnectedAgentInitializeTraceData` trace. The parser copies it as-is. */
export type ConnectedAgentInitializeValue = NonNullable<
  ProcessedDebugInfo["connectedAgentInitialize"]
>;

/** `value` of a `ConnectedAgentCompletedTraceData` trace. The parser copies it as-is. */
export type ConnectedAgentCompletedValue = NonNullable<
  ProcessedDebugInfo["connectedAgentCompleted"]
>;

/** One action recorded by a `DialogTracing` trace. */
export interface DialogTracingAction {
  topicId?: string;
  dialogComponentId?: string;
}

/** `value` of a `DialogTracing` trace. */
export interface DialogTracingValue {
  actions: DialogTracingAction[];
}

/** `value` of a `UniversalSearchToolTraceData` trace. */
export interface UniversalSearchToolTraceDataValue {
  /** Names of the knowledge sources that were searched. */
  knowledgeSources?: string[];
  /** Names of the knowledge sources that returned results. */
  outputKnowledgeSources?: string[];
}

/** `value` of a `KnowledgeTraceData` trace. */
export interface KnowledgeTraceDataValue {
  isKnowledgeSearched?: boolean;
  /** Names of the knowledge sources cited in the answer. */
  citedKnowledgeSources?: string[];
}

/** Token usage of one LLM call. */
export interface CapiResourceUsage {
  PromptTokens: number;
  CompletionTokens: number;
  TotalTokens: number;
  ModelName: string;
}

/** One LLM response recorded in GenerativeAnswersSupportData. */
export interface GenerativeAnswersResponse {
  PromptTokens?: number;
  CompletionTokens?: number;
  TotalTokens?: number;
  ModelName?: string;
  CapiResourceUsage?: CapiResourceUsage;
}

/** `value` of a `GenerativeAnswersSupportData` trace. */
export interface GenerativeAnswersSupportDataValue {
  queryRewrittingOpenAIResponse?: GenerativeAnswersResponse;
  queryRewritingOpenAIResponse?: GenerativeAnswersResponse;
  completionOpenAIResponse?: GenerativeAnswersResponse;
  openAIResponse?: GenerativeAnswersResponse;
  summarizationOpenAIResponse?: GenerativeAnswersResponse;
}

/** `value` of a `SessionInfo` trace. */
export interface SessionInfoValue {
  outcome: string;
  outcomeReason: string;
}
