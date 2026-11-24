/**
 * The seven bundle-integrity rules: `BND-01` … `BND-07`.
 *
 * ## One authority, two shapes (IMPL-12)
 *
 * `analyzeBundleIntegrity` was 432 lines that build a reference graph, index the
 * bundle's resources case-insensitively, and raise seven different kinds of
 * integrity problem from the one pass. Re-expressing that inside seven `check`
 * closures would be a second implementation of the same algorithm, and the two
 * would drift — a reference the detector resolved and the check did not would
 * show the maker a finding the score disagreed with.
 *
 * So the detector moved here whole, as {@link assessBundleIntegrity}, and it
 * produces {@link BundleIntegrityRow}s: the finding payloads minus the only two
 * fields that are a function of *which rule raised them* rather than of what was
 * found — `id` and `severity`. Those rows are then projected twice and neither
 * projection derives from the other:
 *
 * - {@link bundleIntegrityCheck} turns them into `RuleOutcome`s for the scorer.
 * - The adapter in `agents-experience/services/skill/bundleIntegrity.ts` turns
 *   them into `GroundedSkillFinding`s for the four existing consumers.
 *
 * Severity lives on {@link SkillBundleIntegrityOptions}, once, and the adapter
 * reads it back off the owning entry in
 * {@link skillBundleIntegrityRuleEntries}. There is no second severity table to
 * fall out of step.
 *
 * ## BND-01 is one rule with four instance kinds (D-2.3-A)
 *
 * The legacy code raises four textually different problems under the single id
 * `BND-01`: a stored path that is not canonical, a stored path that collides
 * case-insensitively with another, a stored path that is outright unsafe, and a
 * *referenced* path that cannot be normalized safely. They are four answers to
 * one question — "is every path in this bundle canonical, safe and unique?" —
 * so this is one `Rule` whose `check` returns one `RuleInstance` per offending
 * path. Each instance carries its own legacy `title`, `detail`, `why` and
 * `makerAction` verbatim; splitting them into BND-01a..d would invent four ids
 * nothing has ever persisted, and flattening them into one verdict would throw
 * away the four distinct maker actions.
 *
 * ## Harness and pillar
 *
 * `analyzeBundleIntegrity` is reached from both skill flows, so the family
 * declares both and maps a pillar per harness (D-14):
 *
 * - `copilot-skill` → `skills`. The Copilot-agent flow runs it through
 *   `CopilotReviewService` → `SkillBundleReviewService.computeDeterministicFindings`,
 *   and every finding it emits carries `family: "Skills"`, which today's
 *   `FAMILY_TO_PILLAR` in `agents-experience/services/scoring.ts` maps to the
 *   agent `Skills` pillar.
 * - `standalone-skill` → `packaging-quality`. The upload flow reaches the same
 *   service through `skills-automations/services/artifactAiStageCore.ts`, where
 *   `dimensionForFinding` resolves an unregistered `BND-` id through its registry
 *   bucket. `SKILL_DIMENSION_BUCKET['packaging-quality']` is `integrity`, which
 *   is the bucket `dimensionForRuleId` already assigns every `BND-` id.
 *
 * ## The not-applicable discipline
 *
 * A rule's population is what its claim is *about*, not what it reads, and
 * `creditFor` drops a not-applicable rule from the numerator and the denominator
 * together. Passing over an empty population hands out unearned credit, which
 * integrity rules are unusually prone to: "every referenced file exists" is
 * vacuously true of a bundle that references nothing, and crediting it would
 * score a bundle with no reference graph exactly like one with a clean reference
 * graph. So every rule here that quantifies over a population answers
 * `not-applicable` when that population is empty, and only BND-06 — whose
 * population is a single declared field — is gated on a precondition instead.
 *
 * There is deliberately **no** `could-not-run` state. The legacy detector has no
 * bundle-level decode failure: `decodeStatus` and `isBinary` are the *subject*
 * of BND-03 and BND-07's judgement, not a reason they cannot run, and SKILL.md
 * is always present as a text source even when it is empty. Inventing one would
 * move findings out of the scored set that are scored today.
 */

import type { SkillFindingSeverity } from '../../agents-experience/contracts/Findings';
import type { ReferenceId } from '../../agents-experience/contracts/references';
import type { SkillBundle, SkillBundleResource } from '../../agents-experience/contracts/SkillBundle';
import { normalizeSkillResourcePath } from '../../agents-experience/services/skill/resourceNormalizer';
import type { Harness } from '../harness';
import type { Pillar } from '../pillars';
import {
  failWith, notApplicable, pass, rule,
  type Rule, type RuleInstance, type RuleOutcome,
} from '../rule';

/** The seven ids this family owns. Published, and persisted on saved findings. */
export type BundleIntegrityRuleId =
  | 'BND-01'
  | 'BND-02'
  | 'BND-03'
  | 'BND-04'
  | 'BND-05'
  | 'BND-06'
  | 'BND-07';

/** The legacy grouping axis every bundle-integrity finding publishes under. */
export const BUNDLE_INTEGRITY_FAMILY = 'Skills';

/**
 * Both skill flows run this detector, and they score on different tables.
 *
 * `skill-set` + `standalone-skill` and `agent` + a skill harness are the two
 * combinations the registry rejects; `subjectScope: 'skill'` over the two skill
 * harnesses is neither. The subject is one bundle, which is one skill.
 */
const BUNDLE_INTEGRITY_HARNESSES: readonly Harness[] = Object.freeze([
  'copilot-skill', 'standalone-skill',
] as const);

const BUNDLE_INTEGRITY_PILLARS: Partial<Record<Harness, Pillar>> = Object.freeze({
  'copilot-skill': 'skills',
  'standalone-skill': 'packaging-quality',
} as const);

// ── The detector, hoisted whole ────────────────────────────────────────────

export const PATH_REFERENCE =
  /(?:^|[\s`"'(])((?:\.\/)?(?:(?:scripts|references|templates|assets|data)\/[A-Za-z0-9._/-]+|[A-Za-z0-9][A-Za-z0-9._-]*\.(?:md|py|html?|json|ya?ml|txt)))(?=$|[\s`"')\],;:!?]|\.(?:$|[\s`"')\],;:!?]))/gim;

interface TextSource {
  path: string;
  canonicalPath: string;
  content: string;
  isSkillMarkdown: boolean;
}

interface ReferenceMatch {
  from: string;
  canonicalSourcePath: string;
  rawPath: string;
  lineContext: string;
  isSkillMarkdown: boolean;
}

interface ResourceIndexEntry {
  resource: SkillBundleResource;
  canonicalDisplayPath: string;
  referencesFrom: Set<string>;
}

const EXECUTABLE_REFERENCE_PREFIXES = ['scripts/', 'references/', 'templates/'];
const PROGRESSIVE_DISCLOSURE_CUE_RE =
  /\b(when|if(?:\s+you)?\s+(?:need|needed|necessary|required)|only if|as needed|before you|after you|once you|for (?:more|additional|deeper) details|when needed)\b/i;

/**
 * One integrity problem, before it is published as either shape.
 *
 * Exactly the arguments the legacy `makeFinding` took, minus `severity` — which
 * is a property of the rule, not of the problem, and is read back from the
 * owning entry in {@link skillBundleIntegrityRuleEntries} so there is one table
 * rather than two.
 */
export interface BundleIntegrityRow {
  readonly ruleId: BundleIntegrityRuleId;
  readonly title: string;
  readonly fact: string;
  readonly why: string;
  readonly fix: string;
  readonly referenceId: ReferenceId;
  readonly resourcePath?: string;
  readonly referencedIn?: string;
}

function row(
  ruleId: BundleIntegrityRuleId,
  title: string,
  fact: string,
  why: string,
  fix: string,
  referenceId: ReferenceId,
  extras: Pick<BundleIntegrityRow, 'resourcePath' | 'referencedIn'> = {},
): BundleIntegrityRow {
  return { ruleId, title, fact, why, fix, referenceId, ...extras };
}

/**
 * What each rule's claim is about, counted while the detector runs.
 *
 * Counted here rather than recomputed in seven `check` closures: a population
 * derived a second time from the bundle could disagree with the one the detector
 * actually walked, and a rule would then pass over a set it never examined.
 */
export interface BundleIntegrityPopulation {
  /** Stored resource paths — `bundle.resources.length`. */
  readonly storedPaths: number;
  /** Every path reference extracted from SKILL.md and the readable textual resources. */
  readonly pathReferences: number;
  /** References that normalized without throwing. BND-01 owns the ones that did not. */
  readonly normalizableReferences: number;
  /** References that matched a resource in the bundle index. */
  readonly resolvedReferences: number;
  /** Resolved references under `scripts/`, `references/` or `templates/`. */
  readonly executableReferences: number;
  /** Indexed resources that decoded to text, referenced or not. */
  readonly readableTextualResources: number;
  /** References extracted from SKILL.md itself. */
  readonly skillMarkdownReferences: number;
  /** Whether the skill declares a ZIP bundle marker at all. */
  readonly declaresBundleMarker: boolean;
}

/**
 * Everything one pass of the detector established.
 *
 * The four legacy projections are kept as mutable arrays because
 * `BundleIntegrityResult` publishes them that way and this migration does not
 * change a published type.
 */
export interface BundleIntegrityAssessment {
  readonly rows: readonly BundleIntegrityRow[];
  readonly population: BundleIntegrityPopulation;
  readonly referencedButMissing: Array<{ path: string; referencedIn: string }>;
  readonly presentButUnreferenced: Array<{ path: string; note: string }>;
  readonly progressiveDisclosureOk: boolean;
  readonly referenceGraph: Array<{ from: string; to: string }>;
}

function stripTerminalPunctuation(path: string): string {
  return path.replace(/[.,;:!?]+$/g, '');
}

function extractTextSources(bundle: SkillBundle): TextSource[] {
  const sources: TextSource[] = [
    { path: 'SKILL.md', canonicalPath: 'SKILL.md', content: bundle.skillMarkdown, isSkillMarkdown: true },
  ];

  for (const resource of bundle.resources) {
    if (resource.textContent === undefined) {
      continue;
    }

    sources.push({
      path: resource.originalPath,
      canonicalPath: resource.normalizedPath,
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
    const normalizedLine = line.replace(/\\/g, '/');
    for (const match of normalizedLine.matchAll(regex)) {
      const rawPath = stripTerminalPunctuation(match[1] ?? '');
      if (!rawPath) {
        continue;
      }

      matches.push({
        from: source.path,
        canonicalSourcePath: source.canonicalPath,
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
  duplicateRows: BundleIntegrityRow[];
  resourcePathRows: BundleIntegrityRow[];
} {
  const index = new Map<string, ResourceIndexEntry>();
  const duplicateRows: BundleIntegrityRow[] = [];
  const resourcePathRows: BundleIntegrityRow[] = [];

  for (const resource of bundle.resources) {
    const normalizedPath = resource.normalizedPath;
    const key = normalizedPath.toLowerCase();

    try {
      const canonicalPath = normalizeSkillResourcePath(normalizedPath);
      if (canonicalPath.toLowerCase() !== key) {
        resourcePathRows.push(
          row(
            'BND-01',
            `Unsafe bundle path "${resource.originalPath}"`,
            `Stored path "${normalizedPath}" is not canonical`,
            'Bundle paths must remain normalized so reference matching is deterministic.',
            'Rename or re-normalize the resource so its stored path is canonical and case-insensitive safe.',
            'ms-skills-overview',
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

      duplicateRows.push(
        row(
          'BND-01',
          `Duplicate normalized path "${resource.originalPath}"`,
          `Case-insensitive path collision with "${existing.canonicalDisplayPath}"`,
          'Case-insensitive matching makes duplicate bundle paths ambiguous.',
          'Keep a single canonical file for each normalized path and remove or rename the duplicate.',
          'ms-skills-overview',
          { resourcePath: resource.originalPath },
        ),
      );
    } catch {
      resourcePathRows.push(
        row(
          'BND-01',
          `Unsafe bundle path "${resource.originalPath}"`,
          `Stored path "${normalizedPath}" is unsafe`,
          'Bundle paths must not include traversal, absolute, or otherwise unsafe segments.',
          'Rename or re-normalize the resource so its stored path is safe and canonical.',
          'ms-skills-overview',
          { resourcePath: resource.originalPath },
        ),
      );
    }
  }

  return { index, duplicateRows, resourcePathRows };
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
 * case-insensitively against the bundle, and returns explicit rows for
 * missing, unreadable, unsupported, duplicate, and progressive-disclosure
 * issues.
 *
 * This is the whole of the former `analyzeBundleIntegrity` body. Row order is
 * the order the legacy detector pushed findings in; it is preserved so that the
 * adapter's stable sort breaks ties exactly as it did before.
 *
 * @param bundle - Canonical skill bundle assembled by the skill bundle pipeline.
 * @returns One assessment, projected separately into rule outcomes and findings.
 */
export function assessBundleIntegrity(bundle: SkillBundle): BundleIntegrityAssessment {
  const { index, duplicateRows, resourcePathRows } = buildResourceIndex(bundle);
  const rows: BundleIntegrityRow[] = [...duplicateRows, ...resourcePathRows];
  const referenceGraph: Array<{ from: string; to: string }> = [];
  const referencedButMissing = new Map<string, { path: string; referencedIn: string }>();
  const missingReferenceGroups = new Map<string, { path: string; referencedIn: Set<string> }>();
  const presentButUnreferenced = new Map<string, { path: string; note: string }>();
  const unresolvedPairs = new Set<string>();
  const unreadableEmitted = new Set<string>();
  const sourceReferences = extractTextSources(bundle).flatMap((source) =>
    collectReferences(source).map((match) => ({ ...match, from: source.path })),
  );

  let normalizableReferences = 0;
  let resolvedReferences = 0;
  let executableReferences = 0;
  let readableTextualResources = 0;

  for (const match of sourceReferences) {
    let normalizedPath: string;
    let localPath: string;

    try {
      normalizedPath = normalizeSkillResourcePath(match.rawPath);
      const sourcePath = normalizeSkillResourcePath(match.canonicalSourcePath);
      const directory = sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1);
      localPath = normalizeSkillResourcePath(`${directory}${normalizedPath}`);
    } catch {
      const key = `${match.from}|${match.rawPath}`;
      if (!unresolvedPairs.has(key)) {
        unresolvedPairs.add(key);
        rows.push(
          row(
            'BND-01',
            `Unsafe referenced path "${match.rawPath}"`,
            `Reference from "${match.from}" cannot be normalized safely`,
            'References must stay within the bundle root and use canonical relative paths.',
            'Rewrite the reference as a safe, canonical bundle-relative path.',
            'ms-skills-overview',
            { resourcePath: match.rawPath, referencedIn: match.from },
          ),
        );
      }
      continue;
    }

    normalizableReferences++;

    // A reference is resolved twice: against the bundle root, and against the
    // directory of the file that contains it. A path-looking reference written
    // without `./` reads as bundle-relative, so the root wins; a bare filename or
    // an explicit `./x` reads as a sibling, so the local directory wins. Resolving
    // only against the root is what used to report a present sibling as missing.
    const normalizedKey = normalizedPath.toLowerCase();
    const isSkillDefinition = normalizedKey === 'skill.md';
    const rootEntry = index.get(normalizedKey);
    const localEntry = index.get(localPath.toLowerCase());
    const resourceEntry = normalizedPath.includes('/') && !match.rawPath.startsWith('./')
      ? rootEntry ?? localEntry
      : localEntry ?? rootEntry;
    const graphTarget = isSkillDefinition
      ? 'SKILL.md'
      : resourceEntry?.canonicalDisplayPath ?? normalizedPath;
    referenceGraph.push({ from: match.from, to: graphTarget });

    // SKILL.md is `bundle.skillMarkdown`, not a resource, so it is absent from the
    // index by construction. Without this guard the idiomatic "see SKILL.md" was
    // reported as a missing resource on virtually every bundle.
    if (isSkillDefinition) {
      continue;
    }

    if (!resourceEntry) {
      const group = missingReferenceGroups.get(normalizedKey);
      if (group) {
        group.referencedIn.add(match.from);
      } else {
        missingReferenceGroups.set(normalizedKey, {
          path: normalizedPath,
          referencedIn: new Set([match.from]),
        });
      }
      continue;
    }

    resolvedReferences++;
    if (isExecutableReference(resourceEntry.resource.normalizedPath)) executableReferences++;

    resourceEntry.referencesFrom.add(match.from);

    const unreadable = resourceEntry.resource.textContent === undefined || resourceEntry.resource.textContent.trim().length === 0;
    const unreadableKey = resourceEntry.canonicalDisplayPath.toLowerCase();
    if (unreadable && !unreadableEmitted.has(unreadableKey)) {
      unreadableEmitted.add(unreadableKey);
      rows.push(
        row(
          'BND-03',
          `Referenced resource "${resourceEntry.canonicalDisplayPath}" is empty or unreadable`,
          `Referenced from "${match.from}"`,
          'Referenced textual resources must contain readable content so the agent can actually use them.',
          'Populate the file with readable UTF-8 text or stop referencing it.',
          'ms-skills-overview',
          { resourcePath: resourceEntry.canonicalDisplayPath, referencedIn: match.from },
        ),
      );
    }

    if (
      isExecutableReference(resourceEntry.resource.normalizedPath) &&
      (resourceEntry.resource.isBinary ||
        resourceEntry.resource.decodeStatus !== 'decoded' ||
        resourceEntry.resource.kind === 'asset' ||
        resourceEntry.resource.kind === 'other')
    ) {
      rows.push(
        row(
          'BND-07',
          `Referenced executable/instruction resource "${resourceEntry.canonicalDisplayPath}" is binary or unsupported`,
          `Referenced from "${match.from}"`,
          'Scripts and instruction resources must be readable text before the skill can safely use them.',
          'Replace the file with readable UTF-8 text or point the instruction at a supported text resource.',
          'owasp-llm06',
          { resourcePath: resourceEntry.canonicalDisplayPath, referencedIn: match.from },
        ),
      );
    }
  }

  // Emitted after the walk, not inside it: one BND-02 per missing path naming
  // every file that referenced it. Emitting inside the loop produced one
  // identical finding per referencing file, and each one named only its own
  // source — so a maker who fixed the named reference still failed the rule.
  for (const [key, group] of missingReferenceGroups) {
    const sources = [...group.referencedIn].sort((left, right) => {
      if (left === 'SKILL.md') return -1;
      if (right === 'SKILL.md') return 1;
      return left.localeCompare(right);
    });
    const referencedIn = sources.join(', ');
    referencedButMissing.set(key, { path: group.path, referencedIn });
    rows.push(
      row(
        'BND-02',
        `Referenced resource "${group.path}" is missing`,
        `Referenced from ${sources.map((source) => `"${source}"`).join(', ')}`,
        'Every referenced resource must resolve to a present bundle file.',
        'Add the missing file to the bundle or remove the reference.',
        'ms-skills-overview',
        { resourcePath: group.path, referencedIn },
      ),
    );
  }

  for (const resource of bundle.resources) {
    const entry = index.get(resource.normalizedPath.toLowerCase());
    if (!entry) {
      continue;
    }

    // Counted before the two claim tests below, because a referenced resource and
    // a readable one are both in BND-04's population — being referenced is the
    // rule passing, not the rule having nothing to judge.
    if (resource.textContent !== undefined) readableTextualResources++;

    if (entry.referencesFrom.size > 0) {
      continue;
    }

    if (resource.textContent === undefined) {
      continue;
    }

    presentButUnreferenced.set(resource.normalizedPath.toLowerCase(), {
      path: entry.canonicalDisplayPath,
      note: 'Readable textual resource is never referenced by SKILL.md or another textual resource.',
    });

    rows.push(
      row(
        'BND-04',
        `Textual resource "${entry.canonicalDisplayPath}" is present but never referenced`,
        `"${entry.canonicalDisplayPath}" exists in the bundle but is not referenced from SKILL.md or any other textual resource`,
        'Unreferenced resources are never loaded by the agent, wasting bundle space and potentially causing confusion.',
        'Either reference the resource from SKILL.md or remove it from the bundle.',
        'ms-skills-overview',
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

    rows.push(
      row(
        'BND-05',
        'SKILL.md does not explain when to load referenced resources',
        `Lacks cue language for: ${missingProgressiveDisclosure.join(', ')}`,
        'The skill markdown should tell the agent when each referenced resource is relevant.',
        "Add cue phrases such as 'when you need details' or 'only if needed' before the resource links.",
        'ms-skill-authoring-rubric',
        { resourcePath: 'SKILL.md' },
      ),
    );
  }

  if (bundle.bundleMarker && bundle.resources.length === 0) {
    rows.push(
      row(
        'BND-06',
        'ZIP bundle marker is present but no child attachments exist',
        'The canonical bundle has no downloadable resources besides SKILL.md',
        'A ZIP-style skill must include at least one attachment if it declares a bundle marker.',
        'Attach the bundle resources or remove the ZIP bundle marker and use inline markdown instead.',
        'ms-skills-overview',
        { resourcePath: 'SKILL.md' },
      ),
    );
  }

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
    rows,
    population: {
      storedPaths: bundle.resources.length,
      pathReferences: sourceReferences.length,
      normalizableReferences,
      resolvedReferences,
      executableReferences,
      readableTextualResources,
      skillMarkdownReferences: skillReferences.length,
      declaresBundleMarker: Boolean(bundle.bundleMarker),
    },
    referencedButMissing: sortedMissing,
    presentButUnreferenced: sortedUnreferenced,
    progressiveDisclosureOk,
    referenceGraph: sortedGraph,
  };
}

// ── The seam ───────────────────────────────────────────────────────────────

/**
 * What a bundle-integrity rule is asked about: one bundle, and the single pass
 * of the detector over it.
 *
 * The assessment is carried on the context rather than recomputed inside each
 * `check`, because seven rules sharing one reference graph is the whole point of
 * the hoist: seven independent passes would be seven chances to disagree.
 */
export interface SkillBundleIntegrityContext {
  readonly bundle: SkillBundle;
  readonly integrity: BundleIntegrityAssessment;
}

/** Runs the detector once and packages it as the context every check reads. */
export function skillBundleIntegrityContext(bundle: SkillBundle): SkillBundleIntegrityContext {
  return Object.freeze({ bundle, integrity: assessBundleIntegrity(bundle) });
}

/**
 * Whether a rule's subject was there to be judged.
 *
 * Two states, not the scanner seam's three. There is no `unreadable` here: the
 * detector has no bundle-level decode failure, because a resource that failed to
 * decode is what BND-03 and BND-07 are *about* rather than a reason they could
 * not run, and SKILL.md is always a text source even when it is empty.
 */
export type BundleIntegrityPopulationState =
  | { readonly kind: 'present'; readonly detail: string }
  | { readonly kind: 'absent'; readonly because: string };

function populated(detail: string): BundleIntegrityPopulationState {
  return Object.freeze({ kind: 'present' as const, detail });
}

function noPopulation(because: string): BundleIntegrityPopulationState {
  return Object.freeze({ kind: 'absent' as const, because });
}

function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

/**
 * The published fields the `Rule` vocabulary cannot carry, plus the population
 * the check consults when the detector raised nothing.
 */
export interface SkillBundleIntegrityOptions {
  /** Legacy five-point scale. `Rule.severity` has three values and cannot spell `critical`. */
  readonly severity: SkillFindingSeverity;
  /** Folded into `Rule.severity` on the new side, still published on every finding. */
  readonly confidence: 'high' | 'medium' | 'low';
  /** The legacy grouping axis the skill UI reads. `"Skills"` for all seven. */
  readonly family: string;
  /** What this rule's claim is about, resolved from the single detector pass. */
  readonly population: (assessment: BundleIntegrityAssessment) => BundleIntegrityPopulationState;
}

/**
 * A rule and the options that publish it, kept together so they cannot be
 * mismatched.
 *
 * `id` is repeated here, narrowed, so the legacy adapter can select a rule's rows
 * without casting `Rule.id` back down from `string`.
 */
export interface SkillBundleIntegrityRuleEntry {
  readonly id: BundleIntegrityRuleId;
  readonly rule: Rule<SkillBundleIntegrityContext>;
  readonly options: SkillBundleIntegrityOptions;
}

/**
 * One offending path.
 *
 * `why` and `makerAction` come from the row, not from the rule's prose, because
 * BND-01 answers one question four different ways and each answer has its own
 * reason and its own remedy. `subjectRef` carries the bundle-relative path as
 * the subject's identity — a bundle resource has no component id on the legacy
 * finding — and the text source the reference was read from as the field path,
 * which is literally where the quote came from.
 */
function instanceFor(hit: BundleIntegrityRow): RuleInstance {
  return {
    ...(hit.resourcePath ? { subject: hit.resourcePath } : {}),
    title: hit.title,
    detail: hit.fact,
    why: hit.why,
    makerAction: hit.fix,
    reference: hit.referenceId,
    ...(hit.resourcePath
      ? {
        subjectRef: {
          schemaName: hit.resourcePath,
          quote: hit.fact,
          ...(hit.referencedIn ? { fieldPath: hit.referencedIn } : {}),
        },
      }
      : {}),
  };
}

/**
 * The reduction every bundle-integrity rule shares.
 *
 * The detector is what decides a failure; the population is consulted only to
 * tell a real pass apart from a question that was never asked.
 */
function bundleIntegrityCheck(
  ruleId: BundleIntegrityRuleId,
  options: SkillBundleIntegrityOptions,
  ctx: SkillBundleIntegrityContext,
): RuleOutcome {
  const hits = ctx.integrity.rows.filter((candidate) => candidate.ruleId === ruleId);
  if (hits.length > 0) return failWith(hits.map(instanceFor));

  const state = options.population(ctx.integrity);
  return state.kind === 'absent' ? notApplicable(state.because) : pass(state.detail);
}

/** What an author writes. The four constant fields are filled in below. */
type SkillBundleIntegrityDeclaration =
  Omit<Rule<SkillBundleIntegrityContext>,
    'check' | 'harnesses' | 'subjectScope' | 'execution' | 'pillar' | 'references' | 'id'> & {
    readonly id: BundleIntegrityRuleId;
    readonly references: readonly ReferenceId[];
  };

function skillBundleIntegrityRule(
  declaration: SkillBundleIntegrityDeclaration,
  options: SkillBundleIntegrityOptions,
): SkillBundleIntegrityRuleEntry {
  const declared: Rule<SkillBundleIntegrityContext> = {
    ...declaration,
    harnesses: BUNDLE_INTEGRITY_HARNESSES,
    pillar: BUNDLE_INTEGRITY_PILLARS,
    subjectScope: 'skill',
    execution: 'deterministic',
    check: (ctx) => bundleIntegrityCheck(declaration.id, options, ctx),
  };
  return Object.freeze({ id: declaration.id, rule: rule(declared), options });
}

// ── The seven rules ────────────────────────────────────────────────────────

const BND_01 = skillBundleIntegrityRule(
  {
    id: 'BND-01',
    title: 'Bundle paths are canonical, safe and unique',
    severity: 'high',
    tags: ['security', 'quality'],
    references: ['ms-skills-overview'],
    prose: {
      question: 'Is every stored bundle path and every referenced path canonical, safe and unique?',
      summary: 'Normalize every stored resource path and every extracted path reference, and compare them case-insensitively.',
      why: 'Reference matching is case-insensitive and path-based, so a path that is not canonical, is not unique, or escapes the bundle root makes the bundle ambiguous or unsafe to resolve.',
      fix: 'Rename or re-normalize the offending path so it is canonical, safe and unique within the bundle.',
      passWhen: [
        'Every stored resource path normalizes to itself, no two stored paths collide case-insensitively, and every extracted reference normalizes safely.',
      ],
      failWhen: [
        'A stored resource path is not canonical.',
        'Two stored resource paths collide case-insensitively.',
        'A stored resource path contains a traversal, absolute or otherwise unsafe segment.',
        'A path reference cannot be normalized safely.',
      ],
      notApplicableWhen: [
        'The bundle stores no resource path and no text source references one, so there is no path to canonicalize.',
      ],
    },
    evidence: {
      fieldPaths: ['resources[].normalizedPath', 'resources[].originalPath', 'skillMarkdown'],
    },
  },
  {
    severity: 'critical',
    confidence: 'high',
    family: BUNDLE_INTEGRITY_FAMILY,
    population: (assessment) => {
      const { storedPaths, pathReferences } = assessment.population;
      if (storedPaths === 0 && pathReferences === 0) {
        return noPopulation(
          'The bundle stores no resource path and no text source references one, so there is no path to canonicalize.',
        );
      }
      return populated(
        `${count(storedPaths, 'stored bundle path')} and ${count(pathReferences, 'path reference')} are canonical, safe and unique.`,
      );
    },
  },
);

const BND_02 = skillBundleIntegrityRule(
  {
    id: 'BND-02',
    title: 'Every referenced resource exists in the bundle',
    severity: 'high',
    tags: ['quality'],
    references: ['ms-skills-overview'],
    prose: {
      question: 'Does every path reference resolve to a file that is actually in the bundle?',
      summary: 'Match every normalized path reference against the case-insensitive bundle index.',
      why: 'Every referenced resource must resolve to a present bundle file.',
      fix: 'Add the missing file to the bundle or remove the reference.',
      passWhen: [
        'Every path reference extracted from SKILL.md and the readable textual resources resolves to a file in the bundle.',
      ],
      failWhen: ['A path reference names a file that is not in the bundle.'],
      notApplicableWhen: [
        'Neither SKILL.md nor any readable textual resource references a bundle path, so there is no reference to resolve.',
      ],
    },
    evidence: {
      fieldPaths: ['skillMarkdown', 'resources[].textContent', 'resources[].normalizedPath'],
    },
  },
  {
    severity: 'high',
    confidence: 'high',
    family: BUNDLE_INTEGRITY_FAMILY,
    population: (assessment) => {
      const { normalizableReferences } = assessment.population;
      if (normalizableReferences === 0) {
        return noPopulation(
          'Neither SKILL.md nor any readable textual resource references a bundle path, so there is no reference to resolve.',
        );
      }
      return populated(
        `${count(normalizableReferences, 'path reference')} resolve to a file in the bundle.`,
      );
    },
  },
);

const BND_03 = skillBundleIntegrityRule(
  {
    id: 'BND-03',
    title: 'Every referenced resource has readable content',
    severity: 'medium',
    tags: ['quality'],
    references: ['ms-skills-overview'],
    prose: {
      question: 'Does every resolved reference point at a file with readable content?',
      summary: 'Read the decoded text of every resource a reference resolved to.',
      why: 'Referenced textual resources must contain readable content so the agent can actually use them.',
      fix: 'Populate the file with readable UTF-8 text or stop referencing it.',
      passWhen: ['Every resolved reference points at a file with non-blank decoded text.'],
      failWhen: ['A resolved reference points at a file that is empty or did not decode to text.'],
      notApplicableWhen: [
        'No path reference resolves to a file in the bundle, so there is no referenced content to read.',
      ],
    },
    evidence: {
      fieldPaths: ['resources[].textContent', 'resources[].decodeStatus', 'resources[].normalizedPath'],
    },
  },
  {
    severity: 'medium',
    confidence: 'high',
    family: BUNDLE_INTEGRITY_FAMILY,
    population: (assessment) => {
      const { resolvedReferences } = assessment.population;
      if (resolvedReferences === 0) {
        return noPopulation(
          'No path reference resolves to a file in the bundle, so there is no referenced content to read.',
        );
      }
      return populated(
        `${count(resolvedReferences, 'resolved reference')} point at a file with readable content.`,
      );
    },
  },
);

const BND_04 = skillBundleIntegrityRule(
  {
    id: 'BND-04',
    title: 'Every readable textual resource is referenced',
    severity: 'info',
    tags: ['quality'],
    references: ['ms-skills-overview'],
    prose: {
      question: 'Is every readable textual resource referenced from SKILL.md or another textual resource?',
      summary: 'Walk the reference graph back over the indexed resources that decoded to text.',
      why: 'Unreferenced resources are never loaded by the agent, wasting bundle space and potentially causing confusion.',
      fix: 'Either reference the resource from SKILL.md or remove it from the bundle.',
      passWhen: [
        'Every indexed resource that decoded to text is referenced from SKILL.md or another textual resource.',
      ],
      failWhen: ['A readable textual resource is in the bundle but is never referenced.'],
      notApplicableWhen: [
        'The bundle indexes no resource that decoded to text, so there is nothing that could be left unreferenced.',
      ],
    },
    evidence: {
      fieldPaths: ['resources[].normalizedPath', 'resources[].textContent', 'skillMarkdown'],
    },
  },
  {
    severity: 'low',
    confidence: 'high',
    family: BUNDLE_INTEGRITY_FAMILY,
    population: (assessment) => {
      const { readableTextualResources } = assessment.population;
      if (readableTextualResources === 0) {
        return noPopulation(
          'The bundle indexes no resource that decoded to text, so there is nothing that could be left unreferenced.',
        );
      }
      return populated(
        `${count(readableTextualResources, 'readable textual resource')} are referenced from SKILL.md or another textual resource.`,
      );
    },
  },
);

const BND_05 = skillBundleIntegrityRule(
  {
    id: 'BND-05',
    title: 'SKILL.md explains when to load each referenced resource',
    severity: 'info',
    tags: ['quality'],
    references: ['ms-skill-authoring-rubric'],
    prose: {
      question: 'Does SKILL.md say when each referenced resource should be loaded?',
      summary: 'Scan the SKILL.md line carrying each reference for progressive-disclosure cue language.',
      why: 'The skill markdown should tell the agent when each referenced resource is relevant.',
      fix: "Add cue phrases such as 'when you need details' or 'only if needed' before the resource links.",
      passWhen: ['Every SKILL.md line that references a resource carries progressive-disclosure cue language.'],
      failWhen: ['A SKILL.md line references a resource with no cue language saying when to load it.'],
      notApplicableWhen: [
        'SKILL.md references no bundle resource, so there is no load to cue.',
      ],
    },
    evidence: { fieldPaths: ['skillMarkdown'] },
  },
  {
    severity: 'low',
    confidence: 'high',
    family: BUNDLE_INTEGRITY_FAMILY,
    population: (assessment) => {
      const { skillMarkdownReferences } = assessment.population;
      if (skillMarkdownReferences === 0) {
        return noPopulation('SKILL.md references no bundle resource, so there is no load to cue.');
      }
      return populated(
        `${count(skillMarkdownReferences, 'SKILL.md reference')} carry progressive-disclosure cue language.`,
      );
    },
  },
);

const BND_06 = skillBundleIntegrityRule(
  {
    id: 'BND-06',
    title: 'A declared ZIP bundle carries at least one attachment',
    severity: 'high',
    tags: ['quality'],
    references: ['ms-skills-overview'],
    prose: {
      question: 'Does a skill that declares a ZIP bundle marker actually carry child attachments?',
      summary: 'Compare the declared bundle marker against the canonical resource list.',
      why: 'A ZIP-style skill must include at least one attachment if it declares a bundle marker.',
      fix: 'Attach the bundle resources or remove the ZIP bundle marker and use inline markdown instead.',
      passWhen: ['The skill declares a ZIP bundle marker and the canonical bundle carries at least one resource.'],
      failWhen: ['The skill declares a ZIP bundle marker but the canonical bundle carries no resource.'],
      notApplicableWhen: [
        'The skill declares no ZIP bundle marker, so it is inline markdown and has no attachments to carry.',
      ],
    },
    evidence: { fieldPaths: ['bundleMarker', 'resources'] },
  },
  {
    severity: 'high',
    confidence: 'high',
    family: BUNDLE_INTEGRITY_FAMILY,
    population: (assessment) => {
      const { declaresBundleMarker, storedPaths } = assessment.population;
      if (!declaresBundleMarker) {
        return noPopulation(
          'The skill declares no ZIP bundle marker, so it is inline markdown and has no attachments to carry.',
        );
      }
      return populated(
        `The declared ZIP bundle carries ${count(storedPaths, 'child attachment')}.`,
      );
    },
  },
);

const BND_07 = skillBundleIntegrityRule(
  {
    id: 'BND-07',
    title: 'Every referenced script or instruction resource is readable text',
    severity: 'high',
    tags: ['security', 'quality'],
    references: ['owasp-llm06'],
    prose: {
      question: 'Is every referenced resource under scripts/, references/ or templates/ readable text?',
      summary: 'Check the decode status and classified kind of every executable or instruction resource a reference resolved to.',
      why: 'Scripts and instruction resources must be readable text before the skill can safely use them.',
      fix: 'Replace the file with readable UTF-8 text or point the instruction at a supported text resource.',
      passWhen: [
        'Every referenced resource under scripts/, references/ or templates/ decoded to text and is classified as a usable kind.',
      ],
      failWhen: [
        'A referenced resource under scripts/, references/ or templates/ is binary, did not decode, or is classified as an asset or other.',
      ],
      notApplicableWhen: [
        'No reference resolves to a resource under scripts/, references/ or templates/, so there is no executable or instruction resource to decode.',
      ],
    },
    evidence: {
      fieldPaths: ['resources[].isBinary', 'resources[].decodeStatus', 'resources[].kind'],
    },
  },
  {
    severity: 'critical',
    confidence: 'high',
    family: BUNDLE_INTEGRITY_FAMILY,
    population: (assessment) => {
      const { executableReferences } = assessment.population;
      if (executableReferences === 0) {
        return noPopulation(
          'No reference resolves to a resource under scripts/, references/ or templates/, so there is no executable or instruction resource to decode.',
        );
      }
      return populated(
        `${count(executableReferences, 'referenced script or instruction resource')} decoded to readable text.`,
      );
    },
  },
);

/** `BND-01` … `BND-07`. Order is published. */
export const skillBundleIntegrityRuleEntries: readonly SkillBundleIntegrityRuleEntry[] =
  Object.freeze([BND_01, BND_02, BND_03, BND_04, BND_05, BND_06, BND_07]);

export const skillBundleIntegrityRules: readonly Rule<SkillBundleIntegrityContext>[] =
  Object.freeze(skillBundleIntegrityRuleEntries.map((entry) => entry.rule));
