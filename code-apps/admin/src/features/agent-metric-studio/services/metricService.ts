// Loads metric definitions from cat_metricdefinition, caches them,
// and fetches metric data from the configured source table.

import { dv } from './dataverseClient';
import { buildOwnerFilter, getCachedUserId } from './userContextService';
import type {
  MetricDefinition, MetricDataset, TimeSeriesPoint, CategoricalPoint,
  FilterState, AggregationType,
} from '../types';
import { resolveTimeRange, priorRange } from '../utils/dateHelpers';
import { allSuggestedMetrics } from './suggestedMetrics';
import { DEFAULT_DASHBOARD_CARDS } from './defaultDashboard';

const CHOICE_CATEGORY: Record<number, MetricDefinition['category']> = {
  10000: 'Conversations', 10001: 'Quality', 10002: 'Adoption',
  10003: 'Performance', 10004: 'Cost', 10005: 'Errors',
};

function categoryToCode(category: string): number {
  const entry = Object.entries(CHOICE_CATEGORY).find(([, v]) => v === category);
  return entry ? Number(entry[0]) : 10000;
}

const CHOICE_AGG: Record<number, AggregationType> = {
  10000: 'Sum', 10001: 'Average', 10002: 'Count',
  10003: 'Min', 10004: 'Max', 10005: 'Latest',
};

const VALID_VIZ: Set<string> = new Set<string>([
  'KPI', 'Line', 'Bar', 'Donut', 'Table',
  'HorizontalBar', 'GroupedBar', 'Area', 'TopicsList',
]);

const UNKNOWN_CHANNEL_VALUE = 'unknown';
const KNOWN_CHANNEL_VALUES = [
  'msteams',
  'webchat',
  'directline',
  'pva-studio',
  'pva-autonomous',
  'pva-published-engine-direct',
  'pva-maker-evaluation',
  'm365copilot',
  'mobile',
  'whatsapp',
];

function parseViz(raw: string | undefined): MetricDefinition['visualizationType'] {
  if (raw && VALID_VIZ.has(raw)) return raw as MetricDefinition['visualizationType'];
  return 'KPI';
}

interface CatMetricRow {
  cat_metricdefinitionid: string;
  cat_metricname: string;
  cat_description?: string;
  cat_category: number;
  cat_sourcetable: string;
  cat_sourcefield: string;
  cat_aggregation: number;
  cat_visualizationtypename?: string;
  cat_unit?: string;
  cat_isactive: boolean;
  cat_isrecommendedmetric?: boolean;
  createdon?: string;
  _createdby_value?: string;
  '_createdby_value@OData.Community.Display.V1.FormattedValue'?: string;
}

function rowToMetric(r: CatMetricRow): MetricDefinition {
  return {
    id: r.cat_metricdefinitionid,
    name: r.cat_metricname,
    description: r.cat_description,
    category: CHOICE_CATEGORY[r.cat_category] ?? 'Conversations',
    sourceTable: r.cat_sourcetable,
    sourceField: r.cat_sourcefield,
    aggregation: CHOICE_AGG[r.cat_aggregation] ?? 'Sum',
    visualizationType: parseViz(r.cat_visualizationtypename),
    unit: r.cat_unit,
    isActive: r.cat_isactive,
    isRecommendedMetric: r.cat_isrecommendedmetric === true,
    createdOn: r.createdon,
    createdBy: r['_createdby_value@OData.Community.Display.V1.FormattedValue'] ?? r._createdby_value,
  };
}

const cache = { metrics: null as MetricDefinition[] | null, allMetrics: null as MetricDefinition[] | null, ts: 0, allTs: 0 };
const TTL = 60_000; // 1 min

export const metricService = {
  /** List only active (published) metrics — used by the dashboard. */
  async listMetrics(force = false): Promise<MetricDefinition[]> {
    if (!force && cache.metrics && Date.now() - cache.ts < TTL) return cache.metrics;
    try {
      const filter = buildOwnerFilter({
        baseFilter: 'cat_isactive eq true',
      });
      // Fail-closed: if user context unavailable, return empty
      if (!filter) {
        console.warn('[metricService] No user context — returning empty (fail-closed)');
        return [];
      }
      const rows = await dv.list<CatMetricRow>('cat_metricdefinitions', {
        filter,
        top: 500,
      });
      const metrics = rows.map(rowToMetric).sort((a, b) => {
        // Default: newest first
        const dateA = a.createdOn ?? '';
        const dateB = b.createdOn ?? '';
        return dateB.localeCompare(dateA);
      });
      cache.metrics = metrics;
      cache.ts = Date.now();
      return metrics;
    } catch (e) {
      console.warn('[metricService] failed to load metrics — returning empty list', e);
      return [];
    }
  },

  /** List all metrics (active + inactive) — used by the metric registry/admin. */
  async listAllMetrics(force = false): Promise<MetricDefinition[]> {
    if (!force && cache.allMetrics && Date.now() - cache.allTs < TTL) return cache.allMetrics;
    try {
      const filter = buildOwnerFilter();
      if (!filter) {
        console.warn('[metricService] No user context — returning empty (fail-closed)');
        return [];
      }
      const rows = await dv.list<CatMetricRow>('cat_metricdefinitions', {
        filter,
        top: 500,
      });
      const metrics = rows.map(rowToMetric).sort((a, b) => {
        const dateA = a.createdOn ?? '';
        const dateB = b.createdOn ?? '';
        return dateB.localeCompare(dateA);
      });
      cache.allMetrics = metrics;
      cache.allTs = Date.now();
      return metrics;
    } catch (e) {
      console.warn('[metricService] failed to load all metrics — returning empty list', e);
      return [];
    }
  },

  async upsertMetric(m: MetricDefinition): Promise<void> {
    const aggCode      = Object.entries(CHOICE_AGG).find(([, v]) => v === m.aggregation)?.[0];
    const row: Record<string, unknown> = {
      cat_metricname: m.name,
      cat_description: m.description ?? '',
      cat_category: categoryToCode(m.category),
      cat_sourcetable: m.sourceTable,
      cat_sourcefield: m.sourceField,
      cat_aggregation: Number(aggCode ?? 10000),
      cat_visualizationtypename: m.visualizationType,
      cat_unit: m.unit ?? '',
      cat_isactive: m.isActive,
      cat_isrecommendedmetric: !!m.isRecommendedMetric,
    };
    if (m.id) {
      await dv.update('cat_metricdefinitions', m.id, row);
    } else {
      await dv.create('cat_metricdefinitions', row);
    }
    cache.metrics = null; cache.allMetrics = null;
  },

  async deleteMetric(id: string): Promise<void> {
    await dv.remove('cat_metricdefinitions', id);
    cache.metrics = null; cache.allMetrics = null;
  },

  /** Bulk-create multiple metrics. Runs sequentially to avoid Dataverse throttling. */
  async batchUpsert(metrics: Omit<MetricDefinition, 'id'>[]): Promise<void> {
    for (const m of metrics) {
      const aggCode      = Object.entries(CHOICE_AGG).find(([, v]) => v === m.aggregation)?.[0];
      const row: Record<string, unknown> = {
        cat_metricname: m.name,
        cat_description: m.description ?? '',
        cat_category: categoryToCode(m.category),
        cat_sourcetable: m.sourceTable,
        cat_sourcefield: m.sourceField,
        cat_aggregation: Number(aggCode ?? 10000),
        cat_visualizationtypename: m.visualizationType,
        cat_unit: m.unit ?? '',
        cat_isactive: m.isActive,
        cat_isrecommendedmetric: !!m.isRecommendedMetric,
      };
      await dv.create('cat_metricdefinitions', row);
    }
    cache.metrics = null; cache.allMetrics = null;
  },

  /**
   * Idempotent bootstrap: ensures all publishedByDefault metrics exist in Dataverse.
   * Returns a Map<canonicalKey, metricId> for default dashboard layout construction,
   * plus a MetricDefinition[] built from local data (avoids Dataverse eventual-consistency issues).
   * canonicalKey = `${sourceTable}.${sourceField}.${aggregation}`
   *
   * Strategy: pre-generate GUIDs and pass them as the primary key in the create payload.
   * Dataverse supports caller-supplied primary keys, so we know the IDs immediately
   * without needing to re-query (avoids eventual-consistency race conditions).
   */
  async ensureRecommendedMetrics(): Promise<{ keyToId: Map<string, string>; metrics: MetricDefinition[] }> {
    console.log('[AMS:ensureRecommendedMetrics] Loading existing metrics for current user…');
    // Load only the current user's metrics — each user gets their own recommended set
    const userId = getCachedUserId();
    const ownerFilter = userId ? `_owninguser_value eq ${userId}` : undefined;
    const existing = await dv.list<CatMetricRow>('cat_metricdefinitions', {
      filter: ownerFilter,
      top: 500,
    });
    console.log(`[AMS:ensureRecommendedMetrics] Found ${existing.length} existing metric definitions for current user`);
    const existingByKey = new Map<string, CatMetricRow>();
    for (const r of existing) {
      const key = `${r.cat_sourcetable}.${r.cat_sourcefield}.${CHOICE_AGG[r.cat_aggregation]}`;
      existingByKey.set(key, r);
    }

    // Only create metrics that are actually used by the default dashboard cards
    const dashboardKeys = new Set(DEFAULT_DASHBOARD_CARDS.map(c => c.canonicalKey));
    const recommended = allSuggestedMetrics.filter(m => {
      const key = `${m.sourceTable}.${m.sourceField}.${m.aggregation}`;
      return dashboardKeys.has(key);
    });
    console.log(`[AMS:ensureRecommendedMetrics] ${recommended.length} metrics needed for default dashboard`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Build keyToId and metrics array as we go — no re-query needed
    const keyToId = new Map<string, string>();
    const metricsResult: MetricDefinition[] = [];

    // Pre-populate with existing metrics
    for (const r of existing) {
      const key = `${r.cat_sourcetable}.${r.cat_sourcefield}.${CHOICE_AGG[r.cat_aggregation]}`;
      keyToId.set(key, r.cat_metricdefinitionid);
      metricsResult.push(rowToMetric(r));
    }

    for (const m of recommended) {
      const key = `${m.sourceTable}.${m.sourceField}.${m.aggregation}`;
      const match = existingByKey.get(key);

      if (match) {
        // Reactivate if inactive, and mark as recommended
        if (!match.cat_isactive || !match.cat_isrecommendedmetric) {
          console.log(`[AMS:ensureRecommendedMetrics] Updating existing metric: "${m.name}" (${key})`);
          await dv.update('cat_metricdefinitions', match.cat_metricdefinitionid, {
            cat_isactive: true,
            cat_isrecommendedmetric: true,
          });
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Pre-generate a GUID so we can use it immediately without re-querying
        const newId = crypto.randomUUID();
        console.log(`[AMS:ensureRecommendedMetrics] Creating metric: "${m.name}" (${key}) with pre-generated ID: ${newId}`);
        const aggCode = Object.entries(CHOICE_AGG).find(([, v]) => v === m.aggregation)?.[0];
        await dv.create('cat_metricdefinitions', {
          cat_metricdefinitionid: newId,
          cat_metricname: m.name,
          cat_description: m.description ?? '',
          cat_category: categoryToCode(m.category),
          cat_sourcetable: m.sourceTable,
          cat_sourcefield: m.sourceField,
          cat_aggregation: Number(aggCode ?? 10000),
          cat_visualizationtypename: m.visualizationType,
          cat_unit: '',
          cat_isactive: true,
          cat_isrecommendedmetric: true,
        });
        // Use the pre-generated ID directly — no need to read back
        keyToId.set(key, newId);
        metricsResult.push({
          id: newId,
          name: m.name,
          description: m.description,
          category: m.category,
          sourceTable: m.sourceTable,
          sourceField: m.sourceField,
          aggregation: m.aggregation,
          visualizationType: m.visualizationType,
          unit: '',
          isActive: true,
          isRecommendedMetric: true,
        });
        created++;
      }
    }

    console.log(`[AMS:ensureRecommendedMetrics] Done: ${created} created, ${updated} updated, ${skipped} skipped`);
    cache.metrics = null; cache.allMetrics = null;
    console.log(`[AMS:ensureRecommendedMetrics] Returning keyToId map with ${keyToId.size} entries, ${metricsResult.length} metrics`);
    return { keyToId, metrics: metricsResult };
  },

  /**
   * Fetches metric data for a given metric under the current filter state.
   * Heuristic: if source table has 'metrics' in its name, it's a time-series table
   * with a date column — we group by day. Otherwise we fall back to a simple count.
   */
  async getDataset(metric: MetricDefinition, filters: FilterState): Promise<MetricDataset> {
    const debug = typeof window !== 'undefined' && !!(window as unknown as { __AMS_DEBUG?: boolean }).__AMS_DEBUG;
    const range = resolveTimeRange(filters.timeRange);
    const dateField = pickDateField(metric.sourceTable);
    const filter = buildFilter(metric.sourceTable, filters, range.from, range.to);
    const entitySet = pluralize(metric.sourceTable);

    console.info(`[AMS] Loading metric "${metric.name}" → ${entitySet} | field: ${metric.sourceField} | agg: ${metric.aggregation}`);

    if (debug) {
      console.groupCollapsed(`[AMS:debug] getDataset → ${metric.name}`);
      console.log('sourceTable:', metric.sourceTable);
      console.log('entitySet (pluralized):', entitySet);
      console.log('sourceField:', metric.sourceField);
      console.log('dateField:', dateField);
      console.log('aggregation:', metric.aggregation);
      console.log('filter:', filter);
      console.log('time range:', range.from.toISOString(), '→', range.to.toISOString());
    }

    try {
      const rows = await dv.list<Record<string, unknown>>(entitySet, {
        select: [dateField, metric.sourceField].filter(Boolean) as string[],
        filter,
        orderBy: `${dateField} asc`,
        top: 5000,
      });

      console.info(`[AMS] "${metric.name}" returned ${rows.length} rows`);
      if (rows.length === 0) {
        console.warn(`[AMS] ⚠️ "${metric.name}" returned 0 rows. Filter: ${filter}`);
      }

      if (debug) {
        if (rows.length > 0) {
          const sample = rows[0];
          console.log('[AMS:debug] first row:', sample);
          console.log(`[AMS:debug] dateField "${dateField}" present:`, dateField in sample);
          console.log(`[AMS:debug] sourceField "${metric.sourceField}" present:`, metric.sourceField in sample);
        }
      }

      const points = aggregateByDay(rows, dateField, metric.sourceField, metric.aggregation);

      if (debug) {
        console.log('[AMS:debug] aggregated points:', points.length);
        if (points.length === 0 && rows.length > 0) {
          console.warn('[AMS:debug] ⚠️ Rows exist but produced 0 aggregated points — dateField values may be missing/null');
        }
        console.groupEnd();
      }

      const total = aggregate(points.map(p => p.value), metric.aggregation);
      const prior = priorRange(range);
      const priorFilter = buildFilter(metric.sourceTable, filters, prior.from, prior.to);
      const priorRows = await dv.list<Record<string, unknown>>(entitySet, {
        select: [dateField, metric.sourceField].filter(Boolean) as string[],
        filter: priorFilter,
        top: 5000,
      }).catch(() => []);
      const priorTotal = aggregate(priorRows.map(r => Number(r[metric.sourceField] ?? 0)), metric.aggregation);
      const delta = priorTotal ? ((total - priorTotal) / priorTotal) * 100 : 0;

      return {
        metricId: metric.id,
        points,
        total,
        delta,
        unit: metric.unit,
        lastUpdated: new Date().toISOString(),
        categorical: derivCategorical(points),
      };
    } catch (e) {
      if (debug) {
        console.groupEnd();
      }
      console.warn(`[AMS] ⚠️ "${metric.name}" query FAILED — falling back to demo data:`, e);
      return demoDataset(metric);
    }
  },
};

// --- helpers ---

function pluralize(entity: string): string {
  // Dataverse plural names: most cat_* tables follow cat_xxxmetrics / cat_xxxs pattern.
  // The entity set name often just adds 'es' or 's'. Common custom plurals below.
  const fixed: Record<string, string> = {
    'cat_dailymetrics': 'cat_dailymetrics',
    'cat_topicmetrics': 'cat_topicmetrics',
    'cat_toolmetrics': 'cat_toolmetrics',
    'cat_actionmetrics': 'cat_actionmetrics',
    'cat_errordetails': 'cat_errordetails',
    'cat_metricdefinition': 'cat_metricdefinitions',
    'cat_userlayout': 'cat_userlayouts',
    'cat_transcriptmetrics': 'cat_transcriptmetricses',
  };
  if (fixed[entity]) return fixed[entity];
  if (entity.endsWith('s')) return entity;
  if (entity.endsWith('y')) return entity.slice(0, -1) + 'ies';
  return entity + 's';
}

function pickDateField(table: string): string {
  if (table.includes('dailymetrics')) return 'cat_metricdate';
  if (table.includes('transcriptmetrics')) return 'cat_conversationdate';
  if (table.includes('metrics'))      return 'createdon';
  return 'createdon';
}

function buildFilter(_table: string, f: FilterState, from: Date, to: Date): string {
  const parts: string[] = [];
  const dateCol = pickDateField(_table);
  // Use full UTC ISO so filter boundaries don't drift by local timezone offset.
  parts.push(`${dateCol} ge ${from.toISOString()}`);
  parts.push(`${dateCol} le ${to.toISOString()}`);
  if (f.agentIds?.length) {
    const col = pickAgentColumn(_table);
    if (col) {
      const id = f.agentIds[0];
      parts.push(`${col} eq ${id}`);
    }
  }
  // Channel filter
  if (f.channels?.length) {
    const col = pickChannelColumn(_table);
    if (col) {
      parts.push(buildChannelFilterClause(f.channels[0], col));
    }
  }
  // Data mode filter (numeric option-set: 1=production, 2=test)
  if (f.dataMode && f.dataMode !== 'both') {
    const col = pickDataSourceColumn(_table);
    if (col) {
      const code = f.dataMode === 'production' ? 1 : 2;
      parts.push(`${col} eq ${code}`);
    }
  }
  return parts.join(' and ');
}

/**
 * Returns the agent lookup column for a given table, or null if the table
 * does not have an agent reference (e.g. cat_agentdetails itself).
 */
export function pickAgentColumn(table: string): string | null {
  if (table.includes('copilotkpi')) return '_cat_copilotconfigurationid_value';
  if (table.includes('dailymetrics') || table.includes('topicmetrics') ||
      table.includes('toolmetrics') || table.includes('transcriptmetrics') ||
      table.includes('agenttranscript')) return '_cat_agentconfiguration_value';
  if (table.includes('agentusagehistory')) return '_cat_agent_value';
  if (table.includes('copilottestrun')) return '_cat_copilotconfigurationid_value';
  return null;
}

/** Tables that have the `cat_channelid` column. */
const CHANNEL_TABLES = new Set([
  'cat_dailymetrics', 'cat_topicmetrics', 'cat_toolmetrics', 'cat_transcriptmetrics',
  'cat_actionmetrics', 'cat_errordetails',
]);

/** Tables that have the `cat_datasourcecode` option-set column. */
const DATASOURCE_TABLES = new Set([
  'cat_dailymetrics', 'cat_topicmetrics', 'cat_toolmetrics', 'cat_transcriptmetrics',
]);

/**
 * Returns the channel column name if the table supports channel filtering.
 */
export function pickChannelColumn(table: string): string | null {
  for (const t of CHANNEL_TABLES) {
    if (table.includes(t.replace('cat_', ''))) return 'cat_channelid';
  }
  return null;
}

/**
 * Returns the data source column name if the table supports data-mode filtering.
 */
export function pickDataSourceColumn(table: string): string | null {
  for (const t of DATASOURCE_TABLES) {
    if (table.includes(t.replace('cat_', ''))) return 'cat_datasourcecode';
  }
  return null;
}

/** Escape single quotes for OData string literals. */
export function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

/** Builds an OData channel filter, expanding Unknown to all unmapped channel values. */
export function buildChannelFilterClause(channel: string, channelColumn: string): string {
  if (channel === UNKNOWN_CHANNEL_VALUE) {
    const knownChannelExclusions = KNOWN_CHANNEL_VALUES
      .map((value) => `${channelColumn} ne '${escapeOData(value)}'`)
      .join(' and ');

    return `(${channelColumn} eq null or ${channelColumn} eq '' or (${knownChannelExclusions}))`;
  }

  return `${channelColumn} eq '${escapeOData(channel)}'`;
}

function aggregateByDay(
  rows: Record<string, unknown>[], dateField: string, valueField: string, agg: AggregationType,
): TimeSeriesPoint[] {
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    const dRaw = r[dateField] as string | undefined;
    if (!dRaw) continue;
    const day = dRaw.slice(0, 10);
    const raw = r[valueField];
    const v = Number(raw ?? 1);
    // Non-numeric values (e.g. GUIDs for "id" fields) count as 1 per row
    if (!buckets.has(day)) buckets.set(day, []);
    buckets.get(day)!.push(Number.isFinite(v) ? v : 1);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, vals]) => ({ date: day, value: aggregate(vals, agg) }));
}

function aggregate(vals: number[], agg: AggregationType): number {
  if (!vals.length) return 0;
  switch (agg) {
    case 'Sum':     return vals.reduce((a, b) => a + b, 0);
    case 'Average': return vals.reduce((a, b) => a + b, 0) / vals.length;
    case 'Count':   return vals.length;
    case 'Min':     return Math.min(...vals);
    case 'Max':     return Math.max(...vals);
    case 'Latest':  return vals[vals.length - 1];
  }
}

function derivCategorical(points: TimeSeriesPoint[]): CategoricalPoint[] | undefined {
  if (!points.length) return undefined;
  return points.slice(-7).map(p => ({ label: p.date.slice(5), value: p.value }));
}

function demoDataset(metric: MetricDefinition): MetricDataset {
  // Fallback when source table cannot be queried (e.g., empty Kit tables in dev).
  const today = new Date();
  const points: TimeSeriesPoint[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    const base = 100 + Math.sin(i / 4) * 20 + i * 2;
    return { date: d.toISOString().slice(0, 10), value: Math.round(base + Math.random() * 10) };
  });
  const total = aggregate(points.map(p => p.value), metric.aggregation);
  return {
    metricId: metric.id,
    points,
    total,
    delta: 6.2,
    unit: metric.unit,
    lastUpdated: new Date().toISOString(),
    categorical: points.slice(-7).map(p => ({ label: p.date.slice(5), value: p.value })),
  };
}
