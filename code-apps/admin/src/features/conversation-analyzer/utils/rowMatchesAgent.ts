/**
 * Determines whether a conversation-analyzer row belongs to a given agent.
 *
 * A row matches if:
 *  - cat_agentid equals the agent's agentId, AND
 *  - cat_environmenturl is null/blank (legacy rows) OR equals the agent's environmentUrl
 */
export function rowMatchesAgent(
  rowAgentId: string | undefined,
  rowEnvironmentUrl: string | undefined | null,
  agentId: string,
  agentEnvironmentUrl: string | undefined,
): boolean {
  if (rowAgentId !== agentId) return false;
  if (!rowEnvironmentUrl || rowEnvironmentUrl.trim() === '') return true;
  return rowEnvironmentUrl === agentEnvironmentUrl;
}
