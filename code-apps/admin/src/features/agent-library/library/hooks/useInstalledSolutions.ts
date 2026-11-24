/**
 * useInstalledSolutions — Detects which CSK component solutions are installed
 * in the current Power Platform environment and fetches component IDs for deep linking.
 *
 * Wraps SolutionDetectionService with React Query (useQuery).
 * staleTime: 60 seconds — solution state rarely changes but can change mid-session.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { detectInstalledSolutions } from '../services/SolutionDetectionService';
import { useClient } from '../provider/AgentLibraryProvider';
import type { InstalledSolutionsResult } from '../contracts/types';
import { SOLUTIONS_STALE_TIME } from '../contracts/types';

/**
 * Detects installed CSK solutions and fetches bot component IDs for deep linking.
 *
 * @param solutionNames - Unique solution names from the catalog to check.
 * @param componentNames - Display names of components to look up IDs for.
 */
export function useInstalledSolutions(solutionNames: string[], componentNames: string[]) {
  const client = useClient();

  return useQuery<InstalledSolutionsResult>({
    queryKey: [...queryKeys.installedSolutions(), solutionNames, componentNames],
    queryFn: () => detectInstalledSolutions(client, solutionNames, componentNames),
    staleTime: SOLUTIONS_STALE_TIME,
    enabled: solutionNames.length > 0,
  });
}
