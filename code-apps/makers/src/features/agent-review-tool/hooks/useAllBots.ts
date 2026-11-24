/**
 * useAllBots Hook
 *
 * React Query hook for fetching all active bots from Dataverse.
 * When selectedOrgUrl is provided, fetches from that environment via
 * ListRecordsWithOrganization. Otherwise fetches from the current environment.
 *
 * Configuration:
 * - Stale time: 5 minutes
 * - Refetch on window focus: true
 * - Retry: 3 attempts
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { botService } from '../services/BotService';
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import type { BotMetadata } from '../contracts/ReviewResult';
import { STALE_TIMES } from '../contracts/Constants';
import { detectAgentHarness, isReviewableAgentConfiguration } from '../agents-experience/services/detection';

/**
 * Query key for all bots — keyed by org URL so each environment is cached separately.
 */
export const allBotsQueryKey = (orgUrl: string | null) =>
  ['bots', 'active', orgUrl ?? 'current'] as const;

/**
 * Fetch bots from a specific environment via ListRecordsWithOrganization.
 */
export async function fetchBotsFromOrg(orgUrl: string): Promise<BotMetadata[]> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    orgUrl,
    'bots',
    undefined,
    undefined,
    undefined,
    undefined,
    'botid,name,statuscode,componentidunique,modifiedon,createdon,publishedon,iconbase64,configuration,template',
    'statecode eq 0',
    'name asc',
  );

  if (!result.success || !result.data) {
    console.error('Failed to fetch bots from org:', result.error);
    return [];
  }

  const items = (result.data as { value?: Record<string, unknown>[] }).value ?? [];

  // Gen AI standard agents, Microsoft Copilot agents, and unsupported harness agents (spec 013, issue 947)
  const generativeBots = items.filter((bot) =>
    isReviewableAgentConfiguration(
      bot['configuration'] as string | null | undefined,
      bot['template'] as string | null | undefined,
    ),
  );

  return generativeBots.map((bot) => ({
    botId: (bot['botid'] as string) || '',
    name: (bot['name'] as string) || 'Unnamed Bot',
    statusCode: (bot['statuscode'] as number) || 0,
    componentIdUnique: (bot['componentidunique'] as string) || '',
    modifiedOn: bot['modifiedon'] ? new Date(bot['modifiedon'] as string) : undefined,
    createdOn: bot['createdon'] ? new Date(bot['createdon'] as string) : undefined,
    publishedOn: bot['publishedon'] ? new Date(bot['publishedon'] as string) : undefined,
    iconBase64: (bot['iconbase64'] as string) || undefined,
    harness: detectAgentHarness(
      bot['configuration'] as string | null | undefined,
      bot['template'] as string | null | undefined,
    ).kind,
  }));
}

/**
 * useAllBots hook
 *
 * Fetches all active Gen-AI bots. Accepts an optional `orgUrl` to fetch from
 * a different environment. When null, falls back to the current environment.
 *
 * @param orgUrl - Optional environment URL. Null = current environment.
 *
 * @example
 * ```tsx
 * const { data: bots } = useAllBots(selectedOrgUrl);
 * ```
 */
export function useAllBots(orgUrl: string | null = null): UseQueryResult<BotMetadata[], Error> {
  return useQuery({
    queryKey: allBotsQueryKey(orgUrl),
    queryFn: () =>
      orgUrl ? fetchBotsFromOrg(orgUrl) : botService.getAllActiveBots(),
    staleTime: STALE_TIMES.BOTS, // 5 minutes
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
