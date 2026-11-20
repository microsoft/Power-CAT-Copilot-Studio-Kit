import { FluentProvider, Toaster, makeStyles, tokens } from '@fluentui/react-components';
import { Routes, Route } from 'react-router-dom';
import { powerShieldTheme } from './theme/powerShieldTheme';
import { PowerShieldAuthProvider } from './shared/contexts/AuthContext';
import { AppShell } from './shared/components/AppShell';
import { PowerShieldLanding } from './shared/components/PowerShieldLanding';
import { PowerShieldNotFound } from './shared/components/PowerShieldNotFound';
import { HomeScreen } from './features/home/components/HomeScreen';
import { CreditHomeScreen } from './features/credits/components/CreditHomeScreen';
import { CreditRequestDetailView } from './features/credits/components/CreditRequestDetailView';
import { RequestDetailView } from './features/request-detail/components/RequestDetailView';
import { WizardShell } from './features/wizard/components/WizardShell';
import { Step1Environment } from './features/wizard/components/Step1Environment';
import { Step2Questionnaire } from './features/wizard/components/Step2Questionnaire';
import { Step3Connectors } from './features/wizard/components/Step3Connectors';
import { Step4Justification } from './features/wizard/components/Step4Justification';
import { Step5Review } from './features/wizard/components/Step5Review';
import { CreditWizardRoute } from './features/credits/wizard/components/CreditWizardRoute';
import { ServiceTreeManagementScreen } from './features/service-tree/screens/ServiceTreeManagementScreen';
import { POWERSHIELD_TOASTER_ID } from './shared/hooks/useNotify';
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
 * PowerShield feature page — runs as a feature inside CopilotStudioKit.
 *
 * Uses a scoped FluentProvider with PowerShield's purple brand theme and
 * internal sub-routing for all PowerShield screens. The AppShell renders
 * loading/error/unauthorized states based on AuthBootContext.
 */
export default function PowerShieldPage() {
  useFeatureTelemetry('power-shield', 'Power Shield');
  const styles = useStyles();

  return (
    <FluentProvider theme={powerShieldTheme} style={{ backgroundColor: 'transparent' }}>
      <PowerShieldAuthProvider>
        <Toaster toasterId={POWERSHIELD_TOASTER_ID} position="top-end" pauseOnHover />
        <AppShell>
          <div className={styles.pageWrapper}>
            <Routes>
              <Route element={<PowerShieldLanding />}>
                <Route index element={<HomeScreen />} />
                <Route path="credits" element={<CreditHomeScreen />} />
              </Route>
              <Route path="service-trees" element={<ServiceTreeManagementScreen />} />
              <Route path="requests/:requestId" element={<RequestDetailView />} />
              <Route path="credit-requests/:requestId" element={<CreditRequestDetailView />} />
              <Route
                path="credit-requests"
                element={
                  <PowerShieldNotFound
                    title="Credit request not found"
                    description="This request is not available in the Copilot Credits experience."
                  />
                }
              />
              <Route path="new-request" element={<WizardShell />}>
                <Route path="environment" element={<Step1Environment />} />
                <Route path="questionnaire" element={<Step2Questionnaire />} />
                <Route path="connectors" element={<Step3Connectors />} />
                <Route path="justification" element={<Step4Justification />} />
                <Route path="review" element={<Step5Review />} />
              </Route>
              <Route path="new-request-credits" element={<CreditWizardRoute />} />
              <Route path="*" element={<PowerShieldNotFound />} />
            </Routes>
          </div>
        </AppShell>
      </PowerShieldAuthProvider>
    </FluentProvider>
  );
}
