/**
 * Logical chunking for skill bundle resources (spec 013 §5, Task 5).
 *
 * Splits resource text content into {@link ResourceChunk} objects using
 * language-specific boundary patterns when available, falling back to
 * line-window splitting with 20-line overlap. Every chunk records its
 * line range and a SHA-256 content hash.
 */
import type { ResourceChunk, SkillBundleResource } from "../../contracts/SkillBundle.js";

const PYTHON_BOUNDARY = /^(?:async\s+def|def|class)\s+\w+/m;
const MARKDOWN_BOUNDARY = /^#{1,6}\s+\S/m;
const HTML_BOUNDARY = /<(?:script|style|section|article|template)\b/i;

/** Lines of overlap used by the fallback line-window splitter. */
const FALLBACK_OVERLAP_LINES = 20;

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getBoundaryPattern(resource: SkillBundleResource): RegExp | null {
  switch (resource.language) {
    case "python": return PYTHON_BOUNDARY;
    case "markdown": return MARKDOWN_BOUNDARY;
    case "html": return HTML_BOUNDARY;
    default: return null;
  }
}

interface RawChunk {
  startLine: number;
  endLine: number;
  content: string;
  overlapBeforeLines: number;
  overlapAfterLines: number;
}

/**
 * Splits lines into chunks at detected boundary positions, respecting
 * targetChars per chunk. Falls back to a simple size split when no boundary
 * lands before the budget is exhausted mid-segment.
 *
 * When adding a boundary line would reach or exceed `targetChars`, the chunk
 * is flushed *before* the boundary so the boundary always opens the next chunk.
 */
function splitAtBoundaries(lines: string[], boundarySet: Set<number>, targetChars: number): RawChunk[] {
  const result: RawChunk[] = [];
  let startLine = 0;
  let content = "";

  for (let i = 0; i < lines.length; i++) {
    const lineText = i < lines.length - 1 ? lines[i] + "\n" : lines[i]!;

    // At a non-first boundary, flush before it if adding this line would reach or exceed the budget.
    // Using >= ensures the boundary line opens the next chunk even at an exact-target boundary.
    if (boundarySet.has(i) && i > 0 && content.length > 0) {
      if (content.length + lineText.length >= targetChars) {
        result.push({ startLine, endLine: i - 1, content, overlapBeforeLines: 0, overlapAfterLines: 0 });
        startLine = i;
        content = lineText;
        continue;
      }
    }

    content += lineText;

    // Fallback: hard-flush when we've already exceeded targetChars without a boundary
    if (content.length >= targetChars && i < lines.length - 1) {
      result.push({ startLine, endLine: i, content, overlapBeforeLines: 0, overlapAfterLines: 0 });
      startLine = i + 1;
      content = "";
    }
  }

  if (content.length > 0) {
    result.push({ startLine, endLine: lines.length - 1, content, overlapBeforeLines: 0, overlapAfterLines: 0 });
  }

  return result;
}

/**
 * Fallback splitter using fixed-size line windows with up to
 * {@link FALLBACK_OVERLAP_LINES} lines of overlap between adjacent chunks.
 *
 * Overlap metadata reports the *actual* shared line count, which is less than
 * FALLBACK_OVERLAP_LINES when the window is shorter than the overlap constant.
 */
function splitByLineWindows(lines: string[], targetChars: number): RawChunk[] {
  const result: RawChunk[] = [];
  let i = 0;
  let prevEnd = 0;

  while (i < lines.length) {
    let content = "";
    let end = i;

    while (end < lines.length) {
      const lineText = end < lines.length - 1 ? lines[end] + "\n" : lines[end]!;
      if (content.length > 0 && content.length + lineText.length > targetChars) break;
      content += lineText;
      end++;
    }

    if (end === i) {
      // Single oversized line — include it as its own chunk
      content = (lines[i] ?? "") + (i < lines.length - 1 ? "\n" : "");
      end = i + 1;
    }

    // Compute the actual next-chunk start so we can record real overlap counts.
    const nextI = end >= lines.length ? lines.length : Math.max(i + 1, end - FALLBACK_OVERLAP_LINES);
    const overlapBefore = i === 0 ? 0 : prevEnd - i;
    const overlapAfter = end >= lines.length ? 0 : end - nextI;

    result.push({
      startLine: i,
      endLine: end - 1,
      content,
      overlapBeforeLines: overlapBefore,
      overlapAfterLines: overlapAfter,
    });

    prevEnd = end;
    if (end >= lines.length) break;
    i = nextI;
  }

  return result;
}

/**
 * Splits a skill bundle resource into logical chunks of at most `targetChars`
 * characters each.
 *
 * Uses language-specific boundary patterns (Python def/class, Markdown
 * headings, HTML structural tags) where available; falls back to line-window
 * splitting with 20-line overlap for plain text and unrecognised types.
 *
 * @param resource    - The resource to chunk.
 * @param targetChars - Maximum characters per chunk (default 24 000).
 * @returns Ordered array of {@link ResourceChunk} objects, or empty array if
 *          the resource has no decoded text content.
 */
export async function chunkResource(
  resource: SkillBundleResource,
  targetChars = 24_000,
): Promise<ResourceChunk[]> {
  const text = resource.textContent;
  if (!text) return [];

  const lines = text.split("\n");
  const boundaryPattern = getBoundaryPattern(resource);

  let rawChunks: RawChunk[];

  if (boundaryPattern) {
    const boundarySet = new Set<number>();
    lines.forEach((line, idx) => {
      if (boundaryPattern.test(line)) boundarySet.add(idx);
    });
    rawChunks = splitAtBoundaries(lines, boundarySet, targetChars);
  } else {
    rawChunks = splitByLineWindows(lines, targetChars);
  }

  return Promise.all(
    rawChunks.map(async (raw, index) => ({
      chunkId: `${resource.normalizedPath}:chunk:${index}`,
      resourcePath: resource.normalizedPath,
      index,
      startLine: raw.startLine,
      endLine: raw.endLine,
      content: raw.content,
      contentHash: await sha256Hex(raw.content),
      overlapBeforeLines: raw.overlapBeforeLines,
      overlapAfterLines: raw.overlapAfterLines,
    })),
  );
}
