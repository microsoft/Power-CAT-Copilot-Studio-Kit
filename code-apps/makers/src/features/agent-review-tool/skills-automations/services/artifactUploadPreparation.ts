import type { UploadedArtifact } from '../contracts/ArtifactReview';
import { detectArtifactKind } from './artifactDetector';
import { readUploadedArtifact } from './artifactReader';

export type ArtifactUploadPreparation =
  | { ok: true; artifact: UploadedArtifact }
  | { ok: false; error: string };

/**
 * Read and identify an upload before the review form closes.
 *
 * This keeps file-format errors attached to the input that caused them and
 * prevents an unsupported upload from being rendered as an empty review.
 */
export async function prepareArtifactUpload(file: File): Promise<ArtifactUploadPreparation> {
  try {
    const artifact = await readUploadedArtifact(file);
    const detection = detectArtifactKind(artifact);
    if (!detection.kind) {
      return {
        ok: false,
        error: detection.reason ?? 'The file is not a supported skill or Scout automation.',
      };
    }
    return { ok: true, artifact };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error && caught.message
        ? caught.message
        : 'The file could not be read.',
    };
  }
}
