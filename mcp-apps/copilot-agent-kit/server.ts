import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  browseAgentReviews,
  finalizeAgentReview,
  getAgentMap,
  getConnectedAgentMap,
  getAgentReviewResult,
  getAgentReviewStatus,
  listAgentReviews,
  listReviewableAgents,
  openAgentReview,
  showAgentMap,
  startAgentReview,
} from "./src/tools/review-tools.js";
import {
  analyzeDebuggerConversation,
  getDebuggerChildTranscript,
  getDebuggerConversationTranscript,
  getDebuggerTurnDetails,
  listDebuggerAgents,
  listDebuggerConversations,
  openAgentDebugger,
} from "./src/agent-debugger/server/tools.js";
import { boundedToolResult, compactInitialWidgetResult, getInitialWidgetData, type WidgetOpeningTool } from "./src/tools/initialWidgetPayload.js";
import {
  openEvaluationBuilder,
  createAgentEvaluationSet, getAgentEvaluationSave, updateAgentEvaluationCase,
} from "./src/evaluation/tools.js";

const widgetResourceVersion = "v1.0.18";
const reviewWidgetFile = "agent-review.html";
const reviewWidgetUri = `ui://open_agent_review/${widgetResourceVersion}/${reviewWidgetFile}`;
const mapWidgetFile = "agent-map.html";
const mapWidgetUri = `ui://show_agent_map/${widgetResourceVersion}/${mapWidgetFile}`;
const browserWidgetFile = "review-browser.html";
const browserWidgetUri = `ui://browse_agent_reviews/${widgetResourceVersion}/${browserWidgetFile}`;
const debuggerWidgetFile = "agent-debugger.html";
const debuggerWidgetUri = `ui://open_agent_debugger/${widgetResourceVersion}/${debuggerWidgetFile}`;
const evaluationWidgetFile = "evaluation-builder.html";
const evaluationWidgetUri = `ui://open_evaluation_builder/${widgetResourceVersion}/${evaluationWidgetFile}`;
const dataverseGuid = () => z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Expected a Dataverse GUID",
);
const distDir = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist", "ui")
  : path.join(import.meta.dirname, "..", "ui");

async function withWidgetResource(
  toolResult: Promise<CallToolResult>,
  resourceUri: string,
  openingTool?: WidgetOpeningTool,
  token?: string,
): Promise<CallToolResult> {
  const output = await toolResult;
  const existingUi = output._meta?.ui;
  const result: CallToolResult = {
    ...output,
    _meta: {
      ...output._meta,
      ui: { ...(typeof existingUi === "object" && existingUi !== null ? existingUi : {}), resourceUri },
    },
  };
  return openingTool ? compactInitialWidgetResult(result, openingTool, token) : boundedToolResult(result, token);
}

async function withBoundedResult(toolResult: Promise<CallToolResult>, token?: string): Promise<CallToolResult> {
  return boundedToolResult(await toolResult, token);
}

export function createServer(incomingToken?: string): McpServer {
  const server = new McpServer({
    name: "Agent Review MCP App",
    version: "1.0.0",
  });

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof openAgentReview>[1]>>(server, "open_agent_review", {
    title: "Open Agent Review",
    description: "Start one review for one exact accessible agentName in the supplied environment or Copilot Studio Kit - Dev, including when the optional startReview flag is omitted. Return the acknowledged job ID for the stepper. An unclear, missing or unavailable target opens the existing form without a start, with Dev selected when no environment is supplied. Set startReview false only for manual selection. Resume an existing job or saved result without another start; recovery never starts a replacement.",
    inputSchema: z.object({
      reviewId: dataverseGuid().optional().describe("Completed review ID to open"),
      jobId: dataverseGuid().optional().describe("Existing review job ID to resume"),
      environmentId: dataverseGuid().optional()
        .describe("Environment ID explicitly selected in the conversation"),
      environmentName: z.string().trim().min(1).max(200).optional()
        .describe("Exact environment display name explicitly selected in the conversation"),
      agentId: dataverseGuid().optional()
        .describe("Agent ID explicitly selected in the conversation"),
      agentName: z.string().trim().min(1).max(200).optional()
        .describe("Exact agent display name explicitly selected in the conversation"),
      componentIdUnique: dataverseGuid().optional()
        .describe("Selected agent component version ID when already known"),
      startReview: z.boolean().optional()
        .describe("Optional Review intent. True or an omitted flag with one exact accessible agentName permits one start. False opens the manual form. Unresolved targets never start."),
      requestId: dataverseGuid().optional()
        .describe("Stable request UUID for duplicate-start protection. Reuse it for retries and recovery; use a new UUID only for an intentional new review."),
      resumeOnly: z.boolean().optional()
        .describe("Read-only initial-data recovery. Restore the original request or acknowledged job without a new start. If the request is unavailable, show the form."),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: reviewWidgetUri } },
  }, (args) => withWidgetResource(openAgentReview(incomingToken, args), reviewWidgetUri, "open_agent_review", incomingToken));

  registerAppResource(
    server,
    reviewWidgetUri,
    reviewWidgetUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Agent Review form, progress, and results" },
    async (): Promise<ReadResourceResult> => ({
      contents: [{
        uri: reviewWidgetUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readFile(path.join(distDir, reviewWidgetFile), "utf8"),
      }],
    }),
  );

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof showAgentMap>[1]>>(server, "show_agent_map", {
    title: "Show Agent Map",
    description: "Show a workflow-free deterministic map of a Copilot Studio agent powered by the GitHub Copilot harness, its configured components, and conservative Skill-to-Tool or Knowledge references.",
    inputSchema: z.object({
      environmentId: dataverseGuid().optional().describe("Power Platform environment containing the agent"),
      environmentName: z.string().trim().min(1).max(200).optional()
        .describe("Exact environment display name explicitly selected in the conversation"),
      agentId: dataverseGuid().optional().describe("Copilot Studio agent ID"),
      agentName: z.string().trim().min(1).max(200).optional()
        .describe("Exact agent display name explicitly selected in the conversation"),
      componentIdUnique: dataverseGuid().optional().describe("Selected agent component version ID"),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: mapWidgetUri } },
  }, (args) => withWidgetResource(showAgentMap(incomingToken, args), mapWidgetUri, "show_agent_map", incomingToken));

  registerAppResource(
    server,
    mapWidgetUri,
    mapWidgetUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Deterministic modern-agent component map" },
    async (): Promise<ReadResourceResult> => ({
      contents: [{
        uri: mapWidgetUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readFile(path.join(distDir, mapWidgetFile), "utf8"),
      }],
    }),
  );

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof browseAgentReviews>[1]>>(server, "browse_agent_reviews", {
    title: "Browse Agent Reviews",
    description: "Browse completed Agent Review records in a paginated grid and open an existing persisted review fullscreen.",
    inputSchema: z.object({
      environmentId: dataverseGuid().optional().describe("Power Platform source environment to browse"),
      presentation: z.enum(["inline", "fullscreen"]).optional()
        .describe("Render the review grid inline or in the fullscreen side panel"),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: browserWidgetUri } },
  }, (args) => withWidgetResource(browseAgentReviews(incomingToken, args), browserWidgetUri, "browse_agent_reviews", incomingToken));

  registerAppResource(
    server,
    browserWidgetUri,
    browserWidgetUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Paginated Agent Review inventory and details" },
    async (): Promise<ReadResourceResult> => ({
      contents: [{
        uri: browserWidgetUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readFile(path.join(distDir, browserWidgetFile), "utf8"),
      }],
    }),
  );

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof openAgentDebugger>[1]>>(server, "open_agent_debugger", {
    title: "Open Agent Debugger",
    description: "Open a read-only debugger for saved Copilot Studio conversations. Pass the agent and, when known, the conversation ID. The inline view has no pickers. Resolve one exact agent in the supplied environment or Copilot Studio Kit - Dev without the target form or full agent catalog. Preserve a supplied conversation ID and load its analysis only if it belongs to that target and date range; otherwise show the list with the reason. With no conversation ID, automatically select and analyze the first authorized saved conversation in the existing most-recent-first list order. Show an empty state when none exist. Keep errors visible. Never start a review.",
    inputSchema: z.object({
      environmentId: dataverseGuid().optional()
        .describe("Power Platform environment explicitly selected in the conversation"),
      environmentName: z.string().trim().min(1).max(200).optional()
        .describe("Exact Power Platform environment display name explicitly selected in the conversation"),
      agentId: dataverseGuid().optional()
        .describe("Copilot Studio agent explicitly selected in the conversation"),
      agentName: z.string().trim().min(1).max(200).optional()
        .describe("Exact Copilot Studio agent display name explicitly selected in the conversation"),
      conversationId: z.string().trim().min(1).max(500).optional()
        .describe("Exact saved conversation ID. Preserve this ID and load its saved analysis only if it belongs to the selected agent and date range. If omitted, select the first authorized saved conversation in the existing most-recent-first list order."),
      startedAfter: z.string().datetime({ offset: true }).optional(),
      startedBefore: z.string().datetime({ offset: true }).optional(),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: debuggerWidgetUri } },
  }, (args) => withWidgetResource(openAgentDebugger(incomingToken, args), debuggerWidgetUri, "open_agent_debugger", incomingToken));

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof openEvaluationBuilder>[1]>>(server, "open_evaluation_builder", {
    title: "Open Eval Builder",
    description: "Shows the generated test cases for one Copilot Studio agent. If a generated set exists, it shows that set. Else it generates new cases and saves them as one test set in Copilot Studio. Inline edits sync to Copilot Studio. Pass the exact agent name. The server resolves it in the supplied environment or in Copilot Studio Kit - Dev. Never runs evaluations.",
    inputSchema: z.object({
      environmentId: dataverseGuid().optional(),
      environmentName: z.string().trim().min(1).max(200).optional(),
      agentId: dataverseGuid().optional(),
      agentName: z.string().trim().min(1).max(200).optional(),
      mode: z.string().max(50).optional()
        .describe("Ignored. Kept only so that older callers do not fail."),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: evaluationWidgetUri } },
  }, args => withWidgetResource(openEvaluationBuilder(incomingToken, args), evaluationWidgetUri, "open_evaluation_builder", incomingToken));

  registerAppResource(server, evaluationWidgetUri, evaluationWidgetUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Eval Builder generated test cases and their Copilot Studio test set" },
    async (): Promise<ReadResourceResult> => ({ contents: [{
      uri: evaluationWidgetUri, mimeType: RESOURCE_MIME_TYPE,
      text: await readFile(path.join(distDir, evaluationWidgetFile), "utf8"),
    }] }));

  const saveIdentity = {
    draftId: dataverseGuid(), requestId: dataverseGuid(),
    saveGrant: z.string().min(32).max(128).describe("App-only opaque grant from the Eval Builder opener metadata. Never generate or change it."),
  };
  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof createAgentEvaluationSet>[1]>>(server, "create_agent_evaluation_set", {
    title: "Save Generated Test Set",
    description: "App-only save of one generated Eval Builder draft as one native Conversation test set in Copilot Studio. The app calls it automatically when the generated cases appear. Bound to this caller, target, the generated questions or the user's question edits, the expected responses and the immutable request UUID (the draft ID). General quality does not compare expected answers. One atomic changeset, inner-status checks and complete exact read-back. Never runs evaluations or publishes an agent. An uncertain response requires read-only recovery, not another creation.",
    inputSchema: z.object({
      ...saveIdentity, name: z.string().trim().min(1).max(200), method: z.literal("GeneralQualityGrader"),
      selectedCases: z.array(z.object({
        caseId: z.string().min(1).max(128), expectedResponses: z.array(z.string().max(16_000)).min(1).max(6),
        questions: z.array(z.string().trim().min(1).max(16_000)).min(1).max(6).optional(),
      }).strict()).min(1).max(20),
      confirmed: z.literal(true),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: evaluationWidgetUri, visibility: ["app"] } },
  }, args => withWidgetResource(createAgentEvaluationSet(incomingToken, args), evaluationWidgetUri, undefined, incomingToken));

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof getAgentEvaluationSave>[1]>>(server, "get_agent_evaluation_save", {
    title: "Check Existing Evaluation Set",
    description: "Read-only recovery of an existing immutable native save. Verify all components and parent relationships for the same caller, draft, grant and request UUID. Never sends another changeset, runs an evaluation or publishes.",
    inputSchema: z.object(saveIdentity).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: evaluationWidgetUri, visibility: ["app"] } },
  }, args => withWidgetResource(getAgentEvaluationSave(incomingToken, args), evaluationWidgetUri, undefined, incomingToken));

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof updateAgentEvaluationCase>[1]>>(server, "update_agent_evaluation_case", {
    title: "Update Saved Evaluation Case",
    description: "App-only inline edit or deletion of one case in a verified saved set for this caller, draft, grant and request UUID. Used by generated sets, which save automatically. Reads back the exact change. Never runs an evaluation or publishes.",
    inputSchema: z.object({
      ...saveIdentity, caseId: z.string().min(1).max(128),
      question: z.string().max(16_000), expectedResponse: z.string().max(16_000),
      remove: z.boolean().optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: evaluationWidgetUri, visibility: ["app"] } },
  }, args => withWidgetResource(updateAgentEvaluationCase(incomingToken, args), evaluationWidgetUri, undefined, incomingToken));

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof getInitialWidgetData>[1]>>(server, "get_initial_widget_data", {
    title: "Read Complete Initial App Data",
    description: "Read a caller-scoped complete app result or one immutable lossless gzip/base64 chunk. Every serialized reply is at most 65536 bytes. Retain every record and app-only metadata. This recovery cannot start a Review, save or run an evaluation.",
    inputSchema: z.object({ contextId: dataverseGuid(), index: z.number().int().min(0).max(255).optional(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: evaluationWidgetUri, visibility: ["app"] } },
  }, args => {
    // SDK 1.27.1 cannot publish an object schema wrapped in a refinement.
    if ((args.index === undefined) !== (args.sha256 === undefined)) {
      throw new Error("A chunk requires both index and SHA-256.");
    }
    return getInitialWidgetData(incomingToken, args);
  });

  registerAppResource(
    server,
    debuggerWidgetUri,
    debuggerWidgetUri,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Agent Debugger saved-conversation list and read-only analysis workspace",
    },
    async (): Promise<ReadResourceResult> => ({
      contents: [{
        uri: debuggerWidgetUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readFile(path.join(distDir, debuggerWidgetFile), "utf8"),
      }],
    }),
  );

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof listDebuggerAgents>[1]>>(server, "list_debugger_agents", {
    title: "List Agent Debugger Agents",
    description: "List active classic and generative Copilot Studio agents in one environment for the Agent Debugger interface.",
    inputSchema: z.object({
      environmentId: dataverseGuid(),
      query: z.string().trim().max(200).optional(),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: debuggerWidgetUri, visibility: ["app"] } },
  }, (args) => withWidgetResource(listDebuggerAgents(incomingToken, args), debuggerWidgetUri, undefined, incomingToken));

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof listDebuggerConversations>[1]>>(server, "list_debugger_conversations", {
    title: "List Agent Debugger Conversations",
    description: "List bounded saved conversations for the selected Copilot Studio agent in the Agent Debugger interface.",
    inputSchema: z.object({
      environmentId: dataverseGuid(),
      agentId: dataverseGuid(),
      query: z.string().trim().max(500).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      startedAfter: z.string().datetime({ offset: true }).optional()
        .describe("Inclusive session start-time lower bound; applied in Dataverse"),
      startedBefore: z.string().datetime({ offset: true }).optional()
        .describe("Inclusive session start-time upper bound; applied in Dataverse"),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: debuggerWidgetUri, visibility: ["app"] } },
  }, (args) => withWidgetResource(listDebuggerConversations(incomingToken, args), debuggerWidgetUri, undefined, incomingToken));

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof analyzeDebuggerConversation>[1]>>(server, "analyze_debugger_conversation", {
    title: "Analyze Agent Debugger Conversation",
    description: "Analyze one saved Copilot Studio conversation in the Agent Debugger interface.",
    inputSchema: z.object({
      environmentId: dataverseGuid(),
      agentId: dataverseGuid(),
      conversationId: z.string().trim().min(1).max(500),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: debuggerWidgetUri, visibility: ["app"] } },
  }, (args) => withWidgetResource(analyzeDebuggerConversation(incomingToken, args), debuggerWidgetUri, undefined, incomingToken));

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof getDebuggerTurnDetails>[1]>>(server, "get_debugger_turn_details", {
    title: "Get Agent Debugger Turn Details",
    description: "Load full activity details for one selected conversation turn in the Agent Debugger interface.",
    inputSchema: z.object({
      environmentId: dataverseGuid(),
      agentId: dataverseGuid(),
      conversationId: z.string().trim().min(1).max(500),
      turnId: z.string().trim().min(1).max(500),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: debuggerWidgetUri, visibility: ["app"] } },
  }, (args) => withWidgetResource(getDebuggerTurnDetails(incomingToken, args), debuggerWidgetUri, undefined, incomingToken));

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof getDebuggerChildTranscript>[1]>>(server, "get_debugger_child_transcript", {
    title: "Get Agent Debugger Connected-Agent Transcript",
    description: "Load the transcript for one connected-agent session selected in the Agent Debugger interface.",
    inputSchema: z.object({
      environmentId: dataverseGuid(),
      agentId: dataverseGuid(),
      conversationId: z.string().trim().min(1).max(500),
      sessionId: z.string().trim().min(1).max(500),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: debuggerWidgetUri, visibility: ["app"] } },
  }, (args) => withWidgetResource(getDebuggerChildTranscript(incomingToken, args), debuggerWidgetUri, undefined, incomingToken));

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof getDebuggerConversationTranscript>[1]>>(server, "get_debugger_conversation_transcript", {
    title: "Get Agent Debugger Conversation JSON",
    description: "Load complete saved parent-agent conversation JSON on demand. Requires authentication. Limited to 500 transcript records and an 8 MiB response; rejects incomplete exports. Connected-agent transcripts remain separate.",
    inputSchema: z.object({
      environmentId: dataverseGuid(),
      agentId: dataverseGuid(),
      conversationId: z.string().trim().min(1).max(500),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: debuggerWidgetUri, visibility: ["app"] } },
  }, (args) => withWidgetResource(getDebuggerConversationTranscript(incomingToken, args), debuggerWidgetUri, undefined, incomingToken));

  server.registerTool(
    "list_reviewable_agents",
    {
      description: "List Copilot Studio agents powered by the GitHub Copilot harness in a selected environment. Call after the user selects an environment.",
      inputSchema: z.object({
        environmentId: dataverseGuid(),
        query: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => withBoundedResult(listReviewableAgents(incomingToken, args), incomingToken),
  );

  server.registerTool(
    "get_agent_map",
    {
      description: "Build a workflow-free deterministic map for a selected Copilot Studio agent powered by the GitHub Copilot harness.",
      inputSchema: z.object({
        environmentId: dataverseGuid(),
        agentId: dataverseGuid(),
        componentIdUnique: dataverseGuid(),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => withBoundedResult(getAgentMap(incomingToken, args), incomingToken),
  );

  server.registerTool(
    "get_connected_agent_map",
    {
      description: "Load the current components for a connected agent selected inside Agent Map.",
      inputSchema: z.object({
        environmentId: dataverseGuid(),
        targetSchemaName: z.string().trim().min(1).max(200),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => withBoundedResult(getConnectedAgentMap(incomingToken, args), incomingToken),
  );

  server.registerTool(
    "list_agent_reviews",
    {
      description: "List persisted Agent Review records for a selected source environment.",
      inputSchema: z.object({
        environmentId: dataverseGuid(),
        presentation: z.enum(["inline", "fullscreen"]).optional(),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => withBoundedResult(listAgentReviews(incomingToken, args), incomingToken),
  );

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof startAgentReview>[1]>>(server, "start_agent_review", {
    title: "Start Confirmed Agent Review",
    description: "Create an Agent Review job only after the user confirms the selected target with Create in the live Review form. Requires confirmed:true; can consume credits. Preserve its acknowledged job ID on success or partial failure. Never call to open a form or restore progress.",
    inputSchema: z.object({
      environmentId: dataverseGuid(),
      agentId: dataverseGuid(),
      componentIdUnique: dataverseGuid(),
      projectName: z.string().trim().min(1).max(100),
      transcriptStart: z.string().date().optional(),
      transcriptEnd: z.string().date().optional(),
      confirmed: z.literal(true),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: reviewWidgetUri, visibility: ["app"] } },
  }, (args) => withBoundedResult(startAgentReview(incomingToken, args), incomingToken));

  server.registerTool(
    "get_agent_review_status",
    {
      description: "Get progress for an existing Agent Review job.",
      inputSchema: z.object({ jobId: dataverseGuid() }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => withBoundedResult(getAgentReviewStatus(incomingToken, args), incomingToken),
  );

  server.registerTool(
    "finalize_agent_review",
    {
      description: "Finalize a completed or salvageable Agent Review job and persist the result.",
      inputSchema: z.object({ jobId: dataverseGuid() }).strict(),
    },
    (args) => withBoundedResult(finalizeAgentReview(incomingToken, args), incomingToken),
  );

  registerAppTool<z.ZodRawShape, z.ZodType<Parameters<typeof getAgentReviewResult>[1]>>(server, "get_agent_review_result", {
    title: "Get Agent Review Result",
    description: "Load an existing saved Agent Review by reviewId with its saved Agent Map and complete findings in the Review UI. Use summary for the inline view or fullReview for the expanded view. This read never starts or finalizes a review.",
    inputSchema: z.object({
      reviewId: dataverseGuid(),
      presentation: z.enum(["summary", "fullReview"]).optional()
        .describe("Render the result as an inline summary or the complete fullscreen review"),
    }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: reviewWidgetUri } },
  }, (args) => withWidgetResource(getAgentReviewResult(incomingToken, args), reviewWidgetUri, undefined, incomingToken));

  return server;
}
