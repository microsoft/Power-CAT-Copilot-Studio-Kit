/**
 * Duration formatting for the design surfaces (`fmtMs` in
 * `design/assets/workspace.js:112`).
 *
 * The host's shared `formatDuration()` renders `205ms` / `6.3s` / `1m 50s`.
 * The approved design renders `205 ms` / `6.30 s` / `1m 50s` — a space before
 * the unit and two decimal places for sub-minute values, which is what every
 * waterfall row, tick label and metric in the prototype shows. Keeping this
 * separate leaves `formatDuration()` untouched for the host-derived components
 * that are still byte-identical to the source.
 *
 *   < 1s     -> "205 ms"
 *   < 1m     -> "6.30 s"
 *   >= 1m    -> "1m 50s"
 *   nullish  -> "—"
 */
export function fmtMs(value: number | null | undefined): string {
  if (!value && value !== 0) return '\u2014';
  if (!Number.isFinite(value)) return '\u2014';
  const v = Math.max(0, value);
  if (v < 1000) return `${Math.round(v)} ms`;
  if (v < 60000) return `${(v / 1000).toFixed(2)} s`;
  const m = Math.floor(v / 60000);
  const s = Math.round((v % 60000) / 1000);
  return `${m}m ${s}s`;
}
