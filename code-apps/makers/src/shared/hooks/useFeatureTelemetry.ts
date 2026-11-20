import { useEffect } from 'react';
import { logFeatureOpen } from '../services/featureTelemetry';

/**
 * Fires a fire-and-forget `LogFeatureTelemetry` flow call when a feature page
 * mounts. Safe to call unconditionally at the top of any page component —
 * telemetry is gated on `markTelemetryReady()` and de-duplicated per feature
 * within a 5-second window to absorb StrictMode double-mounts and rapid
 * back/forward navigations.
 */
export function useFeatureTelemetry(featureName: string, featureLabel: string): void {
  useEffect(() => {
    logFeatureOpen(featureName, featureLabel);
  }, [featureName, featureLabel]);
}
