/**
 * Lists agents that can be opted into change tracking.
 *
 * Reads the app's agent catalog (cat_agentdetails) via the generic Dataverse
 * service. The catalog spans every environment the kit has inventoried, so the
 * full set is returned and grouped by environment for the selection flow. The
 * catalog table lives in the tracking org (the environment the app is deployed
 * to), whose URL is resolved at runtime (see services/tracking-org).
 */

import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import {
  type AvailableAgent,
  type AvailableEnvironment,
} from '../contracts/change-tracker';
import { shouldUseLocalStore } from './connection-mode';
import { getTrackingOrgUrl } from './tracking-org';
import { localGetTrackableAgents } from './local-store';

const ENTITY_SET = 'cat_agentdetailses';
const ACCEPT = 'application/json';
const SELECT = [
  'cat_agentdetailsid',
  'cat_name',
  'cat_agentid',
  'cat_environmentid',
  'cat_environmenturl',
  'cat_environmentname',
  'cat_environmenttype',
  'cat_agentowner',
  'cat_publishedby',
  'cat_publisheddate',
].join(',');

function rowsOf(data: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const value = (data as { value?: unknown } | undefined)?.value;
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function strOf(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Fetch every trackable catalog agent across all inventoried environments.
 * Agents missing a catalog id or bot id are skipped (they cannot be tracked).
 * The catalog table itself always lives in the tracking org, so that is where
 * the read is issued from regardless of which environment each agent belongs to.
 */
export async function getTrackableAgents(
  orgUrl: string = getTrackingOrgUrl(),
): Promise<AvailableAgent[]> {
  if (await shouldUseLocalStore()) return localGetTrackableAgents();

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    orgUrl.trim().replace(/\/+$/g, ''),
    ENTITY_SET,
    'odata.maxpagesize=5000',
    ACCEPT,
    undefined,
    undefined,
    SELECT,
    undefined,
    'cat_name asc',
  );
  if (!result.success) return [];

  return rowsOf(result.data)
    .filter((row) => Boolean(strOf(row, 'cat_agentdetailsid')) && Boolean(strOf(row, 'cat_agentid')))
    .map((row) => ({
      id: strOf(row, 'cat_agentdetailsid') ?? '',
      name: strOf(row, 'cat_name') ?? '',
      agentId: strOf(row, 'cat_agentid'),
      environmentId: strOf(row, 'cat_environmentid'),
      environmentUrl: strOf(row, 'cat_environmenturl'),
      environmentName: strOf(row, 'cat_environmentname'),
      environmentType: strOf(row, 'cat_environmenttype'),
      ownerName: strOf(row, 'cat_agentowner'),
      publishedByName: strOf(row, 'cat_publishedby'),
      publishedOn: strOf(row, 'cat_publisheddate'),
    }));
}

/**
 * Derive the distinct environments represented in a set of trackable agents,
 * keyed by normalized org url and sorted by friendly name. Agents without an
 * environment url are ignored.
 */
export function getTrackableEnvironments(agents: AvailableAgent[]): AvailableEnvironment[] {
  const byUrl = new Map<string, AvailableEnvironment>();
  for (const agent of agents) {
    const url = (agent.environmentUrl ?? '').trim().replace(/\/+$/g, '');
    if (!url) continue;
    const key = url.toLowerCase();
    if (byUrl.has(key)) continue;
    byUrl.set(key, {
      id: agent.environmentId ?? key,
      name: agent.environmentName ?? url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0],
      url,
      type: agent.environmentType,
    });
  }
  return [...byUrl.values()].sort((a, b) => a.name.localeCompare(b.name));
}
