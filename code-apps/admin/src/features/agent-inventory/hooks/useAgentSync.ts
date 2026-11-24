import { useMutation } from '@tanstack/react-query';
import { runAgentSync } from '../services/agentSyncService';

/**
 * Mutation wrapper around {@link runAgentSync} for the dashboard "Sync agents"
 * button. Exposes `isPending` so the button can disable while the flow is being
 * invoked, and `data.started` so callers can pick the right notification.
 */
export function useAgentSync() {
  return useMutation({
    mutationFn: () => runAgentSync(),
  });
}
