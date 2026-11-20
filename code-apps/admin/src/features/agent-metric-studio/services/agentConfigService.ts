// Service to fetch active copilot agent configurations for the agent filter dropdown.

import { dv } from './dataverseClient';
import type { AgentOption } from '../types';

interface CopilotConfigRow {
  cat_copilotconfigurationid: string;
  cat_name: string;
  cat_agentname?: string;
}

/**
 * Fetches all active copilot configurations and returns them as AgentOption[].
 * Used to populate the agent filter dropdown in FilterStrip.
 */
export async function loadAgentOptions(): Promise<AgentOption[]> {
  const rows = await dv.list<CopilotConfigRow>('cat_copilotconfigurations', {
    select: ['cat_copilotconfigurationid', 'cat_name', 'cat_agentname'],
    filter: 'statecode eq 0',
    orderBy: 'cat_name asc',
  });

  return rows.map(r => ({
    id: r.cat_copilotconfigurationid,
    name: r.cat_agentname ?? r.cat_name ?? 'Unnamed agent',
  }));
}
