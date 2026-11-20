import { logFeatureEvent } from '../../../shared/services/featureTelemetry';

const REVIEW_FEATURE_NAME = 'agent-review-tool-submission';
const REVIEW_FEATURE_LABEL = 'Agent Review Tool';

/**
 * Records that a user started an Agent Review Tool review.
 *
 * Fires once per accepted review start, for every review type (Standard,
 * Microsoft Copilot, M365 Declarative, Skills & Automations). Call it from each
 * review runner after its in-flight guard, so a telemetry event means "a
 * review was started" rather than "the page was opened". Uses the no-dedup
 * `logFeatureEvent` so two reviews started in quick succession are both
 * counted.
 */
export function logReviewStarted(): void {
  logFeatureEvent(REVIEW_FEATURE_NAME, REVIEW_FEATURE_LABEL);
}
