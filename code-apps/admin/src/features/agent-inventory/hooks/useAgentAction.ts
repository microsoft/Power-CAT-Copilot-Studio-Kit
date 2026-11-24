import { useMutation } from '@tanstack/react-query';
import { runAgentAction, type AgentActionVariables } from '../services/agentActionsService';

/**
 * Mutation wrapper around {@link runAgentAction} for the reassign / quarantine /
 * unquarantine bulk and single-agent dialogs. Exposes `isPending`, `isError`
 * and `error` so dialogs can show a spinner and inline failure message.
 */
export function useAgentAction() {
  return useMutation({
    mutationFn: (variables: AgentActionVariables) => runAgentAction(variables),
  });
}
