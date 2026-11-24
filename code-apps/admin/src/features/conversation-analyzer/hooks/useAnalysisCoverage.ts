import { useAnalyzerBase } from './useAnalyzerBase';
import { buildCoverage, type CoverageData } from '../services/overviewRollup';

export type { CoverageData };

/** Analyzed vs not-analyzed agents for the active time period. */
export function useAnalysisCoverage() {
  return useAnalyzerBase(buildCoverage);
}
