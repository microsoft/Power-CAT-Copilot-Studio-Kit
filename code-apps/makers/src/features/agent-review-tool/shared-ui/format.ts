/**
 * Formatting shared by every result surface.
 *
 * Kept free of React so it can be unit tested in this app's `node` test environment, and so the
 * rules live in one place. There are two apps rendering the same numbers; a duration shown as
 * "15.2 s" in one and "15200 ms" in the other makes two screens look like two products.
 */

/** Coarse health band for a 0-100 score. Drives colour only. */
export type ScoreTone = 'good' | 'fair' | 'poor';

/** Thousands separators only — these are counts, and locale grouping is all they need. */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : '—';
}

/**
 * Milliseconds as the largest unit that stays readable.
 *
 * Sub-second timings keep millisecond precision because that is the range where tool latency is
 * actually compared; above a second a single decimal is enough, and "15.2 s" beats "15200 ms".
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

/** One decimal, with no trailing ".0" — "9%" rather than "9.0%". */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** "1 occurrence" / "2 occurrences" — the singular matters because counts of one are common. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

/** 80 and above reads as healthy, 60 and above as needing attention, below that as failing. */
export function toneForScore(score: number | undefined): ScoreTone {
  if (score === undefined || !Number.isFinite(score)) return 'fair';
  if (score >= 80) return 'good';
  if (score >= 60) return 'fair';
  return 'poor';
}
