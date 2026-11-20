/**
 * Format a number in compact form (e.g., 98016 → "98,016" or "98k").
 * Uses locale-aware formatting with compact notation for large numbers.
 */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 10000) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US').format(value);
}
