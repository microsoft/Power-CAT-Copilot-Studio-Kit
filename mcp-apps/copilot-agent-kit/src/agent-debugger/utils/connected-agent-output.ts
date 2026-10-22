import type { ConnectedAgentInfo } from '../contracts/connected-agent';
import type { ProcessedTurn, StepExecution } from '../contracts/transcript';

const CAPTURE_CONTEXT_TASK_ID = 'P:CaptureContextTool';
const SEND_MESSAGE_TASK_ID = 'P:SendMessageTool';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function generativeAgentResponse(observation: unknown): string | undefined {
  const direct = asRecord(observation);
  if (typeof direct?.agent_response === 'string' && direct.agent_response.trim()) {
    return direct.agent_response;
  }
  if (typeof observation !== 'string') return undefined;

  try {
    const parsed = asRecord(JSON.parse(observation));
    return typeof parsed?.agent_response === 'string' && parsed.agent_response.trim()
      ? parsed.agent_response
      : undefined;
  } catch {
    return undefined;
  }
}

function finalChildReply(agent: ConnectedAgentInfo | undefined): string | undefined {
  const turns = agent?.childTranscript ?? [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.role === 'assistant' && turn.content.trim()) return turn.content;
  }
  return undefined;
}

function isAgentExecution(exec: StepExecution): boolean {
  return (
    String(exec.type ?? '').toLowerCase() === 'agent' ||
    exec.taskDialogId.includes('.agent.') ||
    exec.subtitle === 'Connected agent' ||
    exec.subtitle === 'Child agent'
  );
}

function supportExecutionsForAgent(
  turn: ProcessedTurn,
  agentExecution: StepExecution,
): StepExecution[] {
  const executions = turn.debugInfo?.stepExecutions ?? [];
  const parentKey = `${agentExecution.taskDialogId}:${agentExecution.stepId}`;
  const isSupportTool = (exec: StepExecution) =>
    exec.taskDialogId === CAPTURE_CONTEXT_TASK_ID ||
    exec.taskDialogId === SEND_MESSAGE_TASK_ID;

  const owned = executions.filter(
    (exec) => isSupportTool(exec) && exec.parentStepKey === parentKey,
  );
  if (owned.length) return owned;

  const agentCount = executions.filter(isAgentExecution).length;
  return agentCount === 1 ? executions.filter(isSupportTool) : [];
}

/**
 * Resolves the response emitted by an agent invocation.
 *
 * The parent agent's step observation may be a short orchestration summary.
 * Child-agent support tools and fetched connected-agent transcripts contain
 * the actual response that the invoked agent returned.
 */
export function resolveConnectedAgentOutput(
  turn: ProcessedTurn,
  agentExecution: StepExecution,
  connectedAgent?: ConnectedAgentInfo,
): unknown {
  const generativeResponse = generativeAgentResponse(agentExecution.observation);
  if (generativeResponse) return generativeResponse;

  const childReply = finalChildReply(connectedAgent);
  if (childReply) return childReply;

  const supportExecutions = supportExecutionsForAgent(turn, agentExecution);
  for (let index = supportExecutions.length - 1; index >= 0; index -= 1) {
    const exec = supportExecutions[index];
    if (exec.taskDialogId !== CAPTURE_CONTEXT_TASK_ID) continue;
    const context = asRecord(exec.arguments)?.context;
    const contextRecord = asRecord(context);
    if (contextRecord && Object.keys(contextRecord).length) return contextRecord;
  }

  for (let index = supportExecutions.length - 1; index >= 0; index -= 1) {
    const exec = supportExecutions[index];
    if (exec.taskDialogId !== SEND_MESSAGE_TASK_ID) continue;
    const message = asRecord(exec.arguments)?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return agentExecution.observation;
}
