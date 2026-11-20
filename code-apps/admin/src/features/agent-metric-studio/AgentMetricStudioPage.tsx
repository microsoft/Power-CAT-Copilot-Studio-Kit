/**
 * AgentMetricStudioPage - Root entry point for the Agent Metric Studio feature.
 * Renders the self-contained AMS AppShell with its own Fluent theme and Zustand state.
 * Accessed via /agent-metric-studio route from the Agent Insights Hub.
 */
import { AppShell } from './components/shell/AppShell';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';
import './index.css';

export default function AgentMetricStudioPage() {
  useFeatureTelemetry('agent-metric-studio', 'Agent Metric Studio');
  return <AppShell />;
}
