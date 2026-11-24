/**
 * Collects a review whose browser went away while the workflow kept running.
 *
 * A review announces itself to Dataverse before its slow AI stage, then
 * completes the same row afterwards. Until now the completion existed only in
 * the tab that started it: a refresh, a closed window or a crashed page left the
 * workflow running, the AI call charged, and the row stranded — eventually swept
 * to "Not finished" even though the answer had been produced.
 *
 * Nothing about that was necessary. The job is addressable without the tab:
 * `artifactAiStage` submits it under a synthetic bot id derived from the
 * artifact hash, and the reserved row stores that hash. The job reads are plain
 * queries keyed on the job id. And the reserved row already carries every other
 * input the scored result needs — deterministic findings, target runtimes,
 * artifact kind, the file list. So the only thing missing after a reload is the
 * AI half, and that is exactly what the job holds.
 *
 * This module supplies the missing half and hands both to the same assembly
 * function the live pipeline uses, so a resumed review is scored by identical
 * code rather than a second implementation of it.
 */
import type {
  ArtifactAiAssessment,
  ArtifactFinding,
  ArtifactReviewResult,
  UploadedArtifact,
  UploadedFile,
} from '../contracts/ArtifactReview';
import { ReviewJobStatus, type ReviewJobRow } from '../../agents-experience/contracts/ReviewJob';
import { findLatestJobForBot } from '../../agents-experience/services/jobs/ReviewJobService';
import { createArtifactAiStage } from './artifactAiStage';
import { assembleArtifactReview } from './artifactReviewService';
import { SYNTHETIC_ID_PREFIX } from './uploadBundleAdapter';
import { mergeRuntimeTargets, runtimeTargetsFromPackage } from './runtimeTargeting';

/**
 * What a resume attempt concluded.
 *
 * `unresolved` deliberately does not distinguish "no job exists" from "the read
 * failed". Both mean the same thing to the caller: nothing can be decided now,
 * leave the row alone and let the age-out rule handle it if it never resolves.
 */
export type ArtifactResumeOutcome =
  | { kind: 'running'; jobId: string }
  | { kind: 'collected'; result: ArtifactReviewResult }
  | { kind: 'unresolved' };

/**
 * Rebuilds an upload from what the review row retained.
 *
 * Lossy on purpose: `retainFiles` caps total stored text, so a large archive
 * comes back with some files' `text` absent. That is acceptable here because
 * the rebuilt artifact is never re-reviewed — the deterministic pass already
 * ran against the real bytes and its findings are stored. This artifact exists
 * only to name the bundle, so the workflow's per-component results can be
 * matched back to it.
 */
function rebuildArtifact(result: ArtifactReviewResult): UploadedArtifact | null {
  if (!result.files || result.files.length === 0) return null;

  const files: UploadedFile[] = result.files.map((file) => ({
    path: file.path,
    bytes: file.bytes,
    text: file.text,
    isBinary: file.isBinary,
  }));

  return {
    fileName: result.artifactName,
    files,
    compressedBytes: 0,
    uncompressedBytes: result.uncompressedBytes ?? 0,
    rootFolderName: commonRootFolder(files),
    hash: result.artifactHash,
  };
}

/**
 * The archive's single top-level folder, when it has exactly one.
 *
 * Recomputed rather than stored, because the bundle adapter strips this prefix
 * from every resource path. Getting it wrong would rename every resource and
 * break the join back to the workflow's results.
 */
function commonRootFolder(files: readonly UploadedFile[]): string | undefined {
  const roots = new Set<string>();
  for (const file of files) {
    const slash = file.path.indexOf('/');
    // A file at the archive root proves there is no single wrapping folder.
    if (slash <= 0) return undefined;
    roots.add(file.path.slice(0, slash));
    if (roots.size > 1) return undefined;
  }
  return roots.size === 1 ? [...roots][0] : undefined;
}

/** True once the workflow has stopped, whether it succeeded or not. */
function isFinished(status: ReviewJobRow['cat_jobstatus']): boolean {
  return status === ReviewJobStatus.Succeeded || status === ReviewJobStatus.Failed;
}

/**
 * Finds the job a stranded review is waiting on and collects it if it has
 * finished.
 *
 * Never throws. Every failure path returns `unresolved`, because this runs
 * inside the history read that paints the grid: a Dataverse hiccup must cost
 * the reader one deferred row, not the whole list.
 *
 * @param reserved - The stored `in-progress` review.
 * @param now - Clock, injected for tests.
 */
export async function resumeArtifactReview(
  reserved: ArtifactReviewResult,
  now: Date = new Date(),
): Promise<ArtifactResumeOutcome> {
  if (reserved.status !== 'in-progress') return { kind: 'unresolved' };

  const started = Date.parse(reserved.startedAt ?? reserved.reviewedAt);
  // An unparseable timestamp gives no window to search, and guessing one risks
  // collecting a different run of the same artifact onto this row.
  if (Number.isNaN(started)) return { kind: 'unresolved' };

  let job: ReviewJobRow | null;
  try {
    job = await findLatestJobForBot(
      `${SYNTHETIC_ID_PREFIX}${reserved.artifactHash}`,
      new Date(started),
    );
  } catch {
    return { kind: 'unresolved' };
  }

  if (!job?.cat_agentreviewjobid) return { kind: 'unresolved' };
  if (!isFinished(job.cat_jobstatus)) {
    return { kind: 'running', jobId: job.cat_agentreviewjobid };
  }

  if (job.cat_jobstatus === ReviewJobStatus.Failed) {
    return {
      kind: 'collected',
      result: partialFrom(
        reserved,
        now,
        job.cat_errormessage
          ? `The AI review stage did not complete: ${job.cat_errormessage}`
          : 'The AI review stage did not complete.',
      ),
    };
  }

  const artifact = rebuildArtifact(reserved);
  // Without a retained file list there is no bundle to match results against.
  // Older rows predate the field, so this is a real case and not a bug.
  if (!artifact) {
    return {
      kind: 'collected',
      result: partialFrom(
        reserved,
        now,
        'This review finished, but the files it read were not stored, so its AI findings could not be collected.',
      ),
    };
  }

  let aiFindings: ArtifactFinding[];
  let aiAssessment: ArtifactAiAssessment | undefined;
  try {
    const stage = createArtifactAiStage({ existingJobId: job.cat_agentreviewjobid });
    const aiOutput = await stage(artifact, reserved.selectedRuntimes, []);
    if (Array.isArray(aiOutput)) {
      aiFindings = aiOutput;
    } else {
      aiFindings = aiOutput.findings;
      aiAssessment = aiOutput.assessment;
    }
  } catch (error) {
    return {
      kind: 'collected',
      result: partialFrom(
        reserved,
        now,
        error instanceof Error
          ? `The AI review stage did not complete: ${error.message}`
          : 'The AI review stage did not complete.',
      ),
    };
  }

  return {
    kind: 'collected',
    result: assembleArtifactReview({
      artifactKind: reserved.artifactKind,
      artifactName: reserved.artifactName,
      artifactHash: reserved.artifactHash,
      runtimes: reserved.selectedRuntimes,
      declaredRuntimes: mergeRuntimeTargets(
        runtimeTargetsFromPackage(artifact),
        reserved.declaredRuntimes ?? [],
      ),
      files: reserved.files,
      uncompressedBytes: reserved.uncompressedBytes,
      deterministic: reserved.findings,
      aiFindings,
      aiAssessment,
      aiAvailable: true,
      reviewedAt: now.toISOString(),
      now,
    }),
  };
}

/**
 * Closes a row as partial, keeping everything the first pass established.
 *
 * A missing AI judgement is not a bad one, so the deterministic findings are
 * scored on their own and the AI-dependent dimensions are marked unassessed —
 * the same degradation the live pipeline applies when the AI stage throws.
 */
function partialFrom(
  reserved: ArtifactReviewResult,
  now: Date,
  error: string,
): ArtifactReviewResult {
  const artifact = rebuildArtifact(reserved);
  return assembleArtifactReview({
    artifactKind: reserved.artifactKind,
    artifactName: reserved.artifactName,
    artifactHash: reserved.artifactHash,
    runtimes: reserved.selectedRuntimes,
    declaredRuntimes: mergeRuntimeTargets(
      artifact ? runtimeTargetsFromPackage(artifact) : [],
      reserved.declaredRuntimes ?? [],
    ),
    files: reserved.files,
    uncompressedBytes: reserved.uncompressedBytes,
    deterministic: reserved.findings,
    aiFindings: [],
    aiAvailable: false,
    reviewedAt: now.toISOString(),
    error,
    now,
  });
}
