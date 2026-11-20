import { Button, Caption1, Subtitle1, makeStyles, tokens } from '@fluentui/react-components';
import { Bug20Regular, Chat20Regular, Dismiss24Regular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import { formatCompactDuration } from '../../utils/format';
import { CopyIdButton } from './CopyIdButton';
import { TruncatedId } from './TruncatedId';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXXL },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    margin: 0,
    flex: '1 1 auto',
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    '& > svg': { flexShrink: 0 },
  },
  actions: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexShrink: 0, marginLeft: 'auto' },
  meta: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  idRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, minWidth: 0 },
  label: { flexShrink: 0, whiteSpace: 'nowrap' },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, flex: '0 1 auto' },
  muted: { color: tokens.colorNeutralForeground3 },
});

interface ConversationPreviewHeaderProps {
  /** Transcript `name`: the Copilot Studio conversation ID, also used by Agent Debugger. */
  conversationId?: string;
  environmentUrl?: string;
  /** Copilot Studio bot ID. */
  agentId?: string;
  messageCount?: number;
  durationSeconds?: number;
  titleId?: string;
  onClose: () => void;
}

/** Shared "Conversation preview" header: title, Debug, close, conversation ID and stats. */
export function ConversationPreviewHeader({
  conversationId,
  environmentUrl,
  agentId,
  messageCount,
  durationSeconds,
  titleId,
  onClose,
}: ConversationPreviewHeaderProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const debuggerRoute = conversationId && environmentUrl && agentId
    ? `/agent-debugger?${new URLSearchParams({ conversationId, environmentUrl, agentId })}`
    : undefined;
  const subtitle = [
    messageCount != null ? `${messageCount} ${messageCount === 1 ? 'message' : 'messages'}` : undefined,
    durationSeconds != null ? `${formatCompactDuration(durationSeconds)} duration` : undefined,
  ].filter(Boolean).join(' \u00b7 ');

  return (
    <div className={styles.root}>
      <div className={styles.titleRow}>
        <Subtitle1 as="h2" id={titleId} className={styles.title}>
          <Chat20Regular aria-hidden="true" />Conversation preview
        </Subtitle1>
        <span className={styles.actions}>
          <Button
            appearance="secondary"
            size="small"
            icon={<Bug20Regular />}
            disabled={!debuggerRoute}
            onClick={() => debuggerRoute && navigate(debuggerRoute)}
            title={debuggerRoute ?  'Debug the conversation in Agent Debugger' : 'Unable to open conversation in Agent Debugger'}
          >
            Debug
          </Button>
          <Button appearance="subtle" aria-label="Close" icon={<Dismiss24Regular />} onClick={onClose} />
        </span>
      </div>
      <div className={styles.meta}>
        {conversationId && (
          <div className={styles.idRow}>
            <Caption1 className={styles.label}>Conversation ID:</Caption1>
            <TruncatedId value={conversationId} className={styles.mono} />
            <CopyIdButton value={conversationId} label="Copy conversation ID" />
          </div>
        )}
        {subtitle && <Caption1 className={styles.muted}>{subtitle}</Caption1>}
      </div>
    </div>
  );
}
