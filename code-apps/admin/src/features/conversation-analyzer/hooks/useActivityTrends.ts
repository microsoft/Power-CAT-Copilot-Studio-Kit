import { useAnalyzerBase } from './useAnalyzerBase';
import { buildActivityTrends, type ActivityPoint, type ActivityTrendsData } from '../services/overviewRollup';

export type { ActivityPoint, ActivityTrendsData };

/** Daily analyzed-conversation counts (plus total and peak day) for the active time period. */
export function useActivityTrends() {
  return useAnalyzerBase(buildActivityTrends);
}
