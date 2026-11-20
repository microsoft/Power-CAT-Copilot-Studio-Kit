import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EvaluationRunVM } from '../contracts/model-assessment';
import { pivotKitResults } from '../contracts/kit-results';
import { getKitTestResults } from '../services/model-assessment-service';

/** Kit test results of the selected runs, pivoted so each row is one Kit test across runs. */
export function useKitTestRows(runs: EvaluationRunVM[]) {
  const testRunIds = runs.map((run) => run.kit?.testRunId).filter((id): id is string => Boolean(id));
  const query = useQuery({
    queryKey: ['mat', 'kit-results', ...testRunIds.map((id) => id.toLowerCase()).sort()],
    queryFn: () => getKitTestResults(testRunIds),
    enabled: testRunIds.length > 0,
    staleTime: 30_000,
  });
  const hasKit = testRunIds.length > 0;
  const rows = useMemo(() => (hasKit ? pivotKitResults(query.data ?? []) : []), [hasKit, query.data]);
  return { query, rows, hasKit };
}

export type KitTestRowsState = ReturnType<typeof useKitTestRows>;
