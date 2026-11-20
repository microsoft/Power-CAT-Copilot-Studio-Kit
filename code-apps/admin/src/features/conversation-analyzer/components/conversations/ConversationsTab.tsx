import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Card,
  Caption1,
  Toast,
  ToastTitle,
  Toaster,
  makeStyles,
  tokens,
  useId,
  useToastController,
} from '@fluentui/react-components';
import type { PromptRow } from '../../contracts/types';
import { useConversationAnalysis } from '../../hooks/useConversationAnalysis';
import type { ConversationListRow } from '../../hooks/useConversationListView';
import { useConversationSelection } from '../../hooks/useConversationSelection';
import { useConversationsTabState } from '../../hooks/useConversationsTabState';
import { toIndexKey } from '../../services/ConversationAnalysisIndexService';
import { CONVERSATIONS_ORIGIN } from '../../utils/resultsOrigin';
import { RetryMessageBar } from '../shared/RetryMessageBar';
import { loadErrorTitle } from '../../utils/accessErrors';
import { ConversationGrid } from '../shared/conversation-grid/ConversationGrid';
import { AnalysisRunBanner } from './AnalysisRunBanner';
import { AnalyzeConversationsDialog } from './AnalyzeConversationsDialog';
import { ConversationChatDrawer } from './ConversationChatDrawer';
import { ConversationFilterBar } from './ConversationFilterBar';
import { ConversationGridTools } from './ConversationGridTools';
import { ConversationHeaderActions } from './ConversationHeaderActions';
import { EmptyState } from '../shared/EmptyState';
import { ConversationsEmpty } from './ConversationsEmpty';
import { ConversationSelectionSummary } from './ConversationSelectionSummary';
import { ViewChatButton } from './ViewChatButton';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, width: '100%' },
  content: { width: '100%', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  showing: {
    color: tokens.colorNeutralForeground2,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
});

interface ConversationsTabProps {
  /** Tab-row slot that hosts the Analysis results and Analyze actions. */
  actionsContainer?: HTMLElement | null;
}

/** Browses, filters, selects and analyzes conversation transcripts of one environment (CV-1…CV-26). */
export default function ConversationsTab({ actionsContainer }: ConversationsTabProps) {
  const styles = useStyles();
  const toasterId = useId('conversations-toaster');
  const { dispatchToast } = useToastController(toasterId);
  const analysis = useConversationAnalysis();
  const { run, isRunning } = analysis;
  const state = useConversationsTabState(run);
  const { environment, environmentUrl, list, transcriptsQuery, indexQuery } = state;

  const selectionDisabled = isRunning || state.searchPending || transcriptsQuery.isPending;
  const selection = useConversationSelection<ConversationListRow>(state.filterScope, list.rows, selectionDisabled);
  const [selectingCount, setSelectingCount] = useState<number>();
  const [dialogRows, setDialogRows] = useState<ConversationListRow[]>();
  const [chatRow, setChatRow] = useState<ConversationListRow>();
  const [resultsAvailability, setResultsAvailability] = useState({ environmentUrl, ready: false });
  if (resultsAvailability.environmentUrl !== environmentUrl || (!resultsAvailability.ready && !transcriptsQuery.isPending)) {
    setResultsAvailability({ environmentUrl, ready: !transcriptsQuery.isPending });
  }

  const index = indexQuery.data;
  const hasResult = useCallback((row: ConversationListRow, promptId: string) => {
    const id = promptId.toLowerCase();
    return Boolean(index?.get(toIndexKey(row.id))?.some((entry) => entry.promptId?.toLowerCase() === id));
  }, [index]);

  const selectFirst = async (count: number) => {
    setSelectingCount(count);
    try {
      const result = await list.selectFirst(count);
      selection.selectRows(result.rows);
      const more = result.rows.length < count && result.hasMore ? ' More may match — scroll to load them.' : '';
      dispatchToast(
        <Toast><ToastTitle>{`${result.rows.length.toLocaleString()} conversations selected (newest first, matching filters).${more}`}</ToastTitle></Toast>,
        { intent: 'success', timeout: 4000 },
      );
    } finally {
      setSelectingCount(undefined);
    }
  };

  const startAnalysis = (prompt: PromptRow, rows: ConversationListRow[]) => {
    if (!environment) return;
    const started = analysis.start({
      environmentUrl: environment.organizationUrl,
      environmentName: environment.name,
      prompt,
      transcripts: rows,
      origin: CONVERSATIONS_ORIGIN,
    });
    if (started) {
      setDialogRows(undefined);
      selection.clearSelection();
    }
  };

  const renderActions = useCallback((row: ConversationListRow) => (
    <ViewChatButton onClick={() => setChatRow(row)} />
  ), []);

  const resultsAgents = useMemo(() => {
    const analyzedAgentIds = new Set<string>();
    for (const entries of index?.values() ?? []) {
      for (const entry of entries) if (entry.agentId) analyzedAgentIds.add(entry.agentId.toLowerCase());
    }
    return state.agents
      .filter((agent) => (!state.agentId || agent.id === state.agentId) && analyzedAgentIds.has(agent.id.toLowerCase()))
      .map((agent) => ({ id: agent.id, name: agent.name }));
  }, [index, state.agentId, state.agents]);
  const resultsLoading = Boolean(environmentUrl) && (state.agentsQuery.isPending || indexQuery.isPending);
  const conversationsLoading = state.environmentsQuery.isPending || transcriptsQuery.isPending || list.isPagingAhead;

  const runHere = run && run.environmentUrl === environmentUrl ? run : undefined;
  const total = state.countQuery.data;
  const totalLabel = total != null ? `${total.toLocaleString()} conversations` : 'Conversations';
  const showingLabel = total != null
    ? `Showing ${list.rows.length.toLocaleString()} of ${total.toLocaleString()} conversations`
    : `Showing ${list.rows.length.toLocaleString()} conversations`;
  const selectedCount = selection.selectedRows.length;
  // When conversations also fail, the grid error covers both; its Retry reloads agents too.
  const showAgentsError = state.agentsQuery.isError && !transcriptsQuery.isPending && !transcriptsQuery.isError;
  const retryConversations = () => {
    void transcriptsQuery.refetch();
    if (state.agentsQuery.isError) void state.agentsQuery.refetch();
  };

  let body: ReactNode;
  if (state.environmentsQuery.isError) {
    body = <RetryMessageBar title="Unable to load environments." onRetry={() => void state.environmentsQuery.refetch()} />;
  } else if (!environment && !state.environmentsQuery.isPending) {
    body = (
      <EmptyState
        illustration
        title="Choose an environment"
        description="Select an environment above to load its agent conversations."
        minHeight="360px"
      />
    );
  } else {
    body = (
      <>
        {showAgentsError && (
          <RetryMessageBar
            intent="warning"
            title={loadErrorTitle('agents', state.agentsQuery.error)}
            onRetry={() => void state.agentsQuery.refetch()}
          />
        )}
        {indexQuery.isError && (
          <RetryMessageBar intent="warning" title="Unable to load analysis status." onRetry={() => void indexQuery.refetch()} />
        )}
        <ConversationGridTools
          totalLabel={totalLabel}
          hideGreetingOnly={state.hideGreetingOnly}
          hiddenGreetingCount={list.hiddenGreetingCount}
          onHideGreetingOnlyChange={state.setHideGreetingOnly}
          selectingCount={selectingCount}
          disabled={selectionDisabled || list.rows.length === 0}
          onSelectFirst={(count) => void selectFirst(count)}
        />
        <ConversationSelectionSummary
          selectedCount={selectedCount}
          onClear={selection.clearSelection}
          clearDisabled={selectionDisabled}
        />
        <ConversationGrid<ConversationListRow>
          rows={list.rows}
          ariaLabel="Conversations"
          showAgent={!state.agentId}
          showAnalysis
          renderActions={renderActions}
          sortState={state.sort}
          onSortChange={isRunning ? undefined : state.setSort}
          selectedItems={selection.selectedItems}
          onSelectionChange={selection.onSelectionChange}
          selectionDisabled={selectionDisabled}
          isLoading={conversationsLoading}
          loadingLabel={state.environmentsQuery.isPending ? 'Loading environments…' : 'Loading conversations…'}
          error={transcriptsQuery.error}
          errorTitle={loadErrorTitle('conversations', transcriptsQuery.error)}
          onRetry={retryConversations}
          hasMore={list.hasMore}
          isLoadingMore={list.isPagingAhead}
          onLoadMore={list.showMore}
          empty={<ConversationsEmpty filtersActive={state.filtersActive} onClearFilters={state.clearFilters} />}
        />
        <Caption1 className={styles.showing} role="status" aria-live="polite">{showingLabel}</Caption1>
      </>
    );
  }

  return (
    <div className={styles.root}>
      <Toaster toasterId={toasterId} position="top-end" />
      <ConversationHeaderActions
        container={actionsContainer}
        selectedCount={selectedCount}
        analyzeDisabled={selectedCount === 0 || isRunning || !environment}
        onAnalyze={() => setDialogRows(selection.selectedRows)}
        resultsAgents={resultsAgents}
        resultsLoading={resultsLoading}
        resultsError={state.agentsQuery.isError || indexQuery.isError}
        resultsDisabled={!environmentUrl || !resultsAvailability.ready}
        promptId={runHere?.promptId}
        environmentUrl={environmentUrl}
      />
      <ConversationFilterBar
        environments={state.environments}
        selectedEnvironment={environment}
        agents={state.agents}
        selectedAgentId={state.agentId}
        period={state.period}
        dateRange={state.dateRange}
        status={state.status}
        searchInput={state.searchInput}
        loadingEnvironments={state.environmentsQuery.isPending}
        loadingAgents={state.agentsQuery.isLoading}
        disabled={isRunning}
        onEnvironmentChange={state.setEnvironmentUrl}
        onAgentChange={state.setAgentId}
        onPeriodChange={state.setPeriod}
        onDateRangeChange={state.setDateRange}
        onStatusChange={state.setStatus}
        onSearchChange={state.setSearchInput}
      />
      {run && isRunning && (
        <AnalysisRunBanner
          run={run}
          onCancel={analysis.cancel}
        />
      )}
      <Card className={styles.content}>
        {body}
      </Card>
      {dialogRows && (
        <AnalyzeConversationsDialog<ConversationListRow>
          open
          rows={dialogRows}
          environmentName={environment?.name ?? ''}
          isRunning={isRunning}
          hasResult={hasResult}
          onStart={startAnalysis}
          onClose={() => setDialogRows(undefined)}
        />
      )}
      <ConversationChatDrawer
        environmentUrl={environmentUrl}
        row={chatRow}
        onClose={() => setChatRow(undefined)}
      />
    </div>
  );
}
