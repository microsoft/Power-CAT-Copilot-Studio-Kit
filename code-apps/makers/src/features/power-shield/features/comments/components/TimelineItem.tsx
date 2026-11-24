import { Badge, Text, makeStyles, tokens, mergeClasses } from '@fluentui/react-components';
import type { RequestComment } from '../../../models/comment';
import { AttachmentList } from './AttachmentList';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  item: {
    position: 'relative',
    paddingLeft: '32px',
    paddingBottom: tokens.spacingVerticalL,
  },

  /** Vertical rail line */
  itemWithLine: {
    '::before': {
      content: '""',
      position: 'absolute',
      left: '5px',
      top: '12px',
      bottom: '0',
      width: '2px',
      backgroundColor: tokens.colorNeutralStroke2,
    },
  },

  /** Last item has no continuing rail line */
  itemLast: {
    '::before': {
      display: 'none',
    },
  },

  dotBase: {
    position: 'absolute',
    left: '0',
    top: '4px',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },

  dotAdmin: {
    backgroundColor: tokens.colorBrandBackground,
  },

  dotMaker: {
    backgroundColor: tokens.colorNeutralForeground3,
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalXXS,
  },

  timestamp: {
    color: tokens.colorNeutralForeground3,
  },

  cardBase: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },

  cardAdmin: {
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorBrandBackground,
  },

  bodyText: {
    whiteSpace: 'pre-wrap',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTimestamp(isoString: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) + ' ' + d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface TimelineItemProps {
  comment: RequestComment;
  isLast: boolean;
  onDownloadAttachment: (annotationId: string) => void;
}

export function TimelineItem({ comment, isLast, onDownloadAttachment }: TimelineItemProps) {
  const styles = useStyles();
  const isAdmin = comment.authorRole === 'Admin';

  return (
    <div
      className={mergeClasses(
        styles.item,
        styles.itemWithLine,
        isLast && styles.itemLast,
      )}
    >
      {/* Timeline dot */}
      <div className={mergeClasses(styles.dotBase, isAdmin ? styles.dotAdmin : styles.dotMaker)} />

      {/* Timestamp + author header */}
      <div className={styles.header}>
        <Text size={200} className={styles.timestamp}>
          {formatTimestamp(comment.createdOn)}
        </Text>
        {isAdmin ? (
          <Badge appearance="filled" color="brand">Admin</Badge>
        ) : (
          <Badge appearance="tint">Maker</Badge>
        )}
        <Text size={200} weight="semibold">
          {comment.authorDisplayName || comment.authorUpn}
        </Text>
      </div>

      {/* Comment card */}
      <div className={mergeClasses(styles.cardBase, isAdmin && styles.cardAdmin)}>
        <Text size={300} className={styles.bodyText}>
          {comment.commentBody}
        </Text>
        <AttachmentList
          attachments={comment.attachments}
          onDownload={onDownloadAttachment}
        />
      </div>
    </div>
  );
}
