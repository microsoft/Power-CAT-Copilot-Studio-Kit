/**
 * useTranscriptMetrics - Fetches transcript metrics for the TranscriptsTab.
 *
 * NOTE: Transcripts use cat_conversationdate (NOT cat_metricdate) and
 * cat_agentid (NOT cat_agentname) per the data model.
 * Filters on _cat_agentconfiguration_value, cat_conversationdate,
 * cat_channelid, and cat_datasourcecode.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { TranscriptMetricsService } from '../services/TranscriptMetricsService';
import type { FilterState, TranscriptMetrics } from '../contracts/types';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';
import { getDateFilter } from '../context/FilterState';
import { formatDateForOData } from '../utils/dateFormatting';
import { buildChannelFilter } from '../utils/odataFilterBuilder';

/** Builds an OData filter string for transcript metrics using cat_conversationdate. */
function buildFilter(filters: FilterState): string {
  const parts: string[] = [];
  const { startDate, endDate } = getDateFilter(filters);

  if (filters.selectedConfigId && filters.selectedConfigId !== 'all') {
    parts.push(`_cat_agentconfiguration_value eq ${filters.selectedConfigId}`);
  }

  // Use formatDateForOData (local date methods) — NOT toISOString() which converts to UTC
  // and shifts the date in non-UTC timezones (e.g. UTC+5:30 midnight = previous day UTC,
  // causing "last 7 days" to return 8 days of data).
  parts.push(`cat_conversationdate ge ${formatDateForOData(startDate)}`);
  parts.push(`cat_conversationdate le ${formatDateForOData(endDate)}`);

  if (filters.selectedChannel && filters.selectedChannel !== 'all') {
    const channelFilter = buildChannelFilter(filters.selectedChannel, 'cat_channelid');
    if (channelFilter) parts.push(channelFilter);
  }

  if (filters.dataMode === 'production') {
    parts.push('cat_datasourcecode eq 1');
  } else if (filters.dataMode === 'test') {
    parts.push('cat_datasourcecode eq 2');
  }

  return parts.join(' and ');
}

/** Fetches transcript metrics filtered by the global filter state. */
export function useTranscriptMetrics(filters: FilterState) {
  const { startDate, endDate } = getDateFilter(filters);
  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  return useQuery<TranscriptMetrics[]>({
    queryKey: queryKeys.transcriptMetrics(
      filters.selectedConfigId,
      startStr,
      endStr,
      filters.selectedChannel,
      filters.dataMode,
    ),
    queryFn: () =>
      TranscriptMetricsService.getAll(buildFilter(filters)),
    enabled: !!filters.selectedConfigId,
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
