/**
 * Date Formatting - Date range calculation, OData formatting, gap filling.
 *
 * Does NOT include toUTCTimezone (per m-12 — use Date.toISOString() directly).
 * validateDate is defined here as the single source (per m-13 — not duplicated).
 */

import { DATE_RANGE_OPTIONS } from "../contracts/types";

// ---------------------------------------------------------------------------
// Date Range Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate start and end dates from a preset range identifier.
 * End date is today at end-of-day. Start date is daysBack before today.
 * Falls back to 90 days if the preset is not found.
 */
export function calculateDateRange(preset: string): {
  start: Date;
  end: Date;
} {
  const now = new Date();
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );

  const option = DATE_RANGE_OPTIONS.find((o) => o.value === preset);
  const daysBack = option?.daysBack ?? 90;

  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysBack
  );

  return { start, end };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD for OData filter values. */
export function formatDateForOData(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format a Date for user-facing display using the browser locale. */
export function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Gap Filling
// ---------------------------------------------------------------------------

/**
 * Fill missing days in a dataset with factory-created zero records.
 *
 * Iterates from startDate to endDate. For each day, if no record exists
 * in data whose dateKey matches that day's YYYY-MM-DD string, a new
 * record is created via the factory function.
 *
 * @param data - Existing records (may have gaps)
 * @param startDate - Inclusive start of the range
 * @param endDate - Inclusive end of the range
 * @param dateKey - Property on T that contains the date string
 * @param factory - Creates a zero-value record for a given date string
 * @returns Sorted array with no gaps
 */
export function fillMissingDays<T>(
  data: T[],
  startDate: Date,
  endDate: Date,
  dateKey: keyof T,
  factory: (date: string) => T
): T[] {
  const existingDates = new Set(
    data.map((item) => {
      const raw = item[dateKey];
      if (typeof raw === "string") {
        return raw.substring(0, 10);
      }
      return String(raw);
    })
  );

  const result: T[] = [...data];
  const current = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );
  const end = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );

  while (current <= end) {
    const dateStr = formatDateForOData(current);
    if (!existingDates.has(dateStr)) {
      result.push(factory(dateStr));
    }
    current.setDate(current.getDate() + 1);
  }

  result.sort((a, b) => {
    const aDate = String(a[dateKey]).substring(0, 10);
    const bDate = String(b[dateKey]).substring(0, 10);
    return aDate.localeCompare(bDate);
  });

  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a date string. Returns true if the string can be parsed into
 * a valid Date. Shared single source of truth (per m-13).
 */
export function validateDate(dateStr: string): boolean {
  if (!dateStr || dateStr.trim() === "") return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}
