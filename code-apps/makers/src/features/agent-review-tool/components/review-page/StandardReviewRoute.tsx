/**
 * Route wrapper for the Standard (Copilot Studio) review screen.
 * Path: /agent-review-tool/standard/:botId
 *
 * Keyed by `botId`, matching the shipped `/agent-review-tool/copilot/:botId`.
 *
 * Query string:
 * - `reviewId=<guid>` selects the exact persisted result.
 * - `orgUrl=<url>` scopes the lookup to a cross-environment review, as the
 *   dashboard grid does. Omitted means the current environment.
 */

import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { StandardReviewPage } from './StandardReviewPage';

export default function StandardReviewRoute() {
  const { botId } = useParams<{ botId: string }>();
  const [search] = useSearchParams();
  const reviewId = search.get('reviewId');
  const orgUrl = search.get('orgUrl');
  const sourceEnvironment = search.get('sourceEnvironment');

  if (!botId) return <Navigate to="/agent-review-tool" replace />;

  return (
    <StandardReviewPage
      botId={botId}
      reviewId={reviewId}
      orgUrl={orgUrl}
      sourceEnvironment={sourceEnvironment}
    />
  );
}
