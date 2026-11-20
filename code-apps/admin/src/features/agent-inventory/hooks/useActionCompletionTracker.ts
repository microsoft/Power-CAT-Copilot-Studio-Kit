import {
  getActionCompletion,
  type ActionAuditRecord,
  type ActionCompletionProgress,
} from '../services/actionCompletionService';
import { agentInventoryKeys } from './queryKeys';
import { usePollingTracker } from './usePollingTracker';

/** Batch name (flow output) plus the number of agents targeted by the action. */
interface ActionCompletionSetup {
  name: string;
  expectedCount: number;
}

/**
 * Polls the agent-action audit table every 5 seconds after a governance action
 * (reassign / quarantine / unquarantine) flow starts, resolving once every
 * targeted agent has a terminal audit row. `onSettled` fires once with the
 * per-agent {@link ActionAuditRecord}s so the dialog can render each agent's
 * status (bulk) or toast the single-agent result. `scope` keys the poller per
 * action so the three dialogs never share cache. Call `begin({ name,
 * expectedCount })` with the batch name returned by the flow, and `stop()` to
 * abort when the dialog closes mid-poll.
 */
export function useActionCompletionTracker(
  scope: string,
  onSettled: (records: ActionAuditRecord[]) => void,
) {
  return usePollingTracker<ActionCompletionSetup, ActionCompletionProgress>(
    agentInventoryKeys.actionCompletion(scope),
    (setup) => getActionCompletion(setup.name, setup.expectedCount),
    (result) => !result.settled,
    (result) => onSettled(result.records),
  );
}
