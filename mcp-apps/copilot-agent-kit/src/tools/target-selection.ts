import { escapeOData, guid } from "../agent-review/server/dataverse.js";
import { ReviewError } from "../agent-review/server/types.js";

export const DEFAULT_PROMPT_ENVIRONMENT = "Copilot Studio Kit - Dev";

export interface AgentSelection {
  agentId?: string;
  agentName?: string;
}

export function exactAgentFilter(input: AgentSelection): string {
  const name = input.agentName?.trim();
  if (!input.agentId && !name) {
    throw new ReviewError("AGENT_NAME_REQUIRED", "Provide an exact agent name or choose an agent from the form.");
  }
  return [
    "statecode eq 0",
    ...(input.agentId ? [`botid eq ${guid(input.agentId)}`] : []),
    ...(name ? [`name eq '${escapeOData(name)}'`] : []),
  ].join(" and ");
}

export function exactSelection<TItem extends { id: string; name: string }>(
  items: TItem[],
  kind: "AGENT" | "ENVIRONMENT",
  id?: string,
  name?: string,
): TItem {
  const normalizedId = id ? guid(id) : undefined;
  const normalizedName = name?.trim().toLowerCase();
  const matches = items.filter((item) =>
    (!normalizedId || item.id.toLowerCase() === normalizedId)
    && (!normalizedName || item.name.trim().toLowerCase() === normalizedName));
  if (matches.length === 1) return matches[0];
  const label = kind === "AGENT" ? "agent" : "environment";
  if (matches.length > 1) {
    throw new ReviewError(`${kind}_AMBIGUOUS`, `More than one ${label} has this exact name. Choose an ${label}.`);
  }
  throw new ReviewError(
    `${kind}_NOT_FOUND`,
    `The ${label}${name ? ` "${name.trim()}"` : ""} is unavailable${kind === "AGENT" ? " in the selected environment" : ""}. Choose an ${label}.`,
  );
}
