/**
 * useTopicMetrics - Fetches topic metrics for the TopicsTab.
 *
 * Filters on _cat_agentconfiguration_value, cat_metricdate,
 * cat_channelid, and cat_datasourcecode.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { TopicMetricsService } from '../services/TopicMetricsService';
import type { FilterState, TopicMetrics } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';
import { getDateFilter } from '../context/FilterState';
import { buildTopicMetricsFilter } from '../utils/odataFilterBuilder';

/** Fetches topic metrics filtered by the global filter state. */
export function useTopicMetrics(filters: FilterState) {
  const { startDate, endDate } = getDateFilter(filters);
  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  return useQuery<TopicMetrics[]>({
    queryKey: queryKeys.topicMetrics(
      filters.selectedConfigId,
      startStr,
      endStr,
      filters.selectedChannel,
      filters.dataMode,
    ),
    queryFn: () =>
      TopicMetricsService.getAll(buildTopicMetricsFilter(filters)),
    enabled: !!filters.selectedConfigId,
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
