import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { ReviewError } from "../../agent-review/server/types.js";
import { AgentDebuggerService, type DebuggerAgent, type DebuggerConversation, type DebuggerEnvironment } from "./service.js";
import {
  DEFAULT_DEBUGGER_ENVIRONMENT,
  type DebuggerSelectionInput,
} from "./selection.js";
import { exactSelection } from "../../tools/target-selection.js";

type Structured = Record<string, unknown>;
type ServiceFactory = (token: string) => AgentDebuggerService;

function result(text: string, structuredContent: Structured): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function failure(error: unknown): CallToolResult {
  const known = error instanceof ReviewError;
  const message = known ? error.message : "The Agent Debugger operation failed.";
  if (!known) {
    console.error("Agent Debugger tool failed.", error);
  }
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: {
      state: "error",
      error: {
        code: known ? error.code : "INTERNAL_ERROR",
        message,
        retryable: known ? error.retryable : false,
      },
    },
  };
}

function createService(
  token: string | undefined,
  factory: ServiceFactory = (value) => new AgentDebuggerService(value),
): AgentDebuggerService {
  if (!token) {
    throw new ReviewError(
      "AUTH_REQUIRED",
      "Sign in to debug Copilot Studio agent conversations.",
    );
  }
  return factory(token);
}

export async function openAgentDebugger(
  token: string | undefined,
  input: DebuggerSelectionInput,
  factory?: ServiceFactory,
): Promise<CallToolResult> {
  const selectionId = randomUUID();
  let environments: DebuggerEnvironment[] | undefined;
  let environment: DebuggerEnvironment | undefined;
  let agents: DebuggerAgent[] | undefined;
  let agent: DebuggerAgent | undefined;
  let conversations: DebuggerConversation[] | undefined;
  let targetResolved = false;
  const context = (): Structured => ({
    state: targetResolved ? "conversations" : "selecting",
    selectionId,
    targetResolved,
    environments,
    environment,
    environmentId: environment?.id,
    agents,
    agent,
    agentId: agent?.id,
    conversations,
    ...(environment && !agents ? { deferred: ["agents"] } : {}),
    startedAfter: input.startedAfter,
    startedBefore: input.startedBefore,
    features: { fullscreen: true, lazyTurnDetails: true },
  });
  try {
    const debuggerService = createService(token, factory);
    environments = await debuggerService.listEnvironments();
    const explicitEnvironment = Boolean(input.environmentId || input.environmentName);
    const hasAgentSelection = Boolean(input.agentId || input.agentName?.trim());
    environment = explicitEnvironment || hasAgentSelection
      ? exactSelection(
        environments,
        "ENVIRONMENT",
        input.environmentId,
        input.environmentName ?? (input.environmentId ? undefined : DEFAULT_DEBUGGER_ENVIRONMENT),
      )
      : await debuggerService.defaultEnvironment();
    if (!hasAgentSelection) {
      agents = await debuggerService.listAgents(environment.id);
      throw new ReviewError(
        "AGENT_NAME_REQUIRED",
        "Provide the agent name or choose an agent from the form.",
      );
    }
    agent = await debuggerService.resolveAgent(environment.id, input);
    targetResolved = true;
    const conversationId = input.conversationId?.trim();
    const dates = { startedAfter: input.startedAfter, startedBefore: input.startedBefore };
    conversations = await debuggerService.listConversations(environment.id, agent.id, conversationId ?? "", 50, dates);
    let conversation: DebuggerConversation | undefined;

    if (conversationId) {
      const matches = conversations.filter(
        (conversation) => conversation.id.trim().toLowerCase() === conversationId.toLowerCase(),
      );
      if (matches.length !== 1) {
        conversations = await debuggerService.listConversations(environment.id, agent.id, "", 50, dates);
        return result("Choose a saved conversation for the selected agent.", {
          ...context(),
          error: {
            code: "TRANSCRIPT_NOT_FOUND",
            message: "This conversation is unavailable for the selected agent. Choose a saved conversation.",
            retryable: false,
          },
        });
      }
      conversation = matches[0];
    } else {
      conversation = conversations[0];
    }
    if (conversation) {
      return result(`Selected saved conversation ${conversation.id} for ${agent.name}. The app will load its saved analysis.`, {
        ...context(),
        state: "analysis",
        conversation,
        conversationId: conversation.id,
        deferred: ["agents", "analysis"],
      });
    }
    return result(`No saved conversations are available for ${agent.name} in the selected date range.`, context());
  } catch (error) {
    const selectionError = error instanceof ReviewError && [
      "AGENT_NAME_REQUIRED", "AGENT_NOT_FOUND", "AGENT_AMBIGUOUS",
      "ENVIRONMENT_NOT_FOUND", "ENVIRONMENT_AMBIGUOUS", "DEBUGGER_ENVIRONMENT_NOT_FOUND",
    ].includes(error.code);
    const failed = failure(error);
    const failedContext = context();
    if (!agent && !selectionError) delete failedContext.deferred;
    return {
      ...failed,
      ...(selectionError ? { isError: undefined } : {}),
      structuredContent: { ...failedContext, error: failed.structuredContent?.error },
    };
  }
}

export async function listDebuggerAgents(
  token: string | undefined,
  input: { environmentId: string; query?: string },
): Promise<CallToolResult> {
  try {
    const agents = await createService(token).listAgents(
      input.environmentId,
      input.query,
    );
    return result(`Found ${agents.length} Copilot Studio agents.`, {
      state: "agents",
      environmentId: input.environmentId,
      agents,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function listDebuggerConversations(
  token: string | undefined,
  input: {
    environmentId: string;
    agentId: string;
    query?: string;
    limit?: number;
    startedAfter?: string;
    startedBefore?: string;
  },
): Promise<CallToolResult> {
  try {
    const conversations = await createService(token).listConversations(
      input.environmentId,
      input.agentId,
      input.query,
      input.limit,
      { startedAfter: input.startedAfter, startedBefore: input.startedBefore },
    );
    return result(`Found ${conversations.length} agent conversations.`, {
      state: "conversations",
      environmentId: input.environmentId,
      agentId: input.agentId,
      conversations,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function analyzeDebuggerConversation(
  token: string | undefined,
  input: {
    environmentId: string;
    agentId: string;
    conversationId: string;
  },
): Promise<CallToolResult> {
  try {
    const analysis = await createService(token).analyze(
      input.environmentId,
      input.agentId,
      input.conversationId,
    );
    return result(`Analyzed conversation ${analysis.conversation.name}.`, {
      state: "analysis",
      ...analysis,
      features: { fullscreen: true, lazyTurnDetails: true },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function getDebuggerTurnDetails(
  token: string | undefined,
  input: {
    environmentId: string;
    agentId: string;
    conversationId: string;
    turnId: string;
  },
): Promise<CallToolResult> {
  try {
    const turn = await createService(token).getTurnDetails(
      input.environmentId,
      input.agentId,
      input.conversationId,
      input.turnId,
    );
    return result("Loaded turn details.", {
      state: "turnDetails",
      turn,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function getDebuggerChildTranscript(
  token: string | undefined,
  input: {
    environmentId: string;
    agentId: string;
    conversationId: string;
    sessionId: string;
  },
): Promise<CallToolResult> {
  try {
    const connectedAgent = await createService(token).getChildTranscript(
      input.environmentId,
      input.agentId,
      input.conversationId,
      input.sessionId,
    );
    return result("Loaded the connected-agent transcript.", {
      state: "childTranscript",
      connectedAgent,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function getDebuggerConversationTranscript(
  token: string | undefined,
  input: { environmentId: string; agentId: string; conversationId: string },
  factory?: ServiceFactory,
): Promise<CallToolResult> {
  try {
    const transcriptJson = await createService(token, factory).getConversationTranscript(
      input.environmentId, input.agentId, input.conversationId,
    );
    return result("Loaded all saved parent-agent transcript records for this conversation.", {
      state: "conversationTranscript", transcriptJson,
    });
  } catch (error) {
    return failure(error);
  }
}
