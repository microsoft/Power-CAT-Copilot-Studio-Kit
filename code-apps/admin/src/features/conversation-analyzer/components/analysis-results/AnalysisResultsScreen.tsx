import { useCallback, useMemo, useState } from 'react';
import { Button, Card, makeStyles, tokens } from '@fluentui/react-components';
import { AddRegular } from '@fluentui/react-icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAgentMeta } from '../../hooks/useAgentMeta';
import { useAnalysisResults } from '../../hooks/useAnalysisResults';
import { DEFAULT_RESULTS_SORT, useAnalysisResultRows, type AnalysisResultRow } from '../../hooks/useAnalysisResultRows';
import { useConversationAnalysis } from '../../hooks/useConversationAnalysis';
import { useConversationSelection } from '../../hooks/useConversationSelection';
import { useDeleteAnalysisResults } from '../../hooks/useDeleteAnalysisResults';
import { usePromptLabelMap } from '../../hooks/usePromptLabelMap';
import { getFlagLabel } from '../../utils/analysisOutcome';
import { exportToCsv } from '../../utils/csvExport';
import { getOriginCrumb, originQuery, RESULTS_ENV_PARAM, RESULTS_ORIGIN_PARAM } from '../../utils/resultsOrigin';
import { AnalysisRunBanner } from '../conversations/AnalysisRunBanner';
import { ConversationGrid } from '../shared/conversation-grid/ConversationGrid';
import { sortConversationRows } from '../shared/conversation-grid/conversationGridSort';
import type { ConversationGridSortState } from '../shared/conversation-grid/types';
import { EmptyState } from '../shared/EmptyState';
import { RetryMessageBar } from '../shared/RetryMessageBar';
import { AnalysisScreenHeader } from './AnalysisScreenHeader';
import { DeleteResultsDialog } from './DeleteResultsDialog';
import { ResultsSummaryStrip } from './ResultsSummaryStrip';
import { ResultsToolbar } from './ResultsToolbar';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXL,
    maxWidth: '1280px',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    boxSizing: 'border-box',
  },
  gridCard: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

/** Analysis results for one agent: summary, prompt filter, grid, delete, export and run progress (AR-1…AR-6). */
export default function AnalysisResultsScreen() {
  const styles = useStyles();
  const { agentId = '' } = useParams<{ agentId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const envParam = params.get(RESULTS_ENV_PARAM) ?? undefined;
  const agentMeta = useAgentMeta(agentId, envParam);
  const environmentUrl = agentMeta.data?.environmentUrl ?? envParam;
  const agentName = agentMeta.data?.name ?? 'Agent';
  const analysis = useConversationAnalysis();
  const { run } = analysis;
  const runForAgent = run?.agents.some((a) => a.id === agentId || a.id === agentMeta.data?.agentId) ? run : undefined;
  const isRunningHere = runForAgent?.status === 'running';
  const resultsQuery = useAnalysisResults(
    agentId,
    environmentUrl,
    agentMeta.isSuccess,
    isRunningHere ? 15_000 : false,
  );
  const { prompts, labels } = usePromptLabelMap();
  const allRows = useAnalysisResultRows(resultsQuery.data, labels);

  const origin = params.get(RESULTS_ORIGIN_PARAM);
  const promptId = params.get('promptId')?.toLowerCase() ?? '';
  const setPromptId = (next: string) => {
    const nextParams = new URLSearchParams(params);
    if (next) nextParams.set('promptId', next);
    else nextParams.delete('promptId');
    setParams(nextParams, { replace: true });
  };
  const usedPrompts = useMemo(() => {
    const used = new Set(allRows.map((r) => r.promptId));
    return prompts.filter((p) => used.has(p.id.toLowerCase()));
  }, [allRows, prompts]);
  const promptRows = useMemo(
    () => (promptId ? allRows.filter((r) => r.promptId === promptId) : allRows),
    [allRows, promptId],
  );

  const [flagFilter, setFlagFilter] = useState(false);
  const flagKinds = new Set(promptRows.map((r) => r.outcome.kind));
  const flagLabel = getFlagLabel(flagKinds.size === 1 ? [...flagKinds][0] : undefined);
  const flagActive = flagFilter && Boolean(flagLabel);
  const [sort, setSort] = useState<ConversationGridSortState>(DEFAULT_RESULTS_SORT);
  const rows = useMemo(
    () => sortConversationRows(flagActive ? promptRows.filter((r) => r.outcome.flagged) : promptRows, sort),
    [flagActive, promptRows, sort],
  );

  const deleteMutation = useDeleteAnalysisResults();
  const selection = useConversationSelection<AnalysisResultRow>(`${agentId}|${promptId}|${flagActive}`, rows, deleteMutation.isPending);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selectedIds = selection.selectedRows.map((r) => r.id);
  const handleDelete = () => {
    setConfirmDelete(false);
    deleteMutation.mutate(selectedIds, { onSuccess: (failed) => { if (failed === 0) selection.clearSelection(); } });
  };

  const promptNameState = useMemo(() => ({
    promptNames: Object.fromEntries(prompts.map((p) => [p.id.toLowerCase(), labels.get(p.id.toLowerCase()) ?? p.name])),
    promptTypes: Object.fromEntries(prompts.map((p) => [p.id.toLowerCase(), p.type])),
  }), [labels, prompts]);
  const renderActions = useCallback((row: AnalysisResultRow) => (
    <Button
      size="small"
      appearance="subtle"
      aria-label={`View result for transcript ${row.transcriptId}`}
      onClick={() => navigate(`/conversation-analyzer/agents/${agentId}/conversations/${row.id}${originQuery(origin, environmentUrl)}`, { state: promptNameState })}
    >
      View result
    </Button>
  ), [agentId, environmentUrl, navigate, origin, promptNameState]);

  const handleExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    exportToCsv(`${agentName.replace(/[^\w-]+/g, '_')}_analysis_${stamp}.csv`, rows, [
      { key: 'transcriptId', header: 'Transcript Id' },
      { key: 'promptId', header: 'Prompt', format: (r) => r.analyses?.[0]?.promptLabel },
      { key: 'outcome', header: 'Outcome', format: (r) => r.outcome.label },
      { key: 'startTime', header: 'Start time' },
      { key: 'messageCount', header: 'Messages' },
      { key: 'durationSeconds', header: 'DurationInSeconds' },
      { key: 'summary', header: 'Summary' },
      { key: 'record', header: 'Prompt Result', format: (r) => r.record.cat_promptresult ?? '' },
    ]);
  };

  return (
    <main className={styles.root}>
      <AnalysisScreenHeader
        crumbs={[
          { label: 'Conversation Analyzer', to: '/conversation-analyzer' },
          getOriginCrumb(origin),
          { label: agentMeta.isLoading ? 'Loading…' : agentName },
        ]}
        title={agentMeta.isLoading ? 'Loading agent…' : agentName}
        subtitle="Review analyzed conversations and drill into individual results."
        actions={(
          <Button
            appearance="primary"
            icon={<AddRegular />}
            disabled={analysis.isRunning}
            onClick={() => navigate(`/conversation-analyzer/agents/${agentId}/new-analysis${originQuery(origin, environmentUrl)}`)}
          >
            New Analysis
          </Button>
        )}
      />

      {runForAgent && isRunningHere && (
        <AnalysisRunBanner
          run={runForAgent}
          variant="card"
          onCancel={analysis.cancel}
        />
      )}
      {resultsQuery.isError && (
        <RetryMessageBar
          title="Unable to load analysis results."
          message={resultsQuery.error.message}
          onRetry={() => void resultsQuery.refetch()}
        />
      )}
      {deleteMutation.isError && (
        <RetryMessageBar title="Unable to delete results." message={deleteMutation.error.message} />
      )}
      {deleteMutation.data ? (
        <RetryMessageBar
          intent="warning"
          title={`${deleteMutation.data.toLocaleString()} results couldn't be deleted.`}
          message="Try deleting them again."
        />
      ) : null}

      <ResultsSummaryStrip
        rows={promptRows}
        isLoading={resultsQuery.isPending}
        flagFilter={flagActive}
        onToggleFlagFilter={() => setFlagFilter((v) => !v)}
      />

      <Card className={styles.gridCard}>
        <ResultsToolbar
          prompts={usedPrompts}
          promptId={promptId}
          onSelectPrompt={setPromptId}
          flagLabel={flagActive ? flagLabel : undefined}
          onClearFlag={() => setFlagFilter(false)}
          selectedCount={selectedIds.length}
          isDeleting={deleteMutation.isPending}
          onDelete={() => setConfirmDelete(true)}
          canExport={rows.length > 0}
          onExport={handleExport}
        />
        <ConversationGrid<AnalysisResultRow>
          rows={rows}
          ariaLabel={`Analysis results of ${agentName}`}
          showAnalysis
          showSummary
          renderActions={renderActions}
          clickableSort
          sortState={sort}
          onSortChange={setSort}
          selectedItems={selection.selectedItems}
          onSelectionChange={selection.onSelectionChange}
          selectionDisabled={deleteMutation.isPending}
          isLoading={resultsQuery.isPending}
          loadingLabel="Loading results…"
          empty={(
            <EmptyState
              illustration
              title="No conversations analyzed yet."
              description="Run a new analysis from the Agents tab to populate this view."
              minHeight="280px"
            />
          )}
        />
      </Card>

      <DeleteResultsDialog
        open={confirmDelete}
        count={selectedIds.length}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </main>
  );
}
