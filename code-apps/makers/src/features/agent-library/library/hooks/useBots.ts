/**
 * useBots — Fetches existing bots from a Power Platform environment.
 *
 * Used to retrieve all bot schema names in the target environment
 * for schema deduplication before importing an agent template.
 */

import { useState, useEffect, useCallback } from 'react';
import { useClient } from '../provider/AgentLibraryProvider';
import type { PowerAppsClient } from '../contracts/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BotRecord {
  name: string;
  schemaname: string;
  botid: string;
  createdon: string;
  modifiedon: string;
  statecode: number;
}

interface ODataBotsResponse {
  value: BotRecord[];
}

interface SdkBotsResult {
  data: ODataBotsResponse;
}

// ---------------------------------------------------------------------------
// Core fetch
// ---------------------------------------------------------------------------

async function fetchBots(client: PowerAppsClient, environmentUrl: string): Promise<BotRecord[]> {
  console.log('[useBots] Fetching bots from:', environmentUrl);

  const result = await client.executeAsync<Record<string, unknown>, ODataBotsResponse>({
    connectorOperation: {
      tableName: 'commondataserviceforapps',
      operationName: 'ListRecordsWithOrganization',
      parameters: {
        organization: environmentUrl,
        entityName: 'bots',
        '$select': 'name,schemaname,botid,createdon,modifiedon,statecode',
        '$orderby': 'modifiedon desc',
      },
    },
  });

  const sdkResult = result as unknown as SdkBotsResult;
  const bots = sdkResult.data?.value ?? [];
  console.log('[useBots] Found', bots.length, 'bots');
  return bots;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBots(environmentUrl: string | undefined) {
  const client = useClient();
  const [bots, setBots] = useState<BotRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (envUrl: string) => {
    setLoading(true);
    setError(null);
    setBots([]);
    try {
      const records = await fetchBots(client, envUrl);
      setBots(records);
    } catch (err) {
      console.warn('[useBots] Failed to load bots:', err);
      setError(err instanceof Error ? err.message : 'Failed to load bots.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!environmentUrl) {
      setBots([]);
      setError(null);
      return;
    }
    void load(environmentUrl);
  }, [environmentUrl, load]);

  return { bots, loading, error };
}
