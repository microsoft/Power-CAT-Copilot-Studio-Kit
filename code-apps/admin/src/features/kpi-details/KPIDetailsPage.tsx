import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

export default function KPIDetailsPage() {
  useFeatureTelemetry('kpi-details', 'KPI Details View');
  return (
    <div style={{ padding: '20px' }}>
      <h1>KPI Details View</h1>
      <p>This page is under construction.</p>
    </div>
  );
}
