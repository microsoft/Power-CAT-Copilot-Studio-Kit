import type { GroundedSkillFinding, SkillFindingSeverity } from "../../contracts/Findings.js";
import type { SkillBundle, SkillBundleResource } from "../../contracts/SkillBundle.js";
import type { ReferenceId } from "../../contracts/references.js";
import { normalizeSkillResourcePath } from "./resourceNormalizer.js";

export const PATH_REFERENCE =
  /(?:^|[\s`"'(])((?:\.\/)?(?:(?:scripts|references|templates|assets|data)\/[A-Za-z0-9._/-]+|[A-Za-z0-9][A-Za-z0-9._-]*\.(?:md|py|html?|json|ya?ml|txt)))/gim;

type BundleIntegrityRuleId =
  | "BND-01"
  | "BND-02"
  | "BND-03"
  | "BND-04"
  | "BND-05"
  | "BND-06"
  | "BND-07";

export interface BundleIntegrityFinding extends GroundedSkillFinding {
  ruleId: BundleIntegrityRuleId;
  resourcePath?: string;
  referencedIn?: string;
}

export interface BundleIntegrityResult {
  referencedButMissing: Array<{ path: string; referencedIn: string }>;
  presentButUnreferenced: Array<{ path: string; note: string }>;
  progressiveDisclosureOk: boolean;
  findings: GroundedSkillFinding[];
  referenceGraph: Array<{ from: string; to: string }>;
}

interface TextSource {
  path: string;
  content: string;
  isSkillMarkdown: boolean;
}

interface ReferenceMatch {
  from: string;
  rawPath: string;
  lineContext: string;
  isSkillMarkdown: boolean;
}

interface ResourceIndexEntry {
  resource: SkillBundleResource;
  canonicalDisplayPath: string;
  referencesFrom: Set<string>;
}

const EXECUTABLE_REFERENCE_PREFIXES = ["scripts/", "references/", "templates/"];
const PROGRESSIVE_DISCLOSURE_CUE_RE =
  /\b(when|if(?:\s+you)?\s+(?:need|needed|necessary|required)|only if|as needed|before you|after you|once you|for (?:more|additional|deeper) details|when needed)\b/i;

function makeFinding(
  ruleId: BundleIntegrityRuleId,
  severity: SkillFindingSeverity,
  title: string,
  fact: string,
  why: string,
  fix: string,
  referenceId: ReferenceId,
  extras: Pick<BundleIntegrityFinding, "resourcePath" | "referencedIn"> = {},
): BundleIntegrityFinding {
  return {
    id: `${ruleId}:${extras.referencedIn ?? extras.resourcePath ?? title}`,
    ruleId,
    family: "Skills",
    severity,
    title,
    fact,
    why,
    fix,
    referenceId,
    ai: false,
    evidence: fact,
    recommendation: fix,
    fixSteps: [{ order: 1, action: fix }],
    referenceIds: [referenceId],
    confidence: "high",
    ...extras,
  };
}

function stripTerminalPunctuation(path: string): string {
  return path.replace(/[.,;:!?]+$/g, "");
}

function extractTextSources(bundle: SkillBundle): TextSource[] {
  const sources: TextSource[] = [
    { path: "SKILL.md", content: bundle.skillMarkdown, isSkillMarkdown: true },
  ];

  for (const resource of bundle.resources) {
    if (resource.textContent === undefined) {
      continue;
    }

    sources.push({
      path: resource.originalPath,
      content: resource.textContent,
      isSkillMarkdown: false,
    });
  }

  return sources;
}

function collectReferences(source: TextSource): ReferenceMatch[] {
  const matches: ReferenceMatch[] = [];
  const lines = source.content.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const regex = new RegExp(PATH_REFERENCE.source, PATH_REFERENCE.flags);
    const normalizedLine = line.replace(/\\/g, "/");
    for (const match of normalizedLine.matchAll(regex)) {
      const rawPath = stripTerminalPunctuation(match[1] ?? "");
      if (!rawPath) {
        continue;
      }

      matches.push({
        from: source.path,
        rawPath,
        lineContext: `${index + 1}:${line}`,
        isSkillMarkdown: source.isSkillMarkdown,
      });
    }
  }

  return matches;
}

function buildResourceIndex(bundle: SkillBundle): {
  index: Map<string, ResourceIndexEntry>;
  duplicateFindings: BundleIntegrityFinding[];
  resourcePathIssues: BundleIntegrityFinding[];
} {
  const index = new Map<string, ResourceIndexEntry>();
  const duplicateFindings: BundleIntegrityFinding[] = [];
  const resourcePathIssues: BundleIntegrityFinding[] = [];

  for (const resource of bundle.resources) {
    const normalizedPath = resource.normalizedPath;
    const key = normalizedPath.toLowerCase();

    try {
      const canonicalPath = normalizeSkillResourcePath(normalizedPath);
      if (canonicalPath.toLowerCase() !== key) {
        resourcePathIssues.push(
          makeFinding(
            "BND-01",
            "critical",
            `Unsafe bundle path "${resource.originalPath}"`,
            `Stored path "${normalizedPath}" is not canonical`,
            "Bundle paths must remain normalized so reference matching is deterministic.",
            "Rename or re-normalize the resource so its stored path is canonical and case-insensitive safe.",
            "ms-skills-overview",
            { resourcePath: resource.originalPath },
          ),
        );
        continue;
      }

      const existing = index.get(key);
      if (!existing) {
        index.set(key, {
          resource,
          canonicalDisplayPath: resource.originalPath,
          referencesFrom: new Set<string>(),
        });
        continue;
      }

      duplicateFindings.push(
        makeFinding(
          "BND-01",
          "critical",
          `Duplicate normalized path "${resource.originalPath}"`,
          `Case-insensitive path collision with "${existing.canonicalDisplayPath}"`,
          "Case-insensitive matching makes duplicate bundle paths ambiguous.",
          "Keep a single canonical file for each normalized path and remove or rename the duplicate.",
          "ms-skills-overview",
          { resourcePath: resource.originalPath },
        ),
      );
    } catch {
      resourcePathIssues.push(
        makeFinding(
          "BND-01",
          "critical",
          `Unsafe bundle path "${resource.originalPath}"`,
          `Stored path "${normalizedPath}" is unsafe`,
          "Bundle paths must not include traversal, absolute, or otherwise unsafe segments.",
          "Rename or re-normalize the resource so its stored path is safe and canonical.",
          "ms-skills-overview",
          { resourcePath: resource.originalPath },
        ),
      );
    }
  }

  return { index, duplicateFindings, resourcePathIssues };
}

function isExecutableReference(path: string): boolean {
  const lower = path.toLowerCase();
  return EXECUTABLE_REFERENCE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Analyze a canonical skill bundle for deterministic reference-graph and
 * integrity issues.
 *
 * The analysis is client-side only. It extracts path references from the
 * canonical skill markdown and every decoded textual resource, matches them
 * case-insensitively against the bundle, and returns explicit findings for
 * missing, unreadable, unsupported, duplicate, and progressive-disclosure
 * issues.
 *
 * @param bundle - Canonical skill bundle assembled by the skill bundle pipeline.
 * @returns Deterministic bundle integrity results and grounded findings.
 */
export function analyzeBundleIntegrity(bundle: SkillBundle): BundleIntegrityResult {
  const { index, duplicateFindings, resourcePathIssues } = buildResourceIndex(bundle);
  const findings: BundleIntegrityFinding[] = [...duplicateFindings, ...resourcePathIssues];
  const referenceGraph: Array<{ from: string; to: string }> = [];
  const referencedButMissing = new Map<string, { path: string; referencedIn: string }>();
  const presentButUnreferenced = new Map<string, { path: string; note: string }>();
  const unresolvedPairs = new Set<string>();
  const missingPairs = new Set<string>();
  const unreadableEmitted = new Set<string>();
  const sourceReferences = extractTextSources(bundle).flatMap((source) =>
    collectReferences(source).map((match) => ({ ...match, from: source.path })),
  );

  for (const match of sourceReferences) {
    let normalizedPath: string;

    try {
      normalizedPath = normalizeSkillResourcePath(match.rawPath);
    } catch {
      const key = `${match.from}|${match.rawPath}`;
      if (!unresolvedPairs.has(key)) {
        unresolvedPairs.add(key);
        findings.push(
          makeFinding(
            "BND-01",
            "critical",
            `Unsafe referenced path "${match.rawPath}"`,
            `Reference from "${match.from}" cannot be normalized safely`,
            "References must stay within the bundle root and use canonical relative paths.",
            "Rewrite the reference as a safe, canonical bundle-relative path.",
            "ms-skills-overview",
            { resourcePath: match.rawPath, referencedIn: match.from },
          ),
        );
      }
      continue;
    }

    const resourceEntry = index.get(normalizedPath.toLowerCase());
    const graphTarget = resourceEntry?.canonicalDisplayPath ?? normalizedPath;
    referenceGraph.push({ from: match.from, to: graphTarget });

    if (!resourceEntry) {
      const pairKey = `${match.from}|${normalizedPath}`;
      if (!missingPairs.has(pairKey)) {
        missingPairs.add(pairKey);
        referencedButMissing.set(pairKey, { path: normalizedPath, referencedIn: match.from });
        findings.push(
          makeFinding(
            "BND-02",
            "high",
            `Referenced resource "${normalizedPath}" is missing`,
            `Referenced from "${match.from}"`,
            "Every referenced resource must resolve to a present bundle file.",
            "Add the missing file to the bundle or remove the reference.",
            "ms-skills-overview",
            { resourcePath: normalizedPath, referencedIn: match.from },
          ),
        );
      }
      continue;
    }

    resourceEntry.referencesFrom.add(match.from);

    const unreadable = resourceEntry.resource.textContent === undefined || resourceEntry.resource.textContent.trim().length === 0;
    const unreadableKey = resourceEntry.canonicalDisplayPath.toLowerCase();
    if (unreadable && !unreadableEmitted.has(unreadableKey)) {
      unreadableEmitted.add(unreadableKey);
      findings.push(
        makeFinding(
          "BND-03",
          "medium",
          `Referenced resource "${resourceEntry.canonicalDisplayPath}" is empty or unreadable`,
          `Referenced from "${match.from}"`,
          "Referenced textual resources must contain readable content so the agent can actually use them.",
          "Populate the file with readable UTF-8 text or stop referencing it.",
          "ms-skills-overview",
          { resourcePath: resourceEntry.canonicalDisplayPath, referencedIn: match.from },
        ),
      );
    }

    if (
      isExecutableReference(normalizedPath) &&
      (resourceEntry.resource.isBinary ||
        resourceEntry.resource.decodeStatus !== "decoded" ||
        resourceEntry.resource.kind === "asset" ||
        resourceEntry.resource.kind === "other")
    ) {
      findings.push(
        makeFinding(
          "BND-07",
          "critical",
          `Referenced executable/instruction resource "${resourceEntry.canonicalDisplayPath}" is binary or unsupported`,
          `Referenced from "${match.from}"`,
          "Scripts and instruction resources must be readable text before the skill can safely use them.",
          "Replace the file with readable UTF-8 text or point the instruction at a supported text resource.",
          "owasp-llm06",
          { resourcePath: resourceEntry.canonicalDisplayPath, referencedIn: match.from },
        ),
      );
    }
  }

  for (const resource of bundle.resources) {
    const entry = index.get(resource.normalizedPath.toLowerCase());
    if (!entry) {
      continue;
    }

    if (entry.referencesFrom.size > 0) {
      continue;
    }

    if (resource.textContent === undefined) {
      continue;
    }

    presentButUnreferenced.set(resource.normalizedPath.toLowerCase(), {
      path: entry.canonicalDisplayPath,
      note: "Readable textual resource is never referenced by SKILL.md or another textual resource.",
    });

    findings.push(
      makeFinding(
        "BND-04",
        "low",
        `Textual resource "${entry.canonicalDisplayPath}" is present but never referenced`,
        `"${entry.canonicalDisplayPath}" exists in the bundle but is not referenced from SKILL.md or any other textual resource`,
        "Unreferenced resources are never loaded by the agent, wasting bundle space and potentially causing confusion.",
        "Either reference the resource from SKILL.md or remove it from the bundle.",
        "ms-skills-overview",
        { resourcePath: entry.canonicalDisplayPath },
      ),
    );
  }

  const skillReferences = sourceReferences.filter((match) => match.isSkillMarkdown);
  const progressiveDisclosureOk = skillReferences.every((match) => {
    const lineText = match.lineContext;
    return PROGRESSIVE_DISCLOSURE_CUE_RE.test(lineText);
  });

  if (!progressiveDisclosureOk && skillReferences.length > 0) {
    const missingProgressiveDisclosure = [
      ...new Set(
        skillReferences
          .filter((match) => !PROGRESSIVE_DISCLOSURE_CUE_RE.test(match.lineContext))
          .map((match) => match.rawPath),
      ),
    ];

    findings.push(
      makeFinding(
        "BND-05",
        "low",
        "SKILL.md does not explain when to load referenced resources",
        `Lacks cue language for: ${missingProgressiveDisclosure.join(", ")}`,
        "The skill markdown should tell the agent when each referenced resource is relevant.",
        "Add cue phrases such as 'when you need details' or 'only if needed' before the resource links.",
        "ms-skill-authoring-rubric",
        { resourcePath: "SKILL.md" },
      ),
    );
  }

  if (bundle.bundleMarker && bundle.resources.length === 0) {
    findings.push(
      makeFinding(
        "BND-06",
        "high",
        "ZIP bundle marker is present but no child attachments exist",
        "The canonical bundle has no downloadable resources besides SKILL.md",
        "A ZIP-style skill must include at least one attachment if it declares a bundle marker.",
        "Attach the bundle resources or remove the ZIP bundle marker and use inline markdown instead.",
        "ms-skills-overview",
        { resourcePath: "SKILL.md" },
      ),
    );
  }

  const sortedFindings = findings.sort((left, right) => {
    if (left.ruleId !== right.ruleId) {
      return left.ruleId.localeCompare(right.ruleId);
    }
    const leftKey = `${left.referencedIn ?? ""}|${left.resourcePath ?? ""}|${left.id}`;
    const rightKey = `${right.referencedIn ?? ""}|${right.resourcePath ?? ""}|${right.id}`;
    return leftKey.localeCompare(rightKey);
  });

  const sortedMissing = Array.from(referencedButMissing.values()).sort((left, right) =>
    `${left.referencedIn}|${left.path}`.localeCompare(`${right.referencedIn}|${right.path}`),
  );
  const sortedUnreferenced = Array.from(presentButUnreferenced.values()).sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const sortedGraph = referenceGraph.sort((left, right) =>
    `${left.from}|${left.to}`.localeCompare(`${right.from}|${right.to}`),
  );

  return {
    referencedButMissing: sortedMissing,
    presentButUnreferenced: sortedUnreferenced,
    progressiveDisclosureOk,
    findings: sortedFindings,
    referenceGraph: sortedGraph,
  };
}
