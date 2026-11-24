import { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Dismiss20Regular, Play20Filled } from '@fluentui/react-icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MAX_CONVERSATIONS_PER_ANALYSIS } from '../../contracts/constants';
import { agentResultsPath, getOriginCrumb, normalizeOrigin, RESULTS_ENV_PARAM, RESULTS_ORIGIN_PARAM } from '../../utils/resultsOrigin';
import { loadErrorTitle } from '../../utils/accessErrors';
import { useAgentMeta } from '../../hooks/useAgentMeta';
import { useConversationAnalysis } from '../../hooks/useConversationAnalysis';
import { useConversationAnalysisIndex } from '../../hooks/useConversationAnalysisIndex';
import { useConversationTranscripts } from '../../hooks/useConversationBrowser';
import { useConversationListView, type ConversationListRow } from '../../hooks/useConversationListView';
import { useConversationSelection } from '../../hooks/useConversationSelection';
import { usePromptLabelMap } from '../../hooks/usePromptLabelMap';
import type { ConversationGridSortState } from '../shared/conversation-grid/types';
import { ConversationGrid } from '../shared/conversation-grid/ConversationGrid';
import { EmptyState } from '../shared/EmptyState';
import { AnalysisScreenHeader } from '../analysis-results/AnalysisScreenHeader';
import { ConversationGridTools } from '../conversations/ConversationGridTools';
import { ConversationChatDrawer } from '../conversations/ConversationChatDrawer';
import { ViewChatButton } from '../conversations/ViewChatButton';
import { AnalysisSetupCard } from './AnalysisSetupCard';

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

/** Single-agent analysis: pick a prompt and up to 300 conversations (NA-1…NA-4). */
export default function NewAnalysisScreen() {
  const styles = useStyles();
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const origin = normalizeOrigin(searchParams.get(RESULTS_ORIGIN_PARAM));
  const agentMeta = useAgentMeta(agentId, searchParams.get(RESULTS_ENV_PARAM) ?? undefined);
  const environmentUrl = agentMeta.data?.environmentUrl;
  const botId = agentMeta.data?.agentId ?? agentId;
  const { query: promptsQuery, prompts: allPrompts, labels } = usePromptLabelMap();
  const prompts = useMemo(() => allPrompts.filter((p) => p.state === 0), [allPrompts]);
  const [promptId, setPromptId] = useState('');
  const prompt = prompts.find((p) => p.id === promptId);
  const analysis = useConversationAnalysis();

  const [sort, setSort] = useState<ConversationGridSortState>({ sortColumn: 'startTime', sortDirection: 'descending' });
  const serverColumn = sort.sortColumn === 'conversation' ? 'conversationId' : sort.sortColumn === 'startTime' ? 'conversationStart' : undefined;
  const [hideGreetingOnly, setHideGreetingOnly] = useState(false);
  const transcriptsQuery = useConversationTranscripts(
    environmentUrl,
    botId,
    '',
    [],
    serverColumn ?? 'conversationStart',
    serverColumn ? sort.sortDirection : 'descending',
  );
  const indexQuery = useConversationAnalysisIndex(environmentUrl);
  const scope = `${environmentUrl ?? ''}|${botId ?? ''}|${hideGreetingOnly}`;
  const list = useConversationListView({
    source: transcriptsQuery,
    index: indexQuery.data,
    promptLabels: labels,
    run: analysis.run,
    environmentUrl,
    status: 'all',
    hideGreetingOnly,
    clientSort: serverColumn ? undefined : sort,
    scopeKey: `${scope}|${sort.sortColumn}|${sort.sortDirection}`,
  });
  const selectionDisabled = analysis.isRunning || transcriptsQuery.isPending;
  const selection = useConversationSelection<ConversationListRow>(scope, list.rows, selectionDisabled);
  const [selectingCount, setSelectingCount] = useState<number>();
  const [chatRow, setChatRow] = useState<ConversationListRow>();
  const renderActions = (row: ConversationListRow) => (
    <ViewChatButton onClick={() => setChatRow(row)} />
  );
  const selectedCount = selection.selectedRows.length;
  const overLimit = selectedCount > MAX_CONVERSATIONS_PER_ANALYSIS;
  const canStart = Boolean(prompt && environmentUrl) && selectedCount > 0 && !overLimit && !analysis.isRunning;

  const { selectFirst: listSelectFirst } = list;
  const { selectRows } = selection;
  const selectFirst = useCallback(async (count: number) => {
    setSelectingCount(count);
    try {
      selectRows((await listSelectFirst(count)).rows);
    } finally {
      setSelectingCount(undefined);
    }
  }, [listSelectFirst, selectRows]);

  const handleStart = () => {
    if (!canStart || !prompt || !environmentUrl) return;
    const started = analysis.start({
      environmentUrl,
      environmentName: agentMeta.data?.environmentName ?? environmentUrl,
      prompt,
      transcripts: selection.selectedRows,
      origin,
    });
    if (started) {
      navigate(agentResultsPath(agentId ?? '', { promptId: prompt.id, origin, environmentUrl }));
    }
  };

  const agentName = agentMeta.data?.name ?? 'Agent';
  const total = list.matchingLoadedCount;

  return (
    <main className={styles.root}>
      <AnalysisScreenHeader
        crumbs={[
          { label: 'Conversation Analyzer', to: '/conversation-analyzer' },
          getOriginCrumb(origin),
          { label: 'New Analysis' },
        ]}
        title={agentMeta.isLoading ? 'Loading agent…' : agentName}
        subtitle={`Choose a prompt and select up to ${MAX_CONVERSATIONS_PER_ANALYSIS} conversations to analyze.`}
        actions={(
          <>
            <Button appearance="primary" icon={<Play20Filled />} disabled={!canStart} onClick={handleStart}>
              Start analysis{selectedCount > 0 ? ` (${selectedCount.toLocaleString()})` : ''}
            </Button>
            <Button icon={<Dismiss20Regular />} onClick={() => navigate(-1)}>Cancel</Button>
          </>
        )}
      />

      {analysis.isRunning && (
        <MessageBar intent="info">
          <MessageBarBody>Another analysis is running. You can start a new one when it finishes.</MessageBarBody>
        </MessageBar>
      )}
      {!agentMeta.isLoading && agentMeta.data && !environmentUrl && (
        <MessageBar intent="warning">
          <MessageBarBody>This agent has no environment URL, so its conversations can't be loaded.</MessageBarBody>
        </MessageBar>
      )}

      <AnalysisSetupCard
        prompts={prompts}
        promptId={promptId}
        onSelectPrompt={setPromptId}
        isLoading={promptsQuery.isPending}
        isError={promptsQuery.isError}
        onRetry={() => void promptsQuery.refetch()}
        selectedCount={selectedCount}
        disabled={analysis.isRunning}
      />

      {overLimit && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Too many conversations selected.</MessageBarTitle>
            You can process a maximum of {MAX_CONVERSATIONS_PER_ANALYSIS} conversations at a time.
          </MessageBarBody>
        </MessageBar>
      )}

      <Card className={styles.gridCard}>
        <CardHeader
          header={<Subtitle2 as="h2">Conversations</Subtitle2>}
          action={selectedCount > 0 ? <Badge appearance="tint" color="brand">{selectedCount.toLocaleString()} selected</Badge> : undefined}
        />
        {agentMeta.isLoading ? (
          <Spinner label="Loading agent…" />
        ) : (
          <>
            <ConversationGridTools
              totalLabel={`${total.toLocaleString()}${list.hasMore ? '+' : ''} conversations`}
              hideGreetingOnly={hideGreetingOnly}
              hiddenGreetingCount={list.hiddenGreetingCount}
              onHideGreetingOnlyChange={setHideGreetingOnly}
              selectingCount={selectingCount}
              disabled={selectionDisabled || list.rows.length === 0}
              onSelectFirst={(count) => void selectFirst(count)}
            />
            <ConversationGrid<ConversationListRow>
              rows={list.rows}
              ariaLabel={`Conversations of ${agentName}`}
              showAnalysis
              renderActions={renderActions}
              sortState={sort}
              onSortChange={setSort}
              selectedItems={selection.selectedItems}
              onSelectionChange={selection.onSelectionChange}
              selectionDisabled={selectionDisabled}
              isLoading={transcriptsQuery.isPending && Boolean(environmentUrl)}
              error={transcriptsQuery.error}
              errorTitle={loadErrorTitle('conversations', transcriptsQuery.error)}
              onRetry={() => void transcriptsQuery.refetch()}
              hasMore={list.hasMore}
              isLoadingMore={list.isPagingAhead}
              onLoadMore={list.showMore}
              empty={<EmptyState illustration title="No conversations found" description="This agent has no conversation transcripts yet." minHeight="280px" />}
            />
          </>
        )}
      </Card>
      <ConversationChatDrawer
        environmentUrl={environmentUrl}
        row={chatRow}
        onClose={() => setChatRow(undefined)}
      />
    </main>
  );
}
