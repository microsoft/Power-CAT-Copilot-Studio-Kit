/**
 * Artifact-kind detection (spec 018).
 *
 * The user is never asked what they uploaded, because the files already answer
 * the question. Asking would invite a wrong answer, and a wrong answer would
 * run the wrong rule set and produce a confidently incorrect review.
 */
import type {
  ArtifactDetection,
  UploadedArtifact,
} from '../contracts/ArtifactReview';
import { extensionOf, findFile, filesWhere, stripRoot } from './artifactUtils';

/** Files that describe the package rather than being part of it. */
const METADATA_JSON = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'manifest.json']);

/** Keys that together identify a Scout automation definition. */
function looksLikeAutomation(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;
  // `steps` plus either `name` or `schedule` is the smallest shape that cannot
  // be confused with an unrelated JSON file.
  return Array.isArray(obj.steps) && ('name' in obj || 'schedule' in obj);
}

/**
 * Decide what was uploaded.
 *
 * The order is fixed and deliberate:
 *
 * 1. a root `SKILL.md` wins outright, even when an `INSTALL.md` is also
 *    present.
 * 2. an archive built around `INSTALL.md` is rejected because no supported
 *    runtime publishes that package contract.
 * 3. a bare `.json` matching the automation shape is a plain automation.
 * 4. anything else is undetected, and says what was expected.
 */
export function detectArtifactKind(artifact: UploadedArtifact): ArtifactDetection {
  const skillFile = findFile(artifact, 'SKILL.md');
  if (skillFile) {
    return { kind: 'skill', primaryPath: stripRoot(skillFile.path, artifact.rootFolderName) };
  }

  const installFile = findFile(artifact, 'INSTALL.md');
  const jsonFiles = filesWhere(artifact, (relative) => {
    if (extensionOf(relative) !== 'json') return false;
    const base = relative.split('/').pop() ?? '';
    return !METADATA_JSON.has(base.toLowerCase());
  });

  if (installFile) {
    return {
      reason:
        'This archive uses an unsupported package format. Upload a skill archive containing ' +
        'SKILL.md at its root, or upload a Scout automation as a standalone .json file.',
    };
  }

  const automationFile = jsonFiles.find((f) => f.text && looksLikeAutomation(f.text));
  if (automationFile) {
    return {
      kind: 'automation',
      primaryPath: stripRoot(automationFile.path, artifact.rootFolderName),
    };
  }

  return {
    reason:
      'No reviewable artifact was found. Upload a skill folder or zip containing SKILL.md at its root, ' +
      'or a Scout automation .json file.',
  };
}
