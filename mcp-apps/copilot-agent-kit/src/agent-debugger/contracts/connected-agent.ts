/**
 * Types for Connected Agent (child agent) support.
 * Connected agents are invoked by a parent agent via InvokeConnectedAgentTaskAction.
 *
 * In Dataverse, the child transcript's conversationId is constructed as:
 *   "{parentConversationId}_{connectedAgentSessionId}"
 */

import type { ProcessedTurn } from "./transcript.js";

export interface ConnectedAgentInfo {
  /**
   * Distinguishes a CONNECTED agent (separate published agent invoked via
   * `InvokeConnectedAgentTaskAction`, with its own child transcript fetched
   * from Dataverse) from a CHILD agent (in-app sub-agent surfaced inline via
   * `DynamicPlanStepTriggered` with `type === "Agent"` and a `.agent.`
   * schema). Drives icon + label selection in `ConnectedAgentCard`.
   */
  agentKind: "connected" | "child";
  /** The schema name of the connected agent (e.g., cr7f9_contosoSupportAssistant) */
  botSchemaName: string;
  /** The session ID for the connected agent session */
  sessionId: string;
  /** The parent agent schema name */
  parentBotSchemaName: string;
  /** The dialog/action that invoked the connected agent */
  dialogSchemaName: string;
  /** Display name of the connected agent (derived from schema or trace data) */
  displayName: string;
  /** The constructed conversationId to fetch the child transcript */
  childConversationId: string;
  /** Execution time string from DynamicPlanStepFinished (e.g., "00:00:37.33") */
  executionTime?: string;
  /** Parsed execution time in seconds */
  executionTimeSeconds?: number;
  /** The instruction/prompt passed to the connected agent */
  instruction?: string;
  /** Topics triggered within the connected agent */
  childTopics: ConnectedAgentChildTopic[];
  /** The full parsed child transcript turns (populated after fetch) */
  childTranscript?: ProcessedTurn[];
  /** The replyToId that links this connected agent to the parent turn */
  parentReplyToId?: string;
  /** The step ID from DynamicPlanStepTriggered */
  stepId?: string;
  /** Whether the child transcript has been fetched */
  isFetched: boolean;
  /** Whether the child transcript is currently being fetched */
  isFetching: boolean;
  /** Error message if fetch failed */
  fetchError?: string;
  /** Dataverse record ID(s) of the child transcript (populated after fetch) */
  childTranscriptRecordIds?: string[];
}

export interface ConnectedAgentChildTopic {
  /** Topic display name (e.g., "Account Management") */
  displayName: string;
  /** Topic schema ID (e.g., cr7f9_contosoSupportAssistant.topic.AccountManagement) */
  schemaId: string;
  /** Type emitted by DynamicPlanStepTriggered (e.g., "CustomTopic", "Action",
   *  "KnowledgeSource", "LlmSkill") — empty for plan-only entries that never executed. */
  type: string;
  /** Execution time if available */
  executionTime?: string;
  /** Execution time in seconds */
  executionTimeSeconds?: number;
  /** Whether the step actually executed (i.e. came from a stepExecution, not just a plan list). */
  hasExecution?: boolean;
  /** Plan step UUID (from DynamicPlanStepTriggered.stepId). */
  stepId?: string;
  /** LLM thought from DynamicPlanStepTriggered. */
  thought?: string;
  /** Step arguments from DynamicPlanStepBindUpdate. */
  arguments?: Record<string, unknown>;
  /** Step observation from DynamicPlanStepFinished. */
  observation?: unknown;
  /** Final state ("completed" / "failed" / etc.) from DynamicPlanStepFinished. */
  state?: string | number;
}
