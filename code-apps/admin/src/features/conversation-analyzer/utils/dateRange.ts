/**
 * Date-range helpers for the Conversation Analyzer.
 *
 * Provides ISO-string boundaries derived from a {@link TimePeriod}, suitable
 * for embedding into OData `$filter` clauses against `createdon`.
 */

import type { TimePeriod, AnalyzerFilter } from '../contracts/types';
import { TIME_PERIOD_OPTIONS } from '../contracts/constants';

export interface IsoDateRange {
  from: string;
  to: string;
}

/** Convert a {@link TimePeriod} (and optional custom range) into ISO from/to. */
export function timePeriodToIsoRange(
  period: TimePeriod,
  customStart?: string,
  customEnd?: string,
): IsoDateRange {
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

  if (period === 'custom') {
    const start = customStart ? new Date(customStart) : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const end = customEnd ? new Date(customEnd) : endDate;
    return { from: start.toISOString(), to: end.toISOString() };
  }

  const option = TIME_PERIOD_OPTIONS.find((o) => o.value === period);
  const daysBack = option?.daysBack ?? 7;
  const startDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (daysBack - 1),
  );
  return { from: startDate.toISOString(), to: endDate.toISOString() };
}

/** Build the `createdon` clause of an OData filter from an {@link AnalyzerFilter}. */
export function createdOnFilterClause(filter: Pick<AnalyzerFilter, 'startDate' | 'endDate'>): string {
  return `createdon ge ${filter.startDate} and createdon le ${filter.endDate}`;
}
