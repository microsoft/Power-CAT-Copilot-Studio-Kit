import { useState, useCallback } from 'react';
import { getApprovedRequestsByServiceTree } from '../../../shared/services/dataverse/requestService';
import type { PolicyRequestSummary } from '../../../models/policyRequest';

export interface ApprovedRequestsState {
  approvedRequests: PolicyRequestSummary[];
  isLoading: boolean;
  error: string | null;
  /** Fetches approved requests for the given service tree. Returns them for immediate use. */
  fetch: (serviceTreeId: string) => Promise<PolicyRequestSummary[]>;
}

/**
 * On-demand hook to fetch approved/implemented policy requests for a Service Tree.
 * Not called on mount — the `fetch` function must be invoked explicitly
 * (e.g. when the maker clicks "Next" in Step 1).
 */
export function useApprovedRequests(): ApprovedRequestsState {
  const [approvedRequests, setApprovedRequests] = useState<PolicyRequestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (serviceTreeId: string): Promise<PolicyRequestSummary[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const results = await getApprovedRequestsByServiceTree(serviceTreeId);
      setApprovedRequests(results);
      return results;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to check existing approved requests.';
      setError(msg);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { approvedRequests, isLoading, error, fetch };
}
