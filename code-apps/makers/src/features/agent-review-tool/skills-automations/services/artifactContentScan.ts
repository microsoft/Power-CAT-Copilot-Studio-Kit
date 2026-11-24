/**
 * Deterministic content scan over an uploaded artifact.
 *
 * The packaging, shape and runtime rules judge an artifact's *structure*. None
 * of them reads what the text actually says, so until this module existed the
 * only thing that ever caught an injection phrase or a shell-execution
 * directive in an uploaded file was the AI stage.
 *
 * That was wrong for two reasons. A model is not repeatable -- the same file
 * could be flagged on one run and cleared on the next -- and the AI stage does
 * not run at all when the backend is unavailable, which silently turned a
 * safety review into a packaging review. These rules are defined by a published
 * regex set, so they can and should be decided mechanically.
 *
 * The scanners live in the agent-review side and already dispatch by language.
 * This module's only job is to present an uploaded file to them in the shape
 * they expect, including the main skill document, which reaches the bundle as
 * `skillMarkdown` rather than as a resource and was therefore never scanned.
 */
import type { SkillBundleResource } from '../../agents-experience/contracts/SkillBundle';
import { scanSkillResource } from '../../agents-experience/services/skill/resourceScanners';
import type { ArtifactFinding, UploadedArtifact, UploadedFile } from '../contracts/ArtifactReview';

const SPECIFIC_INLINE_SCRIPT_RULES = new Set([
  'HTML-HANDLER-01',
  'HTML-JSCHEM-01',
  'HTML-EGRESS-01',
  'HTML-STORE-01',
  'HTML-SINK-01',
]);

/** Map a file extension onto the language the scanners dispatch on. */
function languageOf(path: string): SkillBundleResource['language'] {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  if (ext === '.py') return 'python';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  // Everything else with readable text is scanned with the prose patterns. An
  // injection phrase is just as dangerous in a .txt reference or a .json
  // automation body as it is in SKILL.md, and the prose patterns are the ones
  // written to find it.
  return 'text';
}

/**
 * Present an uploaded file to the resource scanners.
 *
 * Only the fields `scanSkillResource` reads are set. The identity fields it
 * ignores are filled with the path, so nothing carries an invented Dataverse
 * id, and the cast is narrowed to that omission.
 */
function toScannableResource(file: UploadedFile): SkillBundleResource {
  return {
    id: file.path,
    componentIdUnique: file.path,
    originalPath: file.path,
    normalizedPath: file.path,
    extension: file.path.slice(file.path.lastIndexOf('.')).toLowerCase(),
    kind: 'reference',
    language: languageOf(file.path),
    sizeBytes: file.text?.length ?? 0,
    sha256: '',
    isBinary: false,
    decodeStatus: 'decoded',
    textContent: file.text,
    referencedBy: [],
    chunks: [],
    issues: [],
  } as unknown as SkillBundleResource;
}

/**
 * Scan every decoded file in an upload for content the scanners define.
 *
 * @param artifact - The upload, already read into files.
 * @returns Deterministic findings, one per rule per file at most.
 */
export function scanArtifactContent(artifact: UploadedArtifact): ArtifactFinding[] {
  const findings: ArtifactFinding[] = [];

  for (const file of artifact.files) {
    if (file.isBinary || !file.text) continue;

    const scanned = scanSkillResource(toScannableResource(file));
    const hasSpecificInlineScriptFinding = scanned.some((finding) =>
      SPECIFIC_INLINE_SCRIPT_RULES.has(finding.ruleId),
    );

    for (const finding of scanned) {
      if (finding.ruleId === 'HTML-SCRIPT-01' && hasSpecificInlineScriptFinding) continue;
      findings.push({
        ...finding,
        // These rules are about what the text says, which no runtime changes.
        // An empty list means the finding applies to every selected runtime.
        runtimes: [],
        source: 'deterministic',
        resourcePath: file.path,
      });
    }
  }

  return findings;
}
