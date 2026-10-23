export interface AgentMapEnvironmentRef {
  id: string;
  name: string;
}

export interface AgentMapAgentRef {
  id: string;
  name: string;
  componentIdUnique: string;
  iconBase64?: string;
  harness: "standard" | "copilot";
}

export function githubCopilotMapAgents<TAgent extends AgentMapAgentRef>(
  agents: TAgent[],
): TAgent[] {
  return agents.filter((agent) => agent.harness === "copilot");
}

export interface AgentMapContextPayload<
  TGraph,
  TEnvironment extends AgentMapEnvironmentRef = AgentMapEnvironmentRef,
  TAgent extends AgentMapAgentRef = AgentMapAgentRef,
> {
  state: "map";
  environments: TEnvironment[];
  environment?: TEnvironment;
  environmentId: string;
  agents: TAgent[];
  agentId: string;
  componentIdUnique: string;
  graph: TGraph;
  features: { fullscreen: true; workflowFree: true };
  [key: string]: unknown;
}

/**
 * Assemble one map result that can rebuild the whole widget on its own.
 *
 * The M365 host remounts the iframe, and a payload holding only the graph left
 * full screen with empty environment and agent pickers after every remount.
 * Carrying the surrounding selection is read-only context, not new data: it is
 * the same inventory the selectors were already showing.
 */
export function agentMapContextPayload<
  TGraph,
  TEnvironment extends AgentMapEnvironmentRef,
  TAgent extends AgentMapAgentRef,
>(input: {
  environments: TEnvironment[];
  environment?: TEnvironment;
  environmentId: string;
  agents: TAgent[];
  agentId: string;
  componentIdUnique: string;
  graph: TGraph;
}): AgentMapContextPayload<TGraph, TEnvironment, TAgent> {
  return {
    state: "map",
    environments: input.environments,
    environment: input.environment
      ?? input.environments.find((candidate) => candidate.id === input.environmentId),
    environmentId: input.environmentId,
    agents: githubCopilotMapAgents(input.agents),
    agentId: input.agentId,
    componentIdUnique: input.componentIdUnique,
    graph: input.graph,
    features: { fullscreen: true, workflowFree: true },
  };
}
