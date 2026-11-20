/**
 * useTableHasData - Lightweight check for whether a metrics table has any records.
 *
 * Used to distinguish "no data at all (needs sync)" from "filters excluded everything".
 * Each query fetches $top=1 with no filter and is cached independently.
 */

import { useQuery } from '@tanstack/react-query';
import { REACT_QUERY_STALE_TIME } from '../contracts/types';
import { DailyMetricsService } from '../services/DailyMetricsService';
import { TopicMetricsService } from '../services/TopicMetricsService';
import { ActionMetricsService } from '../services/ActionMetricsService';
import { ToolMetricsService } from '../services/ToolMetricsService';
import { ErrorDetailsService } from '../services/ErrorDetailsService';
import { TranscriptMetricsService } from '../services/TranscriptMetricsService';

type TableName = 'daily' | 'topics' | 'actions' | 'tools' | 'errors' | 'transcripts';

const HAS_ANY_FN: Record<TableName, () => Promise<boolean>> = {
  daily: DailyMetricsService.hasAny,
  topics: TopicMetricsService.hasAny,
  actions: ActionMetricsService.hasAny,
  tools: ToolMetricsService.hasAny,
  errors: ErrorDetailsService.hasAny,
  transcripts: TranscriptMetricsService.hasAny,
};

/** Returns whether the given metrics table has at least one record (unfiltered). */
export function useTableHasData(table: TableName) {
  return useQuery<boolean>({
    queryKey: ['agent-insights-hub', 'has-data', table],
    queryFn: HAS_ANY_FN[table],
    staleTime: REACT_QUERY_STALE_TIME,
  });
}
