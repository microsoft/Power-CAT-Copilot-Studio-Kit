/**
 * Shared helpers for reading an uploaded artifact (spec 018).
 *
 * Every deterministic rule reads the artifact through these functions, so path
 * matching, frontmatter parsing and line counting behave identically across the
 * whole rule set. Rules that each rolled their own path comparison would
 * disagree about what "the root SKILL.md" means, and the resulting findings
 * would contradict each other.
 */
import { load as parseYaml } from 'js-yaml';
import type { UploadedArtifact, UploadedFile } from '../contracts/ArtifactReview';

/** Normalise a path for comparison: forward slashes, no leading "./". */
export function normalisePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Strip the single top-level folder, when the archive has exactly one.
 *
 * Archives produced by "download as zip" wrap everything in a folder named
 * after the repository or skill. Without this, every path check for a root file
 * fails and the artifact is reported as malformed when it is perfectly fine.
 */
export function stripRoot(path: string, rootFolderName?: string): string {
  const normalised = normalisePath(path);
  if (!rootFolderName) return normalised;
  const prefix = `${rootFolderName}/`;
  return normalised.startsWith(prefix) ? normalised.slice(prefix.length) : normalised;
}

/** Find a file whose path, once the root folder is stripped, equals `target`. */
export function findFile(
  artifact: UploadedArtifact,
  target: string,
): UploadedFile | undefined {
  const wanted = target.toLowerCase();
  return artifact.files.find(
    (f) => stripRoot(f.path, artifact.rootFolderName).toLowerCase() === wanted,
  );
}

/** All files matching a predicate on the root-relative path. */
export function filesWhere(
  artifact: UploadedArtifact,
  predicate: (relativePath: string, file: UploadedFile) => boolean,
): UploadedFile[] {
  return artifact.files.filter((f) =>
    predicate(stripRoot(f.path, artifact.rootFolderName), f),
  );
}

/** The file extension in lower case, without the dot. Empty when there is none. */
export function extensionOf(path: string): string {
  const base = normalisePath(path).split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export interface ParsedFrontmatter {
  /** Parsed YAML mapping. Empty when there is no frontmatter or it failed. */
  data: Record<string, unknown>;
  /** True when a delimited frontmatter block was present at all. */
  present: boolean;
  /** Set when a block was present but could not be parsed. */
  parseError?: string;
  /** Markdown after the frontmatter block. */
  body: string;
  /** Number of lines the frontmatter block occupies, for line-number offsets. */
  frontmatterLines: number;
}

const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Split a markdown file into YAML frontmatter and body.
 *
 * A failed parse is reported rather than thrown. An author with a tab-indented
 * YAML block still deserves every other finding in the review, so a broken
 * frontmatter degrades this one rule instead of the whole run.
 */
export function parseFrontmatter(markdown: string): ParsedFrontmatter {
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match) {
    return { data: {}, present: false, body: markdown, frontmatterLines: 0 };
  }

  const raw = match[1];
  const body = markdown.slice(match[0].length);
  const frontmatterLines = match[0].split(/\r?\n/).length - 1;

  try {
    const parsed = parseYaml(raw);
    const data =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    return { data, present: true, body, frontmatterLines };
  } catch (error) {
    return {
      data: {},
      present: true,
      parseError: error instanceof Error ? error.message : 'Unparseable YAML.',
      body,
      frontmatterLines,
    };
  }
}

/** Read a frontmatter value as a trimmed string, or undefined. */
export function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Read a frontmatter value as an array of strings. Accepts a single string too. */
export function readStringArray(data: Record<string, unknown>, key: string): string[] {
  const value = data[key];
  if (typeof value === 'string') return [value.trim()].filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
}

/** 1-based line number of the first occurrence of `needle`, or undefined. */
export function lineOf(text: string, needle: string): number | undefined {
  const index = text.indexOf(needle);
  if (index < 0) return undefined;
  return text.slice(0, index).split(/\r?\n/).length;
}

/** Find a top-level YAML key in a Markdown frontmatter block. */
export function frontmatterKeyLine(markdown: string, key: string): number | undefined {
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match) return undefined;

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyPattern = new RegExp(`^${escapedKey}\\s*:`);
  const index = match[1].split(/\r?\n/).findIndex((line) => keyPattern.test(line));
  return index < 0 ? undefined : index + 2;
}

/** Count non-empty lines, used by the body-length shape rule. */
export function countContentLines(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

/**
 * Truncate evidence to a safe display length.
 *
 * Findings are rendered in a monospace block and persisted, so an unbounded
 * excerpt can both break the layout and bloat the stored review.
 */
export function truncateEvidence(text: string, max = 240): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length <= max ? single : `${single.slice(0, max - 1)}…`;
}
