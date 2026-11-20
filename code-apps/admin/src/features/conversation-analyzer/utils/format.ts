import type { PromptRow } from '../contracts/types';

/**
 * Formatting utilities for the Conversation Analyzer feature.
 *
 * Extracts common date/time and duration formatters used across
 * multiple table components to avoid duplication.
 */

/** Format an ISO date string to locale date (date only). Returns '' for invalid/empty. */
export function formatDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}

/** Format an ISO date string to locale date+time. Returns '' for invalid/empty. */
export function formatDateTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

/** Format a duration in seconds to a human-readable short form (e.g. "45s", "3m"). */
export function formatSeconds(value?: number): string {
  if (value == null) return '';
  if (value < 60) return `${value}s`;
  return `${Math.round(value / 60)}m`;
}

/** Format a duration in seconds to a descriptive form (e.g. "45 secs", "3m 12s"). */
export function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)} secs`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Format a duration in seconds compactly (e.g. "56s", "1m 21s", "1h 2m"). */
export function formatCompactDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

/** Format an ISO date string with a short month (e.g. "Oct 27, 2026, 2:44 PM"). Returns '' for invalid/empty. */
export function formatShortDateTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Display label for a prompt row. */
export function getPromptLabel(prompt: Pick<PromptRow, 'name' | 'displayName'>): string {
  return prompt.displayName ?? prompt.name;
}
