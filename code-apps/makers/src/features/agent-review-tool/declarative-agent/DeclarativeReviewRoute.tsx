/**
 * Route wrapper for the declarative (M365 Copilot) review screen.
 * Path: /agent-review-tool/declarative/:reviewId
 *
 * Keyed by `reviewId`, not `botId` — a declarative review is identified by its
 * `DAReviewRecord`, and the same manifest can be reviewed more than once.
 *
 * Query string:
 * - `tab=<criterion>` reopens on a specific criterion, so a shared link lands
 *   where the sender was reading.
 *
 * Sibling of the shipped `/agent-review-tool/copilot/:botId` rather than a
 * `:type` segment, because the two are keyed by different identifiers.
 */

import { useParams, Navigate } from 'react-router-dom';
import { DeclarativeReviewPage } from './DeclarativeReviewPage';

export default function DeclarativeReviewRoute() {
  const { reviewId } = useParams<{ reviewId: string }>();

  if (!reviewId) return <Navigate to="/agent-review-tool" replace />;

  return <DeclarativeReviewPage reviewId={reviewId} />;
}
