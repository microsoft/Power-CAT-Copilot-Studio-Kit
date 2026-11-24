/**
 * Resolve the Power Platform environment a reviewed agent actually lives in.
 *
 * The modern Copilot Studio deep-links are
 * `/environments/<envId>/agents/<agentId>/...`.
 * The host app's environment is only the right answer when the review targets
 * the host environment. Agents are routinely reviewed cross-environment, and
 * using the host GUID there sends the user to an environment where the agent
 * does not exist — a link that looks right and is wrong.
 *
 * The environment selector carries the Power Platform environment GUID into the
 * review route. The `cat_agentdetails` lookup below exists only for older direct
 * links that do not include that GUID.
 *
 * When the legacy mapping cannot be resolved this returns `null` so the caller
 * can suppress the link instead of sending the maker to the wrong environment.
 */
import { getContext } from '@microsoft/power-apps/app';
import { MicrosoftDataverseService } from '../../../../generated/services/MicrosoftDataverseService';

/** Normalises an org URL for comparison: scheme-insensitive, no trailing slash. */
function canonicalOrgUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim().toLowerCase().replace(/\/+$/, '');
  if (!trimmed || trimmed === 'zip') return null;
  return trimmed.replace(/^https?:\/\//, '');
}

const envIdByOrgUrl = new Map<string, string | null>();

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * @param reviewedOrgUrl - Org URL the review ran against; null means the host org.
 * @param routeEnvironmentId - Environment GUID captured by the environment selector.
 * @param reviewedAgentId - Agent GUID used only to scope the legacy fallback query.
 * @returns The environment GUID, or null when it cannot be determined.
 */
export async function resolveAgentEnvironmentId(
  reviewedOrgUrl: string | null,
  routeEnvironmentId: string | null,
  reviewedAgentId?: string | null,
): Promise<string | null> {
  const selectedEnvironmentId = routeEnvironmentId?.trim();
  if (selectedEnvironmentId) return selectedEnvironmentId;

  const hostEnvId = await hostEnvironmentId();
  const target = canonicalOrgUrl(reviewedOrgUrl);

  // No explicit target org means the review ran against the host environment.
  if (!target) return hostEnvId;

  const hostOrgUrl = await hostOrganizationUrl();
  if (hostOrgUrl && target === hostOrgUrl) return hostEnvId;

  if (envIdByOrgUrl.has(target)) return envIdByOrgUrl.get(target) ?? null;

  let resolved: string | null = null;
  try {
    const agentId = reviewedAgentId?.trim();
    const filter = agentId
      ? `cat_agentid eq '${escapeODataString(agentId)}'`
      : `cat_environmenturl eq '${escapeODataString(reviewedOrgUrl ?? '')}'`;
    const result = await MicrosoftDataverseService.ListRecords(
      'cat_agentdetailses',
      undefined, // prefer
      undefined, // accept
      undefined, // x_ms_odata_metadata_full
      'cat_agentid,cat_environmentid,cat_environmenturl', // $select
      filter,
      undefined, // $orderby
      undefined, // $expand
      undefined, // fetchXml
      5, // $top
    );
    const rows = (result.data as { value?: Record<string, unknown>[] } | undefined)?.value ?? [];
    for (const row of rows) {
      if (canonicalOrgUrl(row['cat_environmenturl'] as string) === target) {
        const id = (row['cat_environmentid'] as string) ?? '';
        if (id) { resolved = id; break; }
      }
    }
  } catch {
    resolved = null;
  }

  envIdByOrgUrl.set(target, resolved);
  return resolved;
}

let hostEnvIdPromise: Promise<string | null> | undefined;
function hostEnvironmentId(): Promise<string | null> {
  hostEnvIdPromise ??= getContext()
    .then((ctx) => ctx.app.environmentId ?? null)
    .catch(() => null);
  return hostEnvIdPromise;
}

let hostOrgUrlPromise: Promise<string | null> | undefined;
function hostOrganizationUrl(): Promise<string | null> {
  hostOrgUrlPromise ??= getContext()
    .then((ctx) => canonicalOrgUrl((ctx as { app?: { environmentUrl?: string } }).app?.environmentUrl))
    .catch(() => null);
  return hostOrgUrlPromise;
}
