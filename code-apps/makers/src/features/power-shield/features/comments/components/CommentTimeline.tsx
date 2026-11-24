import { makeStyles, tokens, Spinner, Text } from '@fluentui/react-components';
import type { RequestComment } from '../../../models/comment';
import { TimelineItem } from './TimelineItem';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
  },
});

interface CommentTimelineProps {
  comments: RequestComment[];
  loading: boolean;
  error: string | null;
  onDownloadAttachment: (annotationId: string) => void;
}

export function CommentTimeline({ comments, loading, error, onDownloadAttachment }: CommentTimelineProps) {
  const styles = useStyles();

  if (loading) {
    return (
      <div className={styles.emptyState}>
        <Spinner label="Loading comments..." labelPosition="below" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.emptyState} role="alert">
        <Text>Error: {error}</Text>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Text>No comments yet. Start the discussion below.</Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {comments.map((comment, index) => (
        <TimelineItem
          key={comment.id}
          comment={comment}
          isLast={index === comments.length - 1}
          onDownloadAttachment={onDownloadAttachment}
        />
      ))}
    </div>
  );
}
