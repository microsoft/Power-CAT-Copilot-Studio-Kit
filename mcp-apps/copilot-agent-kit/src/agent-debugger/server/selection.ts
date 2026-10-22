import { DEFAULT_PROMPT_ENVIRONMENT } from "../../tools/target-selection.js";

export const DEFAULT_DEBUGGER_ENVIRONMENT = DEFAULT_PROMPT_ENVIRONMENT;

export interface DebuggerEnvironmentRef {
  id: string;
  name: string;
  url?: string;
}

export interface DebuggerAgentRef {
  id: string;
  name: string;
  componentIdUnique?: string;
}

export interface DebuggerSelectionInput {
  environmentId?: string;
  environmentName?: string;
  agentId?: string;
  agentName?: string;
  conversationId?: string;
  startedAfter?: string;
  startedBefore?: string;
}

interface ResolveDebuggerTargetOptions {
  environments: DebuggerEnvironmentRef[];
  agents: DebuggerAgentRef[];
  input: DebuggerSelectionInput;
  preferredEnvironmentName?: string;
}

export interface DebuggerTarget {
  environment?: DebuggerEnvironmentRef;
  agent?: DebuggerAgentRef;
  conversationId?: string;
  canAnalyzeDirectly: boolean;
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function selectedByIdOrName<T extends { id: string; name: string }>(
  items: T[],
  id?: string,
  name?: string,
): T | undefined {
  if (!id && !name) return undefined;
  const matches = items.filter((item) =>
    (!id || normalized(item.id) === normalized(id))
    && (!name || normalized(item.name) === normalized(name)));
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolveDebuggerTarget({
  environments,
  agents,
  input,
  preferredEnvironmentName = DEFAULT_DEBUGGER_ENVIRONMENT,
}: ResolveDebuggerTargetOptions): DebuggerTarget {
  const environment = selectedByIdOrName(
    environments,
    input.environmentId,
    input.environmentName ?? (input.environmentId ? undefined : preferredEnvironmentName),
  );
  const agent = environment
    ? selectedByIdOrName(agents, input.agentId, input.agentName)
    : undefined;
  const conversationId = input.conversationId?.trim() || undefined;

  return {
    environment,
    agent,
    conversationId,
    canAnalyzeDirectly: Boolean(environment && agent && conversationId),
  };
}
