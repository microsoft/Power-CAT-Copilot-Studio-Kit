/**
 * Date Formatting Utilities
 *
 * Provides consistent date formatting across the Agent Review Tool.
 * Uses Intl.DateTimeFormat for localization support.
 */

/**
 * Format date to localized string
 *
 * @param date - Date to format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 *
 * @example
 * ```ts
 * formatDate(new Date('2026-02-26'))
 * // Returns "Feb 26, 2026" (en-US locale)
 * ```
 */
export function formatDate(
  date: Date | string | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '--';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return '--';
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  };

  return new Intl.DateTimeFormat('en-US', defaultOptions).format(dateObj);
}

/**
 * Format date with time
 *
 * @param date - Date to format
 * @returns Formatted date and time string
 *
 * @example
 * ```ts
 * formatDateTime(new Date('2026-02-26T15:30:00'))
 * // Returns "Feb 26, 2026, 3:30 PM"
 * ```
 */
export function formatDateTime(
  date: Date | string | undefined | null
): string {
  if (!date) return '--';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dateObj);
}

/**
 * Format date as relative time (e.g., "2 hours ago", "Yesterday")
 *
 * @param date - Date to format
 * @returns Relative time string
 *
 * @example
 * ```ts
 * formatRelativeDate(new Date(Date.now() - 60 * 60 * 1000))
 * // Returns "1 hour ago"
 *
 * formatRelativeDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
 * // Returns "Yesterday"
 * ```
 */
export function formatRelativeDate(
  date: Date | string | undefined | null
): string {
  if (!date) return '--';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return '--';
  }

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  // Future dates
  if (diffMs < 0) {
    return formatDate(dateObj);
  }

  // Less than 1 minute
  if (diffSec < 60) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diffMin < 60) {
    return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  }

  // Less than 24 hours
  if (diffHour < 24) {
    return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  }

  // Less than 7 days
  if (diffDay < 7) {
    if (diffDay === 1) return 'Yesterday';
    return `${diffDay} days ago`;
  }

  // More than 7 days - show full date
  return formatDate(dateObj);
}

/**
 * Get ISO date string (YYYY-MM-DD)
 *
 * @param date - Date to format
 * @returns ISO date string
 *
 * @example
 * ```ts
 * getDateString(new Date('2026-02-26T15:30:00'))
 * // Returns "2026-02-26"
 * ```
 */
export function getDateString(
  date: Date | string | undefined | null
): string {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  return dateObj.toISOString().split('T')[0];
}

/**
 * Format duration in milliseconds to human-readable string
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted duration string
 *
 * @example
 * ```ts
 * formatDuration(65000) // Returns "1m 5s"
 * formatDuration(3665000) // Returns "1h 1m 5s"
 * ```
 */
export function formatDuration(durationMs: number): string {
  if (durationMs < 0) return '0s';

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const s = seconds % 60;
  const m = minutes % 60;
  const h = hours;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);

  return parts.join(' ');
}

/**
 * Check if date is today
 *
 * @param date - Date to check
 * @returns True if date is today
 */
export function isToday(date: Date | string | undefined | null): boolean {
  if (!date) return false;

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return false;
  }

  const today = new Date();
  return (
    dateObj.getDate() === today.getDate() &&
    dateObj.getMonth() === today.getMonth() &&
    dateObj.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if date is within last N days
 *
 * @param date - Date to check
 * @param days - Number of days
 * @returns True if date is within last N days
 */
export function isWithinDays(
  date: Date | string | undefined | null,
  days: number
): boolean {
  if (!date) return false;

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return false;
  }

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays >= 0 && diffDays <= days;
}
