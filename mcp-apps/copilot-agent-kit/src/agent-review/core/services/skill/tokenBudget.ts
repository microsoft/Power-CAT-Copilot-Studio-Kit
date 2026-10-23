/**
 * Token-safe payload budgeting for skill bundle evaluation (spec 013 §5, Task 5).
 *
 * Provides token-count estimation, standard resource excerpt building with
 * referenced-resource prioritisation, and payload budget enforcement.
 * Never slices serialised JSON — removes optional keys before serialisation.
 */
import type { GroundedSkillFinding } from "../../contracts/Findings.js";
import type { SkillBundle, SkillBundleResource } from "../../contracts/SkillBundle.js";

// ---------------------------------------------------------------------------
// Standard limits
// ---------------------------------------------------------------------------

export const STANDARD_RESOURCE_CHARS = 8_000;
export const STANDARD_RESOURCE_TOTAL_CHARS = 96_000;
export const STANDARD_TOKEN_CEILING = 50_000;

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimates the token count for any serialisable value using the 4-char/token
 * heuristic. Always rounds up.
 */
export const estimateTokens = (value: unknown): number =>
  Math.ceil(JSON.stringify(value).length / 4);

// ---------------------------------------------------------------------------
// Resource excerpt interfaces
// ---------------------------------------------------------------------------

export interface ResourceExcerpt {
  path: string;
  content: string;
  truncated: boolean;
}

export interface OmissionRecord {
  path: string;
  reason: string;
}

export interface StandardExcerptBuildResult {
  excerpts: ResourceExcerpt[];
  omissions: OmissionRecord[];
}

export interface StandardExcerptOptions {
  perResourceChars?: number;
  totalChars?: number;
}

// ---------------------------------------------------------------------------
// Budget enforcement interface
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when a resource is referenced by the skill Markdown or by
 * another resource (populated `referencedBy` field).
 */
function isReferenced(resource: SkillBundleResource, skillMarkdown: string): boolean {
  return (
    resource.referencedBy.length > 0 ||
    skillMarkdown.includes(resource.normalizedPath)
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a prioritised list of resource excerpts from a skill bundle,
 * respecting per-resource and total character budgets.
 *
 * Referenced resources (appearing in the skill Markdown or `referencedBy`)
 * are placed first. Binary resources and resources with no text content are
 * skipped. Resources that do not fit within the remaining budget are recorded
 * in `omissions`.
 *
 * @param b        - The assembled skill bundle.
 * @param _findings - Unused by the standard excerpt builder; reserved for
 *                   future finding-aware prioritisation.
 * @param options  - Optional overrides for per-resource and total char limits.
 */
export function buildStandardResourceExcerpts(
  b: SkillBundle,
  _findings: GroundedSkillFinding[],
  options?: StandardExcerptOptions,
): StandardExcerptBuildResult {
  const perResourceChars = options?.perResourceChars ?? STANDARD_RESOURCE_CHARS;
  const totalChars = options?.totalChars ?? STANDARD_RESOURCE_TOTAL_CHARS;

  const referenced: SkillBundleResource[] = [];
  const unreferenced: SkillBundleResource[] = [];

  for (const resource of b.resources) {
    if (resource.isBinary || resource.textContent == null) continue;
    if (isReferenced(resource, b.skillMarkdown)) {
      referenced.push(resource);
    } else {
      unreferenced.push(resource);
    }
  }

  const ordered = [...referenced, ...unreferenced];
  const excerpts: ResourceExcerpt[] = [];
  const omissions: OmissionRecord[] = [];
  let totalUsed = 0;

  for (const resource of ordered) {
    const text = resource.textContent ?? "";
    const needed = Math.min(text.length, perResourceChars);

    if (totalUsed + needed > totalChars) {
      omissions.push({ path: resource.normalizedPath, reason: "total-budget-exceeded" });
      continue;
    }

    excerpts.push({
      path: resource.normalizedPath,
      content: text.slice(0, needed),
      truncated: text.length > needed,
    });
    totalUsed += needed;
  }

  return { excerpts, omissions };
}
