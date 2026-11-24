import { AgentInventory_AgentDataforActionsService } from '../../../generated/services/AgentInventory_AgentDataforActionsService';

/**
 * Normalised quarantine state for an agent, derived from the flow's raw
 * `quarantinestatus` output:
 * - `quarantined` — flow returned "quarantine" (agent is currently quarantined)
 * - `active`      — flow returned "unquarantine" (agent is not quarantined)
 * - `unavailable` — "unknown" / "not applicable" / empty / unexpected value, a
 *   flow error, or a missing flow response; no governance action can be offered.
 */
export type AgentQuarantineState = 'quarantined' | 'active' | 'unavailable';

export interface AgentQuarantineStatus {
  state: AgentQuarantineState;
  /** Raw value returned by the flow, retained for diagnostics. */
  raw: string;
}

export interface AgentQuarantineStatusInput {
  agentId: string;
  environmentId: string;
}

/**
 * Loads the live quarantine status for a single agent via the
 * "Agent Inventory | Agent Data for Actions" cloud flow. The flow takes the
 * agent id (`text`) and environment id (`text_1`) and returns a
 * `quarantinestatus` string, which this wrapper normalises into an
 * {@link AgentQuarantineState}. Any flow error or missing response resolves to
 * `unavailable` (treated as "not applicable") so the caller simply hides the
 * governance action rather than surfacing an error.
 */
export async function getAgentQuarantineStatus({
  agentId,
  environmentId,
}: AgentQuarantineStatusInput): Promise<AgentQuarantineStatus> {
  try {
    const result = await AgentInventory_AgentDataforActionsService.Run({
      text: agentId,
      text_1: environmentId,
    });
    if (!result.success) {
      return { state: 'unavailable', raw: '' };
    }

    const raw = (result.data?.quarantinestatus ?? '').trim();
    const normalized = raw.toLowerCase();
    if (normalized === 'quarantine') {
      return { state: 'quarantined', raw };
    }
    if (normalized === 'unquarantine') {
      return { state: 'active', raw };
    }
    return { state: 'unavailable', raw };
  } catch {
    return { state: 'unavailable', raw: '' };
  }
}
