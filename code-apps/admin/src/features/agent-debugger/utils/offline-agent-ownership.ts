import type { ConnectedAgentInfo } from "../contracts/connected-agent";
import type { ProcessedTurn } from "../contracts/transcript";

function unavailable(agent: ConnectedAgentInfo): ConnectedAgentInfo {
  return { ...agent, sessionId: "", childConversationId: "", childTopics: [], childTranscript: undefined, isFetched: false, isFetching: false,
    fetchError: "Ambiguous captured child ownership; child evidence is unavailable in this exchange." };
}

/** Resolves original local invocation identities before offline message IDs are remapped. */
export function ownedAgentsByExchange(groups: ProcessedTurn[][], agents: ConnectedAgentInfo[]): ConnectedAgentInfo[][] {
  const result = groups.map(() => [] as ConnectedAgentInfo[]);
  for (const agent of agents) {
    const explicitSessions = groups.map((group, index) => ({ index, found: group.some(turn =>
      turn.activities.some(activity => {
        const value = activity.value as Record<string, unknown> | undefined;
        return (activity.name ?? activity.valueType) === "ConnectedAgentInitializeTraceData" &&
          agent.sessionId && value?.sessionId === agent.sessionId;
      })) })).filter(candidate => candidate.found).map(candidate => candidate.index);
    const candidates = groups.flatMap((group, index) => {
      if (explicitSessions.length && !explicitSessions.includes(index)) return [];
      const activities = group.flatMap(turn => turn.activities);
      if (agent.parentReplyToId && !group.some(turn => turn.id === agent.parentReplyToId) &&
        !activities.some(activity => activity.id === agent.parentReplyToId || activity.replyToId === agent.parentReplyToId)) return [];
      const steps = group.flatMap(turn => turn.debugInfo?.stepExecutions ?? []);
      const invocation = steps.some(step => agent.stepId ? step.stepId === agent.stepId :
        [agent.dialogSchemaName, agent.botSchemaName].includes(step.taskDialogId));
      const rawInvocation = activities.some(activity => {
        const value = activity.value as Record<string, unknown> | undefined;
        return agent.stepId ? (value?.stepId ?? value?.planStepId ?? value?.toolCallId) === agent.stepId :
          [agent.dialogSchemaName, agent.botSchemaName].includes(String(value?.taskDialogId ?? value?.dialogSchemaName ?? ""));
      });
      if (agent.stepId) return invocation || rawInvocation ? [index] : [];
      return invocation || rawInvocation || agent.parentReplyToId || explicitSessions.includes(index) ? [index] : [];
    });
    for (const index of candidates) result[index].push(candidates.length === 1 ? agent : unavailable(agent));
  }
  return result.map(owned => {
    const byInvocation = new Map<string, ConnectedAgentInfo>();
    for (const agent of owned) {
      const key = agent.stepId ? `step:${agent.stepId}` : `schema:${agent.dialogSchemaName || agent.botSchemaName}`;
      byInvocation.set(key, byInvocation.has(key) ? unavailable(agent) : agent);
    }
    return [...byInvocation.values()];
  });
}
