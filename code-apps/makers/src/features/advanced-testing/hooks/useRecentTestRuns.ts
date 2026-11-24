import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { loadRecentTestRuns } from "../services/test-runs";
import type { TestRunSummary } from "../contracts/types";

export function useRecentTestRuns(top = 10): UseQueryResult<TestRunSummary[], Error> {
  return useQuery({
    queryKey: ["advanced-testing", "test-runs", top],
    queryFn: () => loadRecentTestRuns(top),
  });
}
