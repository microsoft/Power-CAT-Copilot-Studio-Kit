/**
 * useSolutions — Fetches existing solution unique names from a Power Platform environment.
 *
 * Used for solution name deduplication before importing an agent template.
 */

import { useState, useEffect, useCallback } from 'react';
import { useClient } from '../provider/AgentLibraryProvider';
import type { PowerAppsClient } from '../contracts/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SolutionRecord {
  uniquename: string;
  friendlyname: string;
  solutionid: string;
}

interface ODataSolutionsResponse {
  value: SolutionRecord[];
}

interface SdkSolutionsResult {
  data: ODataSolutionsResponse;
}

// ---------------------------------------------------------------------------
// Core fetch
// ---------------------------------------------------------------------------

async function fetchSolutions(client: PowerAppsClient, environmentUrl: string): Promise<SolutionRecord[]> {
  console.log('[useSolutions] Fetching solutions from:', environmentUrl);

  const result = await client.executeAsync<Record<string, unknown>, ODataSolutionsResponse>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: environmentUrl,
        entityName: 'solutions',
        '$select': 'uniquename,friendlyname,solutionid',
        '$filter': 'ismanaged eq false',
      },
    },
  });

  const sdkResult = result as unknown as SdkSolutionsResult;
  const solutions = sdkResult.data?.value ?? [];
  console.log('[useSolutions] Found', solutions.length, 'unmanaged solutions');
  return solutions;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSolutions(environmentUrl: string | undefined) {
  const client = useClient();
  const [solutions, setSolutions] = useState<SolutionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (envUrl: string) => {
    setLoading(true);
    setError(null);
    setSolutions([]);
    try {
      const records = await fetchSolutions(client, envUrl);
      setSolutions(records);
    } catch (err) {
      console.warn('[useSolutions] Failed to load solutions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load solutions.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!environmentUrl) {
      setSolutions([]);
      setError(null);
      return;
    }
    void load(environmentUrl);
  }, [environmentUrl, load]);

  return { solutions, loading, error };
}
