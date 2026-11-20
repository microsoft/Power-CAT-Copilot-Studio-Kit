/**
 * Turns a browser File into an UploadedArtifact.
 *
 * Everything happens in the browser. A skill bundle can carry credentials,
 * internal hostnames and customer names, so the bytes are never sent anywhere
 * before the scanner has had a chance to hold parts of them back.
 */
import JSZip from 'jszip';
import type { UploadedArtifact, UploadedFile } from '../contracts/ArtifactReview';

/** Extensions treated as text. Anything else is recorded but not decoded. */
const TEXT_EXTENSIONS = new Set([
  'md', 'markdown', 'json', 'yaml', 'yml', 'txt', 'js', 'ts', 'tsx', 'jsx',
  'py', 'sh', 'ps1', 'bat', 'html', 'htm', 'css', 'xml', 'csv', 'toml', 'ini', 'cfg', 'env',
]);

/** Entries a zip tool adds that are not part of the bundle. */
const IGNORED_ENTRY = /(^|\/)__MACOSX\//;

function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

function looksBinary(text: string): boolean {
  // A NUL byte in the first stretch is the cheapest reliable signal that a
  // decode produced bytes rather than text.
  return text.slice(0, 4096).includes('\u0000');
}

async function hashOf(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The identity of an upload, without reading or unzipping it.
 *
 * Both read paths hash the raw file bytes, so this returns the same value as
 * `readUploadedArtifact(...).hash`. It exists so a caller can ask "have we
 * reviewed this already?" before paying for a full read and an AI call.
 */
export async function hashUploadedFile(file: File): Promise<string> {
  return hashOf(new Uint8Array(await file.arrayBuffer()));
}

/**
 * If every entry sits under one folder, that folder is the bundle root.
 *
 * Zipping a folder is the normal way authors package a skill, so paths are
 * reported relative to it — otherwise every finding would be prefixed with a
 * directory name that means nothing to the reader.
 */
function detectRootFolder(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  const first = paths[0].split('/')[0];
  if (!first || paths.some((p) => !p.includes('/'))) return undefined;
  return paths.every((p) => p.split('/')[0] === first) ? first : undefined;
}

/** Read a single non-zip file, such as a bare SKILL.md or automation.json. */
async function readPlainFile(file: File): Promise<UploadedArtifact> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = extensionOf(file.name);
  const isText = TEXT_EXTENSIONS.has(extension);
  const text = isText ? new TextDecoder().decode(bytes) : undefined;
  const isBinary = !isText || (text !== undefined && looksBinary(text));

  const uploaded: UploadedFile = {
    // A lone markdown upload is the skill; nothing else is in the artifact to
    // be. Browsers rename repeat downloads to "SKILL (1).md", and authors often
    // save the file under the skill's own name, so matching the literal
    // "SKILL.md" would reject the most common way a single skill arrives. The
    // original name is kept on `fileName` for display.
    path: isText && extension === 'md' ? 'SKILL.md' : file.name,
    bytes: bytes.byteLength,
    text: isBinary ? undefined : text,
    isBinary,
  };

  return {
    fileName: file.name,
    files: [uploaded],
    compressedBytes: bytes.byteLength,
    uncompressedBytes: bytes.byteLength,
    hash: await hashOf(bytes),
  };
}

/**
 * Locate the skill folder when SKILL.md is nested rather than at the root.
 *
 * An M365 agent-skill package is a Teams app package: `manifest.json`, icons
 * and `agentSkills[].folder` pointing at `skills/<id>/SKILL.md`. Zipping it
 * leaves several entries at the top level, so `detectRootFolder` finds no
 * common root and the skill goes undetected.
 *
 * Narrowing to the folder that holds the single SKILL.md fixes that. The app
 * packaging around it is Teams metadata reviewed by the declarative-agent tab,
 * not skill resources — keeping it would raise a PKG-ORPHAN for every icon.
 *
 * Two guards keep this from swallowing a real bundle:
 *  - exactly one SKILL.md, so multi-skill bundles are untouched;
 *  - every file outside that folder is a loose top-level file. A sibling
 *    *folder* means the author grouped resources on purpose, and dropping it
 *    would hide their work.
 */
function detectNestedSkillFolder(paths: string[]): string | undefined {
  if (paths.some((p) => p.toLowerCase() === 'skill.md')) return undefined;

  const skillPaths = paths.filter((p) => p.toLowerCase().endsWith('/skill.md'));
  if (skillPaths.length !== 1) return undefined;

  const folder = skillPaths[0].slice(0, skillPaths[0].lastIndexOf('/'));
  const outside = paths.filter((p) => !p.startsWith(`${folder}/`));

  return outside.every((p) => !p.includes('/')) ? folder : undefined;
}


/**
 * A 30 MB zip can expand to gigabytes. The upload dialog caps the *compressed*
 * size, so the extracted total needs its own ceiling or a zip bomb takes the
 * browser tab down before any rule runs.
 */
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 5000;

/** Read a File into the shape the review pipeline expects. */
export async function readUploadedArtifact(file: File): Promise<UploadedArtifact> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    return readPlainFile(file);
  }

  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !IGNORED_ENTRY.test(entry.name));

  if (entries.length > MAX_ENTRIES) {
    throw new Error(
      `This archive holds ${entries.length} files, more than the ${MAX_ENTRIES} a skill bundle should ever need.`,
    );
  }

  const files: UploadedFile[] = [];
  let extracted = 0;

  for (const entry of entries) {
    const bytes = await entry.async('uint8array');
    extracted += bytes.byteLength;

    if (extracted > MAX_UNCOMPRESSED_BYTES) {
      throw new Error(
        `This archive expands beyond ${Math.round(MAX_UNCOMPRESSED_BYTES / (1024 * 1024))} MB, so it was not read.`,
      );
    }

    const extension = extensionOf(entry.name);
    const isText = TEXT_EXTENSIONS.has(extension);
    let text: string | undefined;
    let isBinary = !isText;

    if (isText) {
      text = new TextDecoder().decode(bytes);
      if (looksBinary(text)) {
        isBinary = true;
        text = undefined;
      }
    }

    files.push({ path: entry.name, bytes: bytes.byteLength, text, isBinary });
  }

  const rootFolderName = detectRootFolder(files.map((f) => f.path));
  const nestedSkillFolder = rootFolderName
    ? undefined
    : detectNestedSkillFolder(files.map((f) => f.path));
  const scoped = nestedSkillFolder
    ? files.filter((f) => f.path.startsWith(`${nestedSkillFolder}/`))
    : files;

  return {
    fileName: file.name,
    files: scoped,
    compressedBytes: file.size,
    uncompressedBytes: scoped.reduce((total, f) => total + f.bytes, 0),
    rootFolderName: rootFolderName ?? nestedSkillFolder,
    hash: await hashOf(new Uint8Array(buffer)),
  };
}
