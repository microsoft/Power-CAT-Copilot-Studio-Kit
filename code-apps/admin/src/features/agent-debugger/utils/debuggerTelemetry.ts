import { logFeatureEvent } from '../../../shared/services/featureTelemetry';

const ANALYZE_FEATURE_NAME = 'agent-debugger-analyze';
const ANALYZE_FEATURE_LABEL = 'Agent Debugger';

/**
 * Records that a user ran an Agent Debugger analysis.
 *
 * Fires once per distinct analysis, for both entry paths: the "Analyze" button
 * (transcript mode) and the "Upload snapshot" auto-analysis (snapshot mode).
 * Call it from the AnalysisWorkspace auto-analyze seam, after the valid-data
 * guard, so a telemetry event means "an analysis was started" rather than "the
 * page was opened". Uses the no-dedup `logFeatureEvent` so each distinct
 * analysis is counted; the workspace's key-based remount already prevents an
 * unchanged re-run from re-firing.
 */
export function logAnalyzeStarted(): void {
  logFeatureEvent(ANALYZE_FEATURE_NAME, ANALYZE_FEATURE_LABEL);
}
