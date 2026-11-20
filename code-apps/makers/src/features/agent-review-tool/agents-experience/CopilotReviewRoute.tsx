import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { CopilotReviewPage } from './components/CopilotReviewPage';
import { parseCopilotReviewRouteState } from './utils/copilotReviewRouteState';

/**
 * Route wrapper for the Microsoft Copilot harness review screen.
 * Path: /agent-review-tool/copilot/:botId
 *
 * Two modes (Task 11):
 * - Run:  ?run=1&componentIdUnique=<guid>&name=<agent>
 * - View: ?view=1&reviewId=<guid>&name=<agent>
 *
 * Review depth is not selectable; a legacy `mode` parameter on an older
 * bookmark is accepted and ignored.
 */
export default function CopilotReviewRoute() {
  const { botId } = useParams<{ botId: string }>();
  const [search] = useSearchParams();

  if (!botId) return <Navigate to="/agent-review-tool" replace />;

  const botName = search.get('name') ?? 'Agent';
  const orgUrl = search.get('orgUrl');
  const environmentId = search.get('environmentId');

  let routeState;
  try {
    routeState = parseCopilotReviewRouteState(search);
  } catch {
    // Invalid route state (e.g. view=1 without reviewId) → redirect
    return <Navigate to="/agent-review-tool" replace />;
  }

  return (
    <CopilotReviewPage
      botId={botId}
      botName={botName}
      orgUrl={orgUrl}
      environmentId={environmentId}
      routeState={routeState}
    />
  );
}
