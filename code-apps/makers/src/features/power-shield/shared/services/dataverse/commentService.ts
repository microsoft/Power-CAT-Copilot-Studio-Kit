import { Cat_powershieldpolicyrequestcommentsService } from '../../../../../generated/services/Cat_powershieldpolicyrequestcommentsService';
import { AnnotationsService } from '../../../../../generated/services/AnnotationsService';
import { Cat_policyrequestsService } from '../../../../../generated/services/Cat_policyrequestsService';
import type { Cat_powershieldpolicyrequestcomments, Cat_powershieldpolicyrequestcommentsBase } from '../../../../../generated/models/Cat_powershieldpolicyrequestcommentsModel';
import type { Annotations, AnnotationsBase } from '../../../../../generated/models/AnnotationsModel';
import type { RequestComment, CommentAttachment } from '../../../models/comment';
import type { RequestType } from '../../../models/policyRequest';
import { fileToBase64 } from '../../utils/fileUtils';
import { assertRequestType } from './requestType';
import { SUPPORTING_DOC_PREFIX } from './wizardSubmitService';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Max comment IDs per annotation metadata query to avoid OData URL length limits. */
const ANNOTATION_QUERY_CHUNK_SIZE = 20;

/** Fields to select when listing comments (avoids pulling unnecessary data). */
const COMMENT_SELECT: Array<keyof Cat_powershieldpolicyrequestcomments> = [
  'cat_powershieldpolicyrequestcommentid',
  'cat_commentbody',
  'cat_authoraadobjectid',
  'cat_authordisplayname',
  'cat_authorupn',
  'cat_authorrole',
  'cat_attachmentcount',
  'createdon',
  '_cat_policyrequest_value',
];

/**
 * Fields to select when listing annotation metadata (NEVER include documentbody).
 * notetext stores the parent comment ID as a join key (objectid polymorphic binding
 * is not supported for custom entities in the Code App SDK).
 */
const ANNOTATION_META_SELECT: Array<keyof Annotations> = [
  'annotationid',
  'filename',
  'mimetype',
  'filesize',
  'notetext',
];

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

function toComment(
  record: Cat_powershieldpolicyrequestcomments,
  attachments: CommentAttachment[],
): RequestComment {
  return {
    id: record.cat_powershieldpolicyrequestcommentid,
    policyRequestId: record._cat_policyrequest_value ?? '',
    commentBody: record.cat_commentbody ?? '',
    authorAadObjectId: record.cat_authoraadobjectid ?? '',
    authorDisplayName: record.cat_authordisplayname ?? '',
    authorUpn: record.cat_authorupn ?? '',
    authorRole: record.cat_authorrole === 'Admin' ? 'Admin' : 'Maker',
    attachmentCount: parseInt(record.cat_attachmentcount ?? '0', 10) || 0,
    createdOn: record.createdon ?? '',
    attachments,
  };
}

function toAttachment(record: Annotations): CommentAttachment {
  return {
    id: record.annotationid,
    fileName: record.filename ?? '',
    mimeType: record.mimetype ?? '',
    fileSize: parseInt(record.filesize ?? '0', 10) || 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Isolation (SC-002 / FR-017)
//
// Comments and attachments have no discriminator of their own; the request type
// lives on the parent policy request. Every comment/attachment read and write is
// gated on the parent request matching the caller's experience (Connector by
// default, Credits from the credit detail page), so one experience can never
// read or write the other's thread. The assert always runs BEFORE the sensitive
// read/write (e.g. before pulling an attachment's documentbody).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the parent request's discriminator and rejects anything that is not
 * the expected request type (strict: an unknown discriminator throws). Call
 * before any comment/attachment read or write scoped to that request.
 */
async function assertParentRequestType(requestId: string, requestType: RequestType): Promise<void> {
  const result = await Cat_policyrequestsService.get(requestId, {
    select: ['cat_requesttype'] as string[],
  });
  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? 'Failed to load request.');
  }
  assertRequestType(result.data.cat_requesttype, requestType);
}

/**
 * Resolves the policy request an annotation ultimately belongs to, using only
 * its `notetext` join key (never the documentbody):
 *   - supporting-document attachments store `SUPPORTING_DOC:<requestId>`.
 *   - comment attachments store the parent comment ID; that comment is read to
 *     recover its `_cat_policyrequest_value`.
 * Returns the parent request ID, or throws if it cannot be resolved.
 *
 * NOTE (isolation limit, data-model.md §7a): `notetext` is a client-visible join
 * key, not an enforced relationship. This resolver closes the accidental-crossing
 * case (a genuine Credit-owned annotation is rejected before its body is read),
 * but it cannot defend against a forged/re-parented `notetext` or a TOCTOU flip.
 * The absolute guarantee requires Dataverse permissions + server-side validation
 * of the join key, tracked as an out-of-app gate before Credit rows are activated.
 */
async function resolveAnnotationParentRequestId(annotationId: string): Promise<string> {
  const metaResult = await AnnotationsService.get(annotationId, {
    select: ['notetext'] as string[],
  });
  if (!metaResult.success || !metaResult.data) {
    throw new Error(metaResult.error?.message ?? 'Failed to load attachment.');
  }
  const notetext = metaResult.data.notetext ?? '';

  if (notetext.startsWith(SUPPORTING_DOC_PREFIX)) {
    return notetext.slice(SUPPORTING_DOC_PREFIX.length);
  }

  const commentResult = await Cat_powershieldpolicyrequestcommentsService.get(notetext, {
    select: ['_cat_policyrequest_value'] as string[],
  });
  if (!commentResult.success || !commentResult.data?._cat_policyrequest_value) {
    throw new Error(commentResult.error?.message ?? 'Failed to resolve attachment owner.');
  }
  return commentResult.data._cat_policyrequest_value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all comments for a policy request, including attachment metadata.
 * Returns comments in chronological order (oldest first).
 */
export async function getCommentsForRequest(
  requestId: string,
  requestType: RequestType = 'Connector',
): Promise<RequestComment[]> {
  // Isolation (SC-002): reject a parent of the wrong type before reading its thread.
  await assertParentRequestType(requestId, requestType);

  // Step 1: Fetch comments
  const commentsResult = await Cat_powershieldpolicyrequestcommentsService.getAll({
    filter: `_cat_policyrequest_value eq ${requestId}`,
    select: COMMENT_SELECT as string[],
    orderBy: ['createdon asc'],
  });
  if (!commentsResult.success || !commentsResult.data) {
    throw new Error(commentsResult.error?.message ?? 'Failed to load comments.');
  }
  const commentRecords = commentsResult.data;
  if (commentRecords.length === 0) return [];

  // Step 2: Collect comment IDs that have attachments
  const commentIdsWithAttachments = commentRecords
    .filter((c) => (parseInt(c.cat_attachmentcount ?? '0', 10) || 0) > 0)
    .map((c) => c.cat_powershieldpolicyrequestcommentid);

  // Step 3: Batch-fetch annotation metadata (NOT documentbody)
  const attachmentsByCommentId = new Map<string, CommentAttachment[]>();
  if (commentIdsWithAttachments.length > 0) {
    const annotations = await fetchAnnotationMetadata(commentIdsWithAttachments);
    for (const ann of annotations) {
      const parentId = ann.notetext ?? '';
      if (!attachmentsByCommentId.has(parentId)) {
        attachmentsByCommentId.set(parentId, []);
      }
      attachmentsByCommentId.get(parentId)!.push(toAttachment(ann));
    }
  }

  // Step 4: Map to domain model
  return commentRecords.map((c) => {
    const attachments = attachmentsByCommentId.get(c.cat_powershieldpolicyrequestcommentid) ?? [];
    return toComment(c, attachments);
  });
}

/**
 * Fetch annotation metadata in chunks to avoid OData URL length limits.
 * NEVER includes documentbody in select.
 */
async function fetchAnnotationMetadata(commentIds: string[]): Promise<Annotations[]> {
  const allAnnotations: Annotations[] = [];

  for (let i = 0; i < commentIds.length; i += ANNOTATION_QUERY_CHUNK_SIZE) {
    const chunk = commentIds.slice(i, i + ANNOTATION_QUERY_CHUNK_SIZE);
    const filter = chunk.map((id) => `notetext eq '${id}'`).join(' or ');

    const result = await AnnotationsService.getAll({
      filter,
      select: ANNOTATION_META_SELECT as string[],
    });
    if (result.success && result.data) {
      allAnnotations.push(...result.data);
    }
  }

  return allAnnotations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Write operations
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCommentParams {
  requestId: string;
  body: string;
  dvUserId: string;
  aadObjectId: string;
  displayName: string;
  upn: string;
  isAdmin: boolean;
}

/**
 * Create a comment record in Dataverse.
 * Returns the new comment ID.
 */
async function createComment(params: CreateCommentParams, fileCount: number): Promise<string> {
  const result = await Cat_powershieldpolicyrequestcommentsService.create({
    cat_policyrequestcommentname: `Comment-${Date.now()}`,
    'cat_PolicyRequest@odata.bind': `/cat_policyrequests(${params.requestId})`,
    'cat_Author@odata.bind': `/systemusers(${params.dvUserId})`,
    cat_commentbody: params.body,
    cat_authoraadobjectid: params.aadObjectId,
    cat_authordisplayname: params.displayName,
    cat_authorupn: params.upn,
    cat_authorrole: params.isAdmin ? 'Admin' : 'Maker',
    cat_attachmentcount: String(fileCount),
    statecode: 0,
  } as Omit<Cat_powershieldpolicyrequestcommentsBase, 'cat_powershieldpolicyrequestcommentid'>);

  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? 'Failed to create comment.');
  }

  return result.data.cat_powershieldpolicyrequestcommentid;
}

/**
 * Upload a single file as an annotation linked to a comment.
 *
 * SDK limitation: The Code App SDK's generated annotation metadata does not
 * expose objectid navigation properties for custom entities — both create and
 * update reject ObjectId@odata.bind. Annotations are linked to comments via
 * the notetext field (stores the comment ID as a join key).
 */
async function uploadAttachment(commentId: string, file: File): Promise<void> {
  const base64 = await fileToBase64(file);

  const result = await AnnotationsService.create({
    subject: file.name,
    notetext: commentId,
    filename: file.name,
    mimetype: file.type,
    documentbody: base64,
    isdocument: true as unknown as AnnotationsBase['isdocument'],
  } as Omit<AnnotationsBase, 'annotationid'>);

  if (!result.success) {
    throw new Error(result.error?.message ?? `Failed to upload "${file.name}".`);
  }
}

/**
 * Create a comment with optional file attachments.
 * If annotation uploads fail, the comment still exists (partial success is acceptable).
 */
export async function createCommentWithAttachments(
  params: CreateCommentParams,
  files: File[],
  requestType: RequestType = 'Connector',
): Promise<void> {
  // Isolation (SC-002): reject a parent of the wrong type before writing to its thread.
  await assertParentRequestType(params.requestId, requestType);

  const commentId = await createComment(params, files.length);

  if (files.length > 0) {
    await Promise.all(files.map((f) => uploadAttachment(commentId, f)));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Download a single attachment by annotation ID.
 * Fetches documentbody on-demand and triggers browser download.
 *
 * @param annotationId - The attachment's annotation ID.
 * @param requestType - The experience the caller belongs to (defaults to Connector).
 * @param expectedRequestId - When given, the attachment must belong to this exact
 *   request, so an attachment ID from another request of the same type is rejected.
 */
export async function downloadAttachment(
  annotationId: string,
  requestType: RequestType = 'Connector',
  expectedRequestId?: string,
): Promise<{
  fileName: string;
  mimeType: string;
  base64: string;
}> {
  // Isolation (SC-002): resolve the attachment's parent request and assert its
  // type (and, when known, its identity) BEFORE fetching the sensitive documentbody.
  const parentRequestId = await resolveAnnotationParentRequestId(annotationId);
  if (expectedRequestId && parentRequestId.toLowerCase() !== expectedRequestId.toLowerCase()) {
    throw new Error('Attachment does not belong to this request.');
  }
  await assertParentRequestType(parentRequestId, requestType);

  const result = await AnnotationsService.get(annotationId, {
    select: ['filename', 'mimetype', 'documentbody'] as string[],
  });

  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? 'Failed to download attachment.');
  }

  const record = result.data;
  return {
    fileName: record.filename ?? 'download',
    mimeType: record.mimetype ?? 'application/octet-stream',
    base64: record.documentbody ?? '',
  };
}
