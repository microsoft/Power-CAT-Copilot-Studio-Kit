import { LogFeatureTelemetryService } from '../../generated/services/LogFeatureTelemetryService';

/**
 * Fire-and-forget feature-open telemetry.
 *
 * Best-effort delivery: failures are swallowed to `console.log`, never surface
 * to the UI. Never blocks or throws to callers.
 *
 * Wire-up:
 *   1. `markTelemetryReady()` is called from `App.tsx` after MDA/deeplink
 *      routing settles. Fires before that are dropped to avoid logging the
 *      transient wildcard landing route.
 *   2. Feature pages call `useFeatureTelemetry(name, label)` from the shared
 *      hook, which invokes `logFeatureOpen` on mount.
 */

const APP_NAME = 'Admin';
const DEBOUNCE_MS = 5000;

let telemetryReady = false;
const lastFired = new Map<string, number>();

export function markTelemetryReady(): void {
  telemetryReady = true;
}

export function logFeatureOpen(featureName: string, featureLabel: string): void {
  if (!telemetryReady) return;

  const now = Date.now();
  const prev = lastFired.get(featureName) ?? 0;
  if (now - prev < DEBOUNCE_MS) return;
  lastFired.set(featureName, now);

  fireTelemetry(featureName, featureLabel);
}

/**
 * Fire-and-forget telemetry for a discrete user action, with no time-based
 * de-duplication.
 *
 * Use this for events where every occurrence is a distinct, meaningful action
 * (for example, running an analysis) and must be counted on its own. Unlike
 * `logFeatureOpen`, it has no debounce — callers are responsible for only
 * invoking it when a real action has been accepted. It keeps the same
 * `markTelemetryReady()` gate so events fired before routing settles are
 * dropped rather than mislabelled.
 */
export function logFeatureEvent(featureName: string, featureLabel: string): void {
  if (!telemetryReady) return;
  fireTelemetry(featureName, featureLabel);
}

function fireTelemetry(featureName: string, featureLabel: string): void {
  const payload = {
    appName: APP_NAME,
    featureName,
    featureLabel,
    userTimestamp: new Date().toISOString(),
  };

  try {
    LogFeatureTelemetryService.Run({ text: JSON.stringify(payload) })
      .then((result) => {
        if (!result.success) {
          console.log('[featureTelemetry] flow returned failure:', result.error);
        }
      })
      .catch((err) => {
        console.log('[featureTelemetry] flow call rejected:', err);
      });
  } catch (err) {
    console.log('[featureTelemetry] synchronous throw:', err);
  }
}
