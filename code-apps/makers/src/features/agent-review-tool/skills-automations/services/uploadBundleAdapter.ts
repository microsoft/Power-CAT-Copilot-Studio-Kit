/**
 * Adapter from an uploaded artifact to the existing `SkillBundle` contract.
 *
 * The deep-review engine already knows how to reason about a skill bundle, run
 * the AI stage against it and gate the result on citations. Rather than build a
 * second engine for uploads, an upload is translated into the shape that engine
 * already consumes.
 *
 * The bundle contract was designed for skills read out of Dataverse, so several
 * of its identity fields have no counterpart in an upload. Those are filled with
 * values derived from the artifact's own content hash and prefixed so they are
 * recognisable as synthetic. Inventing a plausible-looking Dataverse GUID would
 * risk an upload result being mistaken for a review of a deployed agent.
 */
import type {
  SkillBundle,
  SkillBundleManifestEntry,
  SkillBundleResource,
} from '../../agents-experience/contracts/SkillBundle';
import type { UploadedArtifact, UploadedFile } from '../contracts/ArtifactReview';
import { extensionOf, findFile, parseFrontmatter, readString, stripRoot } from './artifactUtils';

/** Marks every identifier this adapter fabricates. */
export const SYNTHETIC_ID_PREFIX = 'upload:';

const KIND_BY_EXTENSION: Record<string, SkillBundleResource['kind']> = {
  py: 'script', js: 'script', ts: 'script', sh: 'script', ps1: 'script',
  md: 'reference', txt: 'reference', rst: 'reference',
  html: 'template', htm: 'template', xml: 'template',
  json: 'data', yaml: 'data', yml: 'data', csv: 'data',
  png: 'asset', jpg: 'asset', jpeg: 'asset', gif: 'asset', svg: 'asset', pdf: 'asset',
};

const LANGUAGE_BY_EXTENSION: Record<string, NonNullable<SkillBundleResource['language']>> = {
  py: 'python',
  html: 'html', htm: 'html',
  md: 'markdown',
  txt: 'text',
  json: 'json',
  yaml: 'yaml', yml: 'yaml',
};

/** Files that mention this one, used to populate `referencedBy`. */
function findReferences(files: UploadedFile[], target: UploadedFile): string[] {
  const base = target.path.split('/').pop();
  if (!base) return [];
  return files
    .filter((f) => f.text && f !== target && f.text.includes(base))
    .map((f) => f.path);
}

export interface BundleAdapterOptions {
  artifact: UploadedArtifact;
  /** Paths withheld by the secret scanner; their content is never forwarded. */
  withheldPaths?: readonly string[];
}

/**
 * Translate an uploaded artifact into a `SkillBundle`.
 *
 * Withheld files stay in the manifest but carry no text. The AI stage must be
 * able to see that a file exists and was excluded — silently dropping it would
 * let a skill hide a resource from review by embedding a credential in it.
 */
export function toSkillBundle({ artifact, withheldPaths = [] }: BundleAdapterOptions): SkillBundle {
  const withheld = new Set(withheldPaths);
  const root = artifact.rootFolderName;
  const skillFile = findFile(artifact, 'SKILL.md');
  const skillMarkdown = skillFile?.text ?? '';

  const syntheticId = `${SYNTHETIC_ID_PREFIX}${artifact.hash}`;
  const declaredName = skillMarkdown
    ? readString(parseFrontmatter(skillMarkdown).data, 'name')
    : undefined;

  const resources: SkillBundleResource[] = artifact.files
    .filter((file) => file !== skillFile)
    .map((file, index) => {
      const path = stripRoot(file.path, root);
      const extension = extensionOf(path);
      const isWithheld = withheld.has(path) || withheld.has(file.path);

      return {
        id: `${syntheticId}:${index}`,
        componentIdUnique: `${syntheticId}:${path}`,
        originalPath: file.path,
        normalizedPath: path,
        extension,
        kind: KIND_BY_EXTENSION[extension] ?? 'other',
        language: LANGUAGE_BY_EXTENSION[extension],
        sizeBytes: file.bytes,
        // An upload is reviewed as delivered; per-file digests are not computed
        // because nothing downstream compares them against a stored version.
        sha256: '',
        isBinary: file.isBinary,
        decodeStatus: file.isBinary ? ('binary' as const) : ('decoded' as const),
        // Withheld content is deliberately absent, not empty-stringed, so a
        // consumer cannot mistake "excluded" for "this file has no content".
        textContent: isWithheld || file.isBinary ? undefined : file.text,
        referencedBy: findReferences(artifact.files, file),
        analysisStatus: isWithheld || file.isBinary ? ('skipped' as const) : ('downloaded' as const),
        chunks: [],
        issues: isWithheld
          ? [
              {
                code: 'content-withheld',
                message: 'Content withheld from the AI stage because a credential pattern was detected.',
                resourcePath: path,
                severity: 'warning' as const,
              },
            ]
          : [],
      };
    });

  const manifest: SkillBundleManifestEntry[] = resources.map((r) => ({
    path: r.normalizedPath,
    kind: r.kind,
    language: r.language,
    sizeBytes: r.sizeBytes,
    sha256: r.sha256,
    isBinary: r.isBinary,
    referencedBy: r.referencedBy,
    analysisStatus: r.analysisStatus,
  }));

  return {
    skillComponentId: syntheticId,
    skillComponentUniqueId: syntheticId,
    skillSchemaName: declaredName ?? root ?? 'uploaded-artifact',
    skillName: declaredName ?? artifact.fileName,
    source: artifact.files.length > 1 ? 'zip-bundle' : 'inline-markdown',
    bundleMarker: syntheticId,
    skillMarkdown,
    skillMarkdownHash: artifact.hash,
    // An upload has no parent agent. These stay empty rather than being filled
    // with placeholder prose, so the AI stage cannot treat invented context as
    // evidence about the author's intent.
    parentDescription: undefined,
    agentInstructions: '',
    siblingDescriptions: [],
    manifest,
    resources,
    retrievalIssues: [],
    bundleHash: artifact.hash,
  };
}
