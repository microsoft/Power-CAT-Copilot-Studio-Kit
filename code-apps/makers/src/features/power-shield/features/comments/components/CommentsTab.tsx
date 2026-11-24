import { useComments } from '../hooks/useComments';
import { CommentTimeline } from './CommentTimeline';
import { CommentCompose } from './CommentCompose';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useLayoutStyles } from '../../../shared/styles';
import type { RequestType } from '../../../models/policyRequest';

interface CommentsTabProps {
  requestId: string;
  requestCreatedByAadObjectId: string;
  /** Which experience owns the request. Defaults to Connector. */
  requestType?: RequestType;
  /** Callback to report comment count to parent (for tab label). */
  onCommentCountChange?: (count: number) => void;
}

export function CommentsTab({ requestId, requestCreatedByAadObjectId, requestType = 'Connector', onCommentCountChange }: CommentsTabProps) {
  const layoutStyles = useLayoutStyles();
  const { aadObjectId } = useAuth();
  const { comments, loading, error, posting, postComment, handleDownloadAttachment } = useComments(requestId, requestType);

  // Report count to parent for tab label
  if (onCommentCountChange && !loading) {
    onCommentCountChange(comments.length);
  }

  const canPost = aadObjectId === requestCreatedByAadObjectId;

  return (
    <div className={layoutStyles.contentStack}>
      <CommentTimeline
        comments={comments}
        loading={loading}
        error={error}
        onDownloadAttachment={handleDownloadAttachment}
      />

      {canPost && (
        <CommentCompose
          posting={posting}
          onPost={postComment}
        />
      )}
    </div>
  );
}
