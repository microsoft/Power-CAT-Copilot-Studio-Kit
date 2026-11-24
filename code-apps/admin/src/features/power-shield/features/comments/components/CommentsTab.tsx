import { useComments } from '../hooks/useComments';
import { CommentTimeline } from './CommentTimeline';
import { CommentCompose } from './CommentCompose';
import { useLayoutStyles } from '../../../shared/styles';
import type { RequestType } from '../../../models/policyRequest';

interface CommentsTabProps {
  requestId: string;
  /** Callback to report comment count to parent (for tab label). */
  onCommentCountChange?: (count: number) => void;
  /** Experience gate — the credit detail passes 'Credits'. Defaults to 'Connector'. */
  requestType?: RequestType;
}

export function CommentsTab({ requestId, onCommentCountChange, requestType }: CommentsTabProps) {
  const layoutStyles = useLayoutStyles();
  const { comments, loading, error, posting, postComment, handleDownloadAttachment } = useComments(requestId, requestType);

  // Report count to parent for tab label
  if (onCommentCountChange && !loading) {
    onCommentCountChange(comments.length);
  }

  return (
    <div className={layoutStyles.contentStack}>
      <CommentTimeline
        comments={comments}
        loading={loading}
        error={error}
        onDownloadAttachment={handleDownloadAttachment}
      />

      <CommentCompose
        posting={posting}
        onPost={postComment}
      />
    </div>
  );
}
