/**
 * Shared time-duration formatting for the Agent Debugger.
 *
 * Single source of truth so every duration display (conversation overview,
 * performance waterfall, topic flow, connected agents) formats consistently and
 * stays readable across the full range from milliseconds to days.
 */

/**
 * Format a millisecond duration as a compact, human-readable string that scales
 * with magnitude so long durations stay readable:
 * - `< 1s`   -> `"850ms"`
 * - `< 1m`   -> `"8.5s"` / `"42s"`
 * - `< 1h`   -> `"3m 20s"` / `"3m"`
 * - `< 1d`   -> `"2h 15m"` / `"2h"`
 * - `>= 1d`  -> `"1d 6h"` / `"1d"`
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;

  const totalSeconds = ms / 1000;

  // Sub-minute: keep sub-second precision for short durations.
  if (totalSeconds < 60) {
    const secondsLabel =
      totalSeconds < 10
        ? totalSeconds.toFixed(1).replace(/\.0$/, "")
        : String(Math.round(totalSeconds));
    // Guard the 59.95s -> "60" rounding edge; fall through to the m/s branch.
    if (secondsLabel !== "60") return `${secondsLabel}s`;
  }

  // Use whole seconds for m/h/d to avoid 60s / 60m carry artifacts.
  const whole = Math.round(totalSeconds);
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
