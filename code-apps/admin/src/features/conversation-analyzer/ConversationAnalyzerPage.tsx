/**
 * ConversationAnalyzerPage - root shell for the Conversation Analyzer feature.
 *
 * Wraps everything in FilterProvider and a nested Routes tree.
 *  - `index`                                                → TabShell (Overview / Agents / Prompt insights / Conversations)
 *  - `/agents/:agentId/conversations`                       → AnalysisResultsScreen
 *  - `/agents/:agentId/conversations/:conversationId`       → AnalysisResultDetailsScreen
 *  - `/agents/:agentId/new-analysis`                        → NewAnalysisScreen
 *  - `/prompts`                                             → ManagePromptsScreen
 *
 * The TabShell drives tabs from `?tab=` so deep links stay shareable. Each
 * sub-screen is lazy-loaded.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';
import {
  makeStyles,
  tokens,
  FluentProvider,
  TabList,
  Tab,
  Spinner,
  type SelectTabData,
  type SelectTabEvent,
} from '@fluentui/react-components';
import { Routes, Route, useSearchParams } from 'react-router-dom';
import { conversationAnalyzerLightTheme } from './theme/conversationAnalyzerTheme';
import { FilterProvider, useFilterContext } from './context/FilterContext';
import { FeatureErrorBoundary } from './components/shared/FeatureErrorBoundary';
import { PageHeader } from './components/shared/PageHeader';
import { RetryMessageBar } from './components/shared/RetryMessageBar';
import { TimePeriodFilter } from './components/shared/TimePeriodFilter';
import { AgentPickerToolbar } from './components/shared/AgentPickerToolbar';
import { useEnsureSystemPrompts } from './hooks/useEnsureSystemPrompts';
import { useHasAgents } from './hooks/useHasAgents';
import { NoAgentsEmptyState } from './components/shared/NoAgentsEmptyState';
import { AnalysisRunNotifications } from './components/conversations/AnalysisRunNotifications';
import type { ActiveTab } from './contracts/types';

const DashboardTab = lazy(() => import('./components/dashboard/DashboardTab'));
const AgentsTab = lazy(() => import('./components/agents/AgentsTab'));
const PromptInsightsTab = lazy(() => import('./components/prompt-insights/PromptInsightsTab'));
const ConversationsTab = lazy(() => import('./components/conversations/ConversationsTab'));
const NewAnalysisScreen = lazy(() => import('./components/new-analysis/NewAnalysisScreen'));
const AnalysisResultsScreen = lazy(
  () => import('./components/analysis-results/AnalysisResultsScreen'),
);
const AnalysisResultDetailsScreen = lazy(
  () => import('./components/analysis-result-details/AnalysisResultDetailsScreen'),
);
const ManagePromptsScreen = lazy(
  () => import('./components/manage-prompts/ManagePromptsScreen'),
);

const TAB_IDS: ActiveTab[] = ['overview', 'agents', 'prompt-insights', 'conversations'];
const TAB_LABELS: Record<ActiveTab, string> = {
  overview: 'Overview',
  agents: 'Agents',
  'prompt-insights': 'Prompt insights',
  conversations: 'Conversations',
};
/** Pre-v4 tab IDs kept so existing deep links still resolve. */
const LEGACY_TAB_ALIASES: Record<string, ActiveTab> = {
  'custom-analysis-insights': 'prompt-insights',
};

function resolveTab(value: string | null): ActiveTab | null {
  if (!value) return null;
  const tab = (LEGACY_TAB_ALIASES[value] ?? value) as ActiveTab;
  return TAB_IDS.includes(tab) ? tab : null;
}

const useStyles = makeStyles({
  // Fluent Text rendered `as="h*"` keeps browser default heading margins; reset them (as Agent Inventory does).
  provider: {
    '& h1, & h2, & h3, & h4': { margin: 0 },
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    paddingTop: tokens.spacingVerticalXL,
    paddingRight: tokens.spacingHorizontalXL,
    paddingBottom: tokens.spacingVerticalXL,
    paddingLeft: tokens.spacingHorizontalXL,
    minHeight: '100%',
    maxWidth: '1280px',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  tabsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  rightControls: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '320px',
  },
});

function TabShell() {
  const styles = useStyles();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTab: selectedTab, setActiveTab } = useFilterContext();
  const [conversationActionsSlot, setConversationActionsSlot] = useState<HTMLDivElement | null>(null);

  const tabFromUrl = resolveTab(searchParams.get('tab'));
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== selectedTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, selectedTab, setActiveTab]);

  const handleTabSelect = useCallback(
    (_e: SelectTabEvent, data: SelectTabData) => {
      const next = data.value as ActiveTab;
      setActiveTab(next);
      const params = new URLSearchParams(searchParams);
      params.set('tab', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, setActiveTab],
  );

  return (
    <>
      <div className={styles.tabsRow}>
        <TabList selectedValue={selectedTab} onTabSelect={handleTabSelect} appearance="transparent">
          {TAB_IDS.map((id) => (
            <Tab key={id} value={id}>
              {TAB_LABELS[id]}
            </Tab>
          ))}
        </TabList>
        <div className={styles.rightControls}>
          {selectedTab === 'overview' && <AgentPickerToolbar />}
          {selectedTab !== 'conversations' && <TimePeriodFilter />}
          {selectedTab === 'conversations' && <div ref={setConversationActionsSlot} />}
        </div>
      </div>
      <div className={styles.body}>
        {selectedTab === 'overview' && <DashboardTab />}
        {selectedTab === 'agents' && <AgentsTab />}
        {selectedTab === 'prompt-insights' && <PromptInsightsTab />}
        {selectedTab === 'conversations' && <ConversationsTab actionsContainer={conversationActionsSlot} />}
      </div>
    </>
  );
}

function LoadingFallback() {
  const styles = useStyles();
  return (
    <div className={styles.loading}>
      <Spinner label="Loading…" />
    </div>
  );
}

function PageGate() {
  const styles = useStyles();
  const { hasAgents, isLoading, isError, isFetching, error, refetch } = useHasAgents();
  useEnsureSystemPrompts();
  const pageHeader = (
    <PageHeader
      title="Conversation Analyzer"
      description="Monitor agent performance, sentiment, and conversation analytics across your Copilot Studio agents."
      creditsDescription="Running conversation analysis consumes Copilot Credits."
      helpUrl="https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/CONVERSATION_ANALYZER.md"
    />
  );
  const agentStatusNotice = isError ? (
    <RetryMessageBar
      title="Could not check for synced agents."
      message={error?.message ?? 'Retry to check agent availability.'}
      onRetry={() => void refetch()}
      retryDisabled={isFetching}
    />
  ) : null;

  if (isLoading) {
    return (
      <main className={styles.root}>
        {pageHeader}
        <LoadingFallback />
      </main>
    );
  }

  if (!hasAgents) {
    if (isError) {
      return (
        <main className={styles.root}>
          {pageHeader}
          {agentStatusNotice}
        </main>
      );
    }
    return (
      <main className={styles.root}>
        {pageHeader}
        <NoAgentsEmptyState />
      </main>
    );
  }

  return (
    <Suspense fallback={<main className={styles.root}><LoadingFallback /></main>}>
      <Routes>
        <Route index element={<main className={styles.root}>{pageHeader}{agentStatusNotice}<TabShell /></main>} />
        <Route path="agents/:agentId/new-analysis" element={<NewAnalysisScreen />} />
        <Route path="agents/:agentId/conversations" element={<AnalysisResultsScreen />} />
        <Route
          path="agents/:agentId/conversations/:conversationId"
          element={<AnalysisResultDetailsScreen />}
        />
        <Route path="prompts" element={<ManagePromptsScreen />} />
      </Routes>
    </Suspense>
  );
}

export default function ConversationAnalyzerPage() {
  useFeatureTelemetry('conversation-analyzer', 'Conversation Analyzer');
  const styles = useStyles();
  return (
    <FluentProvider
      theme={conversationAnalyzerLightTheme}
      className={styles.provider}
      style={{ backgroundColor: 'transparent' }}
    >
      <FeatureErrorBoundary>
        <FilterProvider>
          <AnalysisRunNotifications />
          <PageGate />
        </FilterProvider>
      </FeatureErrorBoundary>
    </FluentProvider>
  );
}
