/**
 * Metric Calculations - Trend analysis, formatting, and safe arithmetic.
 *
 * All formatting functions produce locale-friendly strings.
 * calculateTrend uses an isNewMetric sentinel when previous is 0
 * (per m-10 — avoids misleading "100%" display).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrendResult {
  percentageChange: number;
  direction: "up" | "down" | "neutral";
  isSignificant: boolean;
  isNewMetric: boolean;
}

// ---------------------------------------------------------------------------
// Trend Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate trend between current and previous period values.
 *
 * When previous is 0 and current > 0, returns isNewMetric: true with
 * percentageChange: 0 (NOT 100%) so the UI can show "New" instead of
 * a misleading percentage.
 */
export function calculateTrend(
  current: number,
  previous: number
): TrendResult {
  if (previous === 0 && current === 0) {
    return {
      percentageChange: 0,
      direction: "neutral",
      isSignificant: false,
      isNewMetric: false,
    };
  }

  if (previous === 0 && current > 0) {
    return {
      percentageChange: 0,
      direction: "up",
      isSignificant: true,
      isNewMetric: true,
    };
  }

  if (previous === 0 && current < 0) {
    return {
      percentageChange: 0,
      direction: "down",
      isSignificant: true,
      isNewMetric: true,
    };
  }

  const change = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(change * 10) / 10;

  let direction: "up" | "down" | "neutral";
  if (rounded > 0) direction = "up";
  else if (rounded < 0) direction = "down";
  else direction = "neutral";

  return {
    percentageChange: rounded,
    direction,
    isSignificant: Math.abs(rounded) >= 1,
    isNewMetric: false,
  };
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/**
 * Weighted average that safely handles zero weight.
 * Returns 0 when totalWeight is 0 to avoid division by zero.
 */
export function weightedAverage(
  totalValue: number,
  totalWeight: number
): number {
  if (totalWeight === 0) return 0;
  return totalValue / totalWeight;
}

/**
 * Safe division with fallback for zero denominator.
 * Defaults to 0 if no fallback provided.
 */
export function safeDiv(
  numerator: number,
  denominator: number,
  fallback: number = 0
): number {
  if (denominator === 0) return fallback;
  return numerator / denominator;
}

// ---------------------------------------------------------------------------
// Unit Selection
// ---------------------------------------------------------------------------

export interface DurationUnit {
  divisor: number;
  unit: string;
  decimals: number;
}

/**
 * Choose the best display unit for a set of millisecond values.
 * Pass the maximum average ms value across all items in the chart.
 *   < 1 000 ms  → show as ms  (0 decimals)
 *   < 60 000 ms → show as s   (1 decimal)
 *   >= 60 000   → show as min (1 decimal)
 */
export function chooseDurationUnit(maxMs: number): DurationUnit {
  if (maxMs < 1000) return { divisor: 1, unit: "ms", decimals: 0 };
  if (maxMs < 60_000) return { divisor: 1000, unit: "s", decimals: 1 };
  return { divisor: 60_000, unit: "min", decimals: 1 };
}

/** Convert a ms value using a DurationUnit. */
export function convertDuration(ms: number, du: DurationUnit): number {
  const factor = Math.pow(10, du.decimals);
  return Math.round((ms / du.divisor) * factor) / factor;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format a number with locale-aware grouping and max 1 decimal place. */
export function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Format a number in compact notation for constrained spaces (e.g., donut center). */
export function formatCompact(n: number): string {
  if (n < 100_000) return n.toLocaleString();
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
}

/** Format a number as a percentage string with configurable decimal places. */
export function formatPercentage(n: number, decimals: number = 1): string {
  return `${n.toFixed(decimals)}%`;
}

/**
 * Convert milliseconds to a human-readable duration string.
 * Examples: "2m 30s", "1h 15m", "500ms", "0ms"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const roundedSec = Math.round(seconds);
    return roundedSec > 0 ? `${minutes}m ${roundedSec}s` : `${minutes}m`;
  }
  return `${parseFloat(seconds.toFixed(1))}s`;
}

/**
 * Format response time with appropriate unit (ms for < 1000, s otherwise).
 * Shows 1 decimal for seconds.
 */
export function formatResponseTime(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}
