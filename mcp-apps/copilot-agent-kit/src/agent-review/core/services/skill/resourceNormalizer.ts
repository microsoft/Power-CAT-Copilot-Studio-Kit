/**
 * Resource path normalization and decoding for type-14 skill bundle files.
 * Provides client-side-only path safety checks and SHA-256 hashing.
 * No raw source bytes are persisted or logged after normalization.
 */
import type { ReviewHashPort } from "../../api/ports.js";
import type { RetrievalIssue, SkillBundleResource, SkillResourceRow } from "../../contracts/SkillBundle.js";

/** 4 MiB maximum file size before a resource is marked oversized. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** 2 MiB maximum decoded text retained per resource (UTF-8 bytes). */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

/**
 * Normalize a skill resource path: percent-decode, convert backslashes to
 * forward slashes, strip leading "./" prefix, and reject unsafe inputs.
 *
 * @throws {Error} with message starting "Unsafe skill resource path" for
 *   absolute paths, drive-letter paths, null bytes, or traversal segments.
 */
export function normalizeSkillResourcePath(input: string): string {
  const decoded = decodeURIComponent(input).replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (/^[a-zA-Z]:/.test(decoded) || decoded.startsWith("/") || decoded.includes("\0")) {
    throw new Error(`Unsafe skill resource path: ${input}`);
  }
  const parts = decoded.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) {
    throw new Error(`Unsafe skill resource path: ${input}`);
  }
  return parts.join("/");
}

function classifyExtension(extension: string): {
  kind: SkillBundleResource["kind"];
  language: SkillBundleResource["language"];
} {
  switch (extension) {
    case ".py":   return { kind: "script",    language: "python" };
    case ".html":
    case ".htm":  return { kind: "template",  language: "html" };
    case ".md":   return { kind: "reference", language: "markdown" };
    case ".json": return { kind: "data",      language: "json" };
    case ".yaml":
    case ".yml":  return { kind: "data",      language: "yaml" };
    default:      return { kind: "reference", language: "text" };
  }
}

/**
 * Detect likely binary content: returns true when the decoded sample
 * contains null bytes or when U+FFFD replacement characters exceed 1% of
 * total decoded characters (indicating high-density invalid UTF-8 sequences).
 */
function detectBinary(decoded: string): boolean {
  if (decoded.includes("\0")) return true;
  const replacements = (decoded.match(/\uFFFD/g) ?? []).length;
  return decoded.length > 0 && replacements / decoded.length > 0.01;
}

/**
 * Truncate decoded text to at most MAX_TEXT_BYTES UTF-8 bytes, stepping back
 * over any UTF-8 continuation bytes (0x80–0xBF) so that no multi-byte code
 * point or surrogate pair is split at the boundary.
 */
function truncateToUtf8Limit(decoded: string): string {
  const fullBytes = new TextEncoder().encode(decoded);
  if (fullBytes.length <= MAX_TEXT_BYTES) return decoded;
  let cutPoint = MAX_TEXT_BYTES;
  while (cutPoint > 0 && (fullBytes[cutPoint]! & 0xc0) === 0x80) {
    cutPoint--;
  }
  return new TextDecoder("utf-8").decode(fullBytes.slice(0, cutPoint));
}

/**
 * Select and validate the resource path using the approved fallback order:
 * `name` first, then `filedata_name`.  Every candidate is passed through
 * {@link normalizeSkillResourcePath}.  If the primary fails but the fallback
 * is safe, a retrieval issue is added.  If neither is safe the function
 * throws with "Unsafe skill resource path".
 */
function selectPath(row: SkillResourceRow): {
  normalizedPath: string;
  originalPath: string;
  pathIssues: RetrievalIssue[];
} {
  // Primary: name
  try {
    const normalized = normalizeSkillResourcePath(row.name);
    return { normalizedPath: normalized, originalPath: row.name, pathIssues: [] };
  } catch {
    // Primary is unsafe; try fallback below
  }

  // Fallback: filedata_name — throws if also unsafe
  if (row.filedata_name) {
    const normalized = normalizeSkillResourcePath(row.filedata_name);
    return {
      normalizedPath: normalized,
      originalPath: row.filedata_name,
      pathIssues: [
        {
          code: "path-fallback",
          message: `Primary path "${row.name}" was unsafe; fell back to filedata_name "${normalized}"`,
          resourcePath: normalized,
          severity: "warning",
        },
      ],
    };
  }

  throw new Error(`Unsafe skill resource path: ${row.name}`);
}

/**
 * Normalize a single type-14 skill resource row + downloaded bytes into a
 * typed {@link SkillBundleResource}.
 *
 * - Path is selected from `name` first, then `filedata_name`; both must pass
 *   `normalizeSkillResourcePath`.  A fallback warning issue is added when the
 *   primary path is unsafe.
 * - Files exceeding 4 MiB are marked `analysisStatus: "oversized"` and
 *   `decodeStatus: "failed"`; text content is not retained.
 * - Binary content (null bytes or high UTF-8 replacement density) sets
 *   `isBinary: true` and `decodeStatus: "binary"`.
 * - Decoded text is truncated to 2 MiB (UTF-8 bytes) without splitting code
 *   points or surrogate pairs.
 * - Raw bytes are not retained after this function returns.
 */
export async function normalizeResource(
  row: SkillResourceRow,
  bytes: Uint8Array,
  hash: ReviewHashPort,
): Promise<SkillBundleResource> {
  const { normalizedPath, originalPath, pathIssues } = selectPath(row);

  const dotIndex = normalizedPath.lastIndexOf(".");
  const extension = dotIndex !== -1 ? normalizedPath.slice(dotIndex).toLowerCase() : "";
  const { kind, language } = classifyExtension(extension);

  const sha256 = await hash.sha256(bytes);
  const sizeBytes = bytes.length;

  if (sizeBytes > MAX_FILE_BYTES) {
    return {
      id: row.botcomponentid,
      componentIdUnique: row.componentidunique,
      originalPath,
      normalizedPath,
      extension,
      kind,
      language,
      sizeBytes,
      sha256,
      isBinary: false,
      // Oversized resources are released without decoding; "decoded" would be
      // semantically wrong since no textContent is present.
      decodeStatus: "failed",
      referencedBy: [],
      analysisStatus: "oversized",
      chunks: [],
      issues: [
        ...pathIssues,
        {
          code: "resource-oversized",
          message: `Resource "${normalizedPath}" exceeds 4 MiB limit (${sizeBytes} bytes)`,
          resourcePath: normalizedPath,
          severity: "warning",
        },
      ],
    };
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const decoded = decoder.decode(bytes);
  const isBinary = detectBinary(decoded);

  if (isBinary) {
    return {
      id: row.botcomponentid,
      componentIdUnique: row.componentidunique,
      originalPath,
      normalizedPath,
      extension,
      kind,
      language,
      sizeBytes,
      sha256,
      isBinary: true,
      decodeStatus: "binary",
      referencedBy: [],
      analysisStatus: "downloaded",
      chunks: [],
      issues: [...pathIssues],
    };
  }

  const textContent = truncateToUtf8Limit(decoded);

  return {
    id: row.botcomponentid,
    componentIdUnique: row.componentidunique,
    originalPath,
    normalizedPath,
    extension,
    kind,
    language,
    sizeBytes,
    sha256,
    isBinary: false,
    decodeStatus: "decoded",
    textContent,
    referencedBy: [],
    analysisStatus: "downloaded",
    chunks: [],
    issues: [...pathIssues],
  };
}
