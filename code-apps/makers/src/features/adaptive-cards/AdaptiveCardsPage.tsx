import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

export default function AdaptiveCardsPage() {
  useFeatureTelemetry('adaptive-cards', 'Adaptive Cards');
  return (
    <div style={{ padding: '20px', overflowWrap: 'anywhere' }}>
      <h1>Adaptive Cards</h1>
      <p>This page is under construction.</p>
    </div>
  );
}