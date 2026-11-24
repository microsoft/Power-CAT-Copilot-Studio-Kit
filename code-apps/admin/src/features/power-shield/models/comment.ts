/** Domain model for a comment on a Policy Request discussion thread. */
export interface RequestComment {
  id: string;                      // cat_powershieldpolicyrequestcommentid
  policyRequestId: string;         // _cat_policyrequest_value
  commentBody: string;             // cat_commentbody
  authorAadObjectId: string;       // cat_authoraadobjectid
  authorDisplayName: string;       // cat_authordisplayname
  authorUpn: string;               // cat_authorupn
  authorRole: 'Admin' | 'Maker';  // cat_authorrole
  attachmentCount: number;         // parseInt(cat_attachmentcount)
  createdOn: string;               // createdon (system ISO datetime)
  attachments: CommentAttachment[];
}

/** Attachment metadata (documentbody is fetched on-demand for download, never in bulk). */
export interface CommentAttachment {
  id: string;            // annotationid
  fileName: string;      // filename
  mimeType: string;      // mimetype
  fileSize: number;      // parseInt(filesize)
}
