import { useState, useCallback, useEffect } from 'react';
import type { RequestComment } from '../../../models/comment';
import type { RequestType } from '../../../models/policyRequest';
import {
  getCommentsForRequest,
  createCommentWithAttachments,
  downloadAttachment as downloadAttachmentService,
} from '../../../shared/services/dataverse/commentService';
import { downloadBase64File } from '../../../shared/utils/fileUtils';
import { useAuth } from '../../../shared/hooks/useAuth';
import type { CreateCommentParams } from '../../../shared/services/dataverse/commentService';

export interface UseCommentsResult {
  comments: RequestComment[];
  loading: boolean;
  error: string | null;
  posting: boolean;
  postComment: (body: string, files: File[]) => Promise<void>;
  handleDownloadAttachment: (annotationId: string) => Promise<void>;
  refetch: () => void;
}

/**
 * Loads and posts comments for a request. `requestType` gates every read/write
 * to the matching experience (default 'Connector'); the credit detail passes
 * 'Credits' so a wrong-type comment list can never be read (FR-035).
 */
export function useComments(
  requestId: string,
  requestType: RequestType = 'Connector',
): UseCommentsResult {
  const [comments, setComments] = useState<RequestComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const { dvUserId, aadObjectId, displayName, upn, role } = useAuth();

  const fetchComments = useCallback(async () => {
    try {
      setError(null);
      const data = await getCommentsForRequest(requestId, requestType);
      setComments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments.');
    } finally {
      setLoading(false);
    }
  }, [requestId, requestType]);

  // Fetch on mount
  useEffect(() => { fetchComments(); }, [fetchComments]);

  const postComment = useCallback(async (body: string, files: File[]) => {
    setPosting(true);
    try {
      const params: CreateCommentParams = {
        requestId,
        body,
        dvUserId,
        aadObjectId,
        displayName,
        upn,
        isAdmin: role === 'admin',
      };
      await createCommentWithAttachments(params, files, requestType);
      await fetchComments();
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to post comment.');
    } finally {
      setPosting(false);
    }
  }, [requestId, requestType, dvUserId, aadObjectId, displayName, upn, role, fetchComments]);

  const handleDownloadAttachment = useCallback(async (annotationId: string) => {
    const { fileName, mimeType, base64 } = await downloadAttachmentService(annotationId);
    downloadBase64File(base64, fileName, mimeType);
  }, []);

  return {
    comments,
    loading,
    error,
    posting,
    postComment,
    handleDownloadAttachment,
    refetch: fetchComments,
  };
}
