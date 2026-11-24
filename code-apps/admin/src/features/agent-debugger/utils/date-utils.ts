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
