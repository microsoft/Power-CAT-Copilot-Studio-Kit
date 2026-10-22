/**
 * Service to detect, fetch, and manage connected agent (child) transcripts.
 *
 * Connected agent transcripts are stored in Dataverse conversationtranscripts
 * with a conversationId = "{parentConversationId}_{connectedAgentSessionId}".
 *
 * Detection is done by looking for ConnectedAgentInitializeTraceData events
 * in the parent transcript's activities.
 */

import { formatMsAsExecutionTime } from "../utils/step-classification.js";
import { activityTimestampMs } from "../utils/transcript/timestamp.js";
import type {
  ConnectedAgentInfo,
  ConnectedAgentChildTopic,
} from "../contracts/connected-agent.js";

// ─── Public: Detection ─────────────────────────────────────────────

/**
 * Builds the child conversation ID from parent conversation ID and session ID.
 */
export function buildChildConversationId(
  parentConversationId: string,
  connectedAgentSessionId: string
): string {
  return `${parentConversationId}_${connectedAgentSessionId}`;
}

/**
 * Detects connected agent invocations from parent transcript activities.
 *
 * Looks for `ConnectedAgentInitializeTraceData` events and correlates with
 * the preceding `DynamicPlanStepTriggered` (InvokeConnectedAgentTaskAction)
 * and subsequent `DynamicPlanStepFinished` for execution time.
 */
export function detectConnectedAgents(
  activities: unknown[],
  parentConversationId: string
): ConnectedAgentInfo[] {
  const connectedAgents: ConnectedAgentInfo[] = [];
  const seen = new Set<string>();

  for (const activity of activities) {
    const a = activity as Record<string, unknown>;
    if (
      a.valueType === "ConnectedAgentInitializeTraceData" ||
      a.name === "ConnectedAgentInitializeTraceData"
    ) {
      const value = (a.value ?? {}) as Record<string, unknown>;
      const botSchemaName = String(value.botSchemaName ?? "");
      const sessionId = String(value.sessionId ?? "");
      const parentBotSchemaName = String(value.parentBotSchemaName ?? "");
      const dialogSchemaName = String(value.dialogSchemaName ?? "");
      const planStepId = String(value.planStepId ?? "");

      // Deduplicate by sessionId
      if (!sessionId || seen.has(sessionId)) continue;
      seen.add(sessionId);

      const displayName = deriveConnectedAgentDisplayName(dialogSchemaName, botSchemaName);

      // Child conversation id resolution.
      //   Classic transcripts: the trace `conversationId` is already the child
      //   id ("{parent}_{sessionId}").
      //   Generative (new designer): the trace `conversationId` is only the
      //   PARENT id, and the real child conversation id is inside the correlated
      //   agent tool call's result. Build "{parentConvId}_{childConvId}" so a
      //   Contains-fetch matches the stored "{parent}_{child}_{session}" name.
      const traceConversationId = String(value.conversationId ?? "");
      const generativeChildConvId = findGenerativeAgentChildConversationId(
        activities,
        planStepId || sessionId
      );
      const childConversationId = generativeChildConvId
        ? `${traceConversationId || parentConversationId}_${generativeChildConvId}`
        : traceConversationId
          ? traceConversationId
          : buildChildConversationId(parentConversationId, sessionId);

      // Find matching step triggered/finished for this specific invocation
      // using planStepId which links the trace to its DynamicPlanStepTriggered
      const stepInfo = findConnectedAgentStepInfo(activities, planStepId);

      connectedAgents.push({
        agentKind: "connected",
        botSchemaName,
        sessionId,
        parentBotSchemaName,
        dialogSchemaName,
        displayName,
        childConversationId,
        executionTime: stepInfo.executionTime,
        executionTimeSeconds: stepInfo.executionTimeSeconds,
        instruction: stepInfo.instruction,
        childTopics: [],
        parentReplyToId: a.replyToId as string | undefined,
        stepId: planStepId || stepInfo.stepId,
        isFetched: false,
        isFetching: false,
      });
    }
  }

  return connectedAgents;
}

/**
 * Checks if a transcript belongs to a connected agent (child) session.
 * A connected agent transcript starts with a message named "startConnectedAgent".
 */
export function isConnectedAgentTranscript(activities: unknown[]): boolean {
  return activities.some((a) => {
    const act = a as Record<string, unknown>;
    return act.type === "message" && act.name === "startConnectedAgent";
  });
}

/**
 * Extracts the parent conversation context from a child transcript.
 * The `startConnectedAgent` message contains:
 * - text: instruction/prompt from parent
 * - attachments[0].content: parent conversation history
 */
export function extractParentContext(activities: unknown[]): {
  instruction: string;
  parentHistory: unknown[];
} | null {
  const startActivity = activities.find((a) => {
    const act = a as Record<string, unknown>;
    return act.type === "message" && act.name === "startConnectedAgent";
  }) as Record<string, unknown> | undefined;

  if (!startActivity) return null;

  const attachments = startActivity.attachments as Array<Record<string, unknown>> | undefined;
  const parentHistory = (attachments?.[0]?.content ?? []) as unknown[];

  return {
    instruction: String(startActivity.text ?? ""),
    parentHistory,
  };
}

// ─── Public: Child Topic Extraction ────────────────────────────────

/**
 * Extracts child topics from a connected agent's transcript activities.
 * Collects ALL planned steps from DynamicPlanReceived events (including
 * steps that were never triggered due to errors), enriches with type
 * data from DynamicPlanStepTriggered where available.
 *
 * Also surfaces non-plan activities the user expects to see in the child
 * agent view — currently MCP server initializations (`DynamicServerInitialize`).
 * The parent panel renders these as their own activity cards; the
 * connected-agent card mirrors the same set so the timeline isn't artificially
 * pruned to plan-execution only.
 *
 * Steps can appear in multiple DynamicPlanReceived events when the
 * orchestrator re-plans; each occurrence is shown.
 */
export function extractChildTopics(
  childActivities: unknown[]
): ConnectedAgentChildTopic[] {
  const topics: ConnectedAgentChildTopic[] = [];

  // 1) MCP server initialisations — emit one entry per unique server. We
  //    correlate Initialize ↔ InitializeConfirmation (or fall back to the
  //    later DynamicServerToolsList event) by `dialogSchemaName` to compute
  //    a duration when timestamps allow.
  const mcpInitTimestamps = new Map<string, number>();
  const mcpFinishTimestamps = new Map<string, number>();
  const mcpServerNames = new Map<string, string>();
  for (const activity of childActivities) {
    const a = activity as Record<string, unknown>;
    const eventName = String(a.name ?? a.valueType ?? "");
    if (
      eventName !== "DynamicServerInitialize" &&
      eventName !== "DynamicServerInitializeConfirmation" &&
      eventName !== "DynamicServerToolsList"
    ) continue;
    const value = (a.value ?? {}) as Record<string, unknown>;
    const dialogSchemaName = String(value.dialogSchemaName ?? "");
    if (!dialogSchemaName) continue;
    const tsMs = activityTimestampMs(a);
    if (eventName === "DynamicServerInitialize") {
      if (
        !mcpInitTimestamps.has(dialogSchemaName) &&
        tsMs !== undefined
      )
        mcpInitTimestamps.set(dialogSchemaName, tsMs);
      const initResult = (value.initializationResult ?? {}) as Record<string, unknown>;
      const serverInfo = (initResult.serverInfo ?? {}) as Record<string, unknown>;
      const serverName = typeof serverInfo.name === "string" ? serverInfo.name.trim() : "";
      if (serverName && !mcpServerNames.has(dialogSchemaName))
        mcpServerNames.set(dialogSchemaName, serverName);
    } else if (tsMs !== undefined) {
      // The latest finish-side event wins.
      mcpFinishTimestamps.set(dialogSchemaName, tsMs);
    }
  }
  for (const [dialogSchemaName, initMs] of mcpInitTimestamps) {
    const finishMs = mcpFinishTimestamps.get(dialogSchemaName);
    const executionTime =
      typeof finishMs === "number" && finishMs > initMs
        ? msToDotNetTimeSpan(finishMs - initMs)
        : undefined;
    topics.push({
      displayName: deriveMcpServerDisplayName(
        dialogSchemaName,
        mcpServerNames.get(dialogSchemaName)
      ),
      schemaId: dialogSchemaName,
      type: "MCPServer",
      executionTime,
      executionTimeSeconds:
        typeof finishMs === "number" && finishMs > initMs
          ? Math.round(((finishMs - initMs) / 1000) * 100) / 100
          : undefined,
      hasExecution: true,
    });
  }

  // 2) Plan steps — chronological, no cross-plan dedup so re-planned steps
  //    appear once per plan iteration.
  const planEvents: { steps: string[] }[] = [];
  for (const activity of childActivities) {
    const a = activity as Record<string, unknown>;
    if (
      a.valueType === "DynamicPlanReceived" ||
      a.name === "DynamicPlanReceived"
    ) {
      const value = (a.value ?? {}) as Record<string, unknown>;
      const steps = (value.steps ?? []) as string[];
      if (steps.length > 0) {
        planEvents.push({ steps });
      }
    }
  }

  for (let i = 0; i < planEvents.length; i++) {
    const planSteps = planEvents[i].steps;
    for (let j = 0; j < planSteps.length; j++) {
      const stepId = planSteps[j];
      if (!stepId) continue;

      // Always use inferStepType as the primary type source,
      // since DynamicPlanStepTriggered may report generic "Action"
      // for connector actions (e.g., Teams, Outlook).
      const type = inferStepType(stepId);
      const displayName = deriveStepDisplayName(stepId);

      topics.push({
        displayName,
        schemaId: stepId,
        type,
      });
    }
  }

  return topics;
}

/**
 * Derives a friendly MCP server name from the dialog schema name. Schema
 * shape: `{prefix}.action.{ServerName}-{ConnectionVariant}`.
 *   "ppa_interviewAgent.action.WorkIQUserMCP-WorkIQUserPreview" → "Work IQ User MCP"
 * Falls back to `serverInfo.name` from the trace, then the raw segment.
 */
function deriveMcpServerDisplayName(
  dialogSchemaName: string,
  serverName?: string
): string {
  const afterAction = dialogSchemaName.split(".action.").pop() ?? "";
  const beforeDash = afterAction.split("-")[0] ?? afterAction;
  if (beforeDash) {
    const spaced = beforeDash
      .replace(/([A-Z][a-z]+)/g, " $1")
      .replace(/([A-Z]+)/g, " $1")
      .replace(/\s+/g, " ")
      .trim();
    if (spaced) return spaced;
  }
  if (serverName) return serverName;
  return dialogSchemaName;
}

/** Formats a millisecond duration as the .NET TimeSpan format the orchestrator emits. */
function msToDotNetTimeSpan(totalMs: number): string {
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = Math.floor(totalMs % 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const frac = String(millis).padStart(3, "0").padEnd(7, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${frac}`;
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Derives a human-readable display name from a bot schema name.
 * "cr7f9_contosoSupportAssistant" → "Contoso Support Assistant"
 */
function deriveDisplayNameFromSchema(schemaName: string): string {
  const withoutPrefix = schemaName.replace(/^[a-zA-Z0-9]+_/, "");
  return withoutPrefix
    .replace(/([A-Z])/g, " $1")
    .replace(/^\s/, "")
    .trim();
}

/**
 * Derives the connected agent display name from the dialog schema name,
 * falling back to the bot schema name.
 * "cr7f9_agent.InvokeConnectedAgentTaskAction.ContosoSupportAssistant-Auth"
 *  → "Contoso Support Assistant - Auth"
 */
function deriveConnectedAgentDisplayName(
  dialogSchemaName: string,
  botSchemaName: string
): string {
  const invokeMarker = "InvokeConnectedAgentTaskAction.";
  const idx = dialogSchemaName.indexOf(invokeMarker);
  if (idx !== -1) {
    const namePart = dialogSchemaName.substring(idx + invokeMarker.length);
    if (namePart) {
      return namePart
        .replace(/([A-Z])/g, " $1")
        .replace(/\s*-\s*/g, " - ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  return deriveDisplayNameFromSchema(botSchemaName);
}

/**
 * Derives a topic display name from a taskDialogId.
 * "cr7f9_contosoSupportAssistant.topic.AccountManagement" → "Account Management"
 */
function deriveTopicDisplayName(taskDialogId: string): string {
  const parts = taskDialogId.split(".");
  const topicPart = parts[parts.length - 1] || "";
  return topicPart.replace(/([A-Z])/g, " $1").trim();
}

// ─── Step display name & type inference ────────────────────────────

const KNOWN_STEP_NAMES: Record<string, string> = {
  "P:UniversalSearchTool": "Search Sources",
  "P:CodeTool": "Code",
  "P:ReasonerTool": "Reason with advanced model",
};

const KNOWN_CONNECTOR_OPERATIONS: Record<string, string> = {
  "MicrosoftTeams-Postmessageinachatorchannel": "Post message in a chat or channel",
  "MicrosoftTeams-PostMessageToConversation": "Post message in a conversation",
  "MicrosoftTeams-CreateAChat": "Create a chat",
  "Office365Outlook-SendanemailV2": "Send an email",
  "Office365Outlook-SendEmailV2": "Send an email",
  "Office365Outlook-SendEmail": "Send an email",
  "Office365Outlook-ReplyToEmailV2": "Reply to an email",
  "Office365Outlook-ForwardEmailV2": "Forward an email",
};

/**
 * Derives a human-readable step display name from a plan step ID.
 * Exported so the child-topic builder in parse-transcript can reuse the same
 * fallback name when no botcomponents lookup is available.
 */
export function deriveStepDisplayName(stepId: string): string {
  if (KNOWN_STEP_NAMES[stepId]) return KNOWN_STEP_NAMES[stepId];

  // Action steps: "{prefix}.action.{Connector}-{Operation}"
  if (stepId.includes(".action.")) {
    const actionPart = stepId.split(".action.")[1] || "";
    for (const [key, name] of Object.entries(KNOWN_CONNECTOR_OPERATIONS)) {
      if (actionPart === key || actionPart.startsWith(key)) return name;
    }
    // Fallback: extract operation after dash, PascalCase split
    const dashIdx = actionPart.indexOf("-");
    if (dashIdx !== -1) {
      const opName = actionPart
        .substring(dashIdx + 1)
        .replace(/_[A-Za-z0-9]+$/, "")
        .replace(/V\d+$/, "");
      const readable = opName.replace(/([A-Z])/g, " $1").trim();
      return readable || actionPart;
    }
    return actionPart.replace(/([A-Z])/g, " $1").trim();
  }

  // Topic steps
  if (stepId.includes(".topic.")) {
    return deriveTopicDisplayName(stepId);
  }

  // Unknown step ID pattern: return raw stepId as-is
  return stepId;
}

/**
 * Infers the step type from a plan step ID when not available from
 * DynamicPlanStepTriggered.
 */
function inferStepType(stepId: string): string {
  if (stepId === "P:CodeTool") return "BuiltIn";
  if (stepId === "P:ReasonerTool") return "BuiltIn";
  if (stepId.startsWith("P:")) return "KnowledgeSource";
  if (stepId.includes(".action.")) {
    const actionPart = stepId.split(".action.")[1] || "";
    return actionPart.includes("-") ? "ConnectorAction" : "Action";
  }
  if (stepId.includes(".topic.")) return "CustomTopic";
  return "Action";
}

/**
 * Generative (new designer) connected agents are invoked via a `ToolCallTrace`
 * with `toolKind: "agent"`; the child conversation id is inside its completed
 * `result` JSON (`{ "conversation_id": "…" }`). Correlate by `toolCallId`
 * (equal to the `ConnectedAgentInitializeTraceData.planStepId` / `sessionId`)
 * so multiple connected agents in one conversation resolve to the right child.
 */
function findGenerativeAgentChildConversationId(
  activities: unknown[],
  toolCallId: string
): string {
  if (!toolCallId) return "";
  for (const activity of activities) {
    const a = activity as Record<string, unknown>;
    if (a.name !== "ToolCallTrace:Completed") continue;
    const value = (a.value ?? {}) as Record<string, unknown>;
    if (String(value.toolKind ?? "") !== "agent") continue;
    if (String(value.toolCallId ?? "") !== toolCallId) continue;
    const result = value.result;
    if (typeof result !== "string") continue;
    try {
      const parsed = JSON.parse(result) as Record<string, unknown>;
      const convId = parsed?.conversation_id;
      if (typeof convId === "string" && convId) return convId;
    } catch {
      /* result not JSON — no child id available */
    }
  }
  return "";
}

/**
 * Finds the DynamicPlanStepTriggered + DynamicPlanStepFinished that correspond
 * to a specific connected agent invocation, matched by planStepId.
 *
 * The planStepId from ConnectedAgentInitializeTraceData.value matches the
 * stepId from DynamicPlanStepTriggered.value / DynamicPlanStepFinished.value.
 */
function findConnectedAgentStepInfo(
  activities: unknown[],
  planStepId: string
): {
  executionTime?: string;
  executionTimeSeconds?: number;
  instruction?: string;
  stepId?: string;
} {
  let executionTime: string | undefined;
  let executionTimeSeconds: number | undefined;
  let instruction: string | undefined;
  let stepId: string | undefined;

  for (const activity of activities) {
    const a = activity as Record<string, unknown>;
    const eventName = String(a.valueType ?? a.name ?? "");

    // DynamicPlanStepTriggered with InvokeConnectedAgentTaskAction
    if (eventName === "DynamicPlanStepTriggered") {
      const value = (a.value ?? {}) as Record<string, unknown>;
      const taskDialogId = String(value.taskDialogId ?? "");
      const currentStepId = String(value.stepId ?? "");
      if (
        taskDialogId.includes("InvokeConnectedAgentTaskAction") &&
        (planStepId ? currentStepId === planStepId : true)
      ) {
        instruction = value.thought as string | undefined;
        stepId = currentStepId;

        // Also grab the Task argument as instruction fallback
        if (!instruction) {
          const args = value.arguments as Record<string, unknown> | undefined;
          if (args?.Task)
            instruction = String(args.Task);
        }
      }
    }

    // DynamicPlanStepFinished for InvokeConnectedAgentTaskAction
    if (eventName === "DynamicPlanStepFinished") {
      const value = (a.value ?? {}) as Record<string, unknown>;
      const taskDialogId = String(value.taskDialogId ?? "");
      const currentStepId = String(value.stepId ?? "");
      if (
        taskDialogId.includes("InvokeConnectedAgentTaskAction") &&
        (planStepId ? currentStepId === planStepId : true)
      ) {
        const execTime = String(value.executionTime ?? "");
        if (execTime) {
          executionTime = execTime;
          executionTimeSeconds = parseExecutionTime(execTime);
        }
      }
    }

    // Generative orchestration: the connected agent is invoked via a
    // ToolCallTrace (toolKind "agent"); its toolCallId equals the
    // ConnectedAgentInitializeTraceData.planStepId. Pull the instruction from
    // the Started params and the duration from the Completed durationMs.
    if (eventName === "ToolCallTrace:Started") {
      const value = (a.value ?? {}) as Record<string, unknown>;
      if (!planStepId || String(value.toolCallId ?? "") === planStepId) {
        if (!stepId) stepId = String(value.toolCallId ?? "") || undefined;
        if (!instruction) {
          const params = value.filledParameters as Record<string, unknown> | undefined;
          const task = params?.task ?? params?.Task;
          if (task) instruction = String(task);
        }
      }
    }
    if (eventName === "ToolCallTrace:Completed") {
      const value = (a.value ?? {}) as Record<string, unknown>;
      const durationMs = value.durationMs;
      if (
        (!planStepId || String(value.toolCallId ?? "") === planStepId) &&
        typeof durationMs === "number"
      ) {
        executionTime = formatMsAsExecutionTime(durationMs);
        executionTimeSeconds = Math.round((durationMs / 1000) * 100) / 100;
      }
    }
  }

  return { executionTime, executionTimeSeconds, instruction, stepId };
}

/**
 * Parses an execution time string like "00:00:37.3264078" into seconds.
 */
function parseExecutionTime(timeStr?: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  if (parts.length !== 3) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 100) / 100;
}
