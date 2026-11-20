/**
 * Key metrics for the Prompt insights tab (PI-3): total runs with delta and
 * sparkline, prompts in use, most used prompt share and average
 * runs per prompt in use. Covers system and custom prompts (PI-2).
 */

import { usePromptInsightsData, type PromptInsightsData } from './usePromptInsightsData';
import { getPromptLabel } from '../utils/format';

export interface PromptsKpis {
  totalRuns: number;
  /** Percentage change vs. the previous period; undefined when it can't be computed. */
  deltaPct?: number;
  periodDays: number;
  dailyRuns: number[];
  promptsInUse: number;
  totalPrompts: number;
  mostUsed?: { name: string; runs: number; sharePct: number };
  avgRunsPerPrompt: number;
  latestRun?: { name: string; on: string };
}

function selectKpis(data: PromptInsightsData): PromptsKpis {
  const ranked = [...data.prompts].sort((a, b) => b.runsCount - a.runsCount);
  const used = ranked.filter((p) => p.runsCount > 0);
  const top = used[0];
  const latest = [...used].sort((a, b) => (b.lastRunOn ?? '').localeCompare(a.lastRunOn ?? ''))[0];
  const deltaPct =
    data.previousRuns != null && data.previousRuns > 0
      ? Math.round(((data.totalRuns - data.previousRuns) / data.previousRuns) * 100)
      : undefined;

  return {
    totalRuns: data.totalRuns,
    deltaPct,
    periodDays: data.periodDays,
    dailyRuns: data.dailyRuns,
    promptsInUse: used.length,
    totalPrompts: ranked.length,
    mostUsed: top && data.totalRuns > 0
      ? { name: getPromptLabel(top), runs: top.runsCount, sharePct: Math.round((top.runsCount / data.totalRuns) * 100) }
      : undefined,
    avgRunsPerPrompt: used.length > 0 ? Math.round(data.totalRuns / used.length) : 0,
    latestRun: latest?.lastRunOn ? { name: getPromptLabel(latest), on: latest.lastRunOn } : undefined,
  };
}

export function usePromptsKpis() {
  return usePromptInsightsData(selectKpis);
}
