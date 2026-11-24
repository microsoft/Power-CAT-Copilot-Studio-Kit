/**
 * useConfigurations - Fetches active Agent Insights configurations.
 *
 * Needed by FilterBar before any tab loads. Returns the list of
 * agent configurations that have Insights enabled.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { AgentConfigService } from '../services/AgentConfigService';
import type { AgentConfiguration } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';

/** Fetches all active Agent Insights configurations from Dataverse. */
export function useConfigurations() {
  return useQuery<AgentConfiguration[]>({
    queryKey: queryKeys.agentConfigurations(),
    queryFn: () => AgentConfigService.getActiveInsightsConfigs(),
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
