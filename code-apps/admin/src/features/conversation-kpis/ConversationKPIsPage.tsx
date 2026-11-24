import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

export default function ConversationKPIsPage() {
  useFeatureTelemetry('conversation-kpis', 'Conversation KPI');
  return (
    <div style={{ padding: '20px' }}>
      <h1>Conversation KPI</h1>
      <p>This page is under construction.</p>
    </div>
  );
}
