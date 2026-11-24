import { useEffect } from 'react';
import { FluentProvider, Toaster, makeStyles, tokens } from '@fluentui/react-components';
import { Routes, Route, Navigate } from 'react-router-dom';
import { powerShieldTheme } from './theme/powerShieldTheme';
import { AdminAuthProvider } from './shared/contexts/AuthContext';
import { AppShell } from './shared/components/AppShell';
import { HomeScreen } from './features/home/components/HomeScreen';
import { RequestTabsLayout } from './features/credits/components/RequestTabsLayout';
import { CreditsListScreen } from './features/credits/components/CreditsListScreen';
import { CreditRequestDetailView } from './features/credits/components/CreditRequestDetailView';
import { RequestDetailView } from './features/request-detail/components/RequestDetailView';
import { BlockedConnectorsScreen } from './features/admin/components/BlockedConnectorsScreen';
import { ConnectorsScreen } from './features/admin/components/ConnectorsScreen';
import { ConnectorActionsScreen } from './features/admin/components/ConnectorActionsScreen';
import { SettingsHubScreen } from './features/admin/components/SettingsHubScreen';
import { QuestionConfigScreen } from './features/admin/components/QuestionConfigScreen';
import { SetupScreen } from './features/admin/components/SetupScreen';
import { POWERSHIELD_TOASTER_ID } from './shared/hooks/useNotify';
import { initMdaContextFromSdk } from './shared/utils/mda-navigation';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';
import './power-shield.css';

const useStyles = makeStyles({
  pageWrapper: {
    width: '100%',
    minHeight: '100%',
    padding: tokens.spacingHorizontalXXL,
    boxSizing: 'border-box',
  },
});

/**
 * PowerShield Admin feature page — runs as a feature inside CopilotStudioKitAdmin.
 *
 * Uses a scoped FluentProvider with PowerShield's purple brand theme and
 * internal sub-routing for all Admin PowerShield screens. The AppShell renders
 * loading/error/unauthorized states based on AuthContext.
 */
export default function PowerShieldPage() {
  useFeatureTelemetry('power-shield', 'Power Shield');
  const styles = useStyles();

  useEffect(() => {
    initMdaContextFromSdk();
  }, []);

  return (
    <FluentProvider theme={powerShieldTheme} style={{ backgroundColor: 'transparent' }}>
      <AdminAuthProvider>
        <Toaster toasterId={POWERSHIELD_TOASTER_ID} position="top-end" pauseOnHover />
        <AppShell>
          <div className={styles.pageWrapper}>
            <Routes>
              {/* List surfaces share the request-type TabList (Connector Requests | Copilot Credits). */}
              <Route element={<RequestTabsLayout />}>
                <Route index element={<HomeScreen />} />
                <Route path="credits" element={<CreditsListScreen />} />
              </Route>
              <Route path="requests/:requestId" element={<RequestDetailView />} />
              <Route path="credits/:requestId" element={<CreditRequestDetailView />} />
              <Route path="blocked-connectors" element={<BlockedConnectorsScreen />} />
              <Route path="connector-actions" element={<ConnectorActionsScreen />} />
              <Route path="settings" element={<SettingsHubScreen />} />
              <Route path="settings/connectors" element={<ConnectorsScreen />} />
              <Route path="settings/questions" element={<QuestionConfigScreen />} />
              <Route path="settings/setup" element={<SetupScreen />} />
              {/* Legacy routes — preserved as redirects so existing deep-links and banners keep working. */}
              <Route path="settings/notifications" element={<Navigate to="../setup?tab=notifications" replace />} />
              <Route path="settings/connection-health" element={<Navigate to="../setup?tab=connections" replace />} />
              <Route path="settings/connections-notifications" element={<Navigate to="../setup" replace />} />
              <Route path="*" element={<Navigate to="" replace />} />
            </Routes>
          </div>
        </AppShell>
      </AdminAuthProvider>
    </FluentProvider>
  );
}
