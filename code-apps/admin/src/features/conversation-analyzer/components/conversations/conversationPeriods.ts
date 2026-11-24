export type ConversationPeriod = 'last7' | 'last30' | 'last90' | 'custom';

/** Inclusive custom date range as local calendar dates (`YYYY-MM-DD`). */
export interface ConversationDateRange {
  start: string;
  end: string;
}

/** Time periods offered by the Conversations tab (CV-3); 30 days is the default. */
export const CONVERSATION_PERIODS: { value: ConversationPeriod; label: string; days?: number }[] = [
  { value: 'last7', label: 'Last 7 days', days: 7 },
  { value: 'last30', label: 'Last 30 days', days: 30 },
  { value: 'last90', label: 'Last 90 days', days: 90 },
  { value: 'custom', label: 'Custom range' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Formats a Date as a local `YYYY-MM-DD` calendar date. */
export function toLocalDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses a local `YYYY-MM-DD` calendar date to local midnight; undefined when malformed. */
export function fromLocalDateKey(key: string | undefined): Date | undefined {
  const match = key ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null;
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Default custom range: the last 30 days, ending today. */
export function defaultDateRange(): ConversationDateRange {
  const end = new Date();
  return { start: toLocalDateKey(new Date(end.getTime() - 30 * DAY_MS)), end: toLocalDateKey(end) };
}

/**
 * Query window for a period: `since` is inclusive, `until` exclusive (start of the day after the
 * custom end date). Presets start at local midnight so the query key stays stable within a day.
 */
export function periodWindow(period: ConversationPeriod, range: ConversationDateRange): { since: string; until?: string } {
  if (period === 'custom') {
    const start = fromLocalDateKey(range.start) ?? new Date();
    const end = fromLocalDateKey(range.end) ?? new Date();
    const until = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    return { since: start.toISOString(), until: until.toISOString() };
  }
  const days = CONVERSATION_PERIODS.find((p) => p.value === period)?.days ?? 30;
  const start = new Date(Date.now() - days * DAY_MS);
  start.setHours(0, 0, 0, 0);
  return { since: start.toISOString() };
}

const shortDate = (key: string) =>
  fromLocalDateKey(key)?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) ?? key;

/** Display label for a period, e.g. "Last 30 days" or "Mar 1, 2026 \u2013 Mar 5, 2026". */
export function periodLabel(period: ConversationPeriod, range: ConversationDateRange): string {
  if (period === 'custom') return `${shortDate(range.start)} \u2013 ${shortDate(range.end)}`;
  return CONVERSATION_PERIODS.find((p) => p.value === period)?.label ?? '';
}
