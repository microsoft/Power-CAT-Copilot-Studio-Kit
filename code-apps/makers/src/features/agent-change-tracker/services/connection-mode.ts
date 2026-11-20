/**
 * Detects whether the Agent Change Tracker should use its local fallback store
 * instead of the live cross-org Dataverse connection.
 *
 * Normal development runs through Power Apps Local Play, so it must use the
 * same live Dataverse path as the deployed app. Offline preview data is only
 * enabled explicitly with `?changeTrackerPreview=local`; an automatic timeout
 * fallback can race host initialization and make this feature behave
 * differently in dev for the rest of the browser session.
 */

let probe: Promise<boolean> | null = null;

async function runProbe(): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).get('changeTrackerPreview') === 'local';
}

/**
 * Resolves to `true` when the local fallback store should be used.
 * The mode is resolved at most once per session; the result is cached.
 */
export function shouldUseLocalStore(): Promise<boolean> {
  if (!probe) probe = runProbe();
  return probe;
}
