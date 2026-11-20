/**
 * Route wrapper for the Skills and Automations review screen.
 * Path: /agent-review-tool/skills/:reviewId
 *
 * Sibling of `/agent-review-tool/declarative/:reviewId` and
 * `/agent-review-tool/standard/:botId`, so all three review types are reached
 * the same way.
 */

import { useParams, Navigate } from 'react-router-dom';
import { SkillsReviewPage } from './components/SkillsReviewPage';

export default function SkillsReviewRoute() {
  const { reviewId } = useParams<{ reviewId: string }>();

  if (!reviewId) return <Navigate to="/agent-review-tool" replace />;

  return <SkillsReviewPage reviewId={reviewId} />;
}
