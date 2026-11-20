import { AgentInventory_AgentsDataLoadOnDemandService } from '../../../generated/services/AgentInventory_AgentsDataLoadOnDemandService';

export interface AgentSyncResult {
  /** True when the flow reports statuscode "1" (a new sync run was started). */
  started: boolean;
  statusCode?: string;
  response?: string;
}

/**
 * Triggers the "Agent Inventory | Agents Data Load OnDemand" cloud flow to start
 * an on-demand tenant agent sync. The flow takes no inputs and returns a status
 * code of "1" when a new run was queued, or another value when a sync is already
 * running and a new one cannot be started.
 */
export async function runAgentSync(): Promise<AgentSyncResult> {
  const result = await AgentInventory_AgentsDataLoadOnDemandService.Run({});
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Unable to start the agent sync process.');
  }

  const data = result.data;
  return {
    started: String(data?.statuscode) === '1',
    statusCode: data?.statuscode,
    response: data?.response,
  };
}
