import { useAnalyzerBase } from './useAnalyzerBase';
import { buildSummary, type DashboardSummary } from '../services/overviewRollup';

export type { DashboardSummary };

/** KPI strip, insights and sentiment rollup for the active time period. */
export function useConversationAnalyzerSummary() {
  return useAnalyzerBase(buildSummary);
}
