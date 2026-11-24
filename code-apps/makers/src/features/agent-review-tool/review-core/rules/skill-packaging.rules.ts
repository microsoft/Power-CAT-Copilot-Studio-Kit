/**
 * The deterministic packaging rules over an uploaded skill's bundle.
 *
 * These are the second class of `standalone-skill` metadata rules moving out of
 * `agents-experience/services/skill/skillRuleRegistry.ts`. The architecture is
 * the one `skill-scanner.rules.ts` proved: one declaration, projected two ways —
 * `rule` is the shape the core registry wants, `definition` is the legacy
 * `SkillRuleDefinition` row `createRegisteredFinding` has always read — and a
 * generated `check` that reports a verdict over findings the detector already
 * produced rather than re-running detection.
 *
 * Three things differ from the scanner seam, and each is a deliberate sibling
 * rather than a change to it:
 *
 * - **The context is the bundle, not a resource list.** These rules read the
 *   manifest, the file table and the selected runtimes — `UploadedArtifact` and
 *   `TargetRuntime[]` — none of which is a `SkillBundleResource`. So
 *   {@link SkillPackagingContext} sits beside `SkillResourceContext` instead of
 *   widening it. `runtimes` is part of the context because it is part of the
 *   question: the Cowork limits are a Cowork upload contract, and a reviewer who
 *   did not select Cowork was never asked about them.
 * - **The population is resolved, not filtered.** `SkillScannerPopulation` is a
 *   per-resource predicate, which cannot express "the frontmatter `name` field"
 *   or "the bundle as a whole". {@link SkillPackagingPopulation} returns the
 *   ladder state directly, so the generator stays one shared reduction while
 *   each rule says, in its own terms, what "there is nothing to look at" and
 *   "it could not be read" mean for it.
 * - **`family` is per-rule.** The scanner seam hardcodes `'Skills'` because all
 *   21 of its rules publish under it. These 29 span five families — Packaging,
 *   Security, Skills, Automation and Runtime — so the family rides on the
 *   options beside the other two legacy scales.
 *
 * The important call, and the one that changes scores if it is got wrong, is
 * which bundle states are `not-applicable`. The answer is that a rule's
 * population is **what its claim is about, not what it reads**:
 *
 * - A *presence* rule — PKG-REQ, PKG-FM — claims something about the bundle,
 *   which always exists. It can never be not-applicable for a missing manifest,
 *   because that absence is precisely its failure. Returning not-applicable
 *   there drops it from both sides of the ratio in `creditFor`, so a bundle with
 *   no SKILL.md at all would score the same on packaging as a perfect one.
 * - A *property* rule — PKG-NAME below — claims something about a field. With no
 *   field there is no claim to judge, and the absence is already owned and
 *   reported by the presence rule. `evaluatePackaging` encodes the same
 *   judgement by returning early rather than re-reporting one defect as several,
 *   so mirroring it here is not-applicable, not a second failure.
 * - A *limit* rule — LIM-SIZE below — claims a budget is not exceeded. The empty
 *   set satisfies that, so no companion files is a **pass**. Its genuine
 *   not-applicable is the runtime gate, which is the condition under which the
 *   detector does not run at all.
 */

import type {
  GroundedSkillFinding, SkillFindingSeverity, SkillRubricDimension,
} from '../../agents-experience/contracts/Findings';
import type { ReferenceId } from '../../agents-experience/contracts/references';
import type {
  TargetRuntime, UploadedArtifact, UploadedFile,
} from '../../skills-automations/contracts/ArtifactReview';
import { RUNTIME_LABELS } from '../../skills-automations/contracts/ArtifactReview';
import { resolveCatalogue } from '../../skills-automations/data/catalogueResolver';
import {
  findFile, parseFrontmatter, readString, stripRoot,
} from '../../skills-automations/services/artifactUtils';
import { SKILL_DIMENSION_BUCKET, type SkillDimension } from '../pillars';
import {
  couldNotRun, failWith, notApplicable, pass, rule,
  type Rule, type RuleInstance, type RuleProse,
} from '../rule';
import type { SkillRuleDefinition } from './skill-scanner.rules';

/** The legacy row shape, re-exported so this file's consumers need only one import. */
export type { SkillRuleDefinition };

/** The family the packaging and size-limit rules publish under. */
const PACKAGING_RULE_FAMILY = 'Packaging';

/**
 * What a packaging rule is asked about: the upload, the runtimes it is being
 * judged against, and the findings the detectors already drew from it.
 *
 * A sibling of `SkillResourceContext` rather than a widening of it. The two
 * share no subject type — one holds decoded `SkillBundleResource`s, this holds
 * the archive — and collapsing them would give every scanner rule a `runtimes`
 * field it has no use for, and every packaging rule a `resources` list that does
 * not describe what it reads.
 */
export interface SkillPackagingContext {
  /** The upload, exactly as the detectors received it. */
  readonly artifact: UploadedArtifact;
  /** The runtimes the reviewer selected. Part of the question, not of the input. */
  readonly runtimes: readonly TargetRuntime[];
  /** Detector output, keyed by the rule that produced it. */
  readonly findingsByRule: ReadonlyMap<string, readonly GroundedSkillFinding[]>;
}

/** Groups raw detector output into the shape a check reads. */
export function skillPackagingContext(
  artifact: UploadedArtifact,
  runtimes: readonly TargetRuntime[],
  findings: readonly GroundedSkillFinding[],
): SkillPackagingContext {
  const findingsByRule = new Map<string, GroundedSkillFinding[]>();
  for (const finding of findings) {
    const existing = findingsByRule.get(finding.ruleId);
    if (existing) existing.push(finding);
    else findingsByRule.set(finding.ruleId, [finding]);
  }
  return { artifact, runtimes, findingsByRule };
}

/**
 * Whether a rule's subject was there to be judged.
 *
 * Three states rather than a boolean, because "there is nothing to judge" and
 * "there is something and it could not be read" are different answers and only
 * one of them is the rule's fault. `detail` on the present case is what the pass
 * sentence says, so a reader learns what was measured rather than only that
 * nothing was wrong.
 */
export type PackagingPopulationState =
  | { readonly kind: 'present'; readonly detail: string }
  | { readonly kind: 'absent'; readonly because: string }
  | { readonly kind: 'unreadable'; readonly because: string };

export function populated(detail: string): PackagingPopulationState {
  return Object.freeze({ kind: 'present' as const, detail });
}

export function noPopulation(because: string): PackagingPopulationState {
  return Object.freeze({ kind: 'absent' as const, because });
}

export function unreadablePopulation(because: string): PackagingPopulationState {
  return Object.freeze({ kind: 'unreadable' as const, because });
}

/**
 * The subject one rule's detector reads, and whether it was there.
 *
 * A resolver over the whole context rather than a per-element predicate. The
 * scanner seam could filter a list because every one of its rules selects
 * resources; these select a frontmatter field, a file table under a runtime
 * gate, or an automation definition, and only the rule itself knows which of its
 * inputs being absent makes its claim unanswerable.
 */
export interface SkillPackagingPopulation {
  readonly label: string;
  readonly resolve: (ctx: SkillPackagingContext) => PackagingPopulationState;
}

/**
 * The published fields the new `Rule` vocabulary cannot carry, plus the
 * population the check needs.
 *
 * `family` joins the two legacy scales here, rather than being a constant as it
 * is in the scanner seam, because these rules do not all publish under one.
 */
export interface SkillPackagingOptions {
  /** Legacy five-point scale. `Rule.severity` has three values and cannot spell `critical`. */
  readonly severity: SkillFindingSeverity;
  /** Folded into `Rule.severity` on the new side, still published on every finding. */
  readonly confidence: 'high' | 'medium' | 'low';
  /** The legacy grouping axis the skill UI reads. One of five across these rules. */
  readonly family: string;
  readonly population: SkillPackagingPopulation;
  /**
   * Overrides the legacy `dimension` on the published row only.
   *
   * `pillar` and `dimension` are two independent axes that usually agree, and
   * `SKILL_DIMENSION_BUCKET` encodes the agreement. For a handful of rules they
   * genuinely disagree — `AUTO-UNATTENDED` is pinned to `safety-evidence` by
   * `reviewPipeline.test.ts` while its legacy row publishes `readiness` — and
   * one derivation cannot produce both.
   *
   * Setting this keeps `Rule.pillar` honest (it drives the new scorer and the
   * prefix tables) while the legacy row keeps the value the skill UI already
   * reads. Do **not** reach for the inverse workaround of choosing a wrong
   * `pillar` whose bucket happens to give the right `dimension`: that silently
   * moves the rule to another pillar the moment Phase 3 scores from the
   * registry.
   *
   * Omit it whenever the two axes agree, which is the common case.
   */
  readonly legacyDimension?: SkillRubricDimension;
}

/**
 * What an author writes.
 *
 * Identical in shape to `SkillScannerDeclaration`: `harnesses`, `subjectScope`
 * and `execution` are the same for every rule here and are filled in by
 * {@link skillPackagingRule}, and the legacy four-bucket `dimension` is derived
 * from `pillar` rather than authored a second time.
 */
export type SkillPackagingDeclaration =
  Omit<Rule<SkillPackagingContext>, 'check' | 'harnesses' | 'subjectScope' | 'execution' | 'pillar'
  | 'prose' | 'references'> & {
    readonly pillar: SkillDimension;
    readonly references: readonly ReferenceId[];
    readonly prose: RuleProse & { readonly fixSteps: readonly string[] };
  };

/** A rule, the options that publish it, and the legacy row derived from both. */
export interface SkillPackagingRuleEntry {
  readonly rule: Rule<SkillPackagingContext>;
  readonly options: SkillPackagingOptions;
  readonly definition: SkillRuleDefinition;
}

/**
 * One offending subject.
 *
 * `subjectRef` is omitted when the finding names neither a component nor a file,
 * which the scanner seam never had to handle: LIM-SIZE is about the bundle as a
 * whole and its finding carries no `resourcePath`. A reference with every field
 * undefined would claim an identity the finding does not have, and the evidence
 * contract asks for an unverifiable row to be reported as such rather than
 * silently trusted.
 */
function instanceFor(
  declared: Rule<SkillPackagingContext>,
  hit: GroundedSkillFinding,
): RuleInstance {
  const componentIdUnique = hit.componentIdUnique;
  const identified = Boolean(componentIdUnique ?? hit.resourcePath);
  return {
    subjectId: componentIdUnique,
    subject: hit.resourcePath,
    title: declared.title,
    detail: hit.fact,
    makerAction: declared.prose.fix,
    ...(identified
      ? { subjectRef: { id: componentIdUnique, schemaName: hit.resourcePath, quote: hit.evidence } }
      : {}),
  };
}

/**
 * The reduction every packaging rule shares.
 *
 * The same four-way ladder in the same order as the scanner seam, and for the
 * same reason: the detector is what decides a failure, and the population is
 * consulted only to tell the three non-failures apart.
 */
function packagingCheck(
  declared: Rule<SkillPackagingContext>,
  options: SkillPackagingOptions,
  ctx: SkillPackagingContext,
) {
  const hits = ctx.findingsByRule.get(declared.id) ?? [];
  if (hits.length > 0) {
    return failWith(hits.map(hit => instanceFor(declared, hit)));
  }

  const state = options.population.resolve(ctx);
  switch (state.kind) {
    case 'absent': return notApplicable(state.because);
    case 'unreadable': return couldNotRun(state.because);
    default: return pass(state.detail);
  }
}

function definitionFor(
  declared: Rule<SkillPackagingContext>,
  options: SkillPackagingOptions,
  pillar: SkillDimension,
): SkillRuleDefinition {
  return {
    ruleId: declared.id,
    // The legacy title is a failure headline. A rule that titles itself
    // positively says so in `failTitle`; the published row still gets the
    // headline, byte for byte.
    title: declared.prose.failTitle ?? declared.title,
    why: declared.prose.why,
    recommendation: declared.prose.fix,
    fixSteps: (declared.prose.fixSteps ?? []).map((action, index) => ({
      order: index + 1, action,
    })),
    referenceIds: [...declared.references] as ReferenceId[],
    severity: options.severity,
    confidence: options.confidence,
    family: options.family,
    dimension: options.legacyDimension ?? SKILL_DIMENSION_BUCKET[pillar],
  };
}

/**
 * Declares one packaging rule.
 *
 * The closure refers to the rule it is being attached to, which is safe because
 * `check` is only ever called after construction returns.
 */
export function skillPackagingRule(
  declaration: SkillPackagingDeclaration, options: SkillPackagingOptions,
): SkillPackagingRuleEntry {
  const declared: Rule<SkillPackagingContext> = {
    ...declaration,
    harnesses: ['standalone-skill'],
    subjectScope: 'skill',
    execution: 'deterministic',
    check: ctx => packagingCheck(declared, options, ctx),
  };
  return Object.freeze({
    rule: rule(declared),
    options,
    definition: Object.freeze(definitionFor(declared, options, declaration.pillar)),
  });
}

// ── Shared bundle readers ──────────────────────────────────────────────────

/**
 * How far the manifest could be read.
 *
 * Every manifest-field rule needs the same ladder, and each step of it belongs
 * to a different rule: a missing file is PKG-REQ's failure, a missing or broken
 * frontmatter block is PKG-FM's, and a missing key is PKG-REQ's again. A field
 * rule stopping at any of them is reporting that someone else's failure already
 * answered the question — not that this skill passed.
 *
 * `parseFrontmatter` and `readString` are the detector's own, imported rather
 * than reimplemented. A second YAML reader here could disagree with the one that
 * produced the finding the maker is reading, which is the same hazard the
 * scanner seam avoids by not re-running its regexes.
 */
type ManifestStatus = 'missing' | 'unreadable' | 'no-frontmatter' | 'unparsable' | 'read';

interface SkillManifest {
  readonly status: ManifestStatus;
  readonly path: string;
  readonly data: Record<string, unknown>;
}

function readManifest(artifact: UploadedArtifact): SkillManifest {
  const file = findFile(artifact, 'SKILL.md');
  if (!file) return { status: 'missing', path: 'SKILL.md', data: {} };

  const path = stripRoot(file.path, artifact.rootFolderName);
  if (file.isBinary || typeof file.text !== 'string') {
    return { status: 'unreadable', path, data: {} };
  }

  const frontmatter = parseFrontmatter(file.text);
  if (!frontmatter.present) return { status: 'no-frontmatter', path, data: {} };
  if (frontmatter.parseError) return { status: 'unparsable', path, data: {} };
  return { status: 'read', path, data: frontmatter.data };
}

/**
 * SKILL.md as text, which is a different question from SKILL.md as a manifest.
 *
 * PKG-LINK scans the whole file and does not care whether the frontmatter
 * parsed, so the manifest ladder above would answer it wrongly: a skill with a
 * broken frontmatter block still promises files in its body, and the detector
 * still checks them. The one state that stops it is the one mirrored here —
 * `evaluateHygiene` bails on a falsy `markdown`, so a binary file and an empty
 * one are the same "nothing to scan", and neither is a pass.
 */
interface SkillMarkdown {
  readonly status: 'missing' | 'unreadable' | 'read';
  readonly path: string;
}

function readSkillMarkdown(artifact: UploadedArtifact): SkillMarkdown {
  const file = findFile(artifact, 'SKILL.md');
  if (!file) return { status: 'missing', path: 'SKILL.md' };

  const path = stripRoot(file.path, artifact.rootFolderName);
  if (typeof file.text !== 'string' || file.text.length === 0) {
    return { status: 'unreadable', path };
  }
  return { status: 'read', path };
}

/** The last segment of the archive's single top-level folder, as PKG-NAME's detector reads it. */
function containingFolderName(artifact: UploadedArtifact): string | undefined {
  const parts = artifact.rootFolderName?.split(/[\\/]/).filter(Boolean);
  return parts?.[parts.length - 1];
}

/** Everything alongside SKILL.md, which is what the Cowork budgets are measured over. */
function companionFiles(artifact: UploadedArtifact): UploadedFile[] {
  return artifact.files.filter(
    file => stripRoot(file.path, artifact.rootFolderName).toLowerCase() !== 'skill.md',
  );
}

// ── Populations ────────────────────────────────────────────────────────────

/**
 * The frontmatter block PKG-FM is about, which is every bundle that claims to be a skill.
 *
 * A presence rule's population is never absent. If it were, the bundle that is
 * missing the very thing the rule insists on would leave the numerator and the
 * denominator together, and a skill with nothing to register would score exactly
 * like one that registers cleanly. So the two states that look absent are
 * answered deliberately: a SKILL.md that could not be decoded is an input
 * failure (nothing was read, so nothing can be claimed either way), and a bundle
 * with no SKILL.md at all is still populated — PKG-REQ owns that absence and
 * carries its penalty, and this rule simply has nothing further to add.
 */
export const SKILL_MD_FRONTMATTER: SkillPackagingPopulation = Object.freeze({
  label: 'the SKILL.md frontmatter block',
  resolve: (ctx: SkillPackagingContext) => {
    const manifest = readManifest(ctx.artifact);
    switch (manifest.status) {
      case 'unreadable':
        return unreadablePopulation(
          `"${manifest.path}" is binary or failed to decode, so it could not be examined for a `
          + 'frontmatter block.',
        );
      case 'missing':
        return populated(
          'This bundle contains no SKILL.md, so there is no frontmatter block for the runtime to '
          + 'register from. The missing manifest itself is reported by PKG-REQ.',
        );
      case 'no-frontmatter':
      case 'unparsable':
        // Unreachable in practice: the detector raises this rule in both states
        // and a finding is decided before the population is consulted. Stated
        // anyway, because answering "absent" here is exactly the mistake that
        // would excuse a skill from the rule it has just broken.
        return populated(
          `"${manifest.path}" carries no frontmatter block this rule could read, which is its own `
          + 'failure rather than an absent population.',
        );
      default:
        return populated(
          `"${manifest.path}" opens with a YAML frontmatter block that parsed.`,
        );
    }
  },
});

/**
 * The required frontmatter fields, which every bundle is asked for.
 *
 * Presence rule, same reasoning as PKG-FM: a missing SKILL.md is this rule's
 * failure, not its exemption. The separable case is a manifest that is present
 * but whose frontmatter could not be read — then the fields were never looked
 * for, which is could-not-run rather than a verdict. That leaves no score hole,
 * because PKG-FM fails on exactly those states and carries the penalty.
 */
export const REQUIRED_FRONTMATTER_FIELDS: SkillPackagingPopulation = Object.freeze({
  label: 'the required SKILL.md frontmatter fields',
  resolve: (ctx: SkillPackagingContext) => {
    const manifest = readManifest(ctx.artifact);
    switch (manifest.status) {
      case 'unreadable':
        return unreadablePopulation(
          `"${manifest.path}" is binary or failed to decode, so neither required field could be `
          + 'looked for.',
        );
      case 'no-frontmatter':
      case 'unparsable':
        return unreadablePopulation(
          `"${manifest.path}" carries no frontmatter block this rule could read, so neither `
          + 'required field could be looked for. The block itself is reported by PKG-FM.',
        );
      case 'missing':
        // Unreachable: the detector raises this rule when SKILL.md is absent.
        // Populated regardless — a bundle with no manifest has declared neither
        // required field, and that is the failure rather than an exemption.
        return populated(
          'This bundle contains no SKILL.md, so neither required field is declared anywhere.',
        );
      default:
        return populated(
          `The frontmatter of "${manifest.path}" was read for both required fields: name and `
          + 'description.',
        );
    }
  },
});

/**
 * The declared skill name, and the folder it has to agree with.
 *
 * Both operands are required, and the second is the one that is quietly absent
 * most often: an archive with no single top-level folder gives the detector
 * nothing to compare against, so it never fires. Reading that silence as a pass
 * would credit the skill for a comparison that was never made.
 */
export const DECLARED_SKILL_NAME: SkillPackagingPopulation = Object.freeze({
  label: 'declared skill name',
  resolve: (ctx: SkillPackagingContext) => {
    const manifest = readManifest(ctx.artifact);
    switch (manifest.status) {
      case 'missing':
        return noPopulation(
          'This bundle contains no SKILL.md, so it declares no name to compare against its '
          + 'folder. The missing file is reported by PKG-REQ.',
        );
      case 'unreadable':
        return unreadablePopulation(
          `"${manifest.path}" is binary or failed to decode, so its frontmatter could not be read.`,
        );
      case 'no-frontmatter':
        return noPopulation(
          'SKILL.md begins with no frontmatter block, so it declares no name to compare against '
          + 'its folder. The missing block is reported by PKG-FM.',
        );
      case 'unparsable':
        return noPopulation(
          'The SKILL.md frontmatter could not be parsed, so no name could be read from it. The '
          + 'unparsable block is reported by PKG-FM.',
        );
      default:
        break;
    }

    const name = readString(manifest.data, 'name');
    if (!name) {
      return noPopulation(
        'The SKILL.md frontmatter declares no name field, so there is nothing to compare against '
        + 'the folder. The missing field is reported by PKG-REQ.',
      );
    }

    const folder = containingFolderName(ctx.artifact);
    if (!folder) {
      return noPopulation(
        'This archive has no single top-level folder, so the declared name has no containing '
        + 'folder name to be compared against.',
      );
    }

    return populated(
      `The declared name "${name}" was compared against the containing folder "${folder}".`,
    );
  },
});

/**
 * The declared name, judged against the naming contracts the selected runtimes publish.
 *
 * This is a property rule twice over, so it has two separate ways of being
 * absent. The declared name can be missing — then there is no identifier to
 * judge, and PKG-REQ or PKG-FM owns whatever made it missing. Or the contract
 * can be missing: the detector only fires for a runtime whose catalogue
 * publishes a `namePattern`, and Scout publishes none. Reviewing a Scout-only
 * bundle and calling the name "well-formed" would be inventing a rule the
 * runtime never stated.
 */
export const NAME_AGAINST_RUNTIME_PATTERN: SkillPackagingPopulation = Object.freeze({
  label: 'declared skill name, under the published runtime name patterns',
  resolve: (ctx: SkillPackagingContext) => {
    const constraining = ctx.runtimes.filter(runtime => resolveCatalogue(runtime).namePattern);
    if (constraining.length === 0) {
      return noPopulation(
        'None of the selected runtimes publishes a skill-name pattern, so there is no naming '
        + 'contract for the declared name to be judged against.',
      );
    }

    const manifest = readManifest(ctx.artifact);
    switch (manifest.status) {
      case 'missing':
        return noPopulation(
          'This bundle contains no SKILL.md, so it declares no name to check. The missing file '
          + 'is reported by PKG-REQ.',
        );
      case 'unreadable':
        return unreadablePopulation(
          `"${manifest.path}" is binary or failed to decode, so its frontmatter could not be read.`,
        );
      case 'no-frontmatter':
        return noPopulation(
          'SKILL.md begins with no frontmatter block, so it declares no name to check. The '
          + 'missing block is reported by PKG-FM.',
        );
      case 'unparsable':
        return noPopulation(
          'The SKILL.md frontmatter could not be parsed, so no name could be read from it. The '
          + 'unparsable block is reported by PKG-FM.',
        );
      default:
        break;
    }

    const name = readString(manifest.data, 'name');
    if (!name) {
      return noPopulation(
        'The SKILL.md frontmatter declares no name field, so there is no identifier to check '
        + 'against the runtime patterns. The missing field is reported by PKG-REQ.',
      );
    }

    const labels = constraining.map(runtime => RUNTIME_LABELS[runtime]).join(', ');
    return populated(
      `The declared name "${name}" was checked against the name pattern published by ${labels}.`,
    );
  },
});

/**
 * Every path in the archive, which is the one thing an upload always has.
 *
 * Hygiene is asked of all bundles equally — no runtime gate, no dependency on
 * SKILL.md — so this rule is never not-applicable. A bundle that ships no
 * editor folders or dependency directories has genuinely passed, which is why
 * the empty result is a pass and not an absence. The only thing that stops the
 * question being answerable is an archive that yielded no file table at all.
 */
export const ARCHIVE_FILE_TABLE: SkillPackagingPopulation = Object.freeze({
  label: 'the archived file paths',
  resolve: (ctx: SkillPackagingContext) => {
    if (ctx.artifact.files.length === 0) {
      return unreadablePopulation(
        'This archive produced no file list, so nothing could be examined for development '
        + 'artefacts.',
      );
    }
    return populated(
      `${ctx.artifact.files.length} archived path(s) were checked for editor folders, dependency `
      + 'directories, build output and OS metadata.',
    );
  },
});

/**
 * The body of SKILL.md, which is where the promises of bundled files are made.
 *
 * The population is the prose, not the set of references found in it: a skill
 * whose instructions reference nothing has made no broken promise, and that is
 * a pass rather than an absence. Note that this deliberately does not use the
 * manifest ladder — a skill with a broken frontmatter block still has a body,
 * and `evaluateHygiene` still scans it. The single thing that stops the scan is
 * the detector's own `if (!markdown)` guard, mirrored here: a SKILL.md that is
 * binary or empty yields no text, and nothing was checked.
 */
export const SKILL_MD_FILE_REFERENCES: SkillPackagingPopulation = Object.freeze({
  label: 'the bundled files SKILL.md promises',
  resolve: (ctx: SkillPackagingContext) => {
    const markdown = readSkillMarkdown(ctx.artifact);
    switch (markdown.status) {
      case 'missing':
        return noPopulation(
          'This bundle contains no SKILL.md, so there are no instructions in it to promise a '
          + 'bundled file. The missing file is reported by PKG-REQ.',
        );
      case 'unreadable':
        return unreadablePopulation(
          `"${markdown.path}" produced no readable text, so the files it references could not be `
          + 'resolved.',
        );
      default:
        return populated(
          `The file references in "${markdown.path}" were resolved against the `
          + `${ctx.artifact.files.length} path(s) in the archive.`,
        );
    }
  },
});

/**
 * The files alongside SKILL.md, when Cowork is one of the selected runtimes.
 *
 * The runtime gate is the applicability, and it is the only one: a bundle with
 * no companion files has not escaped the budget, it has comfortably met it, so
 * that is a pass. An archive that produced no file table at all is a different
 * matter — nothing was measured, and a budget cannot be cleared by a measurement
 * that did not happen.
 */
export const COWORK_COMPANION_FILES: SkillPackagingPopulation = Object.freeze({
  label: 'Copilot Cowork companion files',
  resolve: (ctx: SkillPackagingContext) => {
    if (!ctx.runtimes.includes('cowork')) {
      return noPopulation(
        'Copilot Cowork is not among the selected runtimes, and the 10 MB companion budget is a '
        + 'Cowork upload contract rather than a limit the other runtimes publish.',
      );
    }
    if (ctx.artifact.files.length === 0) {
      return unreadablePopulation(
        'This archive produced no file list, so the size of the companion files could not be '
        + 'measured.',
      );
    }
    const companions = companionFiles(ctx.artifact);
    const total = companions.reduce((sum, file) => sum + file.bytes, 0);
    return populated(
      `${companions.length} companion file(s) totalling ${total} byte(s) were measured against `
      + "Copilot Cowork's 10 MB budget.",
    );
  },
});

/**
 * The same companion files, counted rather than weighed.
 *
 * Declared separately from the 10 MB population because the budget it answers
 * to is different, and the detail sentence has to name the budget it measured
 * against or the reader cannot tell which of the three Cowork limits was
 * checked. Applicability is the Cowork gate and nothing else: nineteen files is
 * a pass, zero files is a pass.
 */
export const COWORK_COMPANION_FILE_COUNT: SkillPackagingPopulation = Object.freeze({
  label: 'Copilot Cowork companion-file count',
  resolve: (ctx: SkillPackagingContext) => {
    if (!ctx.runtimes.includes('cowork')) {
      return noPopulation(
        'Copilot Cowork is not among the selected runtimes, and the 20-file companion budget is '
        + 'a Cowork upload contract rather than a limit the other runtimes publish.',
      );
    }
    if (ctx.artifact.files.length === 0) {
      return unreadablePopulation(
        'This archive produced no file list, so the companion files could not be counted.',
      );
    }
    const companions = companionFiles(ctx.artifact);
    return populated(
      `${companions.length} companion file(s) were counted against Copilot Cowork's 20-file `
      + 'budget.',
    );
  },
});

/**
 * The companion files measured one at a time, against the per-file ceiling.
 *
 * The 10 MB budget is a sum and this one is a maximum, so a bundle can clear
 * either while breaking the other. Same applicability as its siblings: the
 * Cowork gate, and an archive with no file table is could-not-run rather than
 * a clean sheet.
 */
export const COWORK_COMPANION_FILE_SIZES: SkillPackagingPopulation = Object.freeze({
  label: 'Copilot Cowork companion files, measured individually',
  resolve: (ctx: SkillPackagingContext) => {
    if (!ctx.runtimes.includes('cowork')) {
      return noPopulation(
        'Copilot Cowork is not among the selected runtimes, and the 5 MB per-file budget is a '
        + 'Cowork upload contract rather than a limit the other runtimes publish.',
      );
    }
    if (ctx.artifact.files.length === 0) {
      return unreadablePopulation(
        'This archive produced no file list, so no companion file could be measured.',
      );
    }
    const companions = companionFiles(ctx.artifact);
    const largest = companions.reduce((max, file) => Math.max(max, file.bytes), 0);
    return populated(
      `${companions.length} companion file(s) were measured individually against Copilot `
      + `Cowork's 5 MB per-file budget; the largest is ${largest} byte(s).`,
    );
  },
});

/**
 * The declared description, when Cowork is selected and a description exists.
 *
 * Two gates, and they are different in kind. The Cowork gate is a contract
 * question — no other runtime publishes a 1024-character ceiling, so there is
 * no limit for the text to exceed. The description gate is a property question:
 * a skill that declares no description has not written an over-long one, and
 * the missing field is PKG-REQ's finding to make, not this one's.
 */
export const COWORK_SKILL_DESCRIPTION: SkillPackagingPopulation = Object.freeze({
  label: 'the declared skill description, under Copilot Cowork',
  resolve: (ctx: SkillPackagingContext) => {
    if (!ctx.runtimes.includes('cowork')) {
      return noPopulation(
        'Copilot Cowork is not among the selected runtimes, and the 1024-character description '
        + 'ceiling is a Cowork upload contract rather than a limit the other runtimes publish.',
      );
    }

    const manifest = readManifest(ctx.artifact);
    switch (manifest.status) {
      case 'missing':
        return noPopulation(
          'This bundle contains no SKILL.md, so it declares no description to measure. The '
          + 'missing file is reported by PKG-REQ.',
        );
      case 'unreadable':
        return unreadablePopulation(
          `"${manifest.path}" is binary or failed to decode, so its frontmatter could not be read.`,
        );
      case 'no-frontmatter':
        return noPopulation(
          'SKILL.md begins with no frontmatter block, so it declares no description to measure. '
          + 'The missing block is reported by PKG-FM.',
        );
      case 'unparsable':
        return noPopulation(
          'The SKILL.md frontmatter could not be parsed, so no description could be read from '
          + 'it. The unparsable block is reported by PKG-FM.',
        );
      default:
        break;
    }

    const description = readString(manifest.data, 'description');
    if (!description) {
      return noPopulation(
        'The SKILL.md frontmatter declares no description field, so there is no text to measure '
        + 'against the ceiling. The missing field is reported by PKG-REQ.',
      );
    }

    return populated(
      `The declared description is ${description.length} character(s), measured against Copilot `
      + "Cowork's 1024-character ceiling.",
    );
  },
});

// ── Packaging rules ────────────────────────────────────────────────────────

export const PKG_FM_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'critical', confidence: 'high', family: PACKAGING_RULE_FAMILY,
  population: SKILL_MD_FRONTMATTER,
});

export const PKG_FM: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'PKG-FM',
  title: 'SKILL.md Has No Readable YAML Frontmatter',
  pillar: 'packaging-quality',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-skill-design-checklist', 'ms-skills-create'],
  prose: {
    question: 'Does SKILL.md open with a YAML frontmatter block the runtime can parse?',
    summary: 'Read the opening of SKILL.md and parse the --- delimited block the loader registers the skill from.',
    why: "The runtime reads the skill's name and trigger description from the frontmatter block. Without a readable block there is nothing to register, so the skill never loads.",
    fix: 'Add a YAML frontmatter block delimited by --- as the very first lines of SKILL.md.',
    fixSteps: [
      'Put a line containing only --- as the first line of the file.',
      'Add the name and description keys, then close the block with another --- line.',
      'Use spaces for indentation. A tab anywhere in the block makes the YAML unparseable.',
    ],
    passWhen: [
      'SKILL.md begins with a --- delimited block and that block parses as YAML.',
    ],
    failWhen: [
      'SKILL.md does not begin with a frontmatter block, or the block is present but the YAML cannot be parsed.',
      'The bundle ships no SKILL.md at all, so there is no block for the runtime to register from.',
    ],
    notApplicableWhen: [
      'Never. This is a presence rule: every bundle claiming to be a skill is asked it, and a bundle with no readable frontmatter is the failure the rule exists to report rather than one it has nothing to say about.',
    ],
  },
  evidence: { fieldPaths: ['SKILL.md:frontmatter'] },
}, PKG_FM_OPTIONS);

export const PKG_REQ_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'critical', confidence: 'high', family: PACKAGING_RULE_FAMILY,
  population: REQUIRED_FRONTMATTER_FIELDS,
});

export const PKG_REQ: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'PKG-REQ',
  title: 'Required Frontmatter Field Is Missing',
  pillar: 'packaging-quality',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-skill-design-checklist', 'ms-skills-create'],
  prose: {
    question: 'Does the frontmatter declare both required fields, name and description?',
    summary: 'Look for a name and a description in the SKILL.md frontmatter, and for SKILL.md itself.',
    why: "Name and description are both required. The name is how the skill is addressed, and the description is the only text the model sees when deciding whether to invoke it — a missing description means the skill is installed but never chosen.",
    fix: 'Add every required frontmatter field.',
    fixSteps: [
      "Add a name field holding the skill's identifier.",
      'Add a description field that states what the skill does and when it should be used.',
    ],
    passWhen: [
      'The frontmatter declares a non-empty name and a non-empty description.',
    ],
    failWhen: [
      'Either required field is absent or empty.',
      'The bundle ships no SKILL.md, so neither field is declared anywhere.',
    ],
    notApplicableWhen: [
      'Never. This is a presence rule, and a bundle with no manifest is precisely what it reports — treating that as an absent population would let a skill with no SKILL.md score like one that is complete.',
    ],
  },
  evidence: { fieldPaths: ['SKILL.md:frontmatter.name', 'SKILL.md:frontmatter.description'] },
}, PKG_REQ_OPTIONS);

export const PKG_NAME_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'high', confidence: 'high', family: PACKAGING_RULE_FAMILY,
  population: DECLARED_SKILL_NAME,
});

export const PKG_NAME: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'PKG-NAME',
  title: 'Frontmatter Name Does Not Match the Folder Name',
  pillar: 'packaging-quality',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-skill-design-checklist'],
  prose: {
    question: 'Does the name declared in SKILL.md match the folder that contains it?',
    summary: "Compare the frontmatter name against the last segment of the archive's top-level folder.",
    why: "The loader resolves a skill's bundled files relative to its folder. When the declared name and the folder disagree, the skill loads but its scripts and references resolve to nothing.",
    fix: 'Make the frontmatter name and the containing folder name identical.',
    fixSteps: [
      'Decide which of the two names is correct.',
      'Rename the other one to match it exactly, including case and hyphens.',
    ],
    passWhen: [
      'The frontmatter declares a name, the archive has a single top-level folder, and the two strings are identical.',
    ],
    failWhen: [
      'The frontmatter name and the containing folder name differ in any character, including case.',
    ],
    notApplicableWhen: [
      'The bundle has no SKILL.md, no frontmatter block, or no name field — each of those is reported by the rule that owns it, and none of them leaves a name to compare.',
      'The archive has no single top-level folder, so the declared name has nothing to be compared against.',
    ],
  },
  evidence: { fieldPaths: ['artifact.rootFolderName', 'SKILL.md:frontmatter.name'] },
}, PKG_NAME_OPTIONS);

export const PKG_SLUG_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'high', confidence: 'high', family: PACKAGING_RULE_FAMILY,
  population: NAME_AGAINST_RUNTIME_PATTERN,
});

export const PKG_SLUG: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'PKG-SLUG',
  title: 'Skill Name Uses Characters the Runtime Rejects',
  pillar: 'packaging-quality',
  severity: 'high',
  tags: ['quality'],
  references: ['agent-skills-spec', 'ms-skill-design-checklist', 'ms-skills-create'],
  prose: {
    question: 'Does the declared name satisfy the name pattern every selected runtime publishes?',
    summary: 'Test the frontmatter name against the name pattern in each selected runtime catalogue.',
    why: 'Skill names are identifiers. The Agent Skills contract rejects uppercase or punctuation, leading or trailing hyphens, and consecutive hyphens.',
    fix: 'Rewrite the name as kebab-case with single internal hyphens.',
    fixSteps: [
      'Convert the name to lower case.',
      'Replace spaces, underscores and punctuation with single hyphens.',
      'Rename the containing folder to match the corrected name.',
    ],
    passWhen: [
      'The declared name matches the name pattern of every selected runtime that publishes one.',
    ],
    failWhen: [
      'The name carries uppercase letters, spaces, underscores or punctuation.',
      'The name starts or ends with a hyphen, or contains two hyphens in a row.',
    ],
    notApplicableWhen: [
      'No selected runtime publishes a name pattern, so there is no naming contract to judge the name against.',
      'The bundle declares no name — through a missing SKILL.md, a missing frontmatter block, or a missing name field — each reported by the rule that owns it.',
    ],
  },
  evidence: { fieldPaths: ['SKILL.md:frontmatter.name', 'artifact.selectedRuntimes'] },
}, PKG_SLUG_OPTIONS);

export const PKG_NOISE_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'low', confidence: 'high', family: PACKAGING_RULE_FAMILY,
  population: ARCHIVE_FILE_TABLE,
});

export const PKG_NOISE: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'PKG-NOISE',
  title: 'Bundle Ships Development Artefacts',
  pillar: 'packaging-quality',
  severity: 'info',
  tags: ['quality', 'security'],
  references: ['ms-skill-design-checklist', 'owasp-secrets-management'],
  prose: {
    question: 'Is the bundle free of editor folders, dependency directories and OS metadata?',
    summary: 'Match every archived path against the known development-artefact patterns.',
    why: 'Editor folders, dependency directories and OS metadata inflate the package and can leak local paths or credentials that were never meant to be shared.',
    fix: 'Remove development artefacts before packaging.',
    fixSteps: [
      'Delete the listed files and folders from the bundle.',
      'Add them to your ignore file so the next package excludes them automatically.',
    ],
    passWhen: [
      'No archived path matches a development-artefact pattern.',
    ],
    failWhen: [
      'The bundle ships an editor folder, a dependency directory, build output or OS metadata.',
    ],
    notApplicableWhen: [
      'Never. Every bundle is asked this, and shipping no development artefacts is a pass rather than an absence.',
    ],
  },
  evidence: { fieldPaths: ['artifact.files[].path'] },
}, PKG_NOISE_OPTIONS);

export const PKG_LINK_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'high', confidence: 'high', family: PACKAGING_RULE_FAMILY,
  population: SKILL_MD_FILE_REFERENCES,
});

export const PKG_LINK: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'PKG-LINK',
  title: 'SKILL.md References a File That Is Not in the Bundle',
  pillar: 'packaging-quality',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-skill-design-checklist'],
  prose: {
    question: 'Does every file SKILL.md tells the model to read actually ship in the bundle?',
    summary: 'Resolve each file path referenced in the SKILL.md body against the archived paths.',
    why: 'The instruction tells the model to read a file that does not exist. At run time the read fails and the skill continues without the information it was told to rely on.',
    fix: 'Add the missing file, or correct the reference.',
    fixSteps: [
      'Check the referenced path against the files actually in the bundle.',
      'Add the missing file, or correct the path in SKILL.md.',
    ],
    passWhen: [
      'Every file path referenced in SKILL.md resolves to a file in the archive.',
      'SKILL.md references no bundled file at all, so it has made no promise it cannot keep.',
    ],
    failWhen: [
      'SKILL.md references a path that is not present in the archive.',
    ],
    notApplicableWhen: [
      'The bundle has no SKILL.md, so nothing in it promises a bundled file. The missing manifest is reported by PKG-REQ.',
    ],
  },
  evidence: { fieldPaths: ['SKILL.md:body', 'artifact.files[].path'] },
}, PKG_LINK_OPTIONS);

// ── Size-limit rules ───────────────────────────────────────────────────────

export const LIM_SIZE_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'critical', confidence: 'high', family: PACKAGING_RULE_FAMILY,
  population: COWORK_COMPANION_FILES,
});

export const LIM_SIZE: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'LIM-SIZE',
  title: 'Cowork Companion Files Exceed 10 MB',
  pillar: 'packaging-quality',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-skill-design-checklist'],
  prose: {
    question: 'Do the files alongside SKILL.md stay inside the 10 MB Copilot Cowork budget?',
    summary: 'Total the uncompressed size of every bundled file except SKILL.md and compare it against the Cowork companion limit.',
    why: 'Copilot Cowork rejects a skill when the files alongside SKILL.md total more than 10 MB.',
    fix: 'Reduce the total size of the Cowork companion files.',
    fixSteps: [
      'Remove large binaries, sample data and images that the skill does not need at run time.',
      'Fetch large reference material at run time instead of bundling it.',
    ],
    passWhen: [
      'Copilot Cowork is a selected runtime and the companion files total 10 MB or less.',
      'The skill ships no companion files at all, which is comfortably inside the budget.',
    ],
    failWhen: [
      'The files alongside SKILL.md total more than 10 MB, which Copilot Cowork rejects at upload.',
    ],
    notApplicableWhen: [
      'Copilot Cowork is not among the selected runtimes; the 10 MB companion budget is a Cowork upload contract and no other runtime publishes it.',
    ],
  },
  evidence: { fieldPaths: ['artifact.files[].bytes', 'artifact.files[].path'] },
}, LIM_SIZE_OPTIONS);

export const LIM_FILES_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'high', confidence: 'high', family: PACKAGING_RULE_FAMILY,
  population: COWORK_COMPANION_FILE_COUNT,
});

export const LIM_FILES: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'LIM-FILES',
  title: 'Cowork Skill Has More Than 20 Companion Files',
  pillar: 'packaging-quality',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-skill-design-checklist'],
  prose: {
    question: 'Does the skill ship 20 or fewer files alongside SKILL.md?',
    summary: 'Count every bundled file except SKILL.md and compare the count against the Cowork companion limit.',
    why: 'Copilot Cowork accepts at most 20 files alongside SKILL.md. SKILL.md itself is not part of that count.',
    fix: 'Reduce the Cowork companion-file count to 20 or fewer.',
    fixSteps: [
      'Merge related reference files into a single document.',
      'Delete files the skill never reads.',
    ],
    passWhen: [
      'Copilot Cowork is a selected runtime and the bundle ships 20 or fewer companion files.',
      'The skill ships no companion files at all, which is inside the limit rather than outside the question.',
    ],
    failWhen: [
      'More than 20 files ship alongside SKILL.md, which Copilot Cowork rejects at upload.',
    ],
    notApplicableWhen: [
      'Copilot Cowork is not among the selected runtimes; the 20-file companion budget is a Cowork upload contract and no other runtime publishes it.',
    ],
  },
  evidence: { fieldPaths: ['artifact.files[].path'] },
}, LIM_FILES_OPTIONS);

export const LIM_FILESIZE_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'medium', confidence: 'high', family: PACKAGING_RULE_FAMILY,
  population: COWORK_COMPANION_FILE_SIZES,
});

export const LIM_FILESIZE: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'LIM-FILESIZE',
  title: 'Cowork Companion File Exceeds 5 MB',
  pillar: 'packaging-quality',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skill-design-checklist'],
  prose: {
    question: 'Does every individual companion file stay inside the 5 MB Copilot Cowork ceiling?',
    summary: 'Measure each bundled file except SKILL.md on its own against the Cowork per-file limit.',
    why: 'Copilot Cowork rejects a companion file larger than 5 MB.',
    fix: 'Split the file, or trim it to what the skill actually needs.',
    fixSteps: [
      'Split the file into focused sections the skill can read individually.',
      'Reference the specific section from SKILL.md rather than the whole document.',
    ],
    passWhen: [
      'Copilot Cowork is a selected runtime and no single companion file exceeds 5 MB.',
      'The skill ships no companion files at all, so none of them is over the ceiling.',
    ],
    failWhen: [
      'Any one file alongside SKILL.md is larger than 5 MB, even when the bundle total is inside the 10 MB budget.',
    ],
    notApplicableWhen: [
      'Copilot Cowork is not among the selected runtimes; the 5 MB per-file ceiling is a Cowork upload contract and no other runtime publishes it.',
    ],
  },
  evidence: { fieldPaths: ['artifact.files[].bytes', 'artifact.files[].path'] },
}, LIM_FILESIZE_OPTIONS);

export const LIM_DESC_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'medium', confidence: 'high', family: PACKAGING_RULE_FAMILY,
  population: COWORK_SKILL_DESCRIPTION,
  // DIVERGENCE: `packaging-quality` buckets to 'integrity', but the legacy row
  // for LIM-DESC publishes 'quality'. The two axes genuinely disagree here, so
  // the legacy value is overlaid on the published row and `pillar` is left
  // telling the truth. An earlier draft instead declared `pillar:
  // 'trigger-clarity'` because its bucket happens to be 'quality' — that
  // reproduced the row correctly but moved the rule to a different pillar,
  // which would have become a silent score change the moment Phase 3 scores
  // from the registry.
  legacyDimension: 'quality',
});

export const LIM_DESC: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'LIM-DESC',
  title: 'Cowork Skill Description Exceeds 1024 Characters',
  pillar: 'packaging-quality',
  severity: 'medium',
  tags: ['quality'],
  references: ['agent-skills-spec', 'ms-skill-design-checklist'],
  prose: {
    question: 'Does the declared description stay inside the 1024-character Copilot Cowork ceiling?',
    summary: 'Measure the length of the frontmatter description against the Cowork description limit.',
    why: 'Copilot Cowork requires a non-empty skill description between 1 and 1024 characters.',
    fix: 'Shorten the description, moving the detail into the body.',
    fixSteps: [
      'Keep the opening sentence that states when to use the skill.',
      'Move the remaining detail into the body of SKILL.md.',
    ],
    passWhen: [
      'Copilot Cowork is a selected runtime and the declared description is 1024 characters or fewer.',
    ],
    failWhen: [
      'The declared description runs past 1024 characters, which Copilot Cowork rejects at upload.',
    ],
    notApplicableWhen: [
      'Copilot Cowork is not among the selected runtimes; the 1024-character ceiling is a Cowork upload contract and no other runtime publishes it.',
      'The frontmatter declares no description, so there is no text to measure. The missing field is reported by PKG-REQ.',
    ],
  },
  evidence: { fieldPaths: ['SKILL.md:frontmatter.description'] },
}, LIM_DESC_OPTIONS);

/**
 * Every packaging rule declared here, in published order.
 *
 * `skillRuleRegistry.ts` will spread {@link skillPackagingDefinitions} over the
 * rows still written out by hand, exactly as it already does for the scanner
 * rules, so a rule that moves here stops being authored twice without any
 * consumer of `RULE_REGISTRY` changing. That spread is the orchestrator's edit,
 * not this file's.
 */
export const skillPackagingRuleEntries: readonly SkillPackagingRuleEntry[] = Object.freeze([
  PKG_FM,
  PKG_REQ,
  PKG_NAME,
  PKG_SLUG,
  PKG_NOISE,
  PKG_LINK,
  LIM_SIZE,
  LIM_FILES,
  LIM_FILESIZE,
  LIM_DESC,
]);

export const skillPackagingCoreRules: readonly Rule<SkillPackagingContext>[] = Object.freeze(
  skillPackagingRuleEntries.map(entry => entry.rule),
);

export const skillPackagingDefinitions: Readonly<Record<string, SkillRuleDefinition>> =
  Object.freeze(
    Object.fromEntries(skillPackagingRuleEntries.map(entry => [entry.rule.id, entry.definition])),
  );
