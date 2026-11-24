import { Card, makeStyles, tokens } from '@fluentui/react-components';
import type { TranscriptMessage } from '../../utils/transcriptMessages';
import { ConversationPreviewHeader } from '../shared/ConversationPreviewHeader';
import { TranscriptMessageList } from './TranscriptMessageList';

interface ConversationTranscriptCardProps {
  messages: TranscriptMessage[];
  messageCount?: number;
  duration?: number;
  date?: string;
  botName?: string;
  highlightedMessage?: string;
  /** Transcript `name`: the Copilot Studio conversation ID. */
  conversationId?: string;
  environmentUrl?: string;
  /** Copilot Studio bot ID. */
  agentId?: string;
  onClose: () => void;
}

const useStyles = makeStyles({
  card: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: 0,
  },
  header: {
    paddingTop: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalL,
    paddingLeft: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  body: { flex: 1, minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable', padding: tokens.spacingHorizontalL },
});

/** Transcript panel on the result detail screen (RD-1). */
export function ConversationTranscriptCard({
  messages,
  messageCount,
  duration,
  date,
  botName,
  highlightedMessage,
  conversationId,
  environmentUrl,
  agentId,
  onClose,
}: ConversationTranscriptCardProps) {
  const styles = useStyles();

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <ConversationPreviewHeader
          conversationId={conversationId}
          environmentUrl={environmentUrl}
          agentId={agentId}
          messageCount={messageCount}
          durationSeconds={duration}
          onClose={onClose}
        />
      </div>
      <div className={styles.body}>
        <TranscriptMessageList messages={messages} date={date} botName={botName} highlightedMessage={highlightedMessage} />
      </div>
    </Card>
  );
}
