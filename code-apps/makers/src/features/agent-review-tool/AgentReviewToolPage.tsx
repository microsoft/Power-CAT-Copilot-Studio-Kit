/**
 * Agent Review Tool Page
 *
 * Page wrapper for Agent Review Tool feature.
 * This is the component referenced in navigation.ts routing.
 */

import AgentReviewTool from './AgentReviewTool';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

export default function AgentReviewToolPage() {
  useFeatureTelemetry('agent-review-tool-load', 'Agent Review Tool');
  return <AgentReviewTool />;
}
