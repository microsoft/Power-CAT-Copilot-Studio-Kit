import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

export default function WebchatPlaygroundPage() {
  useFeatureTelemetry('webchat-playground', 'Webchat Playground');
  return (
    <div style={{ padding: '20px' }}>
      <h1>Webchat Playground</h1>
      <p>This page is under construction.</p>
    </div>
  );
}
