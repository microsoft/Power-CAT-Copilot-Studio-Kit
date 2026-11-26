import { describe, expect, it } from "vitest";
import type { AgentDetailsOption } from "../../services/dataverse-agent-service";
import { resolveDebuggerDeepLink } from "../deep-link";

const agent: AgentDetailsOption = {
  id: "agent-option",
  name: "Support agent",
  botId: "abcdef01-0000-0000-0000-000000000001",
  environmentId: "abcdef02-0000-0000-0000-000000000002",
  environmentUrl: "https://example.crm.dynamics.com",
};

const notLoading = () => false;

function link(values: Record<string, string>) {
  return new URLSearchParams(values);
}

describe("resolveDebuggerDeepLink", () => {
  it("preselects the agent without a warning when the conversation is omitted", () => {
    const result = resolveDebuggerDeepLink(
      link({ environmentUrl: agent.environmentUrl!, agentId: agent.botId! }),
      [agent],
      notLoading,
    );
    expect(result).toMatchObject({ agent, conversationId: "", error: null, incomplete: false });
  });

  it("accepts an environment ID in place of the environment URL", () => {
    const result = resolveDebuggerDeepLink(
      link({ environmentId: `{${agent.environmentId!.toUpperCase()}}`, agentId: agent.botId! }),
      [agent],
      notLoading,
    );
    expect(result).toMatchObject({ agent, error: null, incomplete: false });
  });

  it("waits for the requested environment to load before reporting a mismatch", () => {
    const result = resolveDebuggerDeepLink(
      link({ environmentId: agent.environmentId!, agentId: agent.botId! }),
      [],
      () => true,
    );
    expect(result).toMatchObject({ agent: null, error: null });
  });

  it("does not select a matching bot ID from a different environment", () => {
    const result = resolveDebuggerDeepLink(
      link({ environmentId: "abcdef03-0000-0000-0000-000000000003", agentId: agent.botId! }),
      [agent],
      notLoading,
    );
    expect(result.agent).toBeNull();
    expect(result.error).toContain("does not match an agent");
  });

  it("still resolves full conversation links", () => {
    const result = resolveDebuggerDeepLink(
      link({ conversationId: "conv-1", environmentUrl: `${agent.environmentUrl}/`, agentId: agent.botId! }),
      [agent],
      notLoading,
    );
    expect(result).toMatchObject({ agent, conversationId: "conv-1", error: null });
  });

  it("warns when the agent or environment is missing", () => {
    const noAgent = resolveDebuggerDeepLink(link({ conversationId: "conv-1", environmentUrl: agent.environmentUrl! }), [agent], notLoading);
    const noEnvironment = resolveDebuggerDeepLink(link({ agentId: agent.botId! }), [agent], notLoading);
    expect(noAgent).toMatchObject({ agent: null, incomplete: true });
    expect(noAgent.error).toContain("agentId");
    expect(noEnvironment).toMatchObject({ agent: null, incomplete: true });
    expect(noEnvironment.error).toContain("environment");
  });
});
