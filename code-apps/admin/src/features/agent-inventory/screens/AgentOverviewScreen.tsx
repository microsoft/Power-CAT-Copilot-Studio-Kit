import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  makeStyles,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Tab,
  TabList,
  Toast,
  Toaster,
  ToastTitle,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import {
  AppsListRegular,
  ChartMultipleRegular,
  DocumentBulletListRegular,
  LayerRegular,
  Info16Regular,
} from '@fluentui/react-icons';
import { useAgentOverview } from '../hooks/useAgentOverview';
import { PageLoader } from '../../../shared/components/PageLoader';
import { AgentDetailHeader } from '../components/detail/AgentDetailHeader';
import type { ActionCompletionSummary } from '../services/actionCompletionService';
import { AgentOverviewTab } from '../components/detail/AgentOverviewTab';
import { AgentUsageTab } from '../components/detail/AgentUsageTab';
import { AgentMetadataTab } from '../components/detail/AgentMetadataTab';

const ComponentsTab = lazy(() => import('../components/detail/ComponentsTab'));

type AgentDetailTab = 'overview' | 'components' | 'usage' | 'metadata';

const useStyles = makeStyles({
  page: {
    width: '100%',
    minWidth: 0,
    minHeight: '100%',
    boxSizing: 'border-box',
    background: `radial-gradient(124.48% 109.39% at 26.98% 6.02%, ${tokens.colorNeutralBackground1} 0%, ${tokens.colorNeutralBackground1} 37.08%, ${tokens.colorBrandBackground2} 100%)`,
  },
  contentRegion: {
    width: '100%',
    maxWidth: '1440px',
    boxSizing: 'border-box',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: tokens.spacingVerticalXL,
    paddingBottom: '48px',
    paddingInlineStart: 'clamp(16px, 5.56vw, 80px)',
    paddingInlineEnd: 'clamp(16px, 5.56vw, 80px)',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    overflowX: 'hidden',
    '@media (max-width: 600px)': {
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} 24px`,
    },
  },
  banner: {
    minHeight: '41px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusLarge,
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
  },
  tabList: {
    width: '100%',
    flexWrap: 'wrap',
    rowGap: tokens.spacingVerticalXS,
  },
  content: { minWidth: 0 },
  centered: {
    minHeight: '240px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function AgentOverviewScreen() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { agentDetailsId } = useParams();
  const { model, agentQuery, usageQuery } = useAgentOverview(agentDetailsId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selectedTab, setSelectedTab] = useState<AgentDetailTab>('overview');
  const toasterId = useId();
  const { dispatchToast } = useToastController(toasterId);
  const showComponents = model?.components.some(section => section.items.length > 0) ?? false;
  const showUsage = (usageQuery.data?.length ?? 0) > 0;
  const activeTab: AgentDetailTab =
    (selectedTab === 'components' && !showComponents) ||
    (selectedTab === 'usage' && !showUsage)
      ? 'overview'
      : selectedTab;

  useEffect(() => {
    document.title = model
      ? `${model.agent.name} | Agent Inventory | Copilot Studio Kit`
      : 'Agent details | Copilot Studio Kit';
    if (model) headingRef.current?.focus();
  }, [model]);

  if (agentQuery.isLoading) return <PageLoader ariaLabel="Loading agent details" />;

  if (agentQuery.isError) {
    return (
      <main className={styles.page}>
        <div className={styles.contentRegion}>
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Agent details could not be loaded</MessageBarTitle>
              We could not retrieve this agent right now. The service may be temporarily unavailable.
            </MessageBarBody>
            <MessageBarActions>
              <Button appearance="transparent" onClick={() => { void agentQuery.refetch(); }}>Retry</Button>
              <Button appearance="transparent" onClick={() => navigate('/agent-inventory/agents')}>Return to all agents</Button>
            </MessageBarActions>
          </MessageBar>
        </div>
      </main>
    );
  }

  if (!model) {
    return (
      <main className={styles.page}>
        <div className={styles.contentRegion}>
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>Agent no longer available</MessageBarTitle>
              This inventory record may have been deleted or removed during a recent synchronization.
            </MessageBarBody>
            <MessageBarActions>
              <Button appearance="transparent" onClick={() => navigate('/agent-inventory/agents')}>Return to all agents</Button>
            </MessageBarActions>
          </MessageBar>
        </div>
      </main>
    );
  }

  const { agent } = model;
  const handleActionCompleted = (summary: ActionCompletionSummary) => {
    if (summary.total > 0) {
      const failed = summary.errorCount > 0;
      dispatchToast(
        <Toast>
          <ToastTitle>
            {failed
              ? (summary.errorMessage?.trim() || `Unable to ${summary.action.toLowerCase()} the agent.`)
              : `${summary.action} completed successfully.`}
          </ToastTitle>
        </Toast>,
        { intent: failed ? 'error' : 'success' },
      );
    }
    void agentQuery.refetch();
  };

  let tabContent: React.ReactNode;
  if (activeTab === 'components') {
    tabContent = (
      <div id="components-tabpanel" role="tabpanel" aria-labelledby="components-tab">
        <Suspense fallback={<div className={styles.centered}><Spinner label="Loading component views" /></div>}>
          <ComponentsTab sections={model.components} agentName={agent.name} />
        </Suspense>
      </div>
    );
  } else if (activeTab === 'usage') {
    tabContent = usageQuery.isPending ? (
      <div className={styles.centered}><Spinner label="Loading usage details" /></div>
    ) : usageQuery.isError ? (
      <MessageBar intent="warning"><MessageBarBody>Usage history is currently unavailable.</MessageBarBody></MessageBar>
    ) : (
      <AgentUsageTab key={agent.id} agent={agent} records={usageQuery.data ?? []} />
    );
  } else if (activeTab === 'metadata') {
    tabContent = <AgentMetadataTab rows={model.metadata} />;
  } else {
    tabContent = (
      <AgentOverviewTab
        model={model}
        usagePending={usageQuery.isPending}
        usageError={usageQuery.isError}
        showUsage={showUsage}
        onViewUsage={() => setSelectedTab('usage')}
      />
    );
  }

  return (
    <main className={styles.page}>
      <Toaster toasterId={toasterId} position="top-end" />
      <AgentDetailHeader
        agent={agent}
        headingRef={headingRef}
        onNavigateDashboard={() => navigate('/agent-inventory')}
        onNavigateAllAgents={() => navigate('/agent-inventory/agents')}
        onActionCompleted={handleActionCompleted}
      />
      <div className={styles.contentRegion}>
        <MessageBar
          className={styles.banner}
          icon={<Info16Regular />}
          intent={agent.hasSystemAdminAccess === 'yes' && agent.hasPpacMismatch !== 'yes' ? 'info' : 'warning'}
        >
          <MessageBarBody>
            {agent.hasPpacMismatch === 'yes'
              ? 'Configuration enrichment may be incomplete because the inventory environment did not match the Power Platform admin context.'
              : agent.hasSystemAdminAccess === 'yes'
                ? 'Detailed configuration was collected directly from Dataverse with system administrator access. Agent status is refreshed live when governance actions are opened.'
                : 'This record has limited configuration detail because system administrator enrichment was unavailable.'}
          </MessageBarBody>
        </MessageBar>
        <nav className={styles.tabs} aria-label="Agent detail sections">
          <TabList
            className={styles.tabList}
            selectedValue={activeTab}
            onTabSelect={(_, data) => setSelectedTab(data.value as AgentDetailTab)}
            appearance="subtle-circular"
            size="medium"
          >
            <Tab icon={<AppsListRegular />} value="overview">Overview</Tab>
            {showComponents && (
              <Tab id="components-tab" aria-controls="components-tabpanel" icon={<LayerRegular />} value="components">
                Components
              </Tab>
            )}
            {showUsage && (
              <Tab icon={<ChartMultipleRegular />} value="usage">Usage</Tab>
            )}
            <Tab icon={<DocumentBulletListRegular />} value="metadata">Metadata</Tab>
          </TabList>
        </nav>
        <div className={styles.content}>{tabContent}</div>
      </div>
    </main>
  );
}
