export type UsageRangeKey =
  | 'month-to-date'
  | 'previous-month'
  | 'two-months-ago'
  | 'last-three-months'
  | 'last-six-months';

export interface UsageDateRange {
  key: UsageRangeKey;
  label: string;
  start: Date;
  endExclusive: Date;
  comparisonStart: Date;
  comparisonEndExclusive: Date;
  comparisonAvailable: boolean;
  unbounded: boolean;
}

function calendarDate(year: number, month: number, day: number) {
  return new Date(year, month, day);
}

function startOfDay(value: Date) {
  return calendarDate(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfMonth(value: Date, monthOffset = 0) {
  return calendarDate(value.getFullYear(), value.getMonth() + monthOffset, 1);
}

export function addCalendarDays(value: Date, days: number) {
  return calendarDate(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

function shiftCalendarMonths(value: Date, months: number) {
  const targetMonthStart = calendarDate(value.getFullYear(), value.getMonth() + months, 1);
  const targetMonthEnd = calendarDate(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0,
  );
  return calendarDate(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth(),
    Math.min(value.getDate(), targetMonthEnd.getDate()),
  );
}

function buildRange(
  key: UsageRangeKey,
  label: string,
  start: Date,
  endExclusive: Date,
  comparisonMonths: number,
  retainedStart: Date,
  unbounded = false,
): UsageDateRange {
  const comparisonStart = shiftCalendarMonths(start, -comparisonMonths);
  const comparisonEndExclusive = shiftCalendarMonths(endExclusive, -comparisonMonths);
  return {
    key,
    label,
    start,
    endExclusive,
    comparisonStart,
    comparisonEndExclusive,
    comparisonAvailable: !unbounded && comparisonStart >= retainedStart,
    unbounded,
  };
}

/** Builds localized calendar ranges from one captured local date. */
export function getUsageDateRanges(asOf: Date, locale?: string): UsageDateRange[] {
  const today = startOfDay(asOf);
  const tomorrow = addCalendarDays(today, 1);
  const currentMonth = startOfMonth(today);
  const previousMonth = startOfMonth(today, -1);
  const twoMonthsAgo = startOfMonth(today, -2);
  const threeMonthsAgo = shiftCalendarMonths(today, -3);
  const retainedStart = startOfMonth(today, -5);
  const monthLabel = (value: Date) => value.toLocaleDateString(locale, { month: 'long' });

  return [
    buildRange('month-to-date', 'Month to date', currentMonth, tomorrow, 1, retainedStart),
    buildRange('previous-month', monthLabel(previousMonth), previousMonth, currentMonth, 1, retainedStart),
    buildRange('two-months-ago', monthLabel(twoMonthsAgo), twoMonthsAgo, previousMonth, 1, retainedStart),
    buildRange('last-three-months', 'Last three months', threeMonthsAgo, tomorrow, 3, retainedStart),
    buildRange('last-six-months', 'Last six months', retainedStart, tomorrow, 6, retainedStart, true),
  ];
}

/** Parses source dates without applying a UTC shift to date-only values. */
export function parseUsageDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:$|T00:00:00(?:\.000)?Z?$)/.exec(value.trim());
  if (dateOnly) {
    const parsed = calendarDate(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
    return parsed.getFullYear() === Number(dateOnly[1])
      && parsed.getMonth() === Number(dateOnly[2]) - 1
      && parsed.getDate() === Number(dateOnly[3])
      ? parsed
      : undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : startOfDay(parsed);
}

export function isDateInRange(value: Date, range: Pick<UsageDateRange, 'start' | 'endExclusive'>) {
  return value >= range.start && value < range.endExclusive;
}

export function startOfUsageWeek(value: Date) {
  const day = value.getDay();
  return addCalendarDays(value, -(day === 0 ? 6 : day - 1));
}

export function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
