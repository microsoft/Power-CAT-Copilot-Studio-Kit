import { useQuery } from '@tanstack/react-query';
import { AgentDescriptionService } from '../services/AgentDescriptionService';
import { InventorySettingsService } from '../settings/services/InventorySettingsService';
import { agentInventoryKeys } from './queryKeys';
import type { AgentInventoryRecord } from '../contracts/types';

/**
 * Fetches an AI-generated description for an agent only when the Agent Inventory
 * "AI-generated description" setting is on (default on when unset or when no
 * settings record exists), the agent has no stored description, is a GitHub
 * Copilot agent (`poweredBy === 'GitHub Copilot'`), and has authored
 * instructions. When the setting is off, a stored description exists, or the
 * agent is not eligible, the query is disabled so no AI Builder call is made.
 */
export function useAgentGeneratedDescription(agent: AgentInventoryRecord) {
  const settingsQuery = useQuery({
    queryKey: agentInventoryKeys.settings(),
    queryFn: () => InventorySettingsService.get(),
  });
  // Default on: allow unless the setting is explicitly disabled. Wait for the
  // settings read to settle first so an explicit "off" is respected before any
  // AI Builder call is made.
  const aiDescriptionEnabled =
    !settingsQuery.isPending && (settingsQuery.data?.aiGeneratedDescription ?? true);

  const instructions = agent.instructions?.trim() ?? '';
  const hasStoredDescription = Boolean(agent.description?.trim());
  const enabled =
    aiDescriptionEnabled &&
    !hasStoredDescription &&
    agent.poweredBy === 'GitHub Copilot' &&
    instructions.length > 0;

  return useQuery({
    queryKey: agentInventoryKeys.generatedDescription(agent.id),
    queryFn: () => AgentDescriptionService.generate(instructions),
    enabled,
    staleTime: Infinity,
  });
}
