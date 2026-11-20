import { useId, useMemo } from 'react';
import {
  DrawerBody,
  DrawerHeader,
  OverlayDrawer,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useConversationTranscriptContent } from '../../hooks/useConversationBrowser';
import type { ConversationListRow } from '../../hooks/useConversationListView';
import { formatShortDateTime } from '../../utils/format';
import { parseTranscriptToMessages } from '../../utils/transcriptMessages';
import { TranscriptMessageList } from '../analysis-result-details/TranscriptMessageList';
import { ConversationPreviewHeader } from '../shared/ConversationPreviewHeader';
import { RetryMessageBar } from '../shared/RetryMessageBar';

const useStyles = makeStyles({
  drawer: { width: 'min(560px, 100vw)', height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: {
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  body: {
    paddingTop: tokens.spacingVerticalL,
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    scrollbarGutter: 'stable',
    paddingBottom: tokens.spacingVerticalXL,
  },
});

interface ConversationChatDrawerProps {
  environmentUrl?: string;
  row?: ConversationListRow;
  onClose: () => void;
}

/** Side drawer with the conversation's chat transcript (CV-26). */
export function ConversationChatDrawer({ environmentUrl, row, onClose }: ConversationChatDrawerProps) {
  const styles = useStyles();
  const titleId = useId();
  const contentQuery = useConversationTranscriptContent(environmentUrl, row?.id);
  const messages = useMemo(() => parseTranscriptToMessages(contentQuery.data), [contentQuery.data]);

  return (
    <OverlayDrawer
      open={Boolean(row)}
      position="end"
      className={styles.drawer}
      aria-labelledby={titleId}
      onOpenChange={(_e, data) => { if (!data.open) onClose(); }}
    >
      <DrawerHeader className={styles.header}>
        <ConversationPreviewHeader
          titleId={titleId}
          conversationId={row?.conversationId}
          environmentUrl={environmentUrl}
          agentId={row?.agentId}
          messageCount={row?.messageCount ?? undefined}
          durationSeconds={row?.durationSeconds ?? undefined}
          onClose={onClose}
        />
      </DrawerHeader>
      <DrawerBody className={styles.body}>
        {contentQuery.isPending && row ? (
          <Spinner label="Loading conversation…" />
        ) : contentQuery.isError ? (
          <RetryMessageBar
            title="Unable to load this conversation."
            onRetry={() => void contentQuery.refetch()}
            retryDisabled={contentQuery.isFetching}
          />
        ) : (
          <TranscriptMessageList
            messages={messages}
            date={formatShortDateTime(row?.conversationStartTime) || undefined}
            botName={row?.agentName}
          />
        )}
      </DrawerBody>
    </OverlayDrawer>
  );
}
