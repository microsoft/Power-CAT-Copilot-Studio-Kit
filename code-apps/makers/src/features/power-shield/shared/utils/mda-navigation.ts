/**
 * MDA (Model-Driven App) deep-link navigation utilities.
 *
 * PowerShield runs inside the same MDA as the Copilot Agent Kit. When
 * embedded, the MDA passes context via Power Apps SDK queryParams:
 *   - mda_org_url: e.g. "https://org.crm.dynamics.com"
 *   - mda_app_id: e.g. "1351a93b-ce0e-41ed-9036-e191f1d272d1"
 *   - deeplink: e.g. "/power-shield" or "/requests/{requestId}"
 *
 * Clicking a non-PowerShield nav item redirects window.top back to the MDA.
 */

import { getContext } from '@microsoft/power-apps/app';
import type { PowerShieldNavConfig } from '../config/navigation';

const MDA_ORG_URL_KEY = 'mda_org_url';
const MDA_APP_ID_KEY = 'mda_app_id';

const POWER_SHIELD_PREFIX = '/power-shield';

/** Allowed deep link route patterns — only GUID-based request detail for now. */
const VALID_DEEP_LINK_PATTERNS: RegExp[] = [
  /^\/requests\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
];

/**
 * Returns true when the app is running inside a Power Apps / MDA iframe
 * AND the MDA has provided its context (org URL + app ID).
 */
export function isMdaContext(): boolean {
  return !!(sessionStorage.getItem(MDA_ORG_URL_KEY) && sessionStorage.getItem(MDA_APP_ID_KEY));
}

/**
 * Build a full MDA /main.aspx URL from the stored org URL, app ID, and
 * page-specific query params.
 */
export function buildMdaUrl(pageParams: string): string | null {
  const orgUrl = sessionStorage.getItem(MDA_ORG_URL_KEY);
  const appId = sessionStorage.getItem(MDA_APP_ID_KEY);
  if (!orgUrl || !appId) return null;

  const base = orgUrl.replace(/\/$/, '');
  return `${base}/main.aspx?appid=${appId}&${pageParams}`;
}

/**
 * Navigate the top-level window (MDA frame) to the given MDA page params.
 */
export function navigateToMda(pageParams: string): void {
  const url = buildMdaUrl(pageParams);
  if (!url) {
    console.warn('[mda-navigation] MDA context not available – cannot redirect.');
    return;
  }

  try {
    window.top!.location.href = url;
  } catch {
    window.location.href = url;
  }
}

/**
 * Returns a filtered NavigationConfig for the current context:
 * - MDA mode: all routes visible
 * - Standalone mode: only routes without mdaPageParams
 */
export function getContextualNavConfig(config: PowerShieldNavConfig, isMda: boolean): PowerShieldNavConfig {
  if (isMda) return config;

  return {
    sections: config.sections
      .map((section) => ({
        ...section,
        routes: section.routes.filter((route) => !route.mdaPageParams),
      }))
      .filter((section) => section.routes.length > 0),
  };
}

/**
 * Extract a valid internal route from a deeplink value.
 *
 * Strips the optional "/power-shield" prefix and validates the route
 * against an allowlist of allowed patterns to prevent arbitrary navigation.
 * Returns null for missing, empty, or unrecognised deeplink values.
 */
export function extractDeepLinkRoute(deeplink: string | null): string | null {
  if (!deeplink) return null;

  let route = deeplink;

  // Strip optional app-level prefix (e.g. "/power-shield/requests/..." → "/requests/...")
  if (route.startsWith(POWER_SHIELD_PREFIX + '/')) {
    route = route.substring(POWER_SHIELD_PREFIX.length);
  } else if (route === POWER_SHIELD_PREFIX) {
    return null; // Just the app identifier — no specific record
  }

  // Validate against allowed patterns
  if (VALID_DEEP_LINK_PATTERNS.some((pattern) => pattern.test(route))) {
    return route;
  }

  return null;
}

/**
 * Read MDA context from the Power Apps SDK queryParams.
 * Persists org URL + app ID to sessionStorage.
 * Returns the deeplink route or null.
 */
export async function initMdaContextFromSdk(): Promise<string | null> {
  // In local dev mode, the Power Apps host is absent — read from URL instead.
  if (import.meta.env.DEV) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('deeplink') ?? null;
  }

  try {
    const ctx = await getContext();
    const params = ctx.app.queryParams;

    const orgUrl = params['mda_org_url'];
    const appId = params['mda_app_id'];
    const deeplink = params['deeplink'] ?? null;

    if (orgUrl) sessionStorage.setItem(MDA_ORG_URL_KEY, orgUrl);
    if (appId) sessionStorage.setItem(MDA_APP_ID_KEY, appId);

    return deeplink && deeplink !== '/' ? deeplink : null;
  } catch (e) {
    console.warn('[mda-navigation] SDK getContext failed:', e);
    return null;
  }
}
