/**
 * Period-scoped Overview rollups (KPIs, sentiment, coverage, activity) derived
 * from the shared {@link AnalyzerBase} snapshot.
 */

import { rowMatchesAgent } from '../utils/rowMatchesAgent';
import { groupRowsByAgentId, rowsInPeriod, type AnalyzerBase } from './analyzerBase';

export interface DashboardSummary {
  totalAgents: number;
  agentsAnalyzed: number;
  conversationsAnalyzed: number;
  /** Conversations whose PII result is low/medium/high. */
  piiConversations: number;
  /** piiConversations ÷ conversationsAnalyzed, 0–100. */
  piiPct: number;
  sentiment: {
    /** (positive − negative) ÷ total, −1…1 rounded to 2 decimals. */
    netScore: number;
    positive: number;
    neutral: number;
    negative: number;
    /** Conversations with a sentiment result. */
    total: number;
    /** Share of conversations with a sentiment result, 0–100. */
    coveragePct: number;
    /** Share of sentiment results that are positive, 0–100. */
    positivePct: number;
  };
}

export interface CoverageData {
  analyzed: number;
  notAnalyzed: number;
  totalAgents: number;
  coveragePct: number;
}

export interface ActivityPoint {
  date: Date;
  analyzed: number;
}

export interface ActivityTrendsData {
  series: ActivityPoint[];
  total: number;
  peak?: ActivityPoint;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Number of agents with at least one analyzer row in the period. */
export function countAnalyzedAgents(base: AnalyzerBase, from: string, to: string): number {
  const byAgent = groupRowsByAgentId(rowsInPeriod(base.rows, from, to));
  return base.agents.filter((a) => {
    const agentId = a.agentId ?? '';
    return (byAgent.get(agentId) ?? []).some((r) =>
      rowMatchesAgent(r.agentId, r.environmentUrl, agentId, a.environmentUrl),
    );
  }).length;
}

/** KPI + sentiment rollup for the active period. */
export function buildSummary(base: AnalyzerBase, from: string, to: string): DashboardSummary {
  const rows = rowsInPeriod(base.rows, from, to);
  let piiConversations = 0;
  let positive = 0;
  let neutral = 0;
  let negative = 0;
  for (const r of rows) {
    const p = r.parsed;
    if (!p) continue;
    if (p.pii && p.pii !== 'none' && p.pii !== 'unknown') piiConversations++;
    if (p.sentiment && p.sentiment !== 'unknown') {
      if (p.sentiment === 'positive') positive++;
      else if (p.sentiment === 'negative') negative++;
      else neutral++;
    }
  }
  const total = positive + neutral + negative;
  return {
    totalAgents: base.agents.length,
    agentsAnalyzed: countAnalyzedAgents(base, from, to),
    conversationsAnalyzed: rows.length,
    piiConversations,
    piiPct: pct(piiConversations, rows.length),
    sentiment: {
      netScore: total > 0 ? Math.round(((positive - negative) / total) * 100) / 100 : 0,
      positive,
      neutral,
      negative,
      total,
      coveragePct: pct(total, rows.length),
      positivePct: pct(positive, total),
    },
  };
}

/** Analyzed vs not-analyzed agents for the active period. */
export function buildCoverage(base: AnalyzerBase, from: string, to: string): CoverageData {
  const analyzed = countAnalyzedAgents(base, from, to);
  const totalAgents = base.agents.length;
  return {
    analyzed,
    notAnalyzed: Math.max(0, totalAgents - analyzed),
    totalAgents,
    coveragePct: pct(analyzed, totalAgents),
  };
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Daily analyzed-conversation counts across the period, with total and peak day. */
export function buildActivityTrends(base: AnalyzerBase, from: string, to: string): ActivityTrendsData {
  const rows = rowsInPeriod(base.rows, from, to);
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.createdOn) continue;
    const k = dayKey(new Date(r.createdOn));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const start = new Date(from);
  const end = new Date(to);
  const series: ActivityPoint[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  let peak: ActivityPoint | undefined;
  while (cursor <= endDay) {
    const point = { date: new Date(cursor), analyzed: counts.get(dayKey(cursor)) ?? 0 };
    series.push(point);
    if (point.analyzed > 0 && (!peak || point.analyzed > peak.analyzed)) peak = point;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { series, total: rows.length, peak };
}
