/**
 * Prompts with run stats for the selected period, most recently run first.
 * Optional `scope` limits the list to system or custom prompts.
 */

import { useCallback } from 'react';
import { usePromptInsightsData, type PromptInsightRow, type PromptInsightsData } from './usePromptInsightsData';
import type { PromptScope } from '../contracts/types';

export type FeaturedPromptRow = PromptInsightRow;

export function useFeaturedPrompts(scope?: PromptScope) {
  const select = useCallback(
    (data: PromptInsightsData): FeaturedPromptRow[] =>
      data.prompts
        .filter((p) => !scope || p.scope === scope)
        .sort((a, b) => {
          const byLastRun = (b.lastRunOn ?? '').localeCompare(a.lastRunOn ?? '');
          return byLastRun !== 0 ? byLastRun : b.runsCount - a.runsCount;
        }),
    [scope],
  );
  return usePromptInsightsData(select);
}
