/**
 * useErrorDetails - Fetches error details for the ErrorsTab.
 *
 * Filters on _cat_agentconfiguration_value, cat_metricdate,
 * cat_channelid (optional on errors), and cat_datasourcecode.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { ErrorDetailsService } from '../services/ErrorDetailsService';
import type { FilterState, ErrorDetails } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';
import { getDateFilter } from '../context/FilterState';
import { buildErrorDetailsFilter } from '../utils/odataFilterBuilder';

/** Fetches error details filtered by the global filter state. */
export function useErrorDetails(filters: FilterState) {
  const { startDate, endDate } = getDateFilter(filters);
  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  return useQuery<ErrorDetails[]>({
    queryKey: queryKeys.errorDetails(
      filters.selectedConfigId,
      startStr,
      endStr,
      filters.selectedChannel,
      filters.dataMode,
    ),
    queryFn: () =>
      ErrorDetailsService.getAll(buildErrorDetailsFilter(filters)),
    enabled: !!filters.selectedConfigId,
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
