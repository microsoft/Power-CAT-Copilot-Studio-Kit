/**
 * cloudUrls — Cloud-type-aware URL resolution for Power Platform services.
 *
 * Resolves base URLs for Copilot Studio and make.powerapps.com based on the
 * tenant's cloud type (Commercial, GCC, GCC High, DoD).
 */

import type { CloudType } from '../contracts/types';

// ---------------------------------------------------------------------------
// URL Maps
// ---------------------------------------------------------------------------

/** Canonical cloud keys used as map keys for URL resolution. */
type CanonicalCloud = 'commercial' | 'gcc' | 'gcchigh' | 'dod';

const VALID_CLOUD_TYPES = new Set<string>(['commercial', 'gcc', 'gcchigh', 'dod']);

function normalizeCloudType(cloudType: CloudType | undefined): CanonicalCloud {
  if (!cloudType) return 'commercial';
  if (cloudType === 'gcc(high)') return 'gcchigh';
  if (!VALID_CLOUD_TYPES.has(cloudType)) {
    console.warn(`[cloudUrls] Invalid cloudType "${cloudType}". Falling back to "commercial".`);
    return 'commercial';
  }
  return cloudType as CanonicalCloud;
}

const COPILOT_STUDIO_URLS: Record<CanonicalCloud, string> = {
  commercial: 'https://copilotstudio.microsoft.com',
  gcc: 'https://gcc.powerva.microsoft.us',
  gcchigh: 'https://high.powerva.microsoft.us',
  dod: 'https://dod.powerva.microsoft.us',
};

const MAKE_POWERAPPS_URLS: Record<CanonicalCloud, string> = {
  commercial: 'https://make.powerapps.com',
  gcc: 'https://make.gov.powerapps.us',
  gcchigh: 'https://make.high.powerapps.us',
  dod: 'https://make.apps.appsplatform.us',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CloudUrls {
  copilotStudio: string;
  makePowerApps: string;
}

/**
 * Returns the base URLs for the given cloud type.
 * Defaults to `'commercial'` when cloudType is undefined.
 */
export function getCloudUrls(cloudType?: CloudType): CloudUrls {
  const cloud = normalizeCloudType(cloudType);
  return {
    copilotStudio: COPILOT_STUDIO_URLS[cloud],
    makePowerApps: MAKE_POWERAPPS_URLS[cloud],
  };
}

/**
 * Builds a Copilot Studio deep link URL.
 * @param cloudType - tenant cloud type
 * @param environmentId - Power Platform environment ID
 * @param path - path segment after /environments/{envId}/ (e.g. "component-collections")
 * @param resourceId - optional resource ID appended to the path
 */
export function buildCopilotStudioUrl(
  cloudType: CloudType | undefined,
  environmentId: string,
  path: string,
  resourceId?: string,
): string {
  const base = getCloudUrls(cloudType).copilotStudio;
  const url = `${base}/environments/${environmentId}/${path}`;
  return resourceId ? `${url}/${resourceId}` : url;
}

/**
 * Builds a make.powerapps.com deep link to create a new connection.
 * @param cloudType - tenant cloud type
 * @param environmentId - Power Platform environment ID
 * @param connectorName - connector short name (e.g. "shared_wordonlinebusiness")
 */
export function buildCreateConnectionUrl(
  cloudType: CloudType | undefined,
  environmentId: string,
  connectorName: string,
): string {
  const base = getCloudUrls(cloudType).makePowerApps;
  return `${base}/environments/${environmentId}/connections/available/${connectorName}`;
}
