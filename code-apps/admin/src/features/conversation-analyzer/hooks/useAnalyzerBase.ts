import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFilterContext } from '../context/FilterContext';
import { queryKeys } from './queryKeys';
import { timePeriodToIsoRange } from '../utils/dateRange';
import { fetchAnalyzerBase, type AnalyzerBase } from '../services/analyzerBase';

/** Cache key for the shared Overview / Agents snapshot. */
export const ANALYZER_BASE_KEY = [...queryKeys.all, 'analyzer-base'] as const;

/**
 * Subscribes to the shared all-time analyzer snapshot and projects it for the
 * active time period. All Overview cards and the Agents grid share one fetch.
 */
export function useAnalyzerBase<T>(derive: (base: AnalyzerBase, from: string, to: string) => T) {
  const { timePeriod, customStartDate, customEndDate } = useFilterContext();
  const { from, to } = timePeriodToIsoRange(timePeriod, customStartDate, customEndDate);
  const select = useCallback((base: AnalyzerBase) => derive(base, from, to), [derive, from, to]);

  return useQuery<AnalyzerBase, Error, T>({
    queryKey: ANALYZER_BASE_KEY,
    queryFn: fetchAnalyzerBase,
    select,
    staleTime: 60_000,
    gcTime: 300_000,
  });
}
