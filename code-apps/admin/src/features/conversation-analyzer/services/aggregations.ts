/**
 * Client-side aggregation helpers for the Conversation Analyzer.
 *
 * `cat_conversationanalyzer` rows are fetched in full (via the typed service
 * with `paginatedFetchAll`) and reduced in memory. The plan defers the
 * decision on server-side OData `$apply=groupby/aggregate` until Phase 1,
 * once we know whether the Dataverse env supports it for this table.
 */

export function countBy<T, K extends string>(rows: T[], keyFn: (row: T) => K | undefined): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const row of rows) {
    const k = keyFn(row);
    if (k == null) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function countDistinct<T>(rows: T[], keyFn: (row: T) => string | undefined): number {
  const set = new Set<string>();
  for (const row of rows) {
    const k = keyFn(row);
    if (k) set.add(k);
  }
  return set.size;
}

export function average<T>(rows: T[], valueFn: (row: T) => number | undefined): number {
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    const v = valueFn(row);
    if (typeof v === 'number' && !Number.isNaN(v)) {
      sum += v;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

export function groupBy<T, K extends string>(rows: T[], keyFn: (row: T) => K | undefined): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const row of rows) {
    const k = keyFn(row);
    if (k == null) continue;
    (out[k] ??= []).push(row);
  }
  return out;
}
