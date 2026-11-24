import { getContext } from '@microsoft/power-apps/app';
import { AgentInventory_AgentActionsService } from '../../../generated/services/AgentInventory_AgentActionsService';
import type { ManualTriggerInput } from '../../../generated/models/AgentInventory_AgentActionsModel';
import type { AgentInventoryRecord } from '../contracts/types';
import type { TenantUser } from './tenantUserService';

export type AgentActionType = 'Reassign' | 'Quarantine' | 'Unquarantine';

export interface AgentActionVariables {
  action: AgentActionType;
  agents: AgentInventoryRecord[];
  /** Target owner — required for Reassign, ignored for quarantine actions. */
  user?: TenantUser | null;
}

export interface AgentActionResult {
  name?: string;
  errorMessage?: string;
}

/** Shape sent to the flow's AgentRecords input (keyed by agent + environment). */
interface AgentActionRecordPayload {
  cat_agentid: string;
  cat_environmentid: string;
}

async function resolvePerformedBy(): Promise<string> {
  try {
    const ctx = await getContext();
    return JSON.stringify({
      Name: ctx.user.fullName ?? '',
      Email: ctx.user.userPrincipalName ?? '',
    });
  } catch {
    return JSON.stringify({ Name: '', Email: '' });
  }
}

function toRecordPayload(agent: AgentInventoryRecord): AgentActionRecordPayload {
  return {
    cat_agentid: agent.agentId,
    cat_environmentid: agent.environmentId ?? '',
  };
}

/**
 * Invokes the "Agent Inventory | Agent Actions" cloud flow to perform a
 * governance action (reassign / quarantine / unquarantine) against one or more
 * agents. Centralises the mapping between UI models and the flow's four opaque
 * text inputs (Action, AgentRecords, UserData, ActionPerformedBy).
 */
export async function runAgentAction({
  action,
  agents,
  user,
}: AgentActionVariables): Promise<AgentActionResult> {
  const performedBy = await resolvePerformedBy();
  const agentRecords = agents.map(toRecordPayload);
  const userData = action === 'Reassign' && user
    ? { Adid: user.id, Email: user.userPrincipalName, Name: user.displayName }
    : null;

  const input: ManualTriggerInput = {
    text: action.toLowerCase(),
    text_1: JSON.stringify(agentRecords),
    text_4: userData ? JSON.stringify(userData) : '',
    text_5: performedBy,
  };

  const result = await AgentInventory_AgentActionsService.Run(input);
  if (!result.success) {
    throw new Error(result.error?.message ?? `Unable to ${action.toLowerCase()} the selected agents.`);
  }

  const data = result.data;
  if (data?.errormessage) {
    throw new Error(data.errormessage);
  }
  if (!data?.name) {
    throw new Error('An unexpected error occurred while running the flow');
  }

  return { name: data.name, errorMessage: data.errormessage };
}
