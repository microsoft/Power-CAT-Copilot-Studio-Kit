import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Body1,
  Button,
  Card,
  Caption1,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle1,
  Subtitle2,
  Toast,
  Toaster,
  ToastTitle,
  Tooltip,
  Title1,
  Title2,
  makeStyles,
  mergeClasses,
  tokens,
  useId,
  useToastController,
} from '@fluentui/react-components';
import {
  ArrowClockwise20Regular,
  ArrowRight16Regular,
  ArrowSync20Regular,
  CoinStackRegular,
  Settings20Regular,
} from '@fluentui/react-icons';
import { PageLoader } from '../../../shared/components/PageLoader';
import { useInventoryDashboard } from '../hooks/useInventoryDashboard';
import { useAgentSync } from '../hooks/useAgentSync';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { useAgentSyncTracker } from '../hooks/useAgentSyncTracker';
import { useComplianceScanTracker } from '../hooks/useComplianceScanTracker';
import { useResumeTracking } from '../hooks/useResumeTracking';
import { agentInventoryKeys } from '../hooks/queryKeys';
import {
  prepareSyncTracking,
  markSyncNotified,
  type SyncTrackingSetup,
  type SyncProgress,
  type ComplianceProgress,
} from '../services/syncTrackingService';
import { AgentsToWatchTable } from '../components/AgentsToWatchTable';
import { NoInventoryEmptyState } from '../components/NoInventoryEmptyState';
import { DistributionCard } from '../components/DistributionCard';
import { InventoryLineChart } from '../components/InventoryLineChart';
import { InventoryMetricCard } from '../components/InventoryMetricCard';
import { useAgentInventorySurfaceStyles } from '../styles/surfaceStyles';
import type { AgentInventoryView } from '../contracts/types';
import { AUTHENTICATION_CATEGORY_LABELS } from '../utils/agentViews';

const useStyles = makeStyles({
  root: {
    width: '100%',
    maxWidth: '1440px',
    boxSizing: 'border-box',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
    paddingInlineStart: 'clamp(16px, 5.56vw, 80px)',
    paddingInlineEnd: 'clamp(16px, 5.56vw, 80px)',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    '@media (max-width: 700px)': {
      paddingTop: tokens.spacingVerticalXL,
    },
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
  },
  headerCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flex: '0 0 auto',
  },
  syncButton: {
    '@media (max-width: 1100px)': {
      minWidth: '32px',
      width: '32px',
      paddingLeft: 0,
      paddingRight: 0,
    },
  },
  syncButtonLabel: {
    '@media (max-width: 1100px)': {
      display: 'none',
    },
  },
  pageHeading: {
    margin: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
  headerBadge: {
    alignSelf: 'center',
    position: 'relative',
    top: tokens.spacingVerticalXXS,
  },
  previewBadge: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
  },
  creditsBadge: {
    backgroundColor: tokens.colorNeutralBackground5,
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightRegular,
    cursor: 'help',
    '::after': {
      borderTopStyle: 'none',
      borderRightStyle: 'none',
      borderBottomStyle: 'none',
      borderLeftStyle: 'none',
    },
    '& svg': {
      opacity: 0.75,
    },
  },
  context: {
    minHeight: '44px',
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 1fr) minmax(260px, 1.25fr) minmax(240px, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    padding: `0 ${tokens.spacingHorizontalL}`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    '@media (max-width: 1450px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      paddingTop: tokens.spacingVerticalS,
      paddingBottom: tokens.spacingVerticalS,
    },
    '@media (max-width: 700px)': {
      gridTemplateColumns: '1fr',
    },
  },
  contextStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    fontWeight: tokens.fontWeightSemibold,
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorPaletteGreenBackground3,
  },
  statusDotSyncing: {
    backgroundColor: tokens.colorPaletteYellowBackground3,
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 700px)': {
      gridTemplateColumns: '1fr',
    },
  },
  analytics: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 705fr) minmax(0, 235fr) minmax(0, 308fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'stretch',
    '@media (max-width: 1600px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
    '@media (max-width: 700px)': {
      gridTemplateColumns: '1fr',
    },
  },
  analyticsCard: {
    height: '100%',
    minHeight: '396px',
    padding: 0,
    overflow: 'hidden',
    '@media (max-width: 700px)': {
      height: 'auto',
      minHeight: '360px',
    },
  },
  growthCard: {
    '@media (max-width: 1600px)': {
      gridColumn: '1 / -1',
    },
    '@media (max-width: 700px)': {
      gridColumn: 'auto',
    },
  },
  cardContent: {
    height: '100%',
    boxSizing: 'border-box',
    padding: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  sectionTitle: {
    margin: 0,
    fontWeight: tokens.fontWeightBold,
  },
  chartHeading: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
  },
  rangeSelector: {
    display: 'flex',
    alignItems: 'center',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  rangeButton: {
    minWidth: '72px',
    borderRadius: 0,
    fontWeight: tokens.fontWeightSemibold,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  rangeButtonSelected: {
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground3,
    fontWeight: tokens.fontWeightBold,
    ':hover': {
      color: tokens.colorNeutralForeground1,
      backgroundColor: tokens.colorNeutralBackground3Hover,
    },
    ':active': {
      color: tokens.colorNeutralForeground1,
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  chartBody: {
    minHeight: 0,
    flex: '1 1 auto',
    overflow: 'hidden',
  },
  chartFooter: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalL,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  footerMetric: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalM,
    '&:not(:first-child)': {
      paddingLeft: tokens.spacingHorizontalL,
      borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    },
  },
  prioritiesLead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalS,
  },
  priorityList: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 0',
  },
  priorityRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
    marginInline: `calc(${tokens.spacingHorizontalXS} * -1)`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    textAlign: 'left',
    background: 'none',
    borderBottom: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    width: 'auto',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-2px',
    },
  },
  priorityValue: {
    fontWeight: tokens.fontWeightBold,
  },
  priorityCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  secondary: {
    color: tokens.colorNeutralForeground3,
  },
  cardAction: {
    alignSelf: 'flex-start',
    minHeight: '32px',
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightRegular,
    lineHeight: tokens.lineHeightBase300,
  },
  insights: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'stretch',
    minHeight: '251px',
    '@media (max-width: 1100px)': {
      gridTemplateColumns: '1fr',
    },
  },
  insightCard: {
    height: '100%',
    padding: 0,
    overflow: 'hidden',
  },
  clickableCard: {
    cursor: 'pointer',
    transitionProperty: 'box-shadow, border-color, transform',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      boxShadow: tokens.shadow8,
    },
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  capabilityList: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 0',
    marginLeft: `-${tokens.spacingHorizontalS}`,
    marginRight: `-${tokens.spacingHorizontalS}`,
    overflow: 'hidden',
    borderRadius: tokens.borderRadiusMedium,
    '@media (max-width: 1100px)': {
      flex: '0 0 auto',
    },
  },
  capability: {
    width: '100%',
    minHeight: 0,
    flex: '1 1 0',
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateColumns: '120px minmax(0, 1fr) 38px',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `0 ${tokens.spacingHorizontalS}`,
    border: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    ':active': {
      backgroundColor: tokens.colorNeutralBackground1Pressed,
    },
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '1px',
    },
    '@media (max-width: 1100px)': {
      minHeight: '36px',
      flex: '0 0 auto',
    },
  },
  capabilityTrack: {
    height: '7px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground4,
    overflow: 'hidden',
  },
  capabilityFill: {
    height: '100%',
    borderRadius: tokens.borderRadiusCircular,
  },
  capabilityValue: {
    fontWeight: tokens.fontWeightSemibold,
  },
  environmentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  environmentList: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    gap: tokens.spacingVerticalL,
    flex: '1 1 0',
  },
  environmentRow: {
    display: 'grid',
    gridTemplateColumns: '22px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  environmentName: {
    fontWeight: tokens.fontWeightSemibold,
  },
  environmentCount: {
    fontWeight: tokens.fontWeightBold,
  },
  rank: {
    width: '22px',
    height: '22px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableHeading: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: '32px',
  },
});

function AgentInventoryTitle() {
  const styles = useStyles();
  const creditsDescription = `Copilot Credits are used when the AI-generated description setting is enabled and you view a GitHub Copilot agent's details page. Syncing agents does not consume Copilot Credits.`;

  return (
    <div className={styles.titleRow}>
      <h1 className={styles.pageHeading}>
        <Title2 as="span">Agent Inventory</Title2>
      </h1>
      <Badge
        appearance="tint"
        color="brand"
        shape="rounded"
        size="medium"
        className={mergeClasses(styles.headerBadge, styles.previewBadge)}
      >
        PREVIEW
      </Badge>
      <Tooltip relationship="description" content={creditsDescription} withArrow>
        <Badge
          appearance="outline"
          shape="circular"
          size="medium"
          icon={<CoinStackRegular />}
          className={mergeClasses(styles.headerBadge, styles.creditsBadge)}
          tabIndex={0}
          aria-label={`Uses Copilot Credits. ${creditsDescription}`}
        >
          Uses Copilot Credits
        </Badge>
      </Tooltip>
    </div>
  );
}

export default function InventoryDashboardScreen() {
  const navigate = useNavigate();
  const styles = useStyles();
  const surfaceStyles = useAgentInventorySurfaceStyles();
  const { model, agentsQuery, usageQuery, lastSyncedAt } = useInventoryDashboard();
  const [rangeMonths, setRangeMonths] = useState<6 | 12>(12);
  const toasterId = useId('inventory-dashboard-toaster');
  const { dispatchToast } = useToastController(toasterId);
  const queryClient = useQueryClient();
  const syncMutation = useAgentSync();
  const syncStatusQuery = useSyncStatus();
  const resumeQuery = useResumeTracking();
  const [refreshInProgress, setRefreshInProgress] = useState(false);
  const refreshLockRef = useRef(false);
  const refetchAgents = agentsQuery.refetch;
  const refetchUsage = usageQuery.refetch;

  const handleComplianceSettled = useCallback((result: ComplianceProgress) => {
    if (result.outcome === 'success') {
      dispatchToast(
        <Toast><ToastTitle>Compliance scan completed successfully.</ToastTitle></Toast>,
        { intent: 'success' },
      );
    } else if (result.outcome === 'error') {
      dispatchToast(
        <Toast><ToastTitle>An error occurred while scanning the agents for compliance. Error logs have been captured in the logs table.</ToastTitle></Toast>,
        { intent: 'error' },
      );
    } else {
      return;
    }
    void markSyncNotified([result.complianceLogId]);
  }, [dispatchToast]);

  const { begin: beginComplianceTracking } = useComplianceScanTracker(handleComplianceSettled);

  const refreshInventoryData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: agentInventoryKeys.agents() });
    void queryClient.invalidateQueries({ queryKey: [...agentInventoryKeys.all, 'usage'] });
    void queryClient.invalidateQueries({ queryKey: agentInventoryKeys.syncStatus() });
    void queryClient.invalidateQueries({ queryKey: agentInventoryKeys.lastSync() });
  }, [queryClient]);

  const handleSyncSettled = useCallback((result: SyncProgress) => {
    // Cancelled: no notification, just refresh (steps 6 & 10).
    if (result.outcome === 'cancelled') {
      refreshInventoryData();
      return;
    }

    // Complete/Error: notify the agent-sync result.
    dispatchToast(
      <Toast>
        <ToastTitle>
          {result.outcome === 'success'
            ? 'The Agent Sync process completed successfully.'
            : 'An error occurred while syncing the Agents data. Error logs have been captured in the logs table.'}
        </ToastTitle>
      </Toast>,
      { intent: result.outcome === 'success' ? 'success' : 'error' },
    );

    // Hand off to compliance tracking when a non-cancelled compliance log exists.
    if (result.startCompliance) {
      dispatchToast(
        <Toast><ToastTitle>Compliance scan has been started.</ToastTitle></Toast>,
        { intent: 'info' },
      );
      beginComplianceTracking();
    }

    // Mark the agent + usage logs notified so they are not re-notified, then
    // refresh now that the sync has been performed.
    void markSyncNotified([result.agentLogId, result.usageLogId]);
    refreshInventoryData();
  }, [dispatchToast, refreshInventoryData, beginComplianceTracking]);

  const { begin: beginSyncTracking, isTracking } = useAgentSyncTracker(handleSyncSettled);
  const syncInProgress = syncStatusQuery.isLoading
    || syncStatusQuery.data?.inProgress === true
    || isTracking;
  // Button gating treats the unknown/loading window as in-progress to avoid starting a
  // duplicate sync. The status tile must not — it should claim "Sync in-progress" only once
  // a run is confirmed, otherwise it flickers to that label on every dashboard load.
  const confirmedSyncInProgress = syncStatusQuery.data?.inProgress === true || isTracking;
  const syncDisabled = syncMutation.isPending || syncInProgress;
  const syncInProgressTooltip = 'An agent data sync is in progress. Please wait until it completes.';
  const refreshDisabled = refreshInProgress;

  const handleRefreshData = useCallback(async (fromEmptyState = false) => {
    if (refreshLockRef.current) return;
    refreshLockRef.current = true;
    setRefreshInProgress(true);

    try {
      const results = await Promise.allSettled([
        refetchAgents({ throwOnError: true }),
        refetchUsage({ throwOnError: true }),
      ]);
      const failed = results.some((result) => result.status === 'rejected');
      const [agentsResult] = results;
      const noAgentsAfterRefresh = agentsResult.status === 'fulfilled'
        && (agentsResult.value.data?.length ?? 0) === 0;

      let title = 'Agent Inventory data refreshed.';
      let intent: 'success' | 'error' | 'info' = 'success';
      if (failed) {
        title = 'Agent Inventory data could not be refreshed.';
        intent = 'error';
      } else if (fromEmptyState && noAgentsAfterRefresh) {
        title = 'No agents data to refresh.';
        intent = 'info';
      }

      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
        </Toast>,
        { intent },
      );
    } finally {
      refreshLockRef.current = false;
      setRefreshInProgress(false);
    }
  }, [dispatchToast, refetchAgents, refetchUsage]);

  // On feature open, resume completion tracking for a run that is still in
  // flight or that finished (unnotified) while the app was closed. Agent+usage
  // and compliance resume independently so a scan is not skipped when the
  // agent/usage notification already fired in a prior session.
  const resumeHandledRef = useRef(false);
  useEffect(() => {
    if (resumeHandledRef.current || !resumeQuery.data) return;
    resumeHandledRef.current = true;
    const { resumeSync, syncSetup, resumeCompliance } = resumeQuery.data;
    if (resumeSync && syncSetup) beginSyncTracking(syncSetup);
    if (resumeCompliance) beginComplianceTracking();
  }, [resumeQuery.data, beginSyncTracking, beginComplianceTracking]);

  const handleSyncAgents = () => {
    void (async () => {
      let setup: SyncTrackingSetup | null = null;
      try {
        setup = await prepareSyncTracking();
      } catch {
        setup = null;
      }
      syncMutation.mutate(undefined, {
        onSuccess: (result) => {
          if (result.started) {
            dispatchToast(
              <Toast><ToastTitle>The Agent Sync process has started and may take some time. You will be notified when it’s complete.</ToastTitle></Toast>,
              { intent: 'success' },
            );
            if (setup) beginSyncTracking(setup);
          } else {
            dispatchToast(
              <Toast><ToastTitle>The Agent Sync process is currently in progress and cannot be initiated at this time.</ToastTitle></Toast>,
              { intent: 'warning' },
            );
          }
        },
        onError: (error) => {
          dispatchToast(
            <Toast><ToastTitle>{error instanceof Error ? error.message : 'Unable to start the agent sync process.'}</ToastTitle></Toast>,
            { intent: 'error' },
          );
        },
      });
    })();
  };

  useEffect(() => {
    document.title = 'Agent Inventory | Copilot Studio Kit';
  }, []);

  if (agentsQuery.isLoading) {
    return <PageLoader ariaLabel="Loading agent inventory dashboard" />;
  }

  if (agentsQuery.isError) {
    return (
      <div className={styles.root}>
        <MessageBar intent="error">
          <MessageBarBody>
            {agentsQuery.error.message}
            <Button appearance="transparent" onClick={() => { void agentsQuery.refetch(); }}>Retry</Button>
          </MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  if (model.totalAgents === 0) {
    return (
      <div className={styles.root}>
        <Toaster toasterId={toasterId} position="top-end" />
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <AgentInventoryTitle />
            <Body1>Monitor adoption, usage, ownership, and governance across every Copilot Studio and Microsoft 365 agent in the tenant.</Body1>
          </div>
        </header>
        <NoInventoryEmptyState
          onSyncAgents={handleSyncAgents}
          onOpenSettings={() => navigate('/agent-inventory/settings')}
          onRefreshData={() => { void handleRefreshData(true); }}
          syncPending={syncMutation.isPending}
          syncDisabled={syncDisabled}
          syncInProgress={syncInProgress}
          syncInProgressTooltip={syncInProgressTooltip}
          refreshInProgress={refreshInProgress}
        />
      </div>
    );
  }

  const enrichment = model.totalAgents ? Math.round(model.enrichedCount / model.totalAgents * 100) : 0;
  const knowledgeAgentsCount = model.knowledgeAgentsCount;
  const knowledgeAgentsPercentage = model.knowledgeEligibleCount
    ? knowledgeAgentsCount / model.knowledgeEligibleCount * 100
    : 0;
  const autonomousPercentage = model.autonomousEligibleCount
    ? model.autonomousCount / model.autonomousEligibleCount * 100
    : 0;
  const draftAgentsPercentage = model.draftEligibleCount
    ? model.draftAgentsCount / model.draftEligibleCount * 100
    : 0;
  const authenticatedCount = model.authentication
    .filter((item) => item.label === AUTHENTICATION_CATEGORY_LABELS.microsoft || item.label === AUTHENTICATION_CATEGORY_LABELS.manual)
    .reduce((sum, item) => sum + item.value, 0);
  const protectedPercentage = model.totalAgents
    ? Math.round(authenticatedCount / model.totalAgents * 100)
    : 0;
  const availableCount = model.statuses.find((item) => item.label === 'Available')?.value ?? 0;
  const availablePercentage = model.totalAgents ? Math.round(availableCount / model.totalAgents * 100) : 0;

  const openInventory = () => navigate('/agent-inventory/agents');
  const openInventoryView = (view: AgentInventoryView) => {
    const search = new URLSearchParams({ view });
    navigate(`/agent-inventory/agents?${search.toString()}`);
  };
  const visibleGrowth = rangeMonths === 6 ? model.growth.slice(-6) : model.growth;
  const capabilityColors = ['#637CEF', '#E3008C', '#2AA0A4', '#9373C0', '#13A10E', '#3A96DD'];

  return (
    <div className={styles.root}>
      <Toaster toasterId={toasterId} position="top-end" />
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <AgentInventoryTitle />
          <Body1>Monitor adoption, usage, ownership, and governance across every Copilot Studio and Microsoft 365 agent in the tenant.</Body1>
        </div>
        <div className={styles.headerActions}>
          <Tooltip
            content={syncDisabled
              ? syncInProgressTooltip
              : 'Sync agents to run the agent data load and refresh the inventory.'}
            relationship="description"
          >
            <Button
              className={styles.syncButton}
              appearance="primary"
              icon={syncMutation.isPending ? <Spinner size="tiny" /> : <ArrowSync20Regular />}
              aria-label="Sync agents"
              onClick={handleSyncAgents}
              disabledFocusable={syncDisabled}
            >
              <span className={styles.syncButtonLabel}>Sync agents</span>
            </Button>
          </Tooltip>
          <Tooltip
            content={refreshInProgress
              ? 'Refreshing dashboard data from source tables.'
              : 'Refresh dashboard data from source tables.'}
            relationship="label"
          >
            <Button
              appearance="outline"
              icon={refreshInProgress ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />}
              aria-label="Refresh dashboard data from source tables"
              onClick={() => { void handleRefreshData(); }}
              disabledFocusable={refreshDisabled}
            />
          </Tooltip>
          <Tooltip
            content={syncInProgress ? syncInProgressTooltip : 'Sync configuration and settings for the Agent Inventory.'}
            relationship="label"
          >
            <Button
              appearance="outline"
              icon={<Settings20Regular />}
              aria-label="Open Agent Inventory settings"
              onClick={() => navigate('/agent-inventory/settings')}
              disabledFocusable={syncInProgress}
            />
          </Tooltip>
        </div>
      </header>

      <div className={styles.context}>
        <Body1 className={styles.contextStatus}>
          <span className={mergeClasses(styles.statusDot, confirmedSyncInProgress && styles.statusDotSyncing)} aria-hidden="true" />
          {confirmedSyncInProgress ? 'Sync in-progress' : model.totalAgents ? 'Inventory current' : 'Inventory empty'}
        </Body1>
        <Body1
          aria-label={`${enrichment}% enriched, ${model.limitedDetailCount.toLocaleString()} agents have limited detail`}
        >
          <strong>{enrichment}% enriched</strong> {model.limitedDetailCount.toLocaleString()} agents have limited detail
        </Body1>
        <Body1>{model.environmentCount.toLocaleString()} environments synchronized</Body1>
        <Body1>{lastSyncedAt ? `Last synchronized ${new Date(lastSyncedAt).toLocaleString()}` : 'Last synchronization unavailable'}</Body1>
      </div>

      {usageQuery.isError && (
        <MessageBar intent="warning">
          <MessageBarBody>Inventory loaded, but usage history could not be loaded.</MessageBarBody>
        </MessageBar>
      )}

      <section className={styles.metrics} aria-label="Governance metrics">
        <InventoryMetricCard
          kind="metric"
          label="Number of agents"
          accentColor="#637CEF"
          value={model.totalAgents.toLocaleString()}
          supporting={`${model.environmentCount.toLocaleString()} ${model.environmentCount === 1 ? 'environment' : 'environments'}`}
          onActivate={openInventory}
          actionLabel="View all agents"
        />
        <InventoryMetricCard
          kind="distribution"
          label="Powered by"
          accentColor="#E3008C"
          distribution={{
            items: model.agentTypes,
            unclassifiedCount: model.unclassifiedAgentTypeCount,
          }}
          onActivate={() => navigate('/agent-inventory/agents?group=poweredBy')}
          actionLabel="View all agents grouped by powered by"
        />
        <InventoryMetricCard
          kind="metric"
          label="Autonomous agents"
          accentColor="#13A10E"
          value={model.autonomousCount.toLocaleString()}
          supporting={`${autonomousPercentage.toFixed(1)}% of agents`}
          tooltip="Agents that act automatically on external triggers."
          onActivate={() => openInventoryView('autonomous')}
          actionLabel="View autonomous agents"
        />
        <InventoryMetricCard
          kind="metric"
          label="Draft agents"
          accentColor="#9373C0"
          value={model.draftAgentsCount.toLocaleString()}
          supporting={`${draftAgentsPercentage.toFixed(1)}% of agents`}
          tooltip="Agents that have not been published."
          onActivate={() => openInventoryView('draft')}
          actionLabel="View draft agents"
        />
        <InventoryMetricCard
          kind="metric"
          label="Agents with knowledge"
          accentColor="#2AA0A4"
          value={knowledgeAgentsCount.toLocaleString()}
          supporting={`${knowledgeAgentsPercentage.toFixed(1)}% of agents`}
          tooltip="Agents configured with one or more knowledge sources to ground their responses."
          onActivate={() => openInventoryView('capability-knowledge-sources')}
          actionLabel="View agents with knowledge sources"
        />
      </section>

      <section className={styles.analytics}>
        <Card appearance="filled" className={mergeClasses(surfaceStyles.card, styles.analyticsCard, styles.growthCard)}>
          <div className={styles.cardContent}>
            <div className={styles.chartHeading}>
              <div className={styles.heading}>
                <Subtitle2 as="h2" className={styles.sectionTitle}>Portfolio growth</Subtitle2>
                <Caption1>Inventory growth over time</Caption1>
              </div>
              <div className={styles.rangeSelector} role="group" aria-label="Chart time range">
                <Button
                  className={mergeClasses(styles.rangeButton, rangeMonths === 12 && styles.rangeButtonSelected)}
                  appearance="transparent"
                  size="small"
                  aria-pressed={rangeMonths === 12}
                  onClick={() => setRangeMonths(12)}
                >
                  12 months
                </Button>
                <Button
                  className={mergeClasses(styles.rangeButton, rangeMonths === 6 && styles.rangeButtonSelected)}
                  appearance="transparent"
                  size="small"
                  aria-pressed={rangeMonths === 6}
                  onClick={() => setRangeMonths(6)}
                >
                  6 months
                </Button>
              </div>
            </div>
            <div className={styles.chartBody}>
              <InventoryLineChart title="Portfolio growth" series={[
                { legend: 'Total inventory', color: '#637CEF', data: visibleGrowth.map((point) => ({ x: point.date, y: point.inventory })) },
              ]} height={200} />
            </div>
            <div className={styles.chartFooter}>
              <div className={styles.footerMetric}>
                <Subtitle1>+{model.newAgentsLast30Days.toLocaleString()}</Subtitle1>
                <Caption1>New agents in 30 days</Caption1>
              </div>
              <div className={styles.footerMetric}>
                <Subtitle1>{model.publishedNewAgents.toLocaleString()}</Subtitle1>
                <Caption1>New agents already published</Caption1>
              </div>
            </div>
          </div>
        </Card>

        <DistributionCard
          title="Authentication"
          subtitle="Agents by authentication mode"
          items={model.authentication}
          variant="vertical"
          centerLabel={`${protectedPercentage}%`}
          centerSublabel="protected"
          colors={['#637CEF', '#E3008C', '#2AA0A4']}
          legendMode="percentage"
          actionLabel="Review authentication"
          onActivate={() => navigate('/agent-inventory/agents?group=authentication')}
        />

        <Card appearance="filled" className={mergeClasses(surfaceStyles.card, styles.analyticsCard)}>
          <div className={styles.cardContent}>
            <div className={styles.heading}>
              <Subtitle2 as="h2" className={styles.sectionTitle}>Governance priorities</Subtitle2>
              <Caption1>Issues requiring administrator review</Caption1>
            </div>
            <div className={styles.prioritiesLead}>
              <Title1>{model.priorities.length}</Title1>
              <Caption1>priority areas</Caption1>
            </div>
            <div className={styles.priorityList}>
              {model.priorities.map((item, index) => (
                <button
                  type="button"
                  key={item.label}
                  className={styles.priorityRow}
                  onClick={() => openInventoryView(item.view)}
                >
                  <div className={styles.priorityCopy}>
                    <Body1>{item.label}</Body1>
                    <Caption1 className={styles.secondary}>{item.description}</Caption1>
                  </div>
                  <Subtitle2
                    className={styles.priorityValue}
                    style={{ color: index === 0 ? '#A4262C' : '#CA5010' }}
                  >
                    {item.value.toLocaleString()}
                  </Subtitle2>
                </button>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section className={styles.insights}>
        <DistributionCard
          title="Portfolio status"
          subtitle="Current lifecycle distribution"
          items={model.statuses}
          centerLabel={`${availablePercentage}%`}
          centerSublabel="available"
          colors={['#637CEF', '#E3008C', '#2AA0A4', '#9373C0', '#13A10E']}
          onActivate={() => navigate('/agent-inventory/agents?group=status')}
          actionLabel="Group by status"
        />

        <Card appearance="filled" className={mergeClasses(surfaceStyles.card, styles.insightCard)}>
          <div className={styles.cardContent}>
            <div className={styles.heading}>
              <Subtitle2 as="h2" className={styles.sectionTitle}>Capability adoption</Subtitle2>
              <Caption1>Share of enriched agents</Caption1>
            </div>
            <div className={styles.capabilityList}>
              {model.capabilities.map((item, index) => (
                <button
                  type="button"
                  key={item.view}
                  className={styles.capability}
                  aria-label={`View agents using ${item.label}, ${item.percentage} percent adoption`}
                  onClick={() => openInventoryView(item.view)}
                >
                  <Caption1>{item.label}</Caption1>
                  <div
                    className={styles.capabilityTrack}
                    aria-hidden="true"
                  >
                    <div
                      className={styles.capabilityFill}
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: capabilityColors[index % capabilityColors.length],
                      }}
                    />
                  </div>
                  <Caption1 className={styles.capabilityValue}>{item.percentage}%</Caption1>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card
          appearance="filled"
          className={mergeClasses(surfaceStyles.card, styles.insightCard, styles.clickableCard)}
          role="button"
          tabIndex={0}
          onClick={() => navigate('/agent-inventory/agents?group=environment')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              navigate('/agent-inventory/agents?group=environment');
            }
          }}
        >
          <div className={styles.cardContent}>
            <div className={styles.environmentHeader}>
              <div className={styles.heading}>
                <Subtitle2 as="h2" className={styles.sectionTitle}>Top environments</Subtitle2>
                <Caption1>Ranked by agent count</Caption1>
              </div>
            </div>
            <div className={styles.environmentList}>
              {model.topEnvironments.map((item, index) => (
                <div key={item.name} className={styles.environmentRow}>
                  <Caption1 className={styles.rank}>{index + 1}</Caption1>
                  <Body1 className={styles.environmentName}>{item.name}</Body1>
                  <Subtitle2 className={styles.environmentCount}>{item.count.toLocaleString()}</Subtitle2>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section>
        <div className={styles.tableHeading}>
          <Subtitle2 as="h2">Agents to watch</Subtitle2>
          <Button
            className={styles.cardAction}
            appearance="transparent"
            icon={<ArrowRight16Regular />}
            iconPosition="after"
            onClick={openInventory}
          >
            View full inventory
          </Button>
        </div>
        {usageQuery.isPending ? (
          <Spinner label="Loading agent usage metrics" />
        ) : usageQuery.isError ? (
          <MessageBar intent="warning"><MessageBarBody>Agent usage metrics are unavailable.</MessageBarBody></MessageBar>
        ) : (
          <AgentsToWatchTable rows={model.agentsToWatch} />
        )}
      </section>
    </div>
  );
}
