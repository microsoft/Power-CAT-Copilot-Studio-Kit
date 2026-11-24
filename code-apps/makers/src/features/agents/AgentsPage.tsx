import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

export default function AgentsPage() {
  useFeatureTelemetry('agents', 'Agents');
  return (
    <div style={{ padding: '20px' }}>
      <h1>Agents</h1>
      <p>This page is under construction.</p>
    </div>
  );
}
