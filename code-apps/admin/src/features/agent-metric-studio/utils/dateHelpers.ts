import type { TimeRange } from '../types';
import { subDays, startOfDay, endOfDay, format, parseISO, differenceInDays } from 'date-fns';

export interface ResolvedRange {
  from: Date;
  to: Date;
  label: string;
}

export function resolveTimeRange(range: TimeRange, now: Date = new Date()): ResolvedRange {
  const to = endOfDay(now);
  switch (range.preset) {
    case '7d':  return { from: startOfDay(subDays(now, 7)),  to, label: 'Last 7 days' };
    case '30d': return { from: startOfDay(subDays(now, 30)), to, label: 'Last 30 days' };
    case '90d': return { from: startOfDay(subDays(now, 90)), to, label: 'Last 90 days' };
    case 'ytd': return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to, label: 'Year to date' };
    case 'custom':
      return {
        from: range.from ? startOfDay(parseISO(range.from)) : startOfDay(subDays(now, 30)),
        to:   range.to   ? endOfDay(parseISO(range.to))     : to,
        label: `${range.from ?? ''} → ${range.to ?? ''}`,
      };
  }
}

export function priorRange(range: ResolvedRange): ResolvedRange {
  const days = Math.max(1, differenceInDays(range.to, range.from));
  return {
    from: subDays(range.from, days),
    to:   subDays(range.to,   days),
    label: 'Prior period',
  };
}

export function formatIsoDay(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function formatShort(d: Date): string {
  return format(d, 'MMM d');
}
