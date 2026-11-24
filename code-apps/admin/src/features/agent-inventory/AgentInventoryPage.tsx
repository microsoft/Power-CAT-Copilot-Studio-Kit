import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from '../../shared/components/PageLoader';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

const InventoryDashboardScreen = lazy(() => import('./screens/InventoryDashboardScreen'));
const AllAgentsScreen = lazy(() => import('./screens/AllAgentsScreen'));
const AgentOverviewScreen = lazy(() => import('./screens/AgentOverviewScreen'));
const AgentInventorySettingsScreen = lazy(() => import('./settings/AgentInventorySettingsScreen'));

export default function AgentInventoryPage() {
  useFeatureTelemetry('agent-inventory', 'Agent Inventory');
  return (
    <Suspense fallback={<PageLoader ariaLabel="Loading agent inventory" />}>
      <Routes>
        <Route index element={<InventoryDashboardScreen />} />
        <Route path="agents" element={<AllAgentsScreen />} />
        <Route path="agents/:agentDetailsId" element={<AgentOverviewScreen />} />
        <Route path="settings" element={<AgentInventorySettingsScreen />} />
        <Route path="*" element={<Navigate to="/agent-inventory" replace />} />
      </Routes>
    </Suspense>
  );
}
