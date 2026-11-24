import { useMemo, useState } from 'react';
import { Button, Link, MessageBar, MessageBarBody, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Chat20Regular, ChevronLeft20Regular, ChevronRight20Regular } from '@fluentui/react-icons';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PROMPT_TYPE_CUSTOM } from '../../contracts/types';
import { useAgentMeta } from '../../hooks/useAgentMeta';
import { useAnalysisResultDetail } from '../../hooks/useAnalysisResultDetail';
import { useAnalysisResults } from '../../hooks/useAnalysisResults';
import { DEFAULT_RESULTS_SORT, toAnalysisResultRow } from '../../hooks/useAnalysisResultRows';
import { sortConversationRows } from '../shared/conversation-grid/conversationGridSort';
import { formatShortDateTime } from '../../utils/format';
import { getOriginCrumb, originQuery, RESULTS_ENV_PARAM, RESULTS_ORIGIN_PARAM } from '../../utils/resultsOrigin';
import { parseTranscriptToMessages } from '../../utils/transcriptMessages';
import { AnalysisScreenHeader } from '../analysis-results/AnalysisScreenHeader';
import { CopyIdButton } from '../shared/CopyIdButton';
import { TruncatedId } from '../shared/TruncatedId';
import { ConversationTranscriptCard } from './ConversationTranscriptCard';
import { CustomResultCard } from './CustomResultCard';
import { PIIResultCard, type PIIData } from './PIIResultCard';
import { PromptContentDialog } from './PromptContentDialog';
import { SentimentResultCard, type SentimentData } from './SentimentResultCard';

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(480px, 2fr)',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXL,
    // Parent wrappers don't bound height; the app content area is the full viewport, so fill it directly.
    height: '100vh',
    minHeight: '480px',
    maxWidth: '1280px',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    boxSizing: 'border-box',
    overflow: 'hidden',
    '@media (max-width: 1024px)': { gridTemplateColumns: 'minmax(0, 1fr)', overflow: 'auto' },
  },
  oneColumn: { gridTemplateColumns: 'minmax(0, 1fr)' },
  title: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, minWidth: 0, whiteSpace: 'nowrap' },
  titleId: { maxWidth: '50%' },
  leftPane: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, minHeight: 0, minWidth: 0 },
  leftColumn: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, flex: 1, minHeight: 0, overflow: 'auto' },
  // Transcript spans the full page height beside the header; absolute fill keeps its length from growing the row.
  rightPane: {
    position: 'relative',
    minHeight: '360px',
    '@media (max-width: 1024px)': { minHeight: '480px' },
  },
  transcriptFill: { position: 'absolute', inset: 0 },
  spinner: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 },
  navRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: tokens.spacingVerticalS },
});

interface ResultNavState {
  promptNames?: Record<string, string>;
  promptTypes?: Record<string, number>;
}

const NO_PROMPT_LABELS: ReadonlyMap<string, string> = new Map();

function parseJson(raw?: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Human-readable result for custom prompts: JSON `result`, JSON `summary.convSummary`, or plain text. */
function extractCustomResult(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const parsed = parseJson(raw);
  if (!parsed) return raw;
  if (typeof parsed.result === 'string') return parsed.result;
  const summary = parsed.summary as { convSummary?: unknown } | undefined;
  return typeof summary?.convSummary === 'string' ? summary.convSummary : undefined;
}

/** Result detail: result card beside the transcript with highlighting and Previous / Next (RD-1). */
export default function AnalysisResultDetailsScreen() {
  const styles = useStyles();
  const { agentId = '', conversationId } = useParams<{ agentId: string; conversationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as ResultNavState | null;
  const [searchParams] = useSearchParams();
  const envParam = searchParams.get(RESULTS_ENV_PARAM) ?? undefined;
  const agentMeta = useAgentMeta(agentId, envParam);
  const environmentUrl = agentMeta.data?.environmentUrl ?? envParam;
  const detailQuery = useAnalysisResultDetail(conversationId);
  const resultsQuery = useAnalysisResults(agentId, environmentUrl, agentMeta.isSuccess);
  const detail = detailQuery.data;
  const resultsPath = `/conversation-analyzer/agents/${agentId}/conversations`;
  const origin = searchParams.get(RESULTS_ORIGIN_PARAM);
  const originSuffix = originQuery(origin, environmentUrl);
  const agentName = agentMeta.data?.name ?? 'Agent';

  const parsed = useMemo(() => parseJson(detail?.cat_promptresult), [detail?.cat_promptresult]);
  const piiData = parsed?.summary && parsed.pii ? (parsed as unknown as PIIData) : undefined;
  const sentimentData = parsed?.summary && parsed.sentiments ? (parsed as unknown as SentimentData) : undefined;
  const transcriptMessages = useMemo(() => parseTranscriptToMessages(detail?.cat_content), [detail?.cat_content]);

  const { prevId, nextId } = useMemo(() => {
    // Same order as the results grid (top to bottom), not the raw fetch order.
    const rows = (resultsQuery.data ?? []).map((r) => toAnalysisResultRow(r, NO_PROMPT_LABELS));
    const list = sortConversationRows(rows, DEFAULT_RESULTS_SORT);
    const idx = list.findIndex((r) => r.id === conversationId);
    return {
      prevId: idx > 0 ? list[idx - 1].id : undefined,
      nextId: idx >= 0 && idx < list.length - 1 ? list[idx + 1].id : undefined,
    };
  }, [resultsQuery.data, conversationId]);

  const [selectedMessage, setSelectedMessage] = useState<string>();
  const [showTranscript, setShowTranscript] = useState(true);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);

  const promptId = detail?._cat_prompt_value ?? undefined;
  const promptKey = promptId?.toLowerCase() ?? '';
  const promptName = navState?.promptNames?.[promptKey] ?? detail?.cat_promptname ?? '';
  const isCustomPrompt = Boolean(promptId) && navState?.promptTypes?.[promptKey] === PROMPT_TYPE_CUSTOM;

  const goTo = (id: string) => {
    setSelectedMessage(undefined);
    navigate(`${resultsPath}/${id}${originSuffix}`, { state: navState });
  };

  const convId = detail?.cat_name || detail?.cat_conversationid || '';
  const duration = detail?.cat_conversationdurationseconds ?? undefined;
  const messages = detail?.cat_messages ?? undefined;

  const transcriptVisible = showTranscript && Boolean(detail);

  return (
    <main className={mergeClasses(styles.root, !transcriptVisible && styles.oneColumn)}>
      <div className={styles.leftPane}>
        <AnalysisScreenHeader
          crumbs={[
            { label: 'Conversation Analyzer', to: '/conversation-analyzer' },
            getOriginCrumb(origin),
            { label: agentName, to: `${resultsPath}${originSuffix}` },
            { label: 'Conversation result' },
          ]}
          title={(
            <span className={styles.title}>
              Conversation
              {convId && <TruncatedId value={convId} className={styles.titleId} />}
              {convId && <CopyIdButton value={convId} label="Copy conversation ID" />}
            </span>
          )}
          subtitle={promptName && (isCustomPrompt
            ? <Link onClick={() => setPromptDialogOpen(true)}>{promptName}</Link>
            : promptName)}
          actions={!showTranscript && (
            <Button icon={<Chat20Regular />} onClick={() => setShowTranscript(true)}>Show transcript</Button>
          )}
        />

        {detailQuery.isLoading ? (
          <div className={styles.spinner}><Spinner label="Loading result…" /></div>
        ) : !detail ? (
          <MessageBar intent="warning">
            <MessageBarBody>This analysis result could not be loaded.</MessageBarBody>
          </MessageBar>
        ) : (
          <div className={styles.leftColumn}>
            {piiData ? (
              <PIIResultCard data={piiData} duration={duration} messages={messages} onSelectMessage={setSelectedMessage} />
            ) : sentimentData ? (
              <SentimentResultCard data={sentimentData} duration={duration} messages={messages} onSelectMessage={setSelectedMessage} />
            ) : (
              <CustomResultCard
                summary={detail.cat_summary ?? 'No summary available.'}
                result={extractCustomResult(detail.cat_promptresult)}
                duration={duration}
                messages={messages}
              />
            )}
            <nav className={styles.navRow} aria-label="Result navigation">
              <Button appearance="subtle" icon={<ChevronLeft20Regular />} disabled={!prevId} onClick={() => prevId && goTo(prevId)}>
                Previous
              </Button>
              <Button
                appearance="subtle"
                icon={<ChevronRight20Regular />}
                iconPosition="after"
                disabled={!nextId}
                onClick={() => nextId && goTo(nextId)}
              >
                Next
              </Button>
            </nav>
          </div>
        )}
      </div>

      {showTranscript && detail && (
        <div className={styles.rightPane}>
          <div className={styles.transcriptFill}>
            <ConversationTranscriptCard
              messages={transcriptMessages}
              messageCount={messages}
              duration={duration}
              date={detail.createdon ? formatShortDateTime(detail.createdon) : undefined}
              botName={agentMeta.data?.name ?? 'Agent'}
              highlightedMessage={selectedMessage}
              conversationId={detail.cat_name || detail.cat_conversationid || undefined}
              environmentUrl={detail.cat_environmenturl || agentMeta.data?.environmentUrl}
              agentId={detail.cat_agentid ?? agentMeta.data?.agentId}
              onClose={() => setShowTranscript(false)}
            />
          </div>
        </div>
      )}

      <PromptContentDialog
        promptId={promptId}
        promptName={promptName}
        open={promptDialogOpen}
        onClose={() => setPromptDialogOpen(false)}
      />
    </main>
  );
}
