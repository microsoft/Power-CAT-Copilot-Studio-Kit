/**
 * Shared data for the Prompt insights tab (PI-2, PI-10).
 *
 * One query loads every active prompt (system + custom) and the prompt runs in
 * the selected time period, then rolls them up per prompt. `usePromptsKpis`,
 * `useFeaturedPrompts` and the Prompt library read slices of it via `select`.
 */

import { useQuery } from '@tanstack/react-query';
import { useFilterContext } from '../context/FilterContext';
import { queryKeys } from './queryKeys';
import { ConversationAnalyzerPromptService } from '../services/ConversationAnalyzerPromptService';
import { PromptRunStatsService, type PromptRun } from '../services/PromptRunStatsService';
import { timePeriodToIsoRange } from '../utils/dateRange';
import { parsePromptResult } from '../utils/parsePromptResult';
import type { PromptRow } from '../contracts/types';

export type InsightTone = 'brand' | 'success' | 'warning' | 'danger';

export interface PromptInsightRow extends PromptRow {
  runsCount: number;
  lastRunOn?: string;
  latestSummary?: string;
  /** Agent of the most recent run - used to deep link into Analysis results. */
  latestAgentId?: string;
  latestEnvironmentUrl?: string;
  /** Agent with the most runs in the period. */
  topAgentId?: string;
  topAgentEnvironmentUrl?: string;
  /** Accent for the Latest insights feed; only resolved for the newest results. */
  latestTone?: InsightTone;
}

export interface PromptInsightsData {
  prompts: PromptInsightRow[];
  totalRuns: number;
  /** Runs in the previous period of equal length; undefined when it could not be loaded. */
  previousRuns?: number;
  /** Runs per bucket, oldest first (max 30 buckets across the period). */
  dailyRuns: number[];
  periodDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SPARK_BUCKETS = 30;
export const LATEST_INSIGHTS_COUNT = 3;

function bucketRuns(runs: PromptRun[], fromMs: number, toMs: number, buckets: number): number[] {
  const counts = new Array<number>(buckets).fill(0);
  const span = Math.max(1, toMs - fromMs);
  for (const run of runs) {
    const t = run.createdOn ? new Date(run.createdOn).getTime() : NaN;
    if (Number.isNaN(t) || t < fromMs || t > toMs) continue;
    counts[Math.min(buckets - 1, Math.floor(((t - fromMs) / span) * buckets))] += 1;
  }
  return counts;
}

function toneFromResult(raw: string | undefined): InsightTone {
  if (!raw) return 'brand';
  const parsed = parsePromptResult(raw);
  if (parsed.sentiment === 'negative' || parsed.pii === 'high' || parsed.pii === 'medium') return 'danger';
  if (parsed.sentiment === 'mixed' || parsed.pii === 'low') return 'warning';
  if (parsed.sentiment === 'positive' || parsed.pii === 'none') return 'success';
  return 'brand';
}

async function loadPromptInsights(from: string, to: string): Promise<PromptInsightsData> {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const prevFrom = new Date(fromMs - (toMs - fromMs)).toISOString();
  const prevTo = new Date(fromMs - 1).toISOString();

  const [prompts, runs, previousRuns] = await Promise.all([
    ConversationAnalyzerPromptService.list(),
    PromptRunStatsService.listRuns(from, to),
    PromptRunStatsService.countRuns(prevFrom, prevTo).catch(() => undefined),
  ]);

  const promptIds = new Set(prompts.map((p) => p.id.toLowerCase()));
  const activeRuns = runs.filter((r) => promptIds.has(r.promptId));

  // Agents are keyed by bot ID + environment: the same bot ID can exist in several environments.
  const stats = new Map<string, { count: number; latest?: PromptRun; agents: Map<string, { run: PromptRun; count: number }> }>();
  for (const run of activeRuns) {
    const entry = stats.get(run.promptId) ?? { count: 0, agents: new Map<string, { run: PromptRun; count: number }>() };
    entry.count += 1;
    // Runs arrive newest first, so the first run seen is the latest.
    if (!entry.latest) entry.latest = run;
    if (run.agentId) {
      const key = `${run.agentId}|${run.environmentUrl ?? ''}`;
      const agent = entry.agents.get(key);
      if (agent) agent.count += 1;
      else entry.agents.set(key, { run, count: 1 });
    }
    stats.set(run.promptId, entry);
  }

  const rows: PromptInsightRow[] = prompts.map((p) => {
    const s = stats.get(p.id.toLowerCase());
    let top: PromptRun | undefined;
    let topCount = 0;
    s?.agents.forEach(({ run, count }) => {
      if (count > topCount) { topCount = count; top = run; }
    });
    return {
      ...p,
      runsCount: s?.count ?? 0,
      lastRunOn: s?.latest?.createdOn,
      latestSummary: s?.latest?.summary,
      latestAgentId: s?.latest?.agentId,
      latestEnvironmentUrl: s?.latest?.environmentUrl,
      topAgentId: top?.agentId,
      topAgentEnvironmentUrl: top?.environmentUrl,
    };
  });

  const newest = rows
    .filter((r) => r.lastRunOn && r.latestSummary)
    .sort((a, b) => (b.lastRunOn ?? '').localeCompare(a.lastRunOn ?? ''))
    .slice(0, LATEST_INSIGHTS_COUNT);
  if (newest.length > 0) {
    const latestIds = newest.map((r) => stats.get(r.id.toLowerCase())?.latest?.id).filter((id): id is string => Boolean(id));
    const results = await PromptRunStatsService.getPromptResults(latestIds).catch(() => new Map<string, string>());
    for (const row of newest) {
      const latestId = stats.get(row.id.toLowerCase())?.latest?.id;
      row.latestTone = toneFromResult(latestId ? results.get(latestId) : undefined);
    }
  }

  const periodDays = Math.max(1, Math.round((toMs - fromMs) / DAY_MS));
  return {
    prompts: rows,
    totalRuns: activeRuns.length,
    previousRuns,
    dailyRuns: bucketRuns(activeRuns, fromMs, toMs, Math.min(periodDays, MAX_SPARK_BUCKETS)),
    periodDays,
  };
}

/** Prompt insights data for the selected time period; `select` derives a slice. */
export function usePromptInsightsData<T = PromptInsightsData>(select?: (data: PromptInsightsData) => T) {
  const { timePeriod, customStartDate, customEndDate } = useFilterContext();
  const { from, to } = timePeriodToIsoRange(timePeriod, customStartDate, customEndDate);

  return useQuery<PromptInsightsData, Error, T>({
    queryKey: [...queryKeys.all, 'prompt-insights', `${from}/${to}`],
    queryFn: () => loadPromptInsights(from, to),
    select,
    staleTime: 60_000,
    gcTime: 300_000,
  });
}
