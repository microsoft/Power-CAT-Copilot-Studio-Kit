import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createHash, randomUUID } from "node:crypto";
import { defaultProjectName } from "../agent-review/core/project-name.js";
import { AgentReviewService } from "../agent-review/server/service.js";
import { guid } from "../agent-review/server/dataverse.js";
import { ReviewError, type ReviewAgent, type ReviewEnvironment } from "../agent-review/server/types.js";
import { DEFAULT_PROMPT_ENVIRONMENT, exactSelection } from "./target-selection.js";
import {
  agentMapContextPayload,
  githubCopilotMapAgents,
  type AgentMapAgentRef,
} from "./agentMapContext.js";

type Structured = Record<string, unknown>;

interface ConversationSelection {
  environmentId?: string;
  environmentName?: string;
  agentId?: string;
  agentName?: string;
  componentIdUnique?: string;
}

interface ReviewInput extends ConversationSelection {
  reviewId?: string;
  jobId?: string;
  startReview?: boolean;
  requestId?: string;
  resumeOnly?: boolean;
}

interface ConfirmedReviewInput {
  environmentId: string;
  agentId: string;
  componentIdUnique: string;
  projectName: string;
  transcriptStart?: string;
  transcriptEnd?: string;
  confirmed: boolean;
}

interface PendingReviewStart {
  options: string;
  result: ReturnType<AgentReviewService["start"]>;
}

interface PromptStart {
  target: string;
  selectionId: string;
  result: Promise<{ jobId: string; agentName: string; projectName: string; startedAt: string }>;
}

const promptEnvironmentName = DEFAULT_PROMPT_ENVIRONMENT;
const pendingReviewStarts = new Map<string, PendingReviewStart>();
const promptRequests = new Map<string, PromptStart>();
const pendingPromptTargets = new Map<string, PromptStart>();

function result(text: string, structuredContent: Structured): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function failure(error: unknown): CallToolResult {
  const known = error instanceof ReviewError;
  const diagnostics = known ? error.diagnostics : undefined;
  const jobId = diagnostics?.start?.jobId;
  const message = [
    known ? error.message : "The Agent Review operation failed.",
    diagnostics?.dataverse
      ? `Request: ${diagnostics.dataverse.method} ${diagnostics.dataverse.url}.` : undefined,
    diagnostics?.start ? `Start stage: ${diagnostics.start.stage}.` : undefined,
    jobId ? `Job ${jobId} was created. Check this job before you start another review.`
      : diagnostics?.start?.jobCreation === "unconfirmed"
        ? "Job creation is not confirmed. Check the review store before you start another review."
        : undefined,
  ].filter(Boolean).join(" ");
  console.error("Agent Review tool failed.", error);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: {
      state: jobId ? "failed" : "error",
      ...(jobId ? { jobId } : {}),
      error: {
        code: known ? error.code : "INTERNAL_ERROR",
        message,
        retryable: known ? error.retryable : false,
        ...(diagnostics ? { diagnostics } : {}),
      },
    },
  };
}

function service(token: string | undefined): AgentReviewService {
  if (!token) throw new ReviewError("AUTH_REQUIRED", "Sign in to review Copilot Studio agents.");
  return new AgentReviewService(token);
}

function requireGitHubCopilotMapAgent<TAgent extends AgentMapAgentRef>(
  agents: TAgent[],
  agentId: string,
  componentIdUnique?: string,
): TAgent {
  const selected = agents.find((agent) =>
    agent.id === agentId
    && (!componentIdUnique || agent.componentIdUnique === componentIdUnique));
  if (!selected) {
    throw new ReviewError(
      "AGENT_MAP_UNSUPPORTED",
      "Agent Map is available only for GitHub Copilot harness agents.",
    );
  }
  return selected;
}

function selectedByIdOrName<TItem extends { id: string; name: string }>(
  items: TItem[],
  id?: string,
  name?: string,
): TItem | undefined {
  if (id) return items.find((item) => item.id.toLocaleLowerCase() === id.toLocaleLowerCase());
  const normalizedName = name?.trim().toLocaleLowerCase();
  if (!normalizedName) return undefined;
  const exact = items.find((item) => item.name.trim().toLocaleLowerCase() === normalizedName);
  if (exact) return exact;
  const compactName = normalizedName.replace(/\s+/g, "");
  const matches = items.filter((item) =>
    item.name.trim().toLocaleLowerCase().replace(/\s+/g, "") === compactName);
  return matches.length === 1 ? matches[0] : undefined;
}

async function selectedEnvironment(
  review: AgentReviewService,
  environments: Awaited<ReturnType<AgentReviewService["listEnvironments"]>>,
  input: ConversationSelection,
  useDefault: boolean,
) {
  const explicit = selectedByIdOrName(
    environments,
    input.environmentId,
    input.environmentName,
  );
  if (explicit) return explicit;
  if (input.environmentId || input.environmentName) {
    throw new ReviewError(
      "ENVIRONMENT_NOT_FOUND",
      "The environment named in the conversation is unavailable.",
    );
  }
  return useDefault ? review.defaultEnvironment() : undefined;
}

async function confirmedStart(
  token: string | undefined,
  input: ConfirmedReviewInput,
): ReturnType<AgentReviewService["start"]> {
  if (!token) throw new ReviewError("AUTH_REQUIRED", "Sign in to review Copilot Studio agents.");
  const caller = createHash("sha256").update(token).digest("hex");
  const environmentId = guid(input.environmentId);
  const agentId = guid(input.agentId);
  const componentIdUnique = guid(input.componentIdUnique);
  const key = `${caller}:${environmentId}:${agentId}:${componentIdUnique}`;
  const options = {
    projectName: input.projectName.trim(),
    ...(input.transcriptStart !== undefined ? { transcriptStart: input.transcriptStart } : {}),
    ...(input.transcriptEnd !== undefined ? { transcriptEnd: input.transcriptEnd } : {}),
  };
  const fingerprint = JSON.stringify(options);
  const existing = pendingReviewStarts.get(key);
  if (existing) {
    if (existing.options !== fingerprint) {
      throw new ReviewError("REVIEW_REQUEST_CHANGED", "This agent already has a pending review with different options. Wait for its job ID before changing the request.");
    }
    return existing.result;
  }
  const started: PendingReviewStart = {
    options: fingerprint,
    result: service(token).start(environmentId, agentId, componentIdUnique, options)
      .then(data => ({ ...data, jobId: guid(data.jobId) })),
  };
  pendingReviewStarts.set(key, started);
  void started.result.then(
    () => pendingReviewStarts.delete(key),
    () => pendingReviewStarts.delete(key),
  );
  return started.result;
}

async function promptStart(
  token: string | undefined,
  input: ReviewInput,
  environment: ReviewEnvironment,
  agent: ReviewAgent,
  selectionId: string,
): Promise<PromptStart> {
  if (!token) throw new ReviewError("AUTH_REQUIRED", "Sign in to review Copilot Studio agents.");
  const caller = createHash("sha256").update(token).digest("hex");
  const target = `${guid(environment.id)}:${guid(agent.id)}:${guid(agent.componentIdUnique)}`;
  const requestKey = `${caller}:${input.requestId ? guid(input.requestId) : `${guid(environment.id)}:${guid(agent.id)}`}`;
  const targetKey = `${caller}:${target}`;
  const existing = promptRequests.get(requestKey);
  if (existing && existing.target !== target) {
    throw new ReviewError("REVIEW_REQUEST_CHANGED", "This review request already selected another target. Resume its job instead.");
  }
  const saved = existing ?? pendingPromptTargets.get(targetKey);
  if (saved) {
    promptRequests.set(requestKey, saved);
    return saved;
  }
  if (input.resumeOnly) {
    throw new ReviewError("REVIEW_REQUEST_NOT_FOUND", "The original review request is unavailable. Resume with its job ID or use the form.");
  }
  const startedAt = new Date().toISOString();
  const projectName = defaultProjectName(new Date(startedAt));
  const started: PromptStart = {
    target,
    selectionId,
    result: confirmedStart(token, {
      environmentId: environment.id, agentId: agent.id, componentIdUnique: agent.componentIdUnique,
      projectName, confirmed: true,
    }).then(data => ({ ...data, projectName, startedAt })),
  };
  promptRequests.set(requestKey, started);
  pendingPromptTargets.set(targetKey, started);
  void started.result.then(
    () => pendingPromptTargets.delete(targetKey),
    () => pendingPromptTargets.delete(targetKey),
  );
  return started;
}

export async function openAgentReview(
  token: string | undefined,
  input: ReviewInput,
): Promise<CallToolResult> {
  const selectionId = randomUUID();
  let environments: ReviewEnvironment[] | undefined;
  let environment: ReviewEnvironment | undefined;
  let agents: ReviewAgent[] | undefined;
  let agent: ReviewAgent | undefined;
  const context = (): Structured => ({
    state: input.reviewId ? "error" : input.jobId ? "load-error" : "selecting",
    ...(input.reviewId ? { reviewId: input.reviewId } : input.jobId ? { jobId: input.jobId } : {}),
    selectionId,
    environments,
    environment,
    environmentId: environment?.id,
    agents: agents?.map(({ id, name, componentIdUnique, iconBase64 }) => ({
      id, name, componentIdUnique, iconBase64,
    })),
    agent: agent ? { id: agent.id, name: agent.name, componentIdUnique: agent.componentIdUnique } : undefined,
    agentId: agent?.id,
    componentIdUnique: agent?.componentIdUnique,
    ...(environment && !agents ? { deferred: ["agents"] } : {}),
    features: { fullscreenResults: true },
  });
  try {
    const review = service(token);
    if (input.reviewId) {
      const data = await review.getResult(input.reviewId);
      return result(`Loaded saved Agent Review ${input.reviewId}.`, {
        state: "review",
        selectionId,
        ...data,
        features: { fullscreenResults: true },
      });
    }
    if (input.jobId) {
      const jobId = guid(input.jobId);
      const status = await review.status(jobId);
      return result(`Loaded status for Agent Review job ${jobId}. No new review was started.`, {
        state: "running",
        selectionId,
        jobId,
        status,
        features: { fullscreenResults: true },
      });
    }
    environments = await review.listEnvironments();
    const hasAgentSelection = Boolean(input.agentId || input.agentName);
    const promptRequest = input.startReview === true
      || (input.startReview !== false && Boolean(input.agentName?.trim()));
    environment = exactSelection(
      environments,
      "ENVIRONMENT",
      input.environmentId,
      input.environmentName ?? (input.environmentId ? undefined : promptEnvironmentName),
    );
    if (environment) {
      if (promptRequest && !input.agentName?.trim()) {
        throw new ReviewError(
          "AGENT_NAME_REQUIRED",
          "Provide the agent name or choose an agent from the form.",
        );
      }
      if (hasAgentSelection) agent = await review.resolveAgent(environment.id, input);
      else agents = await review.listAgents(environment.id);
      if (agent) {
        const componentIdUnique = guid(agent.componentIdUnique);
        if (input.componentIdUnique && guid(input.componentIdUnique) !== componentIdUnique) {
          throw new ReviewError("AGENT_CHANGED", "The selected agent version changed. Choose its current version from the form.");
        }
        if (promptRequest) {
          const started = await promptStart(token, input, environment, agent, selectionId);
          const data = await started.result;
          return result(`Agent Review job ${data.jobId} for ${agent.name} is acknowledged.`, {
            ...context(),
            ...data,
            state: "running",
            selectionId: started.selectionId,
          });
        }
      }
      return result(
        agent
          ? `Prepared Agent Review for ${agent.name}. Confirm with Create. No review job was created.`
          : `Choose an agent in ${environment.name} and confirm with Create. No review job was created.`,
        context(),
      );
    }
    return result("Choose an environment and agent, then confirm with Create. No review job was created.", context());
  } catch (error) {
    const selectionError = !input.reviewId && !input.jobId && error instanceof ReviewError && [
      "AGENT_NAME_REQUIRED", "AGENT_NOT_FOUND", "AGENT_AMBIGUOUS", "AGENT_CHANGED",
      "ENVIRONMENT_NOT_FOUND", "ENVIRONMENT_AMBIGUOUS", "REVIEW_REQUEST_NOT_FOUND", "REVIEW_REQUEST_CHANGED",
    ].includes(error.code);
    const failed = selectionError
      ? result(error.message, { error: { code: error.code, message: error.message, retryable: error.retryable } })
      : failure(error);
    const failedContext = context();
    if (!agent && !selectionError) delete failedContext.deferred;
    return {
      ...failed,
      structuredContent: {
        ...failedContext,
        ...(failed.structuredContent?.jobId ? {
          state: "failed", jobId: failed.structuredContent.jobId,
        } : {}),
        error: failed.structuredContent?.error,
      },
    };
  }
}

export async function listReviewableAgents(
  token: string | undefined,
  input: { environmentId: string; query?: string },
): Promise<CallToolResult> {
  try {
    const agents = await service(token).listAgents(input.environmentId, input.query);
    return result(`Found ${agents.length} reviewable agents.`, {
      state: "agents",
      environmentId: input.environmentId,
      agents,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function browseAgentReviews(
  token: string | undefined,
  input: {
    environmentId?: string;
    presentation?: "inline" | "fullscreen";
  },
): Promise<CallToolResult> {
  try {
    const review = service(token);
    const environments = await review.listEnvironments();
    const environmentId = input.environmentId ?? (await review.defaultEnvironment()).id;
    const inventory = await review.listReviewInventory(environmentId);
    return result(`Loaded ${inventory.rows.length} Agent Review records.`, {
      state: "reviewInventory",
      selectionId: randomUUID(),
      environments,
      ...inventory,
      presentation: input.presentation ?? "inline",
      features: { fullscreenResults: true, paging: true },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function listAgentReviews(
  token: string | undefined,
  input: {
    environmentId: string;
    presentation?: "inline" | "fullscreen";
  },
): Promise<CallToolResult> {
  try {
    const inventory = await service(token).listReviewInventory(input.environmentId);
    return result(`Loaded ${inventory.rows.length} Agent Review records.`, {
      state: "reviewInventory",
      selectionId: randomUUID(),
      ...inventory,
      presentation: input.presentation ?? "inline",
    });
  } catch (error) {
    return failure(error);
  }
}

export async function showAgentMap(
  token: string | undefined,
  input: ConversationSelection,
): Promise<CallToolResult> {
  try {
    const review = service(token);
    const environments = await review.listEnvironments();
    const hasAgentSelection = Boolean(input.agentId || input.agentName);
    const environment = await selectedEnvironment(
      review,
      environments,
      input,
      hasAgentSelection,
    );
    if (!environment) {
      return result("Choose an environment and agent to build its deterministic Agent Map.", {
        state: "mapSelecting",
        selectionId: randomUUID(),
        environments,
        agents: [],
        features: { fullscreen: true, workflowFree: true },
      });
    }
    const environmentId = environment.id;
    const reviewableAgents = await review.listAgents(environmentId);
    const agents = githubCopilotMapAgents(reviewableAgents);
    const selected = selectedByIdOrName(
      reviewableAgents,
      input.agentId,
      input.agentName,
    );
    if (hasAgentSelection && !selected) {
      throw new ReviewError(
        "AGENT_NOT_FOUND",
        "The agent named in the conversation is unavailable in the selected environment.",
      );
    }
    if (!selected) {
      return result("Choose an agent to build its deterministic Agent Map.", {
        state: "mapSelecting",
        selectionId: randomUUID(),
        environments,
        environment,
        environmentId,
        agents,
        features: { fullscreen: true, workflowFree: true },
      });
    }
    const selectedAgent = requireGitHubCopilotMapAgent(
      agents,
      selected.id,
      input.componentIdUnique ?? selected.componentIdUnique,
    );
    const graph = await review.getAgentMap(
      environmentId,
      selectedAgent.id,
      selectedAgent.componentIdUnique,
    );
    return result(`Built a deterministic Agent Map for ${graph.agent.name}.`, agentMapContextPayload({
      environments,
      environment,
      environmentId,
      agents,
      agentId: selectedAgent.id,
      componentIdUnique: selectedAgent.componentIdUnique,
      graph,
    }));
  } catch (error) {
    return failure(error);
  }
}

export async function getAgentMap(
  token: string | undefined,
  input: {
    environmentId: string;
    agentId: string;
    componentIdUnique: string;
  },
): Promise<CallToolResult> {
  try {
    const review = service(token);
    // Read-only context so a remounted widget can restore its own selectors
    // from one call instead of chaining three.
    const [environments, reviewableAgents] = await Promise.all([
      review.listEnvironments(),
      review.listAgents(input.environmentId),
    ]);
    const agents = githubCopilotMapAgents(reviewableAgents);
    const selectedAgent = requireGitHubCopilotMapAgent(
      agents,
      input.agentId,
      input.componentIdUnique,
    );
    const graph = await review.getAgentMap(
      input.environmentId,
      selectedAgent.id,
      selectedAgent.componentIdUnique,
    );
    return result(`Built a deterministic Agent Map for ${graph.agent.name}.`, agentMapContextPayload({
      environments,
      environmentId: input.environmentId,
      agents,
      agentId: selectedAgent.id,
      componentIdUnique: selectedAgent.componentIdUnique,
      graph,
    }));
  } catch (error) {
    return failure(error);
  }
}

export async function getConnectedAgentMap(
  token: string | undefined,
  input: {
    environmentId: string;
    targetSchemaName: string;
  },
): Promise<CallToolResult> {
  try {
    const review = service(token);
    const graph = await review.getConnectedAgentMap(
      input.environmentId,
      input.targetSchemaName,
    );
    return result(`Loaded current components for connected agent ${graph.agent.name}.`, {
      state: "connectedAgentMap",
      targetSchemaName: input.targetSchemaName,
      graph,
      features: { workflowFree: true },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function startAgentReview(
  token: string | undefined,
  input: ConfirmedReviewInput,
): Promise<CallToolResult> {
  try {
    if (input.confirmed !== true) {
      throw new ReviewError("CONFIRMATION_REQUIRED", "Confirm the selected agent before starting the review.");
    }
    const started = await confirmedStart(token, input);
    return result(`Created Agent Review job ${started.jobId} for ${started.agentName}.`, {
      state: "running",
      ...started,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function getAgentReviewStatus(
  token: string | undefined,
  input: { jobId: string },
): Promise<CallToolResult> {
  try {
    const status = await service(token).status(input.jobId);
    return result(`Agent Review status: ${status.status}.`, {
      state: "status",
      status,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function finalizeAgentReview(
  token: string | undefined,
  input: { jobId: string },
): Promise<CallToolResult> {
  try {
    const finalized = await service(token).finalize(input.jobId);
    return result("Agent Review finalized.", {
      state: "summary",
      ...finalized,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function getAgentReviewResult(
  token: string | undefined,
  input: { reviewId: string; presentation?: "summary" | "fullReview" },
): Promise<CallToolResult> {
  try {
    const data = await service(token).getResult(input.reviewId);
    return result("Loaded the Agent Review result.", {
      state: input.presentation ?? "summary",
      ...data,
    });
  } catch (error) {
    return failure(error);
  }
}
