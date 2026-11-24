/**
 * AgentValueSummaryPage — Root page component for the Agent Value Summary feature.
 *
 * Views of the `/agent-value-summary` route:
 *   - default            — dashboard with help screens (state-based, below)
 *   - `?view=agents&…`   — Agent values list behind a selected KPI (issue #747)
 *
 * Dashboard screen state:
 *   - 'dashboard'       — main dashboard (shown when agent count > 0)
 *   - 'agent-types'     — Agent Type help screen (US2)
 *   - 'agent-behaviors' — Agent Behavior help screen (US3)
 *
 * KPI drillthrough: selecting a chart/card opens the Agent values
 * list (Agent Inventory grid UI) filtered to the records behind that KPI value.
 *
 * Empty-state rule (US5):
 *   If the Agent Details inventory is empty and data is not loading, show AgentTypeHelpScreen
 *   instead of DashboardScreen (mirrors original PowerFx StartScreen logic).
 *
 * FeedbackButton is present on all screens (US4):
 *   - DashboardScreen has it in its own header
 *   - HelpScreenLayout includes it in all help screen headers
 */
import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Toaster,
  useToastController,
  Toast,
  ToastTitle,
  ToastBody,
  useId,
  makeStyles,
  tokens,
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  loadingContainer: {
    position: 'relative',
    flex: '1',
    width: '100%',
    height: '100%',
    minHeight: '100vh',
  },
  errorContainer: {
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL}`,
  },
});
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardData } from './hooks/useDashboardData';
import { useSyncStatus } from './hooks/useSyncStatus';
import { SyncStatusService } from './services/SyncStatusService';
import { agentValueQueryKeys } from './hooks/queryKeys';
import { LoadingOverlay } from './components/shared/LoadingOverlay';
import { DashboardScreen } from './screens/DashboardScreen';
import { AgentTypeHelpScreen } from './screens/AgentTypeHelpScreen';
import { AgentBehaviorHelpScreen } from './screens/AgentBehaviorHelpScreen';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';
import { PageLoader } from '../../shared/components/PageLoader';
import { isAgentValuesView, toDrillthroughParams } from './services/agentValueFilter';
import type { DrillthroughFilter } from './contracts/types';

const AgentValuesListScreen = lazy(() => import('./screens/AgentValuesListScreen'));

type ScreenState = 'dashboard' | 'agent-types' | 'agent-behaviors';

const AGENT_VALUE_SUMMARY_PATH = '/agent-value-summary';

/** Root page entry point for Agent Value Summary. */
export default function AgentValueSummaryPage() {
  useFeatureTelemetry('agent-value-summary', 'Agent Value Summary');
  const [searchParams] = useSearchParams();
  if (isAgentValuesView(searchParams)) {
    return (
      <Suspense fallback={<PageLoader ariaLabel="Loading agent values" />}>
        <AgentValuesListScreen />
      </Suspense>
    );
  }
  return <AgentValueSummaryDashboard />;
}

/** Dashboard and help screens. */
function AgentValueSummaryDashboard() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<ScreenState>('dashboard');
  const toasterId = useId('avs-sync-toast');
  const { dispatchToast } = useToastController(toasterId);
  const queryClient = useQueryClient();

  const {
    agentDetails,
    kpis,
    valueBenefitCounts,
    agentTypeCounts,
    agentBehaviorCounts,
    classificationTrend,
    valueByEnvironment,
    isLoading,
    error,
  } = useDashboardData();

  const agentCount = agentDetails.length;

  // Sync status polling — watches for Agent Inventory sync completion
  const syncStatusQuery = useSyncStatus(true);
  const syncRecord = syncStatusQuery.data ?? null;
  const handledIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!syncRecord) return;
    const id = syncRecord.cat_copilotstudiokitlogsid;
    if (handledIdRef.current === id) return;

    const status = syncRecord.cat_executionstatuscode;

    if (status === 3) {
      // Complete
      handledIdRef.current = id;
      dispatchToast(
        <Toast>
          <ToastTitle>Sync complete</ToastTitle>
          <ToastBody>The Agent Sync process completed successfully.</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
      SyncStatusService.markNotified(id).catch(console.error);
      queryClient.invalidateQueries({ queryKey: agentValueQueryKeys.all });
    } else if (status === 4) {
      // Error
      handledIdRef.current = id;
      dispatchToast(
        <Toast>
          <ToastTitle>Sync failed</ToastTitle>
          <ToastBody>
            An error occurred while syncing the Agents data. Error logs have been captured in the logs table.
          </ToastBody>
        </Toast>,
        { intent: 'error' },
      );
      SyncStatusService.markNotified(id).catch(console.error);
    }
  }, [syncRecord, dispatchToast, queryClient]);

  const handleLearnMoreTypes = useCallback(() => {
    setScreen('agent-types');
  }, []);

  const handleLearnMoreBehaviors = useCallback(() => {
    setScreen('agent-behaviors');
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setScreen('dashboard');
  }, []);

  const handleDrillthrough = useCallback(
    (filter: DrillthroughFilter) => {
      navigate(`${AGENT_VALUE_SUMMARY_PATH}?${toDrillthroughParams(filter).toString()}`);
    },
    [navigate],
  );

  // While data is still loading, show the spinner only
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Toaster toasterId={toasterId} position="top-end" />
        <LoadingOverlay visible />
      </div>
    );
  }

  // A failed load must not masquerade as the "no agents" empty state or zero KPIs.
  if (error) {
    return (
      <div className={styles.errorContainer}>
        <Toaster toasterId={toasterId} position="top-end" />
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Agent Value Summary could not be loaded</MessageBarTitle>
            {error.message}
          </MessageBarBody>
          <MessageBarActions>
            <Button
              appearance="transparent"
              onClick={() => { void queryClient.invalidateQueries({ queryKey: agentValueQueryKeys.all }); }}
            >
              Retry
            </Button>
          </MessageBarActions>
        </MessageBar>
      </div>
    );
  }

  // Agent Behavior help screen
  if (screen === 'agent-behaviors') {
    return (
      <>
        <Toaster toasterId={toasterId} position="top-end" />
        <AgentBehaviorHelpScreen onReturnToDashboard={handleBackToDashboard} />
      </>
    );
  }

  // Agent Type help screen — also used as empty state when no agents exist (US5)
  if (screen === 'agent-types' || agentCount === 0) {
    return (
      <>
        <Toaster toasterId={toasterId} position="top-end" />
        <AgentTypeHelpScreen onReturnToDashboard={handleBackToDashboard} />
      </>
    );
  }

  // Dashboard — agents exist and screen state is 'dashboard'
  return (
    <>
      <Toaster toasterId={toasterId} position="top-end" />
      <DashboardScreen
        kpis={kpis}
        valueBenefitCounts={valueBenefitCounts}
        agentTypeCounts={agentTypeCounts}
        agentBehaviorCounts={agentBehaviorCounts}
        classificationTrend={classificationTrend}
        valueByEnvironment={valueByEnvironment}
        onLearnMoreTypes={handleLearnMoreTypes}
        onLearnMoreBehaviors={handleLearnMoreBehaviors}
        onDrillthrough={handleDrillthrough}
      />
    </>
  );
}
