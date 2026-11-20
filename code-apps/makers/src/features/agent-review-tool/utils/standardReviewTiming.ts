import type { StandardReviewScope } from '../hooks/useReviewMutation';

export const STANDARD_REVIEW_EXPECTED_LABEL = 'Estimated 6–10 min';
export const STANDARD_REVIEW_SLOW_AFTER_MS = 10 * 60 * 1000;
export const STANDARD_REVIEW_SLOW_NOTE =
  'This review is taking longer than the measured 6–10 minute range. It is still running in the background.';

/** Format the extracted review scope for the progress dialog. */
export function formatStandardReviewScope(scope: StandardReviewScope): string {
  const topicLabel = scope.topicCount === 1 ? 'topic' : 'topics';
  const knowledgeLabel =
    scope.knowledgeSourceCount === 1 ? 'knowledge source' : 'knowledge sources';
  return `${scope.topicCount} ${topicLabel} · ${scope.toolAndAgentCount} tools and agents · `
    + `${scope.knowledgeSourceCount} ${knowledgeLabel}`;
}
