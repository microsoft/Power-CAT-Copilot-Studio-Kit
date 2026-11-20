/**
 * useInstallSolution — Installs a component solution into the current environment.
 *
 * Wraps SolutionInstallService with React Query (useMutation).
 * On success: invalidates the installedSolutions query so the gallery
 * re-detects install state on next focus.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { installSolution } from '../services/SolutionInstallService';
import { useClient } from '../provider/AgentLibraryProvider';
import type { ComponentTemplate, InstallSolutionResult } from '../contracts/types';

/** Installs a component solution and invalidates the detection cache on success. */
export function useInstallSolution() {
  const queryClient = useQueryClient();
  const client = useClient();

  return useMutation<InstallSolutionResult, Error, ComponentTemplate>({
    mutationFn: (component: ComponentTemplate) =>
      installSolution(client, component, crypto.randomUUID()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.installedSolutions() });
    },
  });
}
