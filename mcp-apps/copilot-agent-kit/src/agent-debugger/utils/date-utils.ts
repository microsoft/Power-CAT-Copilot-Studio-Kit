/**
 * Shared date formatting utilities for the Agent Debugger feature.
 */

/** Formats an ISO date string as a short date (e.g. "Mar 25, 2026"). */
export function formatDate(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Formats a session start in the viewer's local time zone (e.g. "Mar 25, 3:45 PM").
 * The server `startText` has no time zone label, so it is only the fallback for a missing or invalid `startTimeUtc`.
 */
export function formatSessionStart(session: { startTimeUtc?: string; startText?: string }): string {
  const date = session.startTimeUtc ? new Date(session.startTimeUtc) : undefined;
  if (date && !Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  }
  return session.startText ?? "";
}

/** Formats an ISO date string as a short date with time (e.g. "Mar 25, 2026, 3:45 PM"). */
export function formatDateTime(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
