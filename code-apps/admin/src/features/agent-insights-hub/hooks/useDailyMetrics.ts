/**
 * useDailyMetrics - Fetches daily metrics for the DailyMetricsTab.
 *
 * Filters on cat_agentname (via _cat_agentconfiguration_value lookup),
 * cat_metricdate, cat_channelid, and cat_datasourcecode.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { DailyMetricsService } from '../services/DailyMetricsService';
import type { FilterState, DailyMetrics } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';
import { getDateFilter } from '../context/FilterState';
import { buildDailyMetricsFilter } from '../utils/odataFilterBuilder';

/** Fetches daily metrics filtered by the global filter state. */
export function useDailyMetrics(filters: FilterState) {
  const { startDate, endDate } = getDateFilter(filters);
  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  return useQuery<DailyMetrics[]>({
    queryKey: queryKeys.dailyMetrics(
      filters.selectedConfigId,
      startStr,
      endStr,
      filters.selectedChannel,
      filters.dataMode,
    ),
    queryFn: () =>
      DailyMetricsService.getAll(buildDailyMetricsFilter(filters)),
    enabled: !!filters.selectedConfigId,
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
