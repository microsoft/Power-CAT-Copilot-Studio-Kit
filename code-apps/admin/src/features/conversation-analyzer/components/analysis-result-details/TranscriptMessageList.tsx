import { useEffect, useRef } from 'react';
import { Avatar, Caption1, makeStyles, mergeClasses, tokens, typographyStyles } from '@fluentui/react-components';
import { Bot20Regular, Person20Regular } from '@fluentui/react-icons';
import { MarkdownContent } from '../shared/MarkdownContent';
import { matchesHighlight, type TranscriptMessage } from '../../utils/transcriptMessages';

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  dateDivider: {
    display: 'flex',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground3,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: tokens.spacingHorizontalS, minWidth: 0 },
  msgRowUser: { flexDirection: 'row-reverse' },
  avatar: { flexShrink: 0, backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground3 },
  avatarUser: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 },
  message: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS,
    minWidth: 0, maxWidth: '80%', flex: '0 1 auto',
    '@media (max-width: 639px)': { maxWidth: '88%' },
  },
  messageUser: { alignItems: 'flex-end' },
  bubble: {
    ...typographyStyles.body1,
    maxWidth: '100%',
    boxSizing: 'border-box',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusXLarge,
    border: `${tokens.strokeWidthThin} solid transparent`,
    color: tokens.colorNeutralForeground1,
    overflowWrap: 'anywhere',
  },
  bubbleBot: { backgroundColor: tokens.colorNeutralBackground3, borderBottomLeftRadius: tokens.borderRadiusSmall },
  bubbleUser: {
    backgroundColor: tokens.colorBrandBackground2,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke2}`,
    borderBottomRightRadius: tokens.borderRadiusSmall,
  },
  time: { color: tokens.colorNeutralForeground3 },
  highlighted: {
    outline: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    outlineOffset: tokens.spacingHorizontalXXS,
    backgroundColor: tokens.colorBrandBackground2,
  },
  empty: { color: tokens.colorNeutralForeground3 },
});

interface TranscriptMessageListProps {
  messages: TranscriptMessage[];
  date?: string;
  botName?: string;
  highlightedMessage?: string;
}

/** Chat bubble list for a transcript; scrolls the highlighted message into view. */
export function TranscriptMessageList({ messages, date, botName = 'Bot', highlightedMessage }: TranscriptMessageListProps) {
  const styles = useStyles();
  const highlightRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (highlightedMessage && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedMessage]);

  if (messages.length === 0) {
    return <Caption1 className={styles.empty}>This conversation has no messages.</Caption1>;
  }

  const firstHighlightIndex = highlightedMessage == null
    ? -1
    : messages.findIndex((m) => matchesHighlight(m.text, highlightedMessage));
  return (
    <div className={styles.list} role="log" aria-label="Conversation messages">
      {date && !messages.some((msg) => msg.time) && <Caption1 className={styles.dateDivider}>{date}</Caption1>}
      {messages.map((msg, i) => {
        const isHighlighted = highlightedMessage != null && matchesHighlight(msg.text, highlightedMessage);
        const attachRef = i === firstHighlightIndex;
        const isUser = msg.role === 'user';
        return (
          <article key={`${msg.role}-${i}`} ref={attachRef ? highlightRef : undefined}
            aria-label={isUser ? 'User message' : `${botName} message`}
            className={mergeClasses(styles.msgRow, isUser && styles.msgRowUser)}>
            <Avatar size={28} aria-hidden="true"
              className={mergeClasses(styles.avatar, isUser && styles.avatarUser)}
              icon={isUser ? <Person20Regular /> : <Bot20Regular />} />
            <div className={mergeClasses(styles.message, isUser && styles.messageUser)}>
              <div className={mergeClasses(styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot, isHighlighted && styles.highlighted)}>
                <MarkdownContent text={msg.text} />
              </div>
              {msg.time && <Caption1 className={styles.time}>{msg.time}</Caption1>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
