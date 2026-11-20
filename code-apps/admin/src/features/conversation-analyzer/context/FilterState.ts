/**
 * Filter state factory + date-range resolver for the Conversation Analyzer.
 *
 * Default values are computed fresh on each call so date math never goes stale
 * between renders.
 */

import type { FilterState, DateFilter, TimePeriod } from '../contracts/types';
import { TIME_PERIOD_OPTIONS, DEFAULT_TIME_PERIOD, STORAGE_KEYS } from '../contracts/constants';
import { readStoredValue, writeStoredValue } from '../hooks/usePersistentState';

type StoredTimeFilter = Pick<FilterState, 'timePeriod' | 'customStartDate' | 'customEndDate'>;

/** Restores the remembered time period (G-3); invalid stored values fall back to the default. */
function readStoredTimeFilter(): StoredTimeFilter {
  const stored = readStoredValue<Partial<StoredTimeFilter> | null>(STORAGE_KEYS.timeFilter, null);
  const isKnown = TIME_PERIOD_OPTIONS.some((o) => o.value === stored?.timePeriod);
  return {
    timePeriod: isKnown ? (stored?.timePeriod as TimePeriod) : DEFAULT_TIME_PERIOD,
    customStartDate: typeof stored?.customStartDate === 'string' ? stored.customStartDate : '',
    customEndDate: typeof stored?.customEndDate === 'string' ? stored.customEndDate : '',
  };
}

/** Remembers the time period between visits. */
export function persistTimeFilter(filter: StoredTimeFilter): void {
  writeStoredValue<StoredTimeFilter>(STORAGE_KEYS.timeFilter, filter);
}

export function getDefaultFilters(): FilterState {
  return {
    activeTab: 'overview',
    ...readStoredTimeFilter(),
  };
}

export function getDateFilter(state: FilterState): DateFilter {
  const now = new Date();
  const endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

  if (state.timePeriod === 'custom') {
    const start = state.customStartDate
      ? new Date(state.customStartDate)
      : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const end = state.customEndDate ? new Date(state.customEndDate) : endDate;
    return { startDate: start, endDate: end };
  }

  const option = TIME_PERIOD_OPTIONS.find((o) => o.value === state.timePeriod);
  const daysBack = option?.daysBack ?? 7;
  const startDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (daysBack - 1),
  );

  return { startDate, endDate };
}
