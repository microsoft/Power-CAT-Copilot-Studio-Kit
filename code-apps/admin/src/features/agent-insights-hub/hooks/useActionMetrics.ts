/**
 * useActionMetrics - Fetches action metrics for the ActionsTab.
 *
 * Filters on _cat_agentconfiguration_value, cat_metricdate,
 * cat_channelid, and cat_datasourcecode.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { ActionMetricsService } from '../services/ActionMetricsService';
import type { FilterState, ActionMetrics } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';
import { getDateFilter } from '../context/FilterState';
import { buildActionMetricsFilter } from '../utils/odataFilterBuilder';

/** Fetches action metrics filtered by the global filter state. */
export function useActionMetrics(filters: FilterState) {
  const { startDate, endDate } = getDateFilter(filters);
  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  return useQuery<ActionMetrics[]>({
    queryKey: queryKeys.actionMetrics(
      filters.selectedConfigId,
      startStr,
      endStr,
      filters.selectedChannel,
      filters.dataMode,
    ),
    queryFn: () =>
      ActionMetricsService.getAll(buildActionMetricsFilter(filters)),
    enabled: !!filters.selectedConfigId,
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
