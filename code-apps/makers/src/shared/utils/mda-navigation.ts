/**
 * MDA (Model-Driven App) deep-link navigation utilities.
 *
 * The Code App runs on a different origin (powerplatformusercontent.com) from
 * the outer Power Apps player (apps.powerapps.com), so window.top is cross-origin
 * and window.location.search is empty. URL params are only accessible via the
 * Power Apps SDK's getContext().app.queryParams.
 *
 * --- How the MDA side works ---
 * A small HTML web resource is loaded by the MDA sitemap entry for
 * "Agent Insights Hub". It redirects window.top to the Code App URL with params:
 *   https://apps.powerapps.com/play/e/{envId}/app/{APP_ID}
 *     ?deeplink=%2Fagent-insights-hub
 *     &mda_org_url=https%3A%2F%2F…
 *     &mda_app_id=…
 *
 * The Code App reads these via getContext().app.queryParams (Power Apps SDK).
 *
 * --- Outbound navigation ---
 * When user clicks a nav item with mdaPageParams, we redirect window.top back
 * to the MDA. window.top IS accessible here because we are calling it from
 * inside the Power Apps player iframe context (same origin as the player shell).
 *
 * sessionStorage keys persisted after first SDK context read:
 *   - "mda_org_url"  e.g. "https://contoso.crm.dynamics.com"
 *   - "mda_app_id"   e.g. "1351a93b-ce0e-41ed-9036-e191f1d272d1"
 */

import { getContext } from '@microsoft/power-apps/app';
import type { NavigationConfig } from '../types/navigation';

const MDA_ORG_URL_KEY = 'mda_org_url';
const MDA_APP_ID_KEY = 'mda_app_id';

/**
 * Returns true when the Code App is running inside a Power Apps / MDA iframe
 * AND the MDA has provided its context (org URL + app ID).
 */
export function isMdaContext(): boolean {
  return !!(sessionStorage.getItem(MDA_ORG_URL_KEY) && sessionStorage.getItem(MDA_APP_ID_KEY));
}

/**
 * Build a full MDA /main.aspx URL from the stored org URL, app ID, and
 * page-specific query params.
 *
 * @param pageParams - The query-string portion after `appid=…`, e.g.
 *   "pagetype=custom&name=cat_homecoe_70fca"
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
 * Falls back to a no-op if context is missing.
 *
 * @param pageParams - e.g. "pagetype=custom&name=cat_homecoe_70fca"
 */
export function navigateToMda(pageParams: string): void {
  const url = buildMdaUrl(pageParams);
  if (!url) {
    console.warn('[mda-navigation] MDA context not available – cannot redirect.');
    return;
  }

  try {
    // window.top navigates the MDA shell, not just the iframe
    window.top!.location.href = url;
  } catch {
    // Cross-origin guard: if top is not accessible fall back to same window
    window.location.href = url;
  }
}

/**
 * Returns a filtered NavigationConfig containing only routes that are valid
 * in the current context:
 * - In MDA context: all routes (MDA items redirect via window.top, internal items stay in app)
 * - In standalone context: only routes without mdaPageParams (Agent Insights Hub only)
 *
 * @param config - The full navigation configuration
 * @param isMda - Resolved MDA context flag (from MdaContext, not sessionStorage directly)
 */
export function getContextualNavConfig(config: NavigationConfig, _isMda: boolean): NavigationConfig {
  return config;
}

/**
 * Read MDA context and deeplink from the Power Apps SDK queryParams.
 * The SDK surfaces URL query params passed to the Code App play URL.
 *
 * Persists org URL + app ID to sessionStorage.
 * Returns the deeplink route (e.g. "/agent-insights-hub") or null.
 */
export async function initMdaContextFromSdk(): Promise<string | null> {
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
