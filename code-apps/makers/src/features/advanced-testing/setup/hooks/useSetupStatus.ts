/**
 * Aggregates the three Setup read queries into a single status summary for
 * the landing-page indicator on Advanced Testing.
 *
 * Calling this hook from the landing page triggers prefetch of all three
 * datasets via React Query's normal `useQuery` flow. The sessionStorage
 * persister (see `main.tsx` and `persistence.ts`) makes the first paint
 * after a tab reload instant.
 *
 * Returns `{ overall: "unknown" }` while any query is loading or has not
 * yet resolved, so the caller can hide the indicator until data is ready
 * (no spinner, no flash).
 */
import { useConnectionReferences } from "./useConnectionReferences";
import { useTestAutomationProcesses } from "./useTestAutomationProcesses";
import { useEnvironmentVariables } from "./useEnvironmentVariables";
import {
  deriveConnectionsBadge,
  deriveEnvVarsBadge,
  deriveFlowsBadge,
  summarizeSetupStatus,
  type SetupStatusSummary,
} from "../utils/setupStatus";

export function useSetupStatus(): SetupStatusSummary {
  const crQuery = useConnectionReferences(true);
  const processesQuery = useTestAutomationProcesses(true);
  const evsQuery = useEnvironmentVariables(true);

  return summarizeSetupStatus({
    connections: {
      isLoading: crQuery.isLoading,
      isError: crQuery.isError,
      isSuccess: crQuery.isSuccess,
      badge: deriveConnectionsBadge(crQuery.data, {
        isLoading: crQuery.isLoading,
        isError: crQuery.isError,
        isSuccess: crQuery.isSuccess,
      }),
    },
    flows: {
      isLoading: processesQuery.isLoading,
      isError: processesQuery.isError,
      isSuccess: processesQuery.isSuccess,
      badge: deriveFlowsBadge(
        processesQuery.data,
        processesQuery.isLoading,
        processesQuery.isError,
      ),
    },
    envVars: {
      isLoading: evsQuery.isLoading,
      isError: evsQuery.isError,
      isSuccess: evsQuery.isSuccess,
      badge: deriveEnvVarsBadge(
        evsQuery.data?.variables,
        evsQuery.isLoading,
        evsQuery.isError,
      ),
    },
  });
}
