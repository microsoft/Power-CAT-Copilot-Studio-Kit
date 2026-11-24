import { useMemo } from 'react';
import { useAnalyzerBase } from './useAnalyzerBase';
import { buildAgentRows, type AgentTableRow } from '../services/agentRollup';
import type { AnalyzerBase } from '../services/analyzerBase';

export type { AgentTableRow };

const identity = (base: AnalyzerBase, from: string, to: string) => ({ base, from, to });

/**
 * One row per agent with period-scoped status / sentiment / PII / conversations
 * and coverage. Shared by the Agents grid and the Overview agent summary
 * so both always show identical rows. Filtering, sorting and paging are client-side.
 */
export function useAgentsTable() {
  const baseQuery = useAnalyzerBase(identity);
  const snapshot = baseQuery.data;

  const rows = useMemo<AgentTableRow[] | undefined>(
    () => (snapshot ? buildAgentRows(snapshot.base, snapshot.from, snapshot.to) : undefined),
    [snapshot],
  );

  return {
    data: rows,
    isLoading: baseQuery.isLoading,
    isError: baseQuery.isError,
    error: baseQuery.error,
    refetch: baseQuery.refetch,
  };
}
