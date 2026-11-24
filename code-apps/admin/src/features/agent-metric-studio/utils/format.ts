export function formatNumber(v: number | null | undefined, unit?: string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  let s: string;
  if (abs >= 1_000_000) s = (v / 1_000_000).toFixed(1) + 'M';
  else if (abs >= 1_000) s = (v / 1_000).toFixed(1) + 'K';
  else if (abs < 1 && abs > 0) s = v.toFixed(2);
  else s = v.toFixed(0);
  if (unit === '%') return s + '%';
  if (unit === '$') return '$' + s;
  if (unit === 'ms') return s + ' ms';
  if (unit) return s + ' ' + unit;
  return s;
}

export function formatDelta(delta?: number): { text: string; positive: boolean | null } {
  if (delta === undefined || delta === null || Number.isNaN(delta)) return { text: '—', positive: null };
  const sign = delta > 0 ? '+' : '';
  return { text: `${sign}${delta.toFixed(1)}%`, positive: delta > 0 ? true : delta < 0 ? false : null };
}
