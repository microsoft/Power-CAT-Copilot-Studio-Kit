/**
 * Chart helper utilities shared across overview chart hooks.
 *
 * Extracted from useOverviewCharts to enable reuse and keep hooks focused.
 */

import type { DonutDataItem } from "../components/charts/FluentDonutChart";
import { CHART_COLORS_ARRAY } from "../contracts/types";

/** Aggregate values by a derived key, summing duplicates into a Map. */
export function aggregateByKey<T>(
  items: T[],
  keyFn: (item: T) => string,
  valueFn: (item: T) => number
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + valueFn(item));
  }
  return map;
}

/** Sort a Map by descending value and return the top N entries. */
export function topN(map: Map<string, number>, n: number): [string, number][] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/** Convert [label, value] entries into DonutDataItem[] with cycling colors. */
export function toDonutItems(entries: [string, number][]): DonutDataItem[] {
  return entries.map(([legend, data], idx) => ({
    legend,
    data,
    color: CHART_COLORS_ARRAY[idx % CHART_COLORS_ARRAY.length],
  }));
}
