/**
 * Helpers for the "Custom range" date filter shared by the Change history and
 * All agents views. Dates are handled as local-time `YYYY-MM-DD` strings so the
 * value round-trips through `<input type="date">` without a timezone shift.
 */

const DAY_MS = 86_400_000;

/** Formats a Date as a local-time `YYYY-MM-DD` string. */
export function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Dataverse audit rows are purged beyond this age, so anything older simply has
 * no data to show. The picker is clamped to this window to avoid empty results.
 */
export const AUDIT_RETENTION_DAYS = 30;

/** Selectable bounds: the oldest retained day through today. */
export function retentionWindow(now: number): { min: string; max: string } {
  return {
    min: toIsoDate(new Date(now - AUDIT_RETENTION_DAYS * DAY_MS)),
    max: toIsoDate(new Date(now)),
  };
}

/**
 * A custom range as edited in the dialog: local-time `YYYY-MM-DD` dates plus
 * `HH:mm` times, so each value round-trips through its input without a timezone
 * shift.
 */
export interface CustomRange {
  from: string;
  to: string;
  fromTime: string;
  toTime: string;
}

/** Start of day / end of day, used when a time is left blank. */
const DAY_START = '00:00';
const DAY_END = '23:59';

/** Seeds the picker with the full retained window, covering whole days. */
export function defaultCustomRange(now: number): CustomRange {
  const { min, max } = retentionWindow(now);
  return { from: min, to: max, fromTime: DAY_START, toTime: DAY_END };
}

/** An empty range, used when clearing filters. */
export function emptyCustomRange(): CustomRange {
  return { from: '', to: '', fromTime: '', toTime: '' };
}

/** Whether both ends of the range are set enough to filter with. */
export function isCustomRangeComplete(range: CustomRange): boolean {
  return Boolean(range.from && range.to);
}

/**
 * Clamps a `YYYY-MM-DD` value into the retained window. ISO dates sort
 * lexicographically, so string comparison is safe here. Empty or malformed
 * values pass through so the caller can keep showing a cleared field.
 */
export function clampIsoDate(value: string, min: string, max: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Parses `YYYY-MM-DD` as local midnight; returns null when malformed. */
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Public form of {@link parseIsoDate}, for binding to a Fluent `DatePicker`. */
export function fromIsoDate(value: string): Date | undefined {
  return parseIsoDate(value) ?? undefined;
}

/** Selectable bounds as `Date`s, for a `DatePicker`'s minDate/maxDate. */
export function retentionWindowDates(now: number): { min: Date; max: Date } {
  const atMidnight = (time: number) => {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  return {
    min: atMidnight(now - AUDIT_RETENTION_DAYS * DAY_MS),
    max: atMidnight(now),
  };
}

/** Parses `HH:mm`; returns null when absent or malformed. */
function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Inclusive millisecond bounds for a range.
 *
 * Times are applied when supplied; otherwise the range covers whole days —
 * 00:00:00.000 on `from` through 23:59:59.999 on `to`. A missing or malformed
 * date becomes an open bound.
 */
export function customRangeBounds(range: CustomRange): {
  start: number | null;
  end: number | null;
} {
  const startDate = parseIsoDate(range.from);
  const endDate = parseIsoDate(range.to);

  let start: number | null = null;
  if (startDate) {
    const time = parseTime(range.fromTime);
    startDate.setHours(time?.hours ?? 0, time?.minutes ?? 0, 0, 0);
    start = startDate.getTime();
  }

  let end: number | null = null;
  if (endDate) {
    const time = parseTime(range.toTime);
    // An explicit end time includes that whole minute; with no time the range
    // runs to the last millisecond of the day.
    if (time) endDate.setHours(time.hours, time.minutes, 59, 999);
    else endDate.setHours(23, 59, 59, 999);
    end = endDate.getTime();
  }

  return { start, end };
}

/** Whole days covered by an inclusive range, or null when incomplete. */
export function customRangeDays(range: CustomRange): number | null {
  const { start, end } = customRangeBounds(range);
  if (start === null || end === null || end < start) return null;
  return Math.max(1, Math.round((end - start) / DAY_MS));
}

/**
 * Compact button label, e.g. `Jul 18 – Aug 17`. The year is appended only when
 * the range spans two calendar years, keeping the filter bar narrow. Times are
 * appended only when they narrow the range to less than whole days.
 */
export function formatCustomRangeLabel(range: CustomRange): string {
  const start = parseIsoDate(range.from);
  const end = parseIsoDate(range.to);
  if (!start || !end) return 'Custom range';

  const sameYear = start.getFullYear() === end.getFullYear();
  const format = (date: Date, withYear: boolean) =>
    date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });

  // Whole-day ranges are the common case and read better without "00:00".
  const wholeDays =
    (range.fromTime === '' || range.fromTime === DAY_START) &&
    (range.toTime === '' || range.toTime === DAY_END);

  const left = `${format(start, !sameYear)}${wholeDays ? '' : ` ${range.fromTime}`}`;
  const right = `${format(end, !sameYear)}${wholeDays ? '' : ` ${range.toTime}`}`;
  return `${left} – ${right}`;
}
