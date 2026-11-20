/**
 * What is kept of the uploaded files once the review is finished.
 *
 * The file explorer answers one question — "did it really read all of this?" —
 * and it can only answer it if the review carries the file list with it. The
 * list is also written to Dataverse, so a colleague opening the review next week
 * sees the same evidence as the person who ran it.
 *
 * That is why there is a budget. The whole review is stored as a single JSON
 * value in one Dataverse column, so an unbounded bundle would eventually exceed
 * what the column holds and lose the review entirely. Two rules keep it bounded:
 *
 * 1. **Every file is always listed.** Paths and sizes are small and they are the
 *    actual evidence. Nothing is filtered out of the tree, ever.
 * 2. **Text is dropped, never truncated.** A file cut off at 64 KB still looks
 *    like a whole file, and a reader checking line 900 of it would be reading a
 *    line that is not there. An absent file that says why is honest; a shortened
 *    one that says nothing is not.
 */

import type { ReviewedFile, UploadedArtifact, UploadedFile } from '../contracts/ArtifactReview';

/**
 * Largest single file whose text is stored, in characters.
 *
 * Comfortably above a long SKILL.md and well below anything that would dominate
 * the budget on its own.
 */
export const PER_FILE_TEXT_LIMIT = 64 * 1024;

/**
 * Total stored text across the bundle, in characters.
 *
 * Dataverse multi-line text holds about 1,048,576 characters. JSON escaping
 * inflates source text, and the findings, dimensions and verdicts need room
 * beside it, so the text budget is set at a quarter of the column.
 */
export const TOTAL_TEXT_BUDGET = 256 * 1024;

function retainOne(file: UploadedFile, remaining: number): ReviewedFile {
  const base = { path: file.path, bytes: file.bytes, isBinary: file.isBinary };

  if (file.isBinary) return { ...base, omitted: 'binary' };
  if (typeof file.text !== 'string') return { ...base, omitted: 'undecodable' };
  if (file.text.length > PER_FILE_TEXT_LIMIT) return { ...base, omitted: 'too-large' };
  if (file.text.length > remaining) return { ...base, omitted: 'budget' };

  return { ...base, text: file.text };
}

/**
 * Every uploaded file, with text where it fits the budget.
 *
 * Files are processed in the order the archive presented them, so the same
 * bundle always retains the same files — a budget that depended on iteration
 * order would make two reviews of identical bytes disagree.
 */
export function retainFiles(artifact: UploadedArtifact): ReviewedFile[] {
  let remaining = TOTAL_TEXT_BUDGET;

  return artifact.files.map((file) => {
    const retained = retainOne(file, remaining);
    if (typeof retained.text === 'string') remaining -= retained.text.length;
    return retained;
  });
}
