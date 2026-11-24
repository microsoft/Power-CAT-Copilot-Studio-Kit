import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { loadRecentTestSets } from "../services/test-sets";
import type { TestSetSummary } from "../contracts/types";

export function useRecentTestSets(top = 4): UseQueryResult<TestSetSummary[], Error> {
  return useQuery({
    queryKey: ["advanced-testing", "test-sets", top],
    queryFn: () => loadRecentTestSets(top),
  });
}
