// Default dashboard configuration for first-run bootstrap.
// Defines the 4 starter metrics that appear on the auto-created "Overview" dashboard
// and their positions on the 12-column grid (2×2 layout, 6 cols each).
// Covers Adoption, Performance, and Conversations categories.

import type { CardInstance, VisualizationType } from '../types';

export interface DefaultCardDef {
  /** Canonical key: sourceTable.sourceField.aggregation — used to resolve metric ID */
  canonicalKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
  overrideViz?: VisualizationType;
}

/**
 * Default dashboard cards for first-run bootstrap (4 metrics).
 * Covers Adoption (2), Performance (1), and Conversations (1).
 *
 * Layout (2×2 grid, 6 cols each):
 *   Row 1: Daily Conversations (Line) | Daily Unique Users (Line)
 *   Row 2: Tool Success Rate (KPI)   | Topic Trigger Count (Bar)
 */
export const DEFAULT_DASHBOARD_CARDS: DefaultCardDef[] = [
  // Row 1 — Adoption trends
  { canonicalKey: 'cat_dailymetrics.cat_dailyconversationcount.Sum', x: 0, y: 0, w: 6, h: 6, overrideViz: 'Line' },
  { canonicalKey: 'cat_dailymetrics.cat_dailyuniqueusers.Sum', x: 6, y: 0, w: 6, h: 6, overrideViz: 'Line' },

  // Row 2 — Health & intent
  { canonicalKey: 'cat_toolmetrics.cat_successrate.Average', x: 0, y: 6, w: 6, h: 6, overrideViz: 'KPI' },
  { canonicalKey: 'cat_topicmetrics.cat_triggercount.Sum', x: 6, y: 6, w: 6, h: 6, overrideViz: 'Bar' },
];

/**
 * Builds CardInstance[] from the default card definitions using a key-to-ID map.
 * Cards that cannot resolve to a valid metric ID are silently skipped.
 */
export function buildDefaultCards(keyToId: Map<string, string>): CardInstance[] {
  const cards: CardInstance[] = [];
  for (const def of DEFAULT_DASHBOARD_CARDS) {
    const metricId = keyToId.get(def.canonicalKey);
    if (!metricId) {
      console.warn(`[AMS] Default dashboard: skipping card — no metric found for key "${def.canonicalKey}"`);
      continue;
    }
    cards.push({
      instanceId: 'c_' + Math.random().toString(36).slice(2, 10),
      metricId,
      x: def.x,
      y: def.y,
      w: def.w,
      h: def.h,
      overrideViz: def.overrideViz,
    });
  }
  return cards;
}
