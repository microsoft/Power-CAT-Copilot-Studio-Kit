/**
 * Canonical skill bundle assembly (spec 013 §10).
 *
 * Converts a type-9 parent BotComponent and its pre-normalized type-14 child
 * resources into a typed {@link SkillBundle}.  All path comparisons are
 * case-insensitive.  No raw source is persisted or logged.
 */
import { load } from "js-yaml";
import type { ReviewHashPort } from "../../api/ports.js";
import type { BotComponent } from "../../contracts/BotComponent.js";
import type {
  RetrievalIssue,
  SkillBundle,
  SkillBundleManifestEntry,
  SkillBundleResource,
} from "../../contracts/SkillBundle.js";

// Fix 5: capture all non-'>' chars so values with embedded whitespace are
// accepted; the captured value is always .trim()med before use.
const BUNDLE_MARKER_RE = /<!--\s*bic:bundle=([^>]+)\s*-->/;

/** 16 MiB maximum total retained decoded text across the assembled bundle. */
const BUNDLE_MAX_TEXT_BYTES = 16 * 1024 * 1024;

/** Context supplied by the caller describing the owning agent. */
export interface AssemblyContext {
  agentInstructions: string;
  siblingDescriptions: Array<{ name: string; description?: string }>;
}

/**
 * Assemble a canonical {@link SkillBundle} from a type-9 parent BotComponent
 * and its pre-normalized type-14 child resources.
 *
 * **ZIP bundle** (parent `content` contains a `bic:bundle` marker):
 * - Requires exactly one child whose `normalizedPath` is "SKILL.md"
 *   (case-insensitive comparison).
 * - The canonical SKILL.md is removed from `resources` but retained in
 *   `manifest`.
 * - Missing or duplicate SKILL.md emits retrieval errors.
 *
 * **Inline Markdown** (no bundle marker):
 * - Parses the parent `content` field directly as the skill Markdown.
 *
 * @param parent   - Type-9 BotComponent owning the bundle.
 * @param resources - Pre-normalized type-14 child resources.
 * @param context  - Agent-level context for the assembled bundle.
 */
export async function assembleSkillBundle(
  parent: BotComponent,
  resources: SkillBundleResource[],
  context: AssemblyContext,
  hash: ReviewHashPort,
): Promise<SkillBundle> {
  const parsed = load(parent.data || parent.content) as Record<string, unknown>;
  const contentStr = String(parsed?.["content"] ?? "");
  const bundleMarkerMatch = BUNDLE_MARKER_RE.exec(contentStr);
  const bundleMarker = bundleMarkerMatch?.[1]?.trim();
  const isZipBundle = !!bundleMarker;

  const skillFiles = resources.filter(
    (item) => item.normalizedPath.toLowerCase() === "skill.md",
  );

  let skillMarkdown = "";
  const retrievalIssues: RetrievalIssue[] = [];

  if (isZipBundle) {
    if (skillFiles.length === 0) {
      retrievalIssues.push({
        code: "missing-skill-md",
        message: `ZIP bundle "${parent.schemaname}" has no SKILL.md child resource`,
        severity: "error",
      });
    } else if (skillFiles.length > 1) {
      retrievalIssues.push({
        code: "duplicate-skill-md",
        message: `ZIP bundle "${parent.schemaname}" has ${skillFiles.length} SKILL.md children — expected exactly one`,
        severity: "error",
      });
    } else {
      skillMarkdown = skillFiles[0]?.textContent ?? "";
    }
  } else {
    skillMarkdown = contentStr;
  }

  const skillMarkdownHash = await hash.sha256(
    new TextEncoder().encode(skillMarkdown),
  );

  const supportingResources = isZipBundle
    ? resources.filter((item) => item.normalizedPath.toLowerCase() !== "skill.md")
    : resources;

  const manifest: SkillBundleManifestEntry[] = resources.map((item) => ({
    path: item.normalizedPath,
    kind: item.kind,
    language: item.language,
    sizeBytes: item.sizeBytes,
    sha256: item.sha256,
    isBinary: item.isBinary,
    referencedBy: item.referencedBy,
    analysisStatus: item.analysisStatus,
  }));

  // Bundle hash covers the skill Markdown hash + all resource hashes.
  const allHashes = [skillMarkdownHash, ...resources.map((r) => r.sha256)].join("|");
  const bundleHash = await hash.sha256(new TextEncoder().encode(allHashes));

  // Enforce 16 MiB total retained decoded-text budget across the bundle.
  // Canonical SKILL.md byte count is included; resources are processed in
  // their original deterministic order.
  const skillMdBytes = new TextEncoder().encode(skillMarkdown).length;
  let budgetRemaining = BUNDLE_MAX_TEXT_BYTES - skillMdBytes;

  const cappedResources = supportingResources.map((r) => {
    if (r.textContent === undefined) return r;
    const contentBytes = new TextEncoder().encode(r.textContent).length;
    if (budgetRemaining <= 0 || contentBytes > budgetRemaining) {
      return {
        ...r,
        textContent: undefined,
        decodeStatus: "failed" as const,
        issues: [
          ...r.issues,
          {
            code: "bundle-text-budget-exceeded",
            message: `Resource "${r.normalizedPath}" text released: 16 MiB bundle text budget exhausted`,
            resourcePath: r.normalizedPath,
            severity: "warning",
          } satisfies RetrievalIssue,
        ],
      };
    }
    budgetRemaining -= contentBytes;
    return r;
  });

  return {
    skillComponentId: parent.botcomponentid,
    skillComponentUniqueId: parent.componentidunique,
    skillSchemaName: parent.schemaname,
    skillName: parent.name,
    source: isZipBundle ? "zip-bundle" : "inline-markdown",
    bundleMarker,
    skillMarkdown,
    skillMarkdownHash,
    agentInstructions: context.agentInstructions,
    siblingDescriptions: context.siblingDescriptions,
    manifest,
    resources: cappedResources,
    retrievalIssues,
    bundleHash,
  };
}
