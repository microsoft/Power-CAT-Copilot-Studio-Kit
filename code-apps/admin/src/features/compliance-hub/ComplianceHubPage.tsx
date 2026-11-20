import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

export default function ComplianceHubPage() {
  useFeatureTelemetry('compliance-hub', 'Compliance Hub');
  return (
    <div style={{ padding: '20px' }}>
      <h1>Compliance Hub</h1>
      <p>This page is under construction.</p>
    </div>
  );
}
