/**
 * MDA (Model-Driven App) deep-link navigation utilities for PowerShield-Admin.
 *
 * The Admin app is a standalone Code App that runs inside the Power Apps player.
 * When launched from the MDA, context params are passed via the SDK:
 *   - mda_org_url: e.g. "https://org.crm.dynamics.com"
 *   - mda_app_id: e.g. "1351a93b-ce0e-41ed-9036-e191f1d272d1"
 *
 * Clicking a non-PowerShield-Admin nav item redirects window.top to the MDA.
 */

import { getContext } from '@microsoft/power-apps/app';
import type { PowerShieldNavConfig } from '../config/navigation';

const MDA_ORG_URL_KEY = 'mda_org_url';
const MDA_APP_ID_KEY = 'mda_app_id';

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
 * - Standalone mode: only routes without mdaPageParams (internal routes)
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
 * Read MDA context from the Power Apps SDK queryParams.
 * Persists org URL + app ID to sessionStorage.
 * Returns the deeplink route or null.
 */
export async function initMdaContextFromSdk(): Promise<string | null> {
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
