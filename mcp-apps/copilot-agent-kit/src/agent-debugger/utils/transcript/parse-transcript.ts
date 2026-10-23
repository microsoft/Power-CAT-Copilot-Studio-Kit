/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  Activity,
  KnowledgeSourcesDebugInfo,
  MCPServerInfo,
  MCPTool,
  ProcessedDebugInfo,
  ProcessedTranscript,
  ProcessedTurn,
  StepExecution,
  TranscriptData,
} from "../../contracts/transcript.js";
import type { ConnectedAgentInfo, ConnectedAgentChildTopic } from "../../contracts/connected-agent.js";
import {
  detectConnectedAgents,
  isConnectedAgentTranscript,
  extractParentContext,
  extractChildTopics,
  deriveStepDisplayName,
} from "../../services/connected-agent-service.js";
import { toIsoTimestamp } from "../../services/conversation-transcript-service.js";
import {
  extractActivityText,
  isNonConversationalUserResponse,
} from "./extract-activity-text.js";
import { detectOrchestrationEngine } from "./detect-orchestration-engine.js";
import { parseGenerativeTranscript } from "./parse-generative-transcript.js";
import { activityTimestampMs } from "./timestamp.js";

/**
 * Resolves the best-precision ISO timestamp from an activity.
 * Prefers `timestampMs` (millisecond field) over `timestamp` (integer seconds)
 * so that sub-second MCP tool steps don't collapse to 0ms when computing
 * fallback durations via finishedAt - triggeredAt.
 */
function activityTimestamp(activity: Activity): string {
  const ms = activityTimestampMs(activity);
  if (ms !== undefined) return new Date(ms).toISOString();
  return toIsoTimestamp(activity.timestamp);
}

function appendTurnFeedback(
  turn: ProcessedTurn,
  feedback: NonNullable<ProcessedTurn["feedback"]>,
): void {
  turn.feedback = feedback;
  turn.feedbackEvents = [...(turn.feedbackEvents ?? []), feedback];
}

function isUserMessage(
  activity: Activity,
  isStandardTranscript: boolean
): boolean {
  if (activity.type !== "message") return false;
  const from = activity.from;
  const role = from?.role;
  // String role: "user"/"bot" (connected agent nested activities)
  if (role === "user") return true;
  if (role === "bot") return false;
  // Numeric role: 0 = system/bot (standard PVA Studio transcript format)
  if (role === 0) return false;
  // Numeric role: 1 — in standard transcripts always means "user".
  // In connected-agent transcripts both user and bot share role=1,
  // so distinguish by presence of aadObjectId (Azure AD identity → real user).
  if (role === 1) return isStandardTranscript || !!from?.aadObjectId;
  return false;
}

export function parseTranscript(data: TranscriptData): ProcessedTranscript {
  const activities = [...(data.activities ?? [])];

  // New agent designer (generative orchestration) transcripts use a completely
  // different trace vocabulary (ToolCallTrace/ThinkingTrace) — delegate to the
  // dedicated parser, which produces the same ProcessedTranscript model.
  if (detectOrchestrationEngine(activities) === "generative") {
    return parseGenerativeTranscript(data);
  }

  // Detect transcript type: if any message has role=0, it's a standard transcript
  // (role 0=bot, role 1=user). Otherwise it's a connected-agent transcript.
  const isStandardTranscript = activities.some(
    (a) => a.type === "message" && a.from?.role === 0
  );

  const turns: ProcessedTurn[] = [];

  const applyToTurnByReplyToId = (
    replyToId: string | undefined,
    apply: (turn: ProcessedTurn) => void
  ): boolean => {
    if (!replyToId) return false;
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const t = turns[i];
      if (t.id === replyToId && t.role === "user") {
        t.debugInfo = t.debugInfo ?? {};
        apply(t);
        return true;
      }
    }
    return false;
  };

  const firstWithTs = activities.find(
    (activity) => activityTimestampMs(activity) !== undefined,
  );
  const lastWithTs = [...activities]
    .reverse()
    .find((activity) => activityTimestampMs(activity) !== undefined);
  const startMs = activityTimestampMs(firstWithTs) ?? 0;
  const endMs = activityTimestampMs(lastWithTs) ?? startMs;
  const durationMs =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
      ? endMs - startMs
      : 0;

  let pendingDebugInfo: ProcessedDebugInfo = {};
  let pendingActivities: Activity[] = [];

  let sessionOutcome = "Unknown";
  let sessionOutcomeReason = "";
  let stepTimestamps: Record<string, string> = {};
  let currentReplyToId: string | undefined;

  let initialTopic: ProcessedDebugInfo["initialTopic"] = undefined;
  let stepTypes: NonNullable<ProcessedDebugInfo["stepTypes"]> = [];

  let mcpServerInfo: MCPServerInfo | undefined;
  let mcpServers: MCPServerInfo[] = [];
  let mcpTools: MCPTool[] = [];
  // Per-turn step executions - gets cleared when attaching to a user turn
  const pendingStepExecutions = new Map<string, Partial<StepExecution>>();
  // Global step executions map to track finished times that may come later
  const allStepExecutions = new Map<string, Partial<StepExecution>>();
  // Keys (taskDialogId:stepId) already attached to a user turn — prevents
  // late-arriving DynamicPlanStepFinished from duplicating the same step onto
  // a subsequent user turn (e.g. connected-agent multi-turn scenario).
  const attachedStepExecutionKeys = new Set<string>();

  // Map from a child plan's planIdentifier → key of the step that owns it.
  // Built from DynamicPlanReceived.parentPlanIdentifier / parentPlanStepIdentifier.
  // Used to set step.parentStepKey so the UI can nest sub-steps under their
  // parent agent step (lightweight `*.agent.Agent` pattern).
  const planParentStepKey = new Map<string, string>();
  // Lookup: stepId → its full key `taskDialogId:stepId`. Needed because the
  // parentPlanStepIdentifier on a child plan only carries stepId, not
  // taskDialogId, so we need to resolve the parent step key by stepId.
  const stepKeyByStepId = new Map<string, string>();
  // The step exec that is currently "in flight" (Triggered, not yet Finished).
  // Used to attach GenerativeAnswersSupportData / KnowledgeTraceData /
  // UniversalSearchToolTraceData to the producing step instead of the turn.
  let inFlightStepKey: string | undefined;

  const getFirstUserTurn = (): ProcessedTurn | undefined =>
    turns.find((t) => t.role === "user");

  const isStepExecutionAlreadyAttached = (key: string): boolean =>
    attachedStepExecutionKeys.has(key);

  const attachPendingToUserTurn = (userTurn: ProcessedTurn) => {
    // Get step executions for this turn - use pending ones and merge with any finished data
    const turnStepExecutions: StepExecution[] = [];
    for (const [key, exec] of pendingStepExecutions.entries()) {
      // Skip keys already attached to a prior user turn (e.g. trailing
      // DynamicPlanStepFinished for a connected-agent step that spanned
      // multiple user turns — the step belongs to the turn that originally
      // triggered it, not the turn that saw the Finished event).
      if (attachedStepExecutionKeys.has(key)) continue;
      // Check if there's finished data in the global map
      const globalExec = allStepExecutions.get(key);
      const mergedExec = globalExec ? { ...exec, ...globalExec } : exec;
      turnStepExecutions.push(mergedExec as StepExecution);
      attachedStepExecutionKeys.add(key);
    }

    // Merge with the user turn's existing stepExecutions instead of replacing.
    // A single user turn can be flushed multiple times when a parent agent
    // produces several assistant messages back-to-back (e.g. lightweight
    // `*.agent.Agent` flow that runs UniversalSearchTool → message →
    // SendMessageTool → message → CaptureContextTool). Each flush only carries
    // the steps pending at that moment, and an overwrite would drop the
    // earlier steps. Merging by `taskDialogId:stepId` preserves all execs and
    // allows later events to update fields on earlier entries.
    const existingExecs =
      (userTurn.debugInfo?.stepExecutions as StepExecution[] | undefined) ?? [];
    const mergedByKey = new Map<string, StepExecution>();
    for (const ex of existingExecs) {
      const k = ex.stepId
        ? `${ex.taskDialogId}:${ex.stepId}`
        : String(ex.taskDialogId);
      mergedByKey.set(k, ex);
    }
    for (const ex of turnStepExecutions) {
      const k = ex.stepId
        ? `${ex.taskDialogId}:${ex.stepId}`
        : String(ex.taskDialogId);
      const prev = mergedByKey.get(k);
      mergedByKey.set(k, prev ? { ...prev, ...ex } : ex);
    }
    const mergedStepExecutions = Array.from(mergedByKey.values());

    const mergedDebugInfo: ProcessedDebugInfo = {
      ...(userTurn.debugInfo ?? {}),
      ...pendingDebugInfo,
      timestamps: Object.keys(stepTimestamps).length
        ? stepTimestamps
        : (userTurn.debugInfo as any)?.timestamps,
      mcpServerInfo:
        mcpServerInfo ?? (userTurn.debugInfo as any)?.mcpServerInfo,
      mcpServers: mcpServers.length
        ? mcpServers
        : (userTurn.debugInfo as any)?.mcpServers,
      mcpTools: mcpTools.length
        ? mcpTools
        : (userTurn.debugInfo as any)?.mcpTools,
      stepExecutions: mergedStepExecutions.length
        ? mergedStepExecutions
        : (userTurn.debugInfo as any)?.stepExecutions,
    };

    // Preserve initial topic on the first user turn (not necessarily turns[0]).
    const firstUser = getFirstUserTurn();
    if (firstUser && firstUser.id === userTurn.id && initialTopic) {
      mergedDebugInfo.initialTopic =
        mergedDebugInfo.initialTopic ?? initialTopic;
    }

    userTurn.debugInfo = mergedDebugInfo;

    // Also attach the raw trace/event activities so the user can inspect the full batch.
    if (pendingActivities.length) {
      userTurn.activities = [...userTurn.activities, ...pendingActivities];
    }

    // Reset after attach - including step executions for this turn
    pendingDebugInfo = {};
    pendingActivities = [];
    stepTimestamps = {};
    mcpServerInfo = undefined;
    mcpServers = [];
    mcpTools = [];
    pendingStepExecutions.clear(); // Clear per-turn step executions
    stepTypes = [];
    currentReplyToId = undefined;
  };

  const ensureKnowledgeSources = (): KnowledgeSourcesDebugInfo => {
    if (!pendingDebugInfo.knowledgeSources)
      pendingDebugInfo.knowledgeSources = {};
    return pendingDebugInfo.knowledgeSources;
  };

  // Returns true when a user turn is a postBack/consent-card response
  // (e.g., clicking "Allow" on an auth consent card). These intermediate turns
  // should NOT act as step-execution attachment targets — steps triggered after
  // a consent card should be owned by the preceding real user turn so that the
  // Debug Panel and Execution Flow show them together.
  const isConsentCardResponseTurn = (turn: ProcessedTurn): boolean => {
    if (turn.role !== "user") return false;
    const mainAct = turn.activities[0];
    if (!mainAct || mainAct.type !== "message") return false;
    const v = (mainAct.value as Record<string, unknown> | undefined) ?? {};
    // Consent-card postBacks have value.shouldAwaitUserInput set and no text.
    return v.shouldAwaitUserInput !== undefined && !turn.content.trim();
  };

  // Finds the last user turn that is NOT a consent-card postBack response.
  // Used so that steps triggered after consent cards attach to the original
  // real user turn (the one that kicked off the multi-turn flow), keeping
  // all related steps in a single logical turn for the Debug Panel and
  // Execution Flow visualisation.
  const findRealUserTurn = (): ProcessedTurn | null => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.role === "user" && !isConsentCardResponseTurn(t)) return t;
    }
    return null;
  };

  for (const activity of activities) {
    if (activity.type === "message") {
      const role: ProcessedTurn["role"] = isUserMessage(
        activity,
        isStandardTranscript
      )
        ? "user"
        : "assistant";

      const hasAdaptiveCard = activity.attachments?.some(
        (a: any) => a?.contentType === "application/vnd.microsoft.card.adaptive"
      );
      const adaptiveCard = hasAdaptiveCard
        ? (activity.attachments as any[])?.find(
            (a) => a?.contentType === "application/vnd.microsoft.card.adaptive"
          )?.content
        : null;
      const content =
        extractActivityText(activity as any) ||
        (hasAdaptiveCard ? "[Adaptive Card Message]" : "");

      if (
        role === "user" &&
        isNonConversationalUserResponse(activity.value, content)
      ) {
        const targetUser = findRealUserTurn();
        if (targetUser) {
          attachPendingToUserTurn(targetUser);
          targetUser.activities.push(activity);
        } else {
          pendingActivities.push(activity);
        }
        continue;
      }

      const turn: ProcessedTurn = {
        id: activity.id || "",
        role,
        content,
        timestamp: toIsoTimestamp(activity.timestamp),
        activities: [activity, ...pendingActivities],
        debugInfo: {},
        userAction:
          role === "user" && (activity.value as any)?.action
            ? {
                action: (activity.value as any).action,
                id: (activity.value as any).id,
              }
            : undefined,
      };

      // GenAI feedback can be on assistant message channelData.
      if (role === "assistant" && activity.channelData) {
        const cd = activity.channelData as Record<string, unknown>;
        const feedback = cd["pva:gpt-feedback"];
        if (feedback) {
          turn.debugInfo = turn.debugInfo ?? {};
          turn.debugInfo.genAiFeedback = feedback;
        }
      }

      if (hasAdaptiveCard && adaptiveCard) {
        turn.debugInfo = turn.debugInfo ?? {};
        turn.debugInfo.adaptiveCard = adaptiveCard;
      }

      // Attach pending debug info to the last real user turn.
      // Skip consent-card postBack turns (e.g. user clicking "Allow" on an
      // auth consent card) so steps triggered after the consent are attached
      // to the original user message that initiated the flow, keeping all
      // related steps together in the Debug Panel and Execution Flow.
      if (role === "assistant" && turns.length > 0) {
        const targetUser = findRealUserTurn();
        if (targetUser) {
          attachPendingToUserTurn(targetUser);
        }
      }

      turns.push(turn);

      // Reset pending after any message so new trace/event batches align.
      pendingDebugInfo = {};
      pendingActivities = [];
      stepTimestamps = {};
      stepTypes = [];
      currentReplyToId = undefined;
      continue;
    }

    // trace / event
    if (activity.type === "trace" || activity.type === "event") {
      pendingActivities.push(activity);

      // Feedback events — old-style: activity.name === "feedback"
      if (activity.name === "feedback" && (activity.value as any)?.rating) {
        for (let i = turns.length - 1; i >= 0; i -= 1) {
          if (turns[i].role === "assistant") {
            appendTurnFeedback(turns[i], {
              rating: (activity.value as any).rating,
              comment: (activity.value as any).comment,
            });
            break;
          }
        }
      }

      if (activity.valueType === "IntentRecognition") {
        pendingDebugInfo.intent =
          (activity.value as any)?.intentTitle ||
          (activity.value as any)?.intentId;
        stepTimestamps["IntentRecognition"] = toIsoTimestamp(
          activity.timestamp
        );
      }

      // MCP server events
      if (
        activity.name === "DynamicServerInitialize" &&
        (activity.value as any)?.initializationResult
      ) {
        const init = (activity.value as any).initializationResult;
        const serverInfo: MCPServerInfo = {
          name: init.serverInfo?.name || "Unknown",
          description: init.serverInfo?.description,
          version: init.serverInfo?.version || "Unknown",
          sessionId: init.sessionInfo?.id || "Unknown",
          protocolVersion: init.protocolVersion || "Unknown",
          capabilities: init.capabilities,
          schemaName: (activity.value as any)?.dialogSchemaName,
        };
        mcpServerInfo = serverInfo;
        mcpServers.push(serverInfo);
      }

      if (
        activity.name === "DynamicServerToolsList" &&
        (activity.value as any)?.toolsList
      ) {
        const tools = ((activity.value as any).toolsList as any[]).map((tool): MCPTool => ({
          displayName: tool.displayName,
          identifier: tool.identifier,
          description: tool.description,
          schemaName: tool.schemaName,
          llmIdentifierPrefix: tool.llmIdentifierPrefix,
          inputs: tool.inputs?.map((input: any) => ({
            name: input.name,
            description: input.description,
            type: input.type?.$kind || input.type,
            required: input.isRequired,
          })),
        }));
        for (const tool of tools) {
          const duplicate = mcpTools.some(
            (existing) =>
              existing.identifier === tool.identifier &&
              existing.schemaName === tool.schemaName,
          );
          if (!duplicate) mcpTools.push(tool);
        }
      }

      // Step executions
      if (
        (activity.name === "DynamicPlanStepTriggered" || activity.valueType === "DynamicPlanStepTriggered") &&
        (activity.value as any)?.taskDialogId
      ) {
        const taskDialogId = (activity.value as any).taskDialogId as string;
        const stepIdRaw = (activity.value as any).stepId as string;
        const planIdentifier = (activity.value as any).planIdentifier as string | undefined;
        const key = `${taskDialogId}:${stepIdRaw}`;
        const existing = pendingStepExecutions.get(key) || {};
        // Resolve parent-step key from the plan→parent map (built when this
        // step's plan was received). For top-level plans, no parent → undefined.
        const parentStepKey = planIdentifier
          ? planParentStepKey.get(planIdentifier)
          : undefined;
        const stepData = {
          ...existing,
          stepId: stepIdRaw,
          taskDialogId,
          thought: (activity.value as any).thought,
          type: (activity.value as any).type,
          state: (activity.value as any).state,
          hasRecommendations: (activity.value as any).hasRecommendations,
          triggeredAt: activityTimestamp(activity),
          parentStepKey: existing.parentStepKey ?? parentStepKey,
          planIdentifier: existing.planIdentifier ?? planIdentifier,
        };
        pendingStepExecutions.set(key, stepData);
        allStepExecutions.set(key, stepData);
        // Index for resolving parent-step lookups when child plans arrive.
        if (stepIdRaw) stepKeyByStepId.set(stepIdRaw, key);
        // Mark this step as currently in flight so subsequent
        // GenerativeAnswers / Knowledge traces are bound to it, not the turn.
        inFlightStepKey = key;
      }

      if (
        (activity.name === "DynamicPlanStepBindUpdate" || activity.valueType === "DynamicPlanStepBindUpdate") &&
        (activity.value as any)?.taskDialogId
      ) {
        const key = `${(activity.value as any).taskDialogId}:${
          (activity.value as any).stepId
        }`;
        const existing =
          pendingStepExecutions.get(key) || allStepExecutions.get(key) || {};
        const stepData = {
          ...existing,
          stepId: (activity.value as any).stepId,
          taskDialogId: (activity.value as any).taskDialogId,
          arguments: (activity.value as any).arguments,
          triggeredAt:
            existing.triggeredAt ?? activityTimestamp(activity),
        };
        pendingStepExecutions.set(key, stepData);
        allStepExecutions.set(key, stepData);
      }

      if (
        (activity.name === "DynamicPlanStepFinished" || activity.valueType === "DynamicPlanStepFinished") &&
        (activity.value as any)?.taskDialogId
      ) {
        const key = `${(activity.value as any).taskDialogId}:${
          (activity.value as any).stepId
        }`;
        const existing =
          pendingStepExecutions.get(key) || allStepExecutions.get(key) || {};
        const stepData = {
          ...existing,
          stepId: (activity.value as any).stepId,
          taskDialogId: (activity.value as any).taskDialogId,
          state: (activity.value as any).state,
          executionTime: (activity.value as any).executionTime,
          observation: (activity.value as any).observation,
          finishedAt: activityTimestamp(activity),
        };
        // Late StepFinished events can arrive after the step was already
        // attached to its originating user turn (especially for connected
        // agents that span multiple turns). Keep global data updated for
        // backfill, but do not re-queue this key for pending attach.
        if (!isStepExecutionAlreadyAttached(key)) {
          pendingStepExecutions.set(key, stepData);
        }
        allStepExecutions.set(key, stepData);
        // If this is the step we considered "in flight", clear so subsequent
        // turn-level traces don't mis-attribute to a completed step.
        if (inFlightStepKey === key) inFlightStepKey = undefined;
      }

      // DynamicPlanStepBlocked fires when the orchestrator blocks a step (e.g.
      // Responsible AI / content filter). There is no prior Triggered event so
      // we create a new entry directly from this activity.
      if (
        (activity.name === "DynamicPlanStepBlocked" || activity.valueType === "DynamicPlanStepBlocked") &&
        (activity.value as any)?.taskDialogId
      ) {
        const key = `${(activity.value as any).taskDialogId}:${
          (activity.value as any).stepId ?? ""
        }`;
        const existing = pendingStepExecutions.get(key) || allStepExecutions.get(key) || {};
        const blockedErr = (activity.value as any).messageBlockedError as Record<string, unknown> | undefined;
        const stepData = {
          ...existing,
          stepId: (activity.value as any).stepId ?? "",
          taskDialogId: (activity.value as any).taskDialogId,
          state: "blocked",
          executionTime: (activity.value as any).executionTime,
          finishedAt: activityTimestamp(activity),
          blockedError: blockedErr
            ? {
                code: String(blockedErr["code"] ?? ""),
                message: String(blockedErr["message"] ?? ""),
                reasonCode: blockedErr["exception"]
                  ? String((blockedErr["exception"] as Record<string, unknown>)?.["reasonCode"] ?? "")
                  : undefined,
              }
            : undefined,
        };
        if (!isStepExecutionAlreadyAttached(key)) {
          pendingStepExecutions.set(key, stepData);
        }
        allStepExecutions.set(key, stepData);
      }

      if (activity.valueType === "VariableAssignment") {
        pendingDebugInfo.variables = pendingDebugInfo.variables || {};
        (pendingDebugInfo.variables as any)[(activity.value as any)?.name] = (
          activity.value as any
        )?.newValue;
        stepTimestamps["VariableAssignment"] = toIsoTimestamp(
          activity.timestamp
        );
      }

      if (
        activity.name === "DynamicPlanReceived" ||
        activity.valueType === "DynamicPlanReceived"
      ) {
        pendingDebugInfo.plan = { ...(activity.value as any) };
        if (
          pendingDebugInfo.plan &&
          (activity.value as any)?.steps &&
          Array.isArray((activity.value as any).steps)
        ) {
          // stepNames will be looked up from component table, not derived here
          pendingDebugInfo.plan.stepNames = [];
        }
        stepTimestamps["DynamicPlanReceived"] = toIsoTimestamp(
          activity.timestamp
        );

        // Record nested-plan → parent-step relationship. The transcript carries
        // this on every child DynamicPlanReceived (e.g. UniversalSearchTool
        // running inside a lightweight `*.agent.Agent` invocation).
        const planValue = activity.value as Record<string, unknown> | undefined;
        const planIdentifier = typeof planValue?.planIdentifier === "string"
          ? (planValue.planIdentifier as string)
          : "";
        const parentPlanStepIdentifier = typeof planValue?.parentPlanStepIdentifier === "string"
          ? (planValue.parentPlanStepIdentifier as string)
          : "";
        if (planIdentifier && parentPlanStepIdentifier) {
          const parentKey = stepKeyByStepId.get(parentPlanStepIdentifier);
          if (parentKey) planParentStepKey.set(planIdentifier, parentKey);
        }
      }

      if (
        activity.name === "DynamicPlanFinished" ||
        activity.valueType === "DynamicPlanFinished"
      ) {
        const planId = (activity.value as any)?.planId;
        pendingDebugInfo.planFinished = {
          planId: typeof planId === "string" ? planId : undefined,
        };
        stepTimestamps["DynamicPlanFinished"] = toIsoTimestamp(
          activity.timestamp
        );
      }

      if (
        activity.name === "ConnectedAgentInitializeTraceData" ||
        activity.valueType === "ConnectedAgentInitializeTraceData"
      ) {
        pendingDebugInfo.connectedAgentInitialize = {
          ...(activity.value as any),
        };
        stepTimestamps["ConnectedAgentInitializeTraceData"] = toIsoTimestamp(
          activity.timestamp
        );
      }

      if (
        activity.name === "ConnectedAgentCompletedTraceData" ||
        activity.valueType === "ConnectedAgentCompletedTraceData"
      ) {
        pendingDebugInfo.connectedAgentCompleted = {
          ...(activity.value as any),
        };
        stepTimestamps["ConnectedAgentCompletedTraceData"] = toIsoTimestamp(
          activity.timestamp
        );
      }

      if (
        activity.name === "DynamicPlanReceivedDebug" ||
        activity.valueType === "DynamicPlanReceivedDebug"
      ) {
        if ((activity.value as any)?.ask)
          pendingDebugInfo.ask = (activity.value as any).ask;
      }

      if (
        activity.name === "DynamicPlanStepTriggered" ||
        activity.valueType === "DynamicPlanStepTriggered"
      ) {
        if ((activity.value as any)?.thought) {
          pendingDebugInfo.thought = pendingDebugInfo.thought
            ? `${pendingDebugInfo.thought}\n\n${
                (activity.value as any).thought
              }`
            : (activity.value as any).thought;
        }

        if ((activity.value as any)?.type) {
          const stepType = (activity.value as any).type as string;
          stepTypes.push({
            type: stepType,
            typeName: "",
            thought: (activity.value as any)?.thought,
            timestamp: toIsoTimestamp(activity.timestamp),
            taskDialogId: (activity.value as any)?.taskDialogId,
            state: (activity.value as any)?.state,
          });

          pendingDebugInfo.stepType = stepType;
          pendingDebugInfo.stepTypeName = "";
          pendingDebugInfo.stepTypes = stepTypes;

          if (stepType === "CustomTopic" || stepType === "KnowledgeSource") {
            currentReplyToId = activity.replyToId;
          }

          if (stepType === "KnowledgeSource") {
            const ks = ensureKnowledgeSources();
            ks.startedAt = toIsoTimestamp(activity.timestamp);
          }
        }

        stepTimestamps["DynamicPlanStepTriggered"] = toIsoTimestamp(
          activity.timestamp
        );
      }

      if (
        activity.name === "DialogTracing" &&
        (activity.value as any)?.actions
      ) {
        if (
          !initialTopic &&
          Array.isArray((activity.value as any).actions) &&
          (activity.value as any).actions.length > 0
        ) {
          const firstAction = (activity.value as any).actions[0];
          if (firstAction.topicId) {
            initialTopic = {
              topicId: firstAction.topicId,
              topicName: "",
              dialogComponentId: firstAction.dialogComponentId,
            };
          }
        }
      }

      if (
        activity.name === "DynamicPlanStepBindUpdate" ||
        activity.valueType === "DynamicPlanStepBindUpdate"
      ) {
        const args = (activity.value as any)?.arguments;
        if (args?.search_query)
          pendingDebugInfo.searchQuery = args.search_query;
        if (args?.search_keywords)
          pendingDebugInfo.searchKeywords = args.search_keywords;
        if (args && Object.keys(args).length > 0)
          pendingDebugInfo.arguments = args;
        stepTimestamps["DynamicPlanStepBindUpdate"] = toIsoTimestamp(
          activity.timestamp
        );
      }

      if (
        activity.name === "DynamicPlanStepFinished" ||
        activity.valueType === "DynamicPlanStepFinished"
      ) {
        const obs = (activity.value as any)?.observation;
        if (obs?.search_result) {
          pendingDebugInfo.searchResults = obs.search_result;
          if (obs.search_result.Text?.CitationSources)
            pendingDebugInfo.citations = obs.search_result.Text.CitationSources;
        }
        if (Array.isArray(obs?.content))
          pendingDebugInfo.stepFinishedContent = obs.content;

        // Extract token info from AI Builder custom prompt / reasoning step observations.
        // Primary token source in snapshots (GenerativeAnswersSupportData is absent).
        if (obs?.predictionOutput && !pendingDebugInfo.tokenInfo) {
          const pred = obs.predictionOutput as Record<string, unknown>;
          const promptTokens = typeof pred.promptTokens === "number" ? pred.promptTokens : 0;
          const completionTokens = typeof pred.completionTokens === "number" ? pred.completionTokens : 0;
          const totalTokens =
            typeof pred.totalTokens === "number"
              ? pred.totalTokens
              : promptTokens + completionTokens;
          if (promptTokens || completionTokens || totalTokens) {
            pendingDebugInfo.tokenInfo = {
              promptTokens,
              completionTokens,
              totalTokens,
              model: typeof pred.modelName === "string" ? pred.modelName : undefined,
            };
          }
        }

        if ((activity.value as any)?.executionTime)
          pendingDebugInfo.executionTime = (
            activity.value as any
          ).executionTime;
        stepTimestamps["DynamicPlanStepFinished"] = toIsoTimestamp(
          activity.timestamp
        );

        if (
          pendingDebugInfo.stepType === "KnowledgeSource" &&
          activity.replyToId === currentReplyToId
        ) {
          const ks = ensureKnowledgeSources();
          ks.finishedAt = activityTimestamp(activity);
          if ((activity.value as any)?.executionTime)
            ks.executionTime = (activity.value as any).executionTime;
        }
      }

      if (
        activity.name === "UniversalSearchToolTraceData" ||
        activity.valueType === "UniversalSearchToolTraceData"
      ) {
        const searched = (activity.value as any)?.knowledgeSources;
        const output = (activity.value as any)?.outputKnowledgeSources;
        const searchedList = Array.isArray(searched)
          ? (searched.filter((s: unknown) => typeof s === "string") as string[])
          : undefined;
        const outputList = Array.isArray(output)
          ? (output.filter((s: unknown) => typeof s === "string") as string[])
          : undefined;

        if (
          pendingDebugInfo.stepType === "KnowledgeSource" &&
          activity.replyToId === currentReplyToId
        ) {
          const ks = ensureKnowledgeSources();
          if (searchedList) ks.searched = searchedList;
          if (outputList) ks.output = outputList;
        }
        // Also bind to the producing step (regardless of stepType — nested
        // agents emit type="Unknown" for the underlying P:UniversalSearchTool).
        if (inFlightStepKey) {
          const exec =
            pendingStepExecutions.get(inFlightStepKey) ||
            allStepExecutions.get(inFlightStepKey);
          if (exec) {
            const ksExisting = exec.knowledgeSources ?? {};
            const updated: Partial<StepExecution> = {
              ...exec,
              knowledgeSources: {
                ...ksExisting,
                ...(searchedList ? { searched: searchedList } : {}),
                ...(outputList ? { output: outputList } : {}),
              },
            };
            pendingStepExecutions.set(inFlightStepKey, updated);
            allStepExecutions.set(inFlightStepKey, updated);
          }
        }
        stepTimestamps["UniversalSearchToolTraceData"] = toIsoTimestamp(
          activity.timestamp
        );
      }

      if (
        activity.name === "KnowledgeTraceData" ||
        activity.valueType === "KnowledgeTraceData"
      ) {
        const isKnowledgeSearched =
          typeof (activity.value as any)?.isKnowledgeSearched === "boolean"
            ? ((activity.value as any).isKnowledgeSearched as boolean)
            : undefined;
        const citedRaw = (activity.value as any)?.citedKnowledgeSources;
        const citedList = Array.isArray(citedRaw)
          ? (citedRaw.filter((s: unknown) => typeof s === "string") as string[])
          : undefined;

        if (
          pendingDebugInfo.stepType === "KnowledgeSource" &&
          activity.replyToId === currentReplyToId
        ) {
          const ks = ensureKnowledgeSources();
          if (isKnowledgeSearched !== undefined) ks.isKnowledgeSearched = isKnowledgeSearched;
          if (citedList) ks.cited = citedList;
        }
        // Also bind to the producing step (handles nested-agent case where
        // stepType arrives as "Unknown").
        if (inFlightStepKey) {
          const exec =
            pendingStepExecutions.get(inFlightStepKey) ||
            allStepExecutions.get(inFlightStepKey);
          if (exec) {
            const ksExisting = exec.knowledgeSources ?? {};
            const updated: Partial<StepExecution> = {
              ...exec,
              knowledgeSources: {
                ...ksExisting,
                ...(isKnowledgeSearched !== undefined ? { isKnowledgeSearched } : {}),
                ...(citedList ? { cited: citedList } : {}),
              },
            };
            pendingStepExecutions.set(inFlightStepKey, updated);
            allStepExecutions.set(inFlightStepKey, updated);
          }
        }
      }

      if (
        activity.name === "GenerativeAnswersSupportData" ||
        activity.valueType === "GenerativeAnswersSupportData"
      ) {
        const valueAny: any = activity.value as any;
        // Find the best usage data: prefer CapiResourceUsage with non-zero tokens,
        // then fall back to top-level response tokens (some payloads have valid
        // PromptTokens/CompletionTokens at the response level but zeroed CapiResourceUsage)
        const responseKeys = [
          "queryRewrittingOpenAIResponse",
          "queryRewritingOpenAIResponse",
          "completionOpenAIResponse",
          "openAIResponse",
          "summarizationOpenAIResponse",
        ];
        let usage: any = undefined;
        // First pass: CapiResourceUsage with non-zero tokens
        for (const rk of responseKeys) {
          const capi = valueAny?.[rk]?.CapiResourceUsage;
          if (capi && ((capi.PromptTokens || 0) > 0 || (capi.CompletionTokens || 0) > 0 || (capi.TotalTokens || 0) > 0)) {
            usage = capi;
            break;
          }
        }
        // Second pass: top-level token fields on the response
        if (!usage) {
          for (const rk of responseKeys) {
            const resp = valueAny?.[rk];
            if (resp && ((resp.PromptTokens || 0) > 0 || (resp.CompletionTokens || 0) > 0)) {
              usage = {
                PromptTokens: resp.PromptTokens || 0,
                CompletionTokens: resp.CompletionTokens || 0,
                TotalTokens: resp.TotalTokens || (resp.PromptTokens || 0) + (resp.CompletionTokens || 0),
                ModelName: resp.CapiResourceUsage?.ModelName || resp.ModelName || "",
              };
              break;
            }
          }
        }
        // Last resort: any CapiResourceUsage that exists
        if (!usage) {
          for (const rk of responseKeys) {
            const capi = valueAny?.[rk]?.CapiResourceUsage;
            if (capi) { usage = capi; break; }
          }
        }
        const tokenInfo = usage
          ? {
              promptTokens: usage.PromptTokens,
              completionTokens: usage.CompletionTokens,
              totalTokens:
                usage.TotalTokens ||
                (usage.PromptTokens || 0) + (usage.CompletionTokens || 0),
              model: usage.ModelName,
            }
          : undefined;

        // Prefer attaching to the producing step (e.g. UniversalSearchTool
        // running inside a lightweight `*.agent.Agent` invocation). Falling
        // back to turn-level only when no step is currently in flight keeps
        // the existing behavior for transcripts where GenAI fires outside any
        // step (rare). This stops the synthetic "GenerativeAnswers" turn-card
        // from rendering as a sibling of the producing step.
        let attachedToStep = false;
        if (inFlightStepKey) {
          const exec =
            pendingStepExecutions.get(inFlightStepKey) ||
            allStepExecutions.get(inFlightStepKey);
          if (exec) {
            const updated: Partial<StepExecution> = {
              ...exec,
              genAiSupportData: activity.value,
              tokenInfo: tokenInfo ?? exec.tokenInfo,
            };
            pendingStepExecutions.set(inFlightStepKey, updated);
            allStepExecutions.set(inFlightStepKey, updated);
            attachedToStep = true;
          }
        }

        if (!attachedToStep) {
          const applied = applyToTurnByReplyToId(activity.replyToId, (turn) => {
            turn.debugInfo = turn.debugInfo ?? {};
            (turn.debugInfo as any).genAiSupportData = activity.value;
            if (tokenInfo) (turn.debugInfo as any).tokenInfo = tokenInfo;
          });
          // Fallback: if we couldn't match to a user message yet, keep it pending.
          if (!applied) {
            pendingDebugInfo.genAiSupportData = activity.value;
            if (tokenInfo) pendingDebugInfo.tokenInfo = tokenInfo;
          }
        }
        stepTimestamps["GenerativeAnswersSupportData"] = toIsoTimestamp(
          activity.timestamp
        );
      }

      if (
        activity.name === "ResponseGeneratorSupportData" ||
        activity.valueType === "ResponseGeneratorSupportData"
      ) {
        pendingDebugInfo.responseGeneratorData = activity.value;
        stepTimestamps["ResponseGeneratorSupportData"] = toIsoTimestamp(
          activity.timestamp
        );
      }

      if (
        activity.name === "CodeTraceData" ||
        activity.valueType === "CodeTraceData"
      ) {
        const codeTrace = activity.value as Record<string, unknown> | undefined;
        const traceCode =
          typeof codeTrace?.code === "string" ? codeTrace.code : undefined;
        const traceResponse =
          typeof codeTrace?.responseContent === "string"
            ? codeTrace.responseContent
            : undefined;
        const traceFile = codeTrace?.file;

        if (inFlightStepKey) {
          const exec =
            pendingStepExecutions.get(inFlightStepKey) ||
            allStepExecutions.get(inFlightStepKey);
          if (exec) {
            const obs =
              exec.observation && typeof exec.observation === "object"
                ? ({ ...(exec.observation as Record<string, unknown>) } as Record<string, unknown>)
                : ({} as Record<string, unknown>);
            if (traceCode) obs.code = traceCode;
            if (traceResponse) obs.responseContent = traceResponse;
            if (traceFile !== undefined) obs.code_file = traceFile;

            const updated: Partial<StepExecution> = {
              ...exec,
              observation: obs,
            };
            pendingStepExecutions.set(inFlightStepKey, updated);
            allStepExecutions.set(inFlightStepKey, updated);
          }
        }

        pendingDebugInfo.codeExecution = activity.value;
        stepTimestamps["CodeTraceData"] = toIsoTimestamp(activity.timestamp);
      }

      // Deep Reasoning trace — emitted alongside ReasonerTool steps in snapshot mode.
      // DebugPanel reads responseContent from turn.activities directly.
      if (
        activity.name === "ReasoningTraceData" ||
        activity.valueType === "ReasoningTraceData"
      ) {
        stepTimestamps["ReasoningTraceData"] = toIsoTimestamp(activity.timestamp);
      }

      if (activity.valueType === "SessionInfo") {
        if ((activity.value as any)?.outcome)
          sessionOutcome = (activity.value as any).outcome;
        if ((activity.value as any)?.outcomeReason)
          sessionOutcomeReason = (activity.value as any).outcomeReason;
      }
    }

    // invoke — new-style feedback: type="invoke", name="message/submitAction",
    // value.actionName="feedback", value.actionValue.reaction="dislike"/"like"
    if (
      activity.type === "invoke" &&
      activity.name === "message/submitAction" &&
      (activity.value as any)?.actionName === "feedback"
    ) {
      const actionValue = (activity.value as any)?.actionValue as Record<string, unknown> | undefined;
      const rawReaction = String(actionValue?.["reaction"] ?? "").toLowerCase();
      // Normalize invoke reaction values to the FeedbackData rating type
      const rating: "thumbsUp" | "thumbsDown" | undefined =
        rawReaction === "like" || rawReaction === "thumbsup"
          ? "thumbsUp"
          : rawReaction === "dislike" || rawReaction === "thumbsdown"
            ? "thumbsDown"
            : undefined;
      const feedbackText = String(
        (actionValue?.["feedback"] as Record<string, unknown> | undefined)?.["feedbackText"] ?? ""
      );
      if (rating) {
        // Attach to the assistant turn the feedback replies to (via replyToId → bot message id)
        const replyToId = activity.replyToId;
        let attached = false;
        if (replyToId) {
          for (let i = turns.length - 1; i >= 0; i -= 1) {
            if (turns[i].role === "assistant" && turns[i].id === replyToId) {
              appendTurnFeedback(turns[i], { rating, comment: feedbackText || undefined });
              attached = true;
              break;
            }
          }
        }
        // Fallback: attach to most recent assistant turn if replyToId not matched
        if (!attached) {
          for (let i = turns.length - 1; i >= 0; i -= 1) {
            if (turns[i].role === "assistant") {
              appendTurnFeedback(turns[i], { rating, comment: feedbackText || undefined });
              break;
            }
          }
        }
      }
    }
  }

  // If the transcript ends with trace/event batches (common in your reference), attach them to the latest user turn.
  const hasPendingTail =
    pendingActivities.length > 0 ||
    Object.keys(pendingDebugInfo).length > 0 ||
    Object.keys(stepTimestamps).length > 0 ||
    Boolean(mcpServerInfo) ||
    mcpServers.length > 0 ||
    mcpTools.length > 0 ||
    pendingStepExecutions.size > 0;

  if (hasPendingTail) {
    const tailTarget = findRealUserTurn();
    if (tailTarget) attachPendingToUserTurn(tailTarget);
  }

  // Update step executions with any finished data that came later. This
  // ensures execution times AND timestamp anchors from DynamicPlanStepFinished
  // are captured even if they arrive after the turn was already flushed (e.g.
  // a sub-step's DynamicPlanStepFinished can fire after a consent-card user
  // submit, which itself triggers a turn flush — without carrying both
  // `executionTime` and `finishedAt` over, the duration resolver later can't
  // compute a fallback from triggeredAt → finishedAt).
  for (const turn of turns) {
    if (turn.role === "user" && turn.debugInfo?.stepExecutions) {
      const updatedExecutions = turn.debugInfo.stepExecutions.map((exec) => {
        const key = exec.stepId
          ? `${exec.taskDialogId}:${exec.stepId}`
          : String(exec.taskDialogId);
        const globalExec = allStepExecutions.get(key);
        if (!globalExec) return exec;
        const next: StepExecution = { ...exec };
        if (
          globalExec.executionTime &&
          (!exec.executionTime ||
            (!hasNonZeroExecutionTime(exec.executionTime) &&
              hasNonZeroExecutionTime(globalExec.executionTime)))
        ) {
          next.executionTime = globalExec.executionTime;
        }
        if (globalExec.observation !== undefined && exec.observation === undefined) {
          next.observation = globalExec.observation;
        }
        if (globalExec.finishedAt && !exec.finishedAt) {
          next.finishedAt = globalExec.finishedAt;
        }
        if (globalExec.triggeredAt && !exec.triggeredAt) {
          next.triggeredAt = globalExec.triggeredAt;
        }
        if (globalExec.state !== undefined && exec.state === undefined) {
          next.state = globalExec.state;
        }
        return next;
      });
      turn.debugInfo.stepExecutions = updatedExecutions;
    }
  }

  const outcomeDisplay = sessionOutcomeReason
    ? `${sessionOutcome} (${sessionOutcomeReason})`
    : sessionOutcome;
  const duration = `${Math.floor(durationMs / 1000)}s`;

  return {
    generalInfo: {
      durationMs,
      duration,
      turnCount: turns.length,
      outcome: outcomeDisplay,
    },
    turns,
    raw: { activities },
  };
}

// ─── Connected Agent helpers ───────────────────────────────────────

/**
 * Extended result from parseTranscript that includes connected agent info.
 */
export interface ParseTranscriptWithConnectedAgentsResult {
  transcript: ProcessedTranscript;
  connectedAgents: ConnectedAgentInfo[];
  isChildTranscript: boolean;
  parentContext: {
    instruction: string;
    parentHistory: unknown[];
  } | null;
}

/**
 * Enhanced version of parseTranscript that also detects connected agents.
 * Use this when you need to discover child agent invocations.
 */
export function parseTranscriptWithConnectedAgents(
  data: TranscriptData,
  conversationId: string
): ParseTranscriptWithConnectedAgentsResult {
  const transcript = parseTranscript(data);

  const activities = data.activities ?? [];

  // Detect if this *is* a child (connected agent) transcript
  const isChildTranscript = isConnectedAgentTranscript(activities);
  const parentContext = isChildTranscript
    ? extractParentContext(activities)
    : null;

  // Detect connected agent invocations in this (parent) transcript
  const connectedAgents = detectConnectedAgents(activities, conversationId);

  return {
    transcript,
    connectedAgents,
    isChildTranscript,
    parentContext,
  };
}

/**
 * After fetching a child transcript, call this to populate a ConnectedAgentInfo
 * with child topics and parsed turns.
 */
export function populateConnectedAgentFromChildTranscript(
  connectedAgent: ConnectedAgentInfo,
  childActivities: unknown[]
): ConnectedAgentInfo {
  const childTranscript = parseTranscript({
    activities: childActivities as Activity[],
  });

  // Build child topics from the parsed step executions of the child transcript.
  // This carries the full per-step debug data (thought, arguments, observation,
  // state, executionTime) and uses the same `type` field that the parent emits
  // via DynamicPlanStepTriggered, so downstream classification matches the
  // parent debug panel exactly.
  const childTopics = buildChildTopicsFromTurns(childTranscript.turns) ;
  // Fallback: if no executions were captured (e.g. only DynamicPlanReceived
  // arrived), still surface the planned step ids so the box isn't empty.
  const finalChildTopics = childTopics.length > 0
    ? childTopics
    : extractChildTopics(childActivities);

  return {
    ...connectedAgent,
    childTopics: finalChildTopics,
    childTranscript: childTranscript.turns,
    isFetched: true,
    isFetching: false,
    fetchError: undefined,
  };
}

function buildChildTopicsFromTurns(turns: ProcessedTurn[]): ConnectedAgentChildTopic[] {
  const out: ConnectedAgentChildTopic[] = [];
  const seen = new Set<string>();
  for (const turn of turns) {
    const execs = turn.debugInfo?.stepExecutions ?? [];
    for (const exec of execs) {
      const schemaId = String(exec?.taskDialogId ?? "").trim();
      if (!schemaId) continue;
      const stepId = exec?.stepId ? String(exec.stepId) : undefined;
      const dedupKey = stepId ? `${schemaId}:${stepId}` : schemaId;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const execTimeRaw = (exec as { executionTime?: unknown })?.executionTime;
      const executionTime = typeof execTimeRaw === "string" ? execTimeRaw : undefined;
      const executionTimeSeconds = parseExecutionTimeToSeconds(executionTime);
      const stateRaw = (exec as { state?: unknown })?.state;

      out.push({
        displayName:
          typeof exec?.displayName === "string" && exec.displayName.trim()
            ? exec.displayName.trim()
            : deriveStepDisplayName(schemaId),
        schemaId,
        type: typeof exec?.type === "string" ? exec.type : "",
        executionTime,
        executionTimeSeconds,
        hasExecution: true,
        stepId,
        thought: typeof exec?.thought === "string" ? exec.thought : undefined,
        arguments: exec?.arguments && typeof exec.arguments === "object"
          ? (exec.arguments as Record<string, unknown>)
          : undefined,
        observation: (exec as { observation?: unknown })?.observation,
        state: typeof stateRaw === "string" || typeof stateRaw === "number"
          ? stateRaw
          : undefined,
      });
    }
  }
  return out;
}

function hasNonZeroExecutionTime(value?: string): boolean {
  if (!value) return false;
  const parts = value.trim().split(":");
  if (parts.length !== 3) return false;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds > 0;
}

function parseExecutionTimeToSeconds(timeStr?: string): number | undefined {
  if (!timeStr) return undefined;
  const parts = timeStr.split(":");
  if (parts.length !== 3) return undefined;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 100) / 100;
}
