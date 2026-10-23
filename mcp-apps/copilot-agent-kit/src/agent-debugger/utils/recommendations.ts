/**
 * Recommendation engine for Agent Debugger.
 *
 * Pure function — no async, no React. Analyses the already-parsed transcript
 * data and returns a list of recommendations ranked by severity.
 *
 * Severity levels:
 *   high   — likely user-facing failures or blocking errors
 *   medium — performance or quality issues that degrade experience
 *   low    — informational / best-practice suggestions
 */

import type { Activity, ProcessedTranscript, ProcessedTurn, StepExecution } from "../contracts/transcript.js";
import type { ConversationData } from "../contracts/conversation.js";
import type { ConnectedAgentInfo } from "../contracts/connected-agent.js";
import type { ComponentInfo } from "../services/botcomponents-service.js";
import { resolveStepName, execTimeToMs } from "./step-classification.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RecommendationSeverity = "high" | "medium" | "low";

export interface Recommendation {
  id: string;
  severity: RecommendationSeverity;
  category: string;
  title: string;
  description: string;
  suggestion: string;
  /** Activity ID of the user turn to navigate to (enables deep-link into Conversation Preview). */
  turnId?: string;
  /** 1-based human-readable turn number shown in the card. */
  turnNumber?: number;
}

// ---------------------------------------------------------------------------
// Helpers — delegate to step-classification.ts (same logic as Debug Panel)
// ---------------------------------------------------------------------------

/** Wraps resolveStepName for a StepExecution, falling back to "Unknown step". */
function stepName(step: StepExecution, componentMap: Record<string, ComponentInfo>): string {
  // Prefer the friendly display name carried on the step (generative
  // orchestration sets this from toolDisplayName) so recommendations never show
  // a raw schema name.
  const dn = typeof step.displayName === "string" ? step.displayName.trim() : "";
  if (dn) return dn;
  return resolveStepName(step.taskDialogId, componentMap) || "Unknown step";
}

/**
 * Resolves a connected agent's friendly display name
 * so recommendations never surface a raw schema name (generative connected
 * agents carry a schema-derived `displayName`).
 */
function agentDisplayName(
  a: ConnectedAgentInfo,
  componentMap: Record<string, ComponentInfo>,
): string {
  const resolve = (schema?: string): string => {
    if (!schema) return "";
    const info = componentMap[schema];
    return info?.modelDisplayName?.trim() || info?.name?.trim() || "";
  };
  return (
    resolve(a.dialogSchemaName) ||
    resolve(a.botSchemaName) ||
    (a.displayName?.trim() || "Connected agent")
  );
}

/** Get the user turns in order so we can attach turn numbers. */
function userTurns(turns: ProcessedTurn[]): ProcessedTurn[] {
  return turns.filter((t) => t.role === "user");
}

// ---------------------------------------------------------------------------
// Individual check functions (each returns 0 or 1 Recommendation)
// ---------------------------------------------------------------------------

/** Mirrors transcriptHasError: state ≥ 2 (number) OR "fail/error/exception/cancel/block" (string). */
function isFailedState(state: unknown): boolean {
  if (typeof state === "number") return state >= 2;
  if (typeof state === "string") return /fail|error|exception|cancel|block/i.test(state);
  return false;
}

/**
 * Detects only activity.type === "error" (e.g. ToolIdentifierConflict).
 * All DynamicPlanStepFinished / ErrorTraceData errors are handled by checkRawActivityErrors.
 * Bot-response-text patterns removed — always a downstream symptom of an already-detected step failure.
 * stepTypes[].state removed — DynamicPlanStepFinished in the raw stream is the authoritative source.
 */
function checkFailedSteps(
  turns: ProcessedTurn[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  const uTurns = userTurns(turns);
  const seenIds = new Set<string>();

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.role !== "user") continue;
    const turnIdx = uTurns.indexOf(turn) + 1;

    // activity.type === "error": ToolIdentifierConflict and similar runtime errors
    // that never appear in DynamicPlanStepFinished (configuration-level faults).
    for (const act of turn.activities ?? []) {
      const actAny = act as unknown as Record<string, unknown>;
      if (actAny["type"] === "error") {
        const id = `activity-error-${act.id ?? `${i}-error`}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          const errName = String(actAny["name"] ?? "Error");
          recs.push({
            id,
            severity: "high",
            category: "Errors",
            title: `"${errName}" error in turn ${turnIdx}`,
            description: `An error activity was recorded: "${errName}". This typically indicates a tool configuration conflict or runtime exception that stopped the agent.`,
            suggestion:
              errName.toLowerCase().includes("toolidentifier")
                ? "Two or more tools share the same identifier. Rename the conflicting tools in your agent configuration to give each a unique name."
                : "Check the Debug Panel for this turn. Review tool and connector configurations for conflicts or permission issues.",
            turnId: turn.id,
            turnNumber: turnIdx,
          });
        }
      }
    }
  }

  return recs;
}

function checkConversationOutcome(
  generalInfo: ConversationData["generalInfo"],
): Recommendation[] {
  const outcome = generalInfo.globalOutcome ?? "";
  // Outcome contains the raw value plus optional reason in parentheses, e.g.
  // "HandOff (AgentTransferConfiguredByAuthor)" or "Abandoned (UserExit)".
  // Use regex to match the core outcome word rather than strict equality.
  if (/escalat|handoff/i.test(outcome)) {
    return [{
      id: "outcome-escalated",
      severity: "high",
      category: "Outcome",
      title: "Conversation was escalated to a human agent",
      description: "The agent could not resolve the user's request and escalated to a human. This may indicate missing topics, poor intent routing, or insufficient knowledge sources.",
      suggestion: "Review the conversation turns to identify where the agent failed. Consider adding topics, improving trigger phrases, or extending knowledge sources.",
    }];
  }
  if (/abandon/i.test(outcome)) {
    return [{
      id: "outcome-abandoned",
      severity: "high",
      category: "Outcome",
      title: "Conversation was abandoned without resolution",
      description: "The user left before the conversation was resolved. This often indicates confusion, unhelpful responses, or a long wait.",
      suggestion: "Review the last few turns. Check for missing bot responses, slow steps, or off-topic answers that may have frustrated the user.",
    }];
  }
  return [];
}

function checkFallbackTriggered(turns: ProcessedTurn[], rawActivities: Activity[]): Recommendation[] {
  const recs: Recommendation[] = [];
  const uTurns = userTurns(turns);
  const seenTurnIds = new Set<string>();

  // Path 1: orchestrated agents — initialTopic is populated from DynamicPlanStepTriggered.
  // Note: topicName is often "" in parsed data; also check topicId which contains the full schema name.
  for (const turn of turns) {
    if (turn.role !== "user") continue;
    const topicName = turn.debugInfo?.initialTopic?.topicName ?? "";
    const topicId   = turn.debugInfo?.initialTopic?.topicId   ?? "";
    if (
      /fallback/i.test(topicName) || /multiple.*matched/i.test(topicName) ||
      /fallback/i.test(topicId)   || /multiple.*matched/i.test(topicId)
    ) {
      const label = topicName || topicId.split(".").pop() || "Fallback";
      const turnIdx = uTurns.indexOf(turn) + 1;
      seenTurnIds.add(turn.id);
      recs.push({
        id: `fallback-turn-${turn.id}`,
        severity: "high",
        category: "Intent Routing",
        title: `"${label}" triggered in turn ${turnIdx}`,
        description: `The agent routed to the system "${label}" topic, meaning the user's intent was not matched by any custom topic.`,
        suggestion: "Add trigger phrases to existing topics, create a new topic for this intent, or switch to Generative orchestration for more flexible routing.",
        turnId: turn.id,
        turnNumber: turnIdx,
      });
    }
  }

  // Path 2: classic (non-orchestrated) agents — Fallback topic appears only in DialogTracing
  // activities, not as DynamicPlanStepTriggered. Scan the raw activity stream for DialogTracing
  // events where any action references a Fallback topic.
  for (const a of rawActivities as unknown as Array<Record<string, unknown>>) {
    if (a["name"] !== "DialogTracing") continue;
    const actions = (a["value"] as Record<string, unknown> | undefined)?.["actions"];
    if (!Array.isArray(actions)) continue;

    const fallbackAction = actions.find(
      (act: unknown) => /fallback/i.test(String((act as Record<string, unknown>)?.["topicId"] ?? ""))
    ) as Record<string, unknown> | undefined;
    if (!fallbackAction) continue;

    const replyToId = String(a["replyToId"] ?? "");
    const userTurn = replyToId
      ? turns.find((t) => t.role === "user" && t.id === replyToId)
      : undefined;
    if (!userTurn || seenTurnIds.has(userTurn.id)) continue;
    seenTurnIds.add(userTurn.id);

    const topicId = String(fallbackAction["topicId"] ?? "");
    const label = topicId.split(".").pop() || "Fallback";
    const turnIdx = uTurns.indexOf(userTurn) + 1;

    recs.push({
      id: `fallback-dialogracing-${userTurn.id}`,
      severity: "high",
      category: "Intent Routing",
      title: `"${label}" triggered in turn ${turnIdx}`,
      description: `The agent routed to the system Fallback topic in turn ${turnIdx} — the user's intent was not matched by any custom topic.`,
      suggestion: "Add trigger phrases to existing topics, create a new topic for this intent, or switch to Generative orchestration for more flexible routing.",
      turnId: userTurn.id,
      turnNumber: turnIdx,
    });
  }

  return recs;
}

function checkConnectedAgentErrors(
  agents: ConnectedAgentInfo[],
  componentMap: Record<string, ComponentInfo>,
): Recommendation[] {
  return agents
    .filter((a) => a.fetchError)
    .map((a) => ({
      id: `agent-error-${a.sessionId}`,
      severity: "high" as RecommendationSeverity,
      category: "Connected Agents",
      title: `Connected agent "${agentDisplayName(a, componentMap)}" returned an error`,
      description: `Error: ${a.fetchError}. The child transcript could not be retrieved, which may mean the connected agent failed during execution.`,
      suggestion: "Ensure the connected agent is published, has correct permissions, and is accessible from this environment.",
    }));
}

/** Any rating value that represents negative feedback across different Copilot Studio versions. */
function isNegativeRating(rating?: string): boolean {
  if (!rating) return false;
  return /thumbsdown|dislike|bad|negative|no/i.test(rating);
}

/** Negative sentiment words in typed CSAT responses. */
const NEGATIVE_SENTIMENT = /\b(bad|not good|terrible|awful|horrible|poor|useless|wrong|incorrect|unhelpful|disappointing|frustrated|failed|error|problem|issue|broken)\b/i;

function checkNegativeFeedback(turns: ProcessedTurn[]): Recommendation[] {
  const recs: Recommendation[] = [];
  const uTurns = userTurns(turns);

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const feedback = turn.feedback;

    // Check explicit feedback rating (may be on assistant OR user turn)
    if (feedback && isNegativeRating(feedback.rating)) {
      // Find the closest preceding user turn for navigation
      const precedingUserTurn = [...turns].slice(0, i + 1).reverse().find((t) => t.role === "user");
      const turnIdx = precedingUserTurn ? uTurns.indexOf(precedingUserTurn) + 1 : undefined;
      recs.push({
        id: `negative-feedback-${turn.id}`,
        severity: "high",
        category: "User Feedback",
        title: turnIdx ? `User gave negative feedback after turn ${turnIdx}` : "User gave negative feedback",
        description: feedback.comment
          ? `User comment: "${feedback.comment}"`
          : "User gave a thumbs-down reaction. The agent response was not satisfactory.",
        suggestion: "Review the bot response in this turn. Check factual accuracy, tone, and whether the knowledge source content is current and relevant.",
        turnId: precedingUserTurn?.id ?? turn.id,
        turnNumber: turnIdx,
      });
    }

    // Check for typed negative CSAT response — user replies with negative text
    // after a bot message that appears to be a satisfaction/feedback prompt
    if (turn.role === "user" && NEGATIVE_SENTIMENT.test(turn.content ?? "")) {
      const prevBotTurn = [...turns].slice(0, i).reverse().find((t) => t.role === "assistant");
      const prevBotText = prevBotTurn?.content ?? "";
      const isCsatPrompt = /experience|feedback|satisfy|helpful|rate|how (did|was)|opinion/i.test(prevBotText);
      if (isCsatPrompt) {
        const turnIdx = uTurns.indexOf(turn) + 1;
        const id = `csat-negative-${turn.id}`;
        // Only add if no explicit rating feedback was already added for this turn area
        if (!recs.some((r) => r.turnId === turn.id)) {
          recs.push({
            id,
            severity: "high",
            category: "User Feedback",
            title: `Negative satisfaction response in turn ${turnIdx}`,
            description: `User responded "${turn.content?.substring(0, 100)}" to a satisfaction prompt — indicating dissatisfaction with the agent.`,
            suggestion: "Review the preceding bot response for accuracy and helpfulness. Check knowledge source coverage and consider adding more targeted content.",
            turnId: turn.id,
            turnNumber: turnIdx,
          });
        }
      }
    }
  }
  return recs;
}

function checkSlowTotalDuration(
  generalInfo: ConversationData["generalInfo"],
): Recommendation[] {
  const ms = generalInfo.totalDuration;
  // Critical: > 10 minutes
  if (ms > 600_000) {
    return [{
      id: "slow-total-critical",
      severity: "medium",
      category: "Performance",
      title: `Total conversation duration was very long (${(ms / 60_000).toFixed(1)} min)`,
      description: "Conversations longer than 10 minutes are very likely to frustrate users and significantly reduce satisfaction scores.",
      suggestion: "Use the Performance Timeline to identify the slowest steps. Consider parallelising tool calls, caching frequent lookups, or simplifying flow logic.",
    }];
  }
  // Warning: > 5 minutes
  if (ms > 300_000) {
    return [{
      id: "slow-total-warning",
      severity: "medium",
      category: "Performance",
      title: `Total conversation duration exceeded 5 minutes (${(ms / 60_000).toFixed(1)} min)`,
      description: "The full conversation took over 5 minutes. While some agentic workflows are expected to be long, users benefit from progress indicators and partial responses.",
      suggestion: "Review the Execution Flow for long-running steps. Optimise connector calls, reduce sequential dependencies, and consider async patterns where possible.",
    }];
  }
  return [];
}

function checkSlowSteps(
  turns: ProcessedTurn[],
  componentMap: Record<string, ComponentInfo>,
): Recommendation[] {
  const uTurns = userTurns(turns);
  type SlowEntry = { name: string; ms: number; turnIdx: number; turnId: string; stepId: string };
  const slow: SlowEntry[] = [];
  const seenKeys = new Set<string>();

  for (const turn of turns) {
    if (turn.role !== "user") continue;
    const turnIdx = uTurns.indexOf(turn) + 1;
    for (const step of turn.debugInfo?.stepExecutions ?? []) {
      // Skip connected agent invocations — handled by checkSlowConnectedAgents to avoid duplicate cards
      if (step.taskDialogId.includes("InvokeConnectedAgentTaskAction")) continue;
      const ms = execTimeToMs(step.executionTime);
      // Deduplicate by (taskDialogId + rounded seconds) — avoid identical steps in merged sessions
      const key = `${step.taskDialogId}-${Math.round(ms / 1000)}`;
      if (ms > 10_000 && !seenKeys.has(key)) {
        seenKeys.add(key);
        slow.push({ name: stepName(step, componentMap), ms, turnIdx, turnId: turn.id, stepId: step.stepId });
      }
    }
  }

  if (slow.length === 0) return [];

  // Single slow step — individual card
  if (slow.length === 1) {
    const s = slow[0];
    return [{
      id: `slow-step-${s.stepId}`,
      severity: "medium",
      category: "Performance",
      title: `Step "${s.name}" took ${(s.ms / 1000).toFixed(1)}s in turn ${s.turnIdx}`,
      description: `Steps slower than 10 seconds add noticeable latency for users. This step ran for ${(s.ms / 1000).toFixed(1)} seconds.`,
      suggestion: "Investigate connector latency, large response payloads, or complex query logic. Consider caching results or splitting the step.",
      turnId: s.turnId,
      turnNumber: s.turnIdx,
    }];
  }

  // Multiple slow steps — grouped into one card, linking to the worst offender
  const worst = slow.reduce((max, s) => s.ms > max.ms ? s : max);
  const stepLines = slow
    .map((s) => `"${s.name}" — ${(s.ms / 1000).toFixed(1)}s (turn ${s.turnIdx})`)
    .join("; ");
  const totalSlowMs = slow.reduce((sum, s) => sum + s.ms, 0);

  return [{
    id: "slow-steps-grouped",
    severity: "medium",
    category: "Performance",
    title: `${slow.length} slow steps detected — worst: "${worst.name}" (${(worst.ms / 1000).toFixed(1)}s)`,
    description: `${slow.length} steps exceeded 10 seconds, adding ~${(totalSlowMs / 1000).toFixed(1)}s of cumulative latency. Steps: ${stepLines}.`,
    suggestion: "Open the Performance Timeline to see the full waterfall. Investigate connector latency, large response payloads, or complex query logic in the highlighted steps.",
    turnId: worst.turnId,
    turnNumber: worst.turnIdx,
  }];
}

function checkSlowConnectedAgents(
  agents: ConnectedAgentInfo[],
  componentMap: Record<string, ComponentInfo>,
): Recommendation[] {
  return agents
    .filter((a) => (a.executionTimeSeconds ?? 0) > 10)
    .map((a) => ({
      id: `slow-agent-${a.sessionId}`,
      severity: "medium" as RecommendationSeverity,
      category: "Performance",
      title: `Connected agent "${agentDisplayName(a, componentMap)}" took ${a.executionTimeSeconds?.toFixed(1)}s`,
      description: "Connected agents slower than 10 seconds significantly impact overall response time and user experience.",
      suggestion: "Profile the connected agent independently. Look for slow topics, large knowledge searches, or connector bottlenecks within that agent.",
    }));
}

function checkLowIntentConfidence(turns: ProcessedTurn[]): Recommendation[] {
  const recs: Recommendation[] = [];
  const uTurns = userTurns(turns);

  for (const turn of turns) {
    if (turn.role !== "user") continue;
    const score = turn.debugInfo?.intentRecognition?.intentScore?.score;
    if (typeof score === "number" && score > 0 && score < 0.7) {
      const turnIdx = uTurns.indexOf(turn) + 1;
      const intentTitle = turn.debugInfo?.intentRecognition?.intentTitle ?? "unknown intent";
      recs.push({
        id: `low-intent-${turn.id}`,
        severity: "medium",
        category: "Intent Routing",
        title: `Low intent confidence (${(score * 100).toFixed(0)}%) in turn ${turnIdx}`,
        description: `The agent matched "${intentTitle}" with only ${(score * 100).toFixed(0)}% confidence. Low confidence routing can lead to wrong topics being triggered.`,
        suggestion: "Add more diverse trigger phrases to the matched topic, remove ambiguous phrases from other topics, or consider Generative orchestration for more natural routing.",
        turnId: turn.id,
        turnNumber: turnIdx,
      });
    }
  }
  return recs;
}

function checkKnowledgeNotCited(turns: ProcessedTurn[]): Recommendation[] {
  let searchedCount = 0;
  let citedCount = 0;

  for (const turn of turns) {
    const ks = turn.debugInfo?.knowledgeSources;
    searchedCount += ks?.searched?.length ?? 0;
    citedCount += ks?.cited?.length ?? 0;
    for (const step of turn.debugInfo?.stepExecutions ?? []) {
      searchedCount += step.knowledgeSources?.searched?.length ?? 0;
      citedCount += step.knowledgeSources?.cited?.length ?? 0;
    }
  }

  if (searchedCount > 0 && citedCount === 0) {
    return [{
      id: "knowledge-not-cited",
      severity: "medium",
      category: "Knowledge",
      title: "Knowledge sources searched but no content was cited",
      description: `${searchedCount} knowledge source${searchedCount > 1 ? "s" : ""} were searched across the conversation but nothing was cited in any response. The agent may be ignoring potentially relevant content.`,
      suggestion: "Verify knowledge source content is up-to-date and relevant to the conversation topic. Check if Semantic Search is enabled in agent settings. Consider reindexing or adding more targeted content.",
    }];
  }
  return [];
}

/**
 * Merged token check: fires if any single turn > 4,000 OR total > 10,000.
 * Per-turn and total checks were separate but almost always co-occurred — consolidated into one.
 * Per-turn threshold (4k) fires first and includes the specific turn; total (10k) fires when
 * no single turn exceeded 4k but cumulative cost is high.
 */
function checkHighTokens(
  turns: ProcessedTurn[],
  generalInfo: ConversationData["generalInfo"],
): Recommendation[] {
  const uTurns = userTurns(turns);

  // Check for a high-token turn first (more specific)
  for (const turn of turns) {
    if (turn.role !== "user") continue;
    const tokens = turn.debugInfo?.tokenInfo?.totalTokens;
    if (tokens && tokens > 4_000) {
      const turnIdx = uTurns.indexOf(turn) + 1;
      return [{
        id: `high-tokens-${turn.id}`,
        severity: "medium",
        category: "Performance",
        title: `High token usage in turn ${turnIdx} (${tokens.toLocaleString()} tokens)`,
        description: `Turn ${turnIdx} used ${tokens.toLocaleString()} tokens — exceeding the 4,000 threshold. High per-turn token counts increase latency and cost.`,
        suggestion: "Review agent instructions for redundancy. Check if knowledge sources return large chunks. Consider enabling token-efficient settings or trimming the context window.",
        turnId: turn.id,
        turnNumber: turnIdx,
      }];
    }
  }

  // Fallback: total conversation tokens high but no single turn exceeded threshold
  const total = generalInfo.totalTokensUsed;
  if (total > 10_000) {
    return [{
      id: "high-total-tokens",
      severity: "low",
      category: "Cost & Performance",
      title: `High total token usage across conversation (${total.toLocaleString()} tokens)`,
      description: "The full conversation consumed more than 10,000 tokens. High cumulative token counts increase both cost and latency at scale.",
      suggestion: "Review agent instructions for verbosity. Check knowledge sources for large chunk sizes. Consider shortening the conversation history window in orchestration settings.",
    }];
  }

  return [];
}

function checkMultipleSessions(
  generalInfo: ConversationData["generalInfo"],
): Recommendation[] {
  if (generalInfo.numberOfSessions > 1) {
    return [{
      id: "multiple-sessions",
      severity: "medium",
      category: "Session",
      title: `Conversation required ${generalInfo.numberOfSessions} sessions (user reconnected)`,
      description: "Multiple sessions indicate the user went idle and reconnected, or the conversation was split across network interruptions. This can cause context loss.",
      suggestion: "Review the conversation timeout and session persistence settings. Ensure the Greeting topic handles returning sessions gracefully with appropriate context recovery.",
    }];
  }
  return [];
}

function checkExcessiveTurnsUnresolved(
  generalInfo: ConversationData["generalInfo"],
  turns: ProcessedTurn[],
): Recommendation[] {
  const userTurnCount = turns.filter((t) => t.role === "user").length;
  if (userTurnCount > 8 && generalInfo.globalOutcome !== "Resolved") {
    return [{
      id: "excessive-turns",
      severity: "medium",
      category: "Conversation Quality",
      title: `${userTurnCount} turns without resolution`,
      description: `The conversation had ${userTurnCount} user messages but was not resolved. Long unresolved conversations indicate the agent is struggling to understand or fulfil the user's request.`,
      suggestion: "Review the conversation flow for looping patterns or repeated misunderstandings. Consider adding an explicit escalation path after a configurable number of failed attempts.",
    }];
  }
  return [];
}

function checkMissingBotResponse(turns: ProcessedTurn[]): Recommendation[] {
  const recs: Recommendation[] = [];
  const uTurns = userTurns(turns);

  for (let i = 0; i < turns.length - 1; i++) {
    if (turns[i].role === "user" && turns[i + 1].role === "user") {
      const turnIdx = uTurns.indexOf(turns[i]) + 1;
      recs.push({
        id: `missing-response-${turns[i].id}`,
        severity: "high",
        category: "Errors",
        title: `No bot response after turn ${turnIdx}`,
        description: "A user message was not followed by a bot response. This may indicate a timeout, unhandled exception, or topic routing failure.",
        suggestion: "Check the On Error system topic configuration. Review timeout settings and ensure all topics have a valid output response defined.",
        turnId: turns[i].id,
        turnNumber: turnIdx,
      });
    }
  }
  return recs;
}

function checkConnectedAgentNotFetched(
  agents: ConnectedAgentInfo[],
  componentMap: Record<string, ComponentInfo>,
): Recommendation[] {
  return agents
    .filter((a) => !a.isFetched && !a.isFetching && !a.fetchError && a.childConversationId)
    .map((a) => ({
      id: `agent-unfetched-${a.sessionId}`,
      severity: "low" as RecommendationSeverity,
      category: "Connected Agents",
      title: `Child transcript for "${agentDisplayName(a, componentMap)}" was not loaded`,
      description: "The connected agent's child transcript was not retrieved. This may be a network issue or a permission problem accessing the child agent's conversation data.",
      suggestion: "Verify the connected agent's environment URL is accessible and the app has permission to read conversation transcripts in that environment.",
    }));
}

/**
 * Scans ALL raw activities for error signals — mirrors transcriptHasError exactly.
 * Groups DynamicPlanStepFinished + its corresponding ErrorTraceData into ONE card
 * so the same fault never produces multiple recommendations.
 */
function checkRawActivityErrors(
  rawActivities: Activity[],
  turns: ProcessedTurn[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  const uTurns = userTurns(turns);

  /** Find the closest preceding real user message activity index */
  function prevUserActIdx(fromIdx: number): number {
    for (let i = fromIdx - 1; i >= 0; i--) {
      const x = rawActivities[i] as unknown as Record<string, unknown>;
      const from = x["from"] as Record<string, unknown> | undefined;
      if (x["type"] === "message" && (from?.["role"] === 1 || from?.["role"] === "user")) return i;
    }
    return -1;
  }

  /** Resolve the ProcessedTurn for a raw activity index */
  function resolveUserTurn(fromIdx: number) {
    const pIdx = prevUserActIdx(fromIdx);
    if (pIdx < 0) return uTurns[uTurns.length - 1];
    const prevId = String((rawActivities[pIdx] as unknown as Record<string, unknown>)["id"] ?? "");
    return turns.find((t) => t.role === "user" && t.activities.some((ta) => ta.id === prevId))
      ?? uTurns[uTurns.length - 1];
  }

  // Build a map of replyToId → ErrorTraceData message so we can enrich the
  // DynamicPlanStepFinished card without generating a separate recommendation.
  const errorTraceByReplyTo = new Map<string, string>();
  for (const act of rawActivities) {
    const a = act as unknown as Record<string, unknown>;
    if (a["valueType"] === "ErrorTraceData") {
      const replyTo = String(a["replyToId"] ?? "");
      const v = a["value"] as Record<string, unknown> | undefined;
      const msg = String(v?.["errorMessage"] ?? "");
      if (replyTo && msg) errorTraceByReplyTo.set(replyTo, msg);
    }
  }

  // Track which ErrorTraceData messages have been absorbed into a step card
  const absorbedReplyTos = new Set<string>();
  const seenStepIds = new Set<string>();

  for (let i = 0; i < rawActivities.length; i++) {
    const a = rawActivities[i] as unknown as Record<string, unknown>;

    // DynamicPlanStepFinished with failed state → ONE card, enriched with ErrorTraceData
    if (
      (a["name"] === "DynamicPlanStepFinished" || a["valueType"] === "DynamicPlanStepFinished") &&
      isFailedState((a["value"] as Record<string, unknown> | undefined)?.["state"])
    ) {
      const value = a["value"] as Record<string, unknown> | undefined;
      const taskId = String(value?.["taskDialogId"] ?? "");
      const stepId = String(value?.["stepId"] ?? "");
      const dedupKey = taskId + stepId;
      if (seenStepIds.has(dedupKey)) continue;
      seenStepIds.add(dedupKey);

      // Both DynamicPlanStepFinished and ErrorTraceData reply to the SAME parent
      // activity (the user message). Match them by their shared replyToId.
      const stepReplyTo = String(a["replyToId"] ?? "");
      const traceMsg = errorTraceByReplyTo.get(stepReplyTo) ?? "";
      if (traceMsg) absorbedReplyTos.add(stepReplyTo);

      // Fallback: use the error object embedded in the step value
      const errObj = value?.["error"] as Record<string, unknown> | undefined;
      const embeddedMsg = String(errObj?.["message"] ?? "");
      const description = (traceMsg || embeddedMsg)
        .substring(0, 250);

      const userTurn = resolveUserTurn(i);
      const turnIdx = userTurn ? uTurns.indexOf(userTurn) + 1 : undefined;
      const stepDisplayName = taskId ? resolveStepName(taskId, {}) || taskId.split(".").pop() || "Unknown step" : "Unknown step";

      recs.push({
        id: `raw-step-failed-${dedupKey}`,
        severity: "high",
        category: "Errors",
        title: turnIdx ? `Step "${stepDisplayName}" failed in turn ${turnIdx}` : `Step "${stepDisplayName}" failed`,
        description: description || `Step returned state "${value?.["state"]}" — connector or tool execution failed.`,
        suggestion: "Check the connector configuration, verify the API endpoint, entity name, and record IDs. Review the error detail above for the HTTP status and inner error message.",
        turnId: userTurn?.id,
        turnNumber: turnIdx,
      });
    }
  }

  // Any ErrorTraceData NOT already absorbed by a step card → its own card
  for (let i = 0; i < rawActivities.length; i++) {
    const a = rawActivities[i] as unknown as Record<string, unknown>;
    if (a["valueType"] !== "ErrorTraceData") continue;
    const actId = String(a["id"] ?? "");
    const replyTo = String(a["replyToId"] ?? "");
    if (absorbedReplyTos.has(replyTo)) continue;  // already merged into a step card

    const v = a["value"] as Record<string, unknown> | undefined;
    const errorCode = String(v?.["errorCode"] ?? "");
    if (!errorCode || seenStepIds.has(`errortrace-${actId}`)) continue;
    seenStepIds.add(`errortrace-${actId}`);

    const userTurn = resolveUserTurn(i);
    const turnIdx = userTurn ? uTurns.indexOf(userTurn) + 1 : undefined;
    const errorMsg = String(v?.["errorMessage"] ?? "");

    recs.push({
      id: `raw-error-trace-${actId}`,
      severity: "high",
      category: "Errors",
      title: turnIdx ? `Connector error in turn ${turnIdx}: ${errorCode}` : `Connector error: ${errorCode}`,
      description: errorMsg.substring(0, 250) || `Error code: ${errorCode}`,
      suggestion: "Verify the connector is correctly configured. Check the API endpoint, authentication, and permissions.",
      turnId: userTurn?.id,
      turnNumber: turnIdx,
    });
  }

  return recs;
}

/**
 * Generative orchestration (new designer): surfaces failed `ToolCallTrace:Failed`
 * tool calls as error recommendations. The classic detectors key off
 * `DynamicPlanStepFinished` / `ErrorTraceData`, which the new engine never emits,
 * so those return nothing for generative transcripts. Running both is safe:
 * each returns [] for the other engine's transcripts.
 */
function checkGenerativeToolFailures(
  rawActivities: Activity[],
  turns: ProcessedTurn[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  const uTurns = userTurns(turns);
  let seq = 0;
  for (const act of rawActivities) {
    const a = act as unknown as Record<string, unknown>;
    if (a["name"] !== "ToolCallTrace:Failed") continue;
    const v = a["value"] as Record<string, unknown> | undefined;
    const toolName = String(v?.["toolDisplayName"] ?? v?.["toolName"] ?? "Tool");
    const errorMessage = String(v?.["errorMessage"] ?? v?.["status"] ?? "");
    const toolCallId = String(v?.["toolCallId"] ?? "");
    seq += 1;

    // Attribute to the user turn whose steps include this toolCallId, else the
    // last user turn.
    const owningTurn =
      turns.find(
        (t) =>
          t.role === "user" &&
          (t.debugInfo?.stepExecutions ?? []).some((s) => s.stepId === toolCallId),
      ) ?? uTurns[uTurns.length - 1];
    const idx = owningTurn ? uTurns.indexOf(owningTurn) : -1;
    const turnIdx = idx >= 0 ? idx + 1 : undefined;

    recs.push({
      id: `generative-tool-failed-${toolCallId || seq}`,
      severity: "high",
      category: "Errors",
      title: turnIdx ? `Tool "${toolName}" failed in turn ${turnIdx}` : `Tool "${toolName}" failed`,
      description: errorMessage.substring(0, 250) || `${toolName} returned a failure.`,
      suggestion:
        "Review the tool/connector configuration, parameters, and permissions. The error detail above shows the HTTP status and inner error message.",
      turnId: owningTurn?.id,
      turnNumber: turnIdx,
    });
  }
  return recs;
}

/** Detects DynamicPlanStepBlocked (Responsible AI / content filter blocks). */
function checkContentFiltered(
  rawActivities: Activity[],
  turns: ProcessedTurn[],
): Recommendation[] {
  const uTurns = userTurns(turns);
  const recs: Recommendation[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawActivities.length; i++) {
    const a = rawActivities[i] as unknown as Record<string, unknown>;
    if (a["name"] !== "DynamicPlanStepBlocked" && a["valueType"] !== "DynamicPlanStepBlocked") continue;

    const value = a["value"] as Record<string, unknown> | undefined;
    const stepId = String(value?.["stepId"] ?? "");
    const dedupKey = stepId || String(i);
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const blockedErr = value?.["messageBlockedError"] as Record<string, unknown> | undefined;
    const code = String(blockedErr?.["code"] ?? "contentFiltered");
    const msg = String(blockedErr?.["message"] ?? "");
    const exception = blockedErr?.["exception"] as Record<string, unknown> | undefined;
    const reasonCode = String(exception?.["reasonCode"] ?? "");

    const replyToId = String(a["replyToId"] ?? "");
    const userTurn = replyToId
      ? turns.find((t) => t.role === "user" && t.id === replyToId) ??
        turns.slice(0, i + 1).reverse().find((t) => t.role === "user")
      : turns.slice(0, i + 1).reverse().find((t) => t.role === "user");
    const turnIdx = userTurn ? uTurns.indexOf(userTurn) + 1 : undefined;

    const reasonLabel = reasonCode ? ` (${reasonCode})` : "";
    recs.push({
      id: `content-filtered-${dedupKey}`,
      severity: "high",
      category: "Errors",
      title: turnIdx
        ? `Content filtered in turn ${turnIdx}: ${code}${reasonLabel}`
        : `Content filtered: ${code}${reasonLabel}`,
      description: msg || "The agent's response was blocked by Responsible AI content filtering.",
      suggestion:
        "Review the user message that triggered this block. If it was a jailbreak or policy violation, consider adding a custom message. If it was a false positive, review the agent's content filter configuration.",
      turnId: userTurn?.id,
      turnNumber: turnIdx,
    });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Derives all recommendations from the parsed transcript data.
 * Returns an empty array when no issues are found.
 * Results are sorted: high → medium → low, then by turn number.
 */
export function deriveRecommendations(
  processedTranscript: ProcessedTranscript,
  conversationData: ConversationData,
  connectedAgents: ConnectedAgentInfo[],
  componentNameBySchemaName: Record<string, ComponentInfo> = {},
): Recommendation[] {
  const { turns } = processedTranscript;
  const rawActivities = (processedTranscript.raw?.activities ?? []) as Activity[];
  const { generalInfo } = conversationData;

  const all: Recommendation[] = [
    // High severity
    ...checkRawActivityErrors(rawActivities, turns),    // scans raw stream — primary error detector
    ...checkGenerativeToolFailures(rawActivities, turns), // generative: ToolCallTrace:Failed
    ...checkContentFiltered(rawActivities, turns),      // DynamicPlanStepBlocked — Responsible AI blocks
    ...checkFailedSteps(turns),                          // activity.type==="error" only (ToolIdentifierConflict)
    ...checkConversationOutcome(generalInfo),
    ...checkFallbackTriggered(turns, rawActivities),    // checks initialTopic + raw DialogTracing
    ...checkConnectedAgentErrors(connectedAgents, componentNameBySchemaName),
    ...checkNegativeFeedback(turns),
    ...checkMissingBotResponse(turns),
    // Medium severity
    ...checkSlowTotalDuration(generalInfo),
    ...checkSlowSteps(turns, componentNameBySchemaName),
    ...checkSlowConnectedAgents(connectedAgents, componentNameBySchemaName),
    ...checkLowIntentConfidence(turns),
    ...checkKnowledgeNotCited(turns),
    ...checkHighTokens(turns, generalInfo),  // merged: per-turn > 4k fires first, total > 10k as fallback
    ...checkMultipleSessions(generalInfo),
    ...checkExcessiveTurnsUnresolved(generalInfo, turns),
    // Low severity
    ...checkConnectedAgentNotFetched(connectedAgents, componentNameBySchemaName),
  ];

  // Sort: high → medium → low, then by turnNumber ascending
  const severityOrder: Record<RecommendationSeverity, number> = { high: 0, medium: 1, low: 2 };
  return all.sort((a, b) => {
    const sd = severityOrder[a.severity] - severityOrder[b.severity];
    if (sd !== 0) return sd;
    return (a.turnNumber ?? 999) - (b.turnNumber ?? 999);
  });
}
