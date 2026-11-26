import type { AgentDetailsOption } from "../services/dataverse-agent-service";

export interface DebuggerDeepLinkResolution {
  requestKey: string;
  conversationId: string;
  agent: AgentDetailsOption | null;
  error: string | null;
  incomplete: boolean;
}

/** Normalize Dataverse IDs for deep-link comparisons. */
export function normalizeRecordId(value: string): string {
  return value.trim().replace(/[{}]/g, "").toLowerCase();
}

/** Normalize an environment URL to its origin for discovery and matching. */
export function normalizeEnvironmentUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/g, "").toLowerCase();
  }
}

/** Resolve Agent Debugger deep-link query parameters against the discovered agents. */
export function resolveDebuggerDeepLink(
  params: URLSearchParams,
  agents: AgentDetailsOption[],
  isEnvironmentLoading: (url: string, environmentId: string) => boolean,
): DebuggerDeepLinkResolution {
  const conversationId = params.get("conversationId")?.trim() ?? "";
  const environmentUrl = normalizeEnvironmentUrl(params.get("environmentUrl") ?? "");
  const environmentId = normalizeRecordId(params.get("environmentId") ?? "");
  const agentId = normalizeRecordId(params.get("agentId") ?? "");
  const idle = { requestKey: "", conversationId, agent: null, error: null, incomplete: false };
  if (!conversationId && !environmentUrl && !environmentId && !agentId) return idle;

  const requestKey = [conversationId, environmentUrl, environmentId, agentId].join("|");
  // The conversation is optional: an agent plus its environment preselects the agent.
  const missing = [
    !environmentUrl && !environmentId && "environmentUrl or environmentId",
    !agentId && "agentId",
  ].filter(Boolean);

  if (missing.length > 0) {
    return {
      ...idle,
      requestKey,
      error: `This Agent Debugger link is incomplete. Select an agent and conversation to continue. Missing: ${missing.join(", ")}.`,
      incomplete: true,
    };
  }
  if (isEnvironmentLoading(environmentUrl, environmentId)) return { ...idle, requestKey };

  const agent = agents.find(candidate =>
    normalizeRecordId(candidate.botId ?? "") === agentId &&
    (environmentUrl
      ? normalizeEnvironmentUrl(candidate.environmentUrl ?? "") === environmentUrl
      : normalizeRecordId(candidate.environmentId ?? "") === environmentId),
  ) ?? null;
  return {
    ...idle,
    requestKey,
    agent,
    error: agent ? null : "The Agent Debugger link does not match an agent in the specified environment.",
  };
}
