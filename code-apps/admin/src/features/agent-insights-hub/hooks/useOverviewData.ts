/**
 * useOverviewData - Combined hook for the OverviewTab.
 *
 * Aggregates data from DailyMetrics, TopicMetrics, ToolMetrics, and
 * ErrorDetails to power the Overview page's KPI cards and charts.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { DailyMetricsService } from '../services/DailyMetricsService';
import { TopicMetricsService } from '../services/TopicMetricsService';
import { ToolMetricsService } from '../services/ToolMetricsService';
import { ErrorDetailsService } from '../services/ErrorDetailsService';
import type { FilterState, DailyMetrics, TopicMetrics, ToolMetrics, ErrorDetails } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';
import { getDateFilter } from '../context/FilterState';
import { buildDailyMetricsFilter, buildDailyMetricsFilterWithDates } from '../utils/odataFilterBuilder';

export interface OverviewData {
  dailyMetrics: UseQueryResult<DailyMetrics[]>;
  previousDailyMetrics: UseQueryResult<DailyMetrics[]>;
  topicMetrics: UseQueryResult<TopicMetrics[]>;
  toolMetrics: UseQueryResult<ToolMetrics[]>;
  errorDetails: UseQueryResult<ErrorDetails[]>;
  isLoading: boolean;
  isError: boolean;
}

/** Fetches all data sources needed by the OverviewTab in parallel. */
export function useOverviewData(filters: FilterState): OverviewData {
  const { startDate, endDate } = getDateFilter(filters);
  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();
  const enabled = !!filters.selectedConfigId;
  const filter = buildDailyMetricsFilter(filters);
  const keyArgs = [filters.selectedConfigId, startStr, endStr, filters.selectedChannel, filters.dataMode] as const;

  // Previous period: same length BEFORE the current start date
  const periodLengthMs = endDate.getTime() - startDate.getTime();
  const prevStart = new Date(startDate.getTime() - periodLengthMs);
  const prevEnd = new Date(startDate.getTime() - 86400000); // day before startDate
  const prevFilter = buildDailyMetricsFilterWithDates(filters, prevStart, prevEnd);
  const prevStartStr = prevStart.toISOString();
  const prevEndStr = prevEnd.toISOString();
  const prevKeyArgs = [filters.selectedConfigId, prevStartStr, prevEndStr, filters.selectedChannel, filters.dataMode] as const;

  const dailyMetrics = useQuery<DailyMetrics[]>({
    queryKey: queryKeys.dailyMetrics(...keyArgs),
    queryFn: () => DailyMetricsService.getAll(filter),
    enabled,
    staleTime: REACT_QUERY_STALE_TIME,
  });

  const previousDailyMetrics = useQuery<DailyMetrics[]>({
    queryKey: queryKeys.previousDailyMetrics(...prevKeyArgs),
    queryFn: () => DailyMetricsService.getAll(prevFilter),
    enabled,
    staleTime: REACT_QUERY_STALE_TIME,
  });

  const topicMetrics = useQuery<TopicMetrics[]>({
    queryKey: queryKeys.topicMetrics(...keyArgs),
    queryFn: () => TopicMetricsService.getAll(filter),
    enabled,
    staleTime: REACT_QUERY_STALE_TIME,
  });

  const toolMetrics = useQuery<ToolMetrics[]>({
    queryKey: queryKeys.toolMetrics(...keyArgs),
    queryFn: () => ToolMetricsService.getAll(filter),
    enabled,
    staleTime: REACT_QUERY_STALE_TIME,
  });

  const errorDetails = useQuery<ErrorDetails[]>({
    queryKey: queryKeys.errorDetails(...keyArgs),
    queryFn: () => ErrorDetailsService.getAll(filter),
    enabled,
    staleTime: REACT_QUERY_STALE_TIME,
  });

  const isLoading = dailyMetrics.isLoading || previousDailyMetrics.isLoading
    || topicMetrics.isLoading || toolMetrics.isLoading || errorDetails.isLoading;
  const isError = dailyMetrics.isError || topicMetrics.isError
    || toolMetrics.isError || errorDetails.isError;

  return { dailyMetrics, previousDailyMetrics, topicMetrics, toolMetrics, errorDetails, isLoading, isError };
}
