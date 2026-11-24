/**
 * useToolMetrics - Fetches tool metrics for the ToolsTab.
 *
 * Filters on _cat_agentconfiguration_value, cat_metricdate,
 * cat_channelid (optional on tools), and cat_datasourcecode.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { ToolMetricsService } from '../services/ToolMetricsService';
import type { FilterState, ToolMetrics } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';
import { getDateFilter } from '../context/FilterState';
import { buildToolMetricsFilter } from '../utils/odataFilterBuilder';

/** Fetches tool metrics filtered by the global filter state. */
export function useToolMetrics(filters: FilterState) {
  const { startDate, endDate } = getDateFilter(filters);
  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  return useQuery<ToolMetrics[]>({
    queryKey: queryKeys.toolMetrics(
      filters.selectedConfigId,
      startStr,
      endStr,
      filters.selectedChannel,
      filters.dataMode,
    ),
    queryFn: () =>
      ToolMetricsService.getAll(buildToolMetricsFilter(filters)),
    enabled: !!filters.selectedConfigId,
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
