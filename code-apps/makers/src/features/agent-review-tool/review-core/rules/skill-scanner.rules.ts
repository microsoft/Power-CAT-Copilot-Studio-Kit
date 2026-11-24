/**
 * The deterministic scanner rules over an uploaded skill's resources.
 *
 * These are the `standalone-skill` rules that used to live only as metadata in
 * `agents-experience/services/skill/skillRuleRegistry.ts`. That registry holds
 * no `check`: the detection lives in `resourceScanners.ts`, which matches a
 * pattern and calls `createRegisteredFinding` to merge the registry's prose into
 * a `GroundedSkillFinding`. A metadata-only rule is not registrable — the core
 * registry rejects `execution !== 'ai'` without a `check` — so this file applies
 * the same IMPL-12 move the Standard rules made: the declaration becomes the one
 * authority, and it is projected two ways. `rule` is the `RuleOutcome` shape the
 * core registry wants; `definition` is the legacy `SkillRuleDefinition` shape
 * `createRegisteredFinding` has always read. One authority, two shapes.
 *
 * Three things here look wrong and are not:
 *
 * - **The `check` does not scan anything.** It reads findings the scanner has
 *   already produced. That is the honest question a scanner rule answers — "did
 *   any resource trip this rule?" — and re-running the regexes here would create
 *   a second detector that could disagree with the one that produced the
 *   finding the maker is looking at. The scanner stays the detector; the rule
 *   reports its verdict. Because that reduction is identical for all of them,
 *   {@link skillScannerRule} generates it rather than asking 53 authors to
 *   retype it.
 * - **The four-way outcome is wider than pass/fail.** "No Python file tripped
 *   this" and "there is no Python file" and "the Python file would not decode"
 *   are three different answers, and only the first is a pass. The population
 *   selector is what separates them, and it mirrors `scanSkillResource`'s own
 *   gate exactly — binary or undecoded resources are skipped there, so claiming
 *   a pass for them here would report an unearned result.
 * - **`severity`, `confidence` and the legacy five-point scale ride on the
 *   options, not the rule.** `Rule.severity` has three values and cannot spell
 *   `critical`, and `confidence` folds into it on the new side but is still
 *   published on every finding. They are legacy vocabulary, so they are carried
 *   verbatim rather than derived from a value that cannot represent them.
 *   Everything that *can* be derived — title, why, fix, ordered steps,
 *   references, rubric bucket — is derived, so there is nothing to drift.
 */

import type {
  GroundedSkillFinding, SkillFindingSeverity, SkillRubricDimension,
} from '../../agents-experience/contracts/Findings';
import type { ReferenceId } from '../../agents-experience/contracts/references';
import type { SkillBundleResource } from '../../agents-experience/contracts/SkillBundle';
import { SKILL_DIMENSION_BUCKET, type SkillDimension } from '../pillars';
import {
  couldNotRun, failWith, notApplicable, pass, rule,
  type Rule, type RuleInstance, type RuleProse,
} from '../rule';

/** Every rule in this file reports under the one family the skill UI groups on. */
const SKILL_RULE_FAMILY = 'Skills';

/**
 * The legacy shape `createRegisteredFinding` reads.
 *
 * Declared here rather than in `skillRuleRegistry.ts` so the import direction is
 * one-way: the registry imports its definitions from the rules, and the rules
 * import nothing from the registry. The registry re-exports this type, so no
 * consumer sees a moved symbol.
 */
export interface SkillRuleDefinition {
  ruleId: string;
  title: string;
  why: string;
  recommendation: string;
  /** Ordered steps; first element is always { order: 1, action: "..." }. */
  fixSteps: Array<{ order: number; action: string }>;
  /** Approved reference IDs for this rule. First element is the primary compat ID. */
  referenceIds: ReferenceId[];
  severity: SkillFindingSeverity;
  /**
   * Confidence level for findings produced by this rule.
   * Use "high" for precise, deterministic patterns; "medium" for broad heuristics.
   */
  confidence: 'high' | 'medium' | 'low';
  family: string;
  /** Rubric dimension this rule's findings roll up into for grouped display. */
  dimension: SkillRubricDimension;
}

/**
 * What a scanner rule is asked about: the uploaded resources, and the findings
 * the scanner already drew from them.
 *
 * Findings arrive grouped by rule id because every rule in this file asks the
 * same question of them, and a flat list would make each of 53 checks re-filter
 * the whole set.
 */
export interface SkillResourceContext {
  /** Every resource considered for scanning, decoded or not. */
  readonly resources: readonly SkillBundleResource[];
  /** Scanner output, keyed by the rule that produced it. */
  readonly findingsByRule: ReadonlyMap<string, readonly GroundedSkillFinding[]>;
}

/** Groups raw scanner output into the shape a check reads. */
export function skillResourceContext(
  resources: readonly SkillBundleResource[],
  findings: readonly GroundedSkillFinding[],
): SkillResourceContext {
  const findingsByRule = new Map<string, GroundedSkillFinding[]>();
  for (const finding of findings) {
    const existing = findingsByRule.get(finding.ruleId);
    if (existing) existing.push(finding);
    else findingsByRule.set(finding.ruleId, [finding]);
  }
  return { resources, findingsByRule };
}

/**
 * The resources one rule's detector reads.
 *
 * A predicate rather than a language list because the 53 do not all select on
 * language — the packaging and shape families read the manifest and the skill
 * body. `label` is the noun the not-applicable and could-not-run sentences use,
 * so those stay readable without a second table of wording.
 */
export interface SkillScannerPopulation {
  readonly label: string;
  readonly selects: (resource: SkillBundleResource) => boolean;
}

function byLanguage(
  label: string, ...languages: readonly NonNullable<SkillBundleResource['language']>[]
): SkillScannerPopulation {
  const accepted = new Set<string>(languages);
  return { label, selects: resource => accepted.has(resource.language ?? '') };
}

/** The three populations `scanSkillResource` dispatches on. */
export const PYTHON_RESOURCES = byLanguage('Python resource', 'python');
export const HTML_RESOURCES = byLanguage('HTML resource', 'html');
export const MARKDOWN_RESOURCES = byLanguage('Markdown or text resource', 'markdown', 'text');

/** Mirrors the gate at the top of `scanSkillResource`: anything else was never read. */
function wasRead(resource: SkillBundleResource): boolean {
  return resource.decodeStatus === 'decoded' && !resource.isBinary && Boolean(resource.textContent);
}

/**
 * The published fields the new `Rule` vocabulary cannot carry, plus the
 * population the check needs.
 *
 * The first two are legacy scales kept verbatim. The third is the rule's
 * algorithm, which is why it sits beside them rather than on the rule.
 */
export interface SkillScannerOptions {
  /** Legacy five-point scale. `Rule.severity` has three values and cannot spell `critical`. */
  readonly severity: SkillFindingSeverity;
  /** Folded into `Rule.severity` on the new side, still published on every finding. */
  readonly confidence: 'high' | 'medium' | 'low';
  readonly population: SkillScannerPopulation;
}

/**
 * What an author writes.
 *
 * `harnesses`, `subjectScope` and `execution` are the same for all 53 and are
 * filled in by {@link skillScannerRule}, so they are not a per-rule decision
 * that could be got wrong. `pillar` narrows to the six published skill rubric
 * dimensions because that is the only vocabulary a `standalone-skill` rule may
 * score on, and the legacy four-bucket `dimension` is derived from it rather
 * than authored a second time. `fixSteps` and `references` are required and
 * typed, so a rule cannot reach the registry without steps or with a citation
 * that does not resolve.
 */
export type SkillScannerDeclaration =
  Omit<Rule<SkillResourceContext>, 'check' | 'harnesses' | 'subjectScope' | 'execution' | 'pillar'
  | 'prose' | 'references'> & {
    readonly pillar: SkillDimension;
    readonly references: readonly ReferenceId[];
    readonly prose: RuleProse & { readonly fixSteps: readonly string[] };
  };

/** A rule, the options that publish it, and the legacy row derived from both. */
export interface SkillScannerRuleEntry {
  readonly rule: Rule<SkillResourceContext>;
  readonly options: SkillScannerOptions;
  readonly definition: SkillRuleDefinition;
}

function instanceFor(
  declared: Rule<SkillResourceContext>,
  ctx: SkillResourceContext,
  hit: GroundedSkillFinding,
): RuleInstance {
  const resource = ctx.resources.find(candidate => candidate.originalPath === hit.resourcePath);
  const componentIdUnique = hit.componentIdUnique ?? resource?.componentIdUnique;
  return {
    subjectId: componentIdUnique,
    subject: hit.resourcePath,
    title: declared.title,
    detail: hit.fact,
    makerAction: declared.prose.fix,
    subjectRef: { id: componentIdUnique, schemaName: hit.resourcePath, quote: hit.evidence },
  };
}

/**
 * The reduction every scanner rule shares.
 *
 * The scanner is the detector and this is its verdict, so the only input that
 * decides a failure is what the scanner reported. The population is consulted
 * only to tell the three non-failures apart.
 */
function scannerCheck(
  declared: Rule<SkillResourceContext>,
  options: SkillScannerOptions,
  ctx: SkillResourceContext,
) {
  const hits = ctx.findingsByRule.get(declared.id) ?? [];
  if (hits.length > 0) {
    return failWith(hits.map(hit => instanceFor(declared, ctx, hit)));
  }

  const { label } = options.population;
  const selected = ctx.resources.filter(options.population.selects);
  if (selected.length === 0) {
    return notApplicable(`This skill contains no ${label} for the scanner to read.`);
  }

  const read = selected.filter(wasRead);
  if (read.length === 0) {
    return couldNotRun(
      `Every ${label} in this skill is binary or failed to decode, so none was scanned.`,
    );
  }
  return pass(`${read.length} of ${selected.length} ${label}(s) were scanned and none matched.`);
}

function definitionFor(
  declared: Rule<SkillResourceContext>,
  options: SkillScannerOptions,
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
    family: SKILL_RULE_FAMILY,
    dimension: SKILL_DIMENSION_BUCKET[pillar],
  };
}

/**
 * Declares one scanner rule.
 *
 * The closure refers to the rule it is being attached to, which is safe because
 * `check` is only ever called after construction returns.
 */
export function skillScannerRule(
  declaration: SkillScannerDeclaration, options: SkillScannerOptions,
): SkillScannerRuleEntry {
  const declared: Rule<SkillResourceContext> = {
    ...declaration,
    harnesses: ['standalone-skill'],
    subjectScope: 'skill',
    execution: 'deterministic',
    check: ctx => scannerCheck(declared, options, ctx),
  };
  return Object.freeze({
    rule: rule(declared),
    options,
    definition: Object.freeze(definitionFor(declared, options, declaration.pillar)),
  });
}

// ── Python scanner rules ───────────────────────────────────────────────────

export const SCR_CMD_01_OPTIONS: SkillScannerOptions = Object.freeze({
  severity: 'critical', confidence: 'high', population: PYTHON_RESOURCES,
});

export const SCR_CMD_01: SkillScannerRuleEntry = skillScannerRule({
  id: 'SCR-CMD-01',
  title: 'OS Command Injection in Python Script',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['security'],
  references: ['cwe-78', 'owasp-command-injection'],
  prose: {
    question: 'Does every Python resource run commands without handing a string to a shell?',
    summary: 'Scan decoded Python resources for direct shell APIs and for subprocess calls made with shell=True.',
    why: 'Unsandboxed shell commands in a skill script can be weaponised to run arbitrary host commands.',
    fix: 'Replace os.system / subprocess shell=True with parameterised APIs; never interpolate user input into shell strings.',
    fixSteps: [
      'Replace os.system/subprocess calls with subprocess.run using a list of arguments, not a shell string.',
      'Validate and sanitize all inputs before passing them to any system call.',
      'Apply least-privilege constraints so the process cannot execute unexpected commands.',
    ],
    passWhen: [
      'Every scanned Python resource is free of os.system, os.popen and commands.getoutput/getstatusoutput.',
      'No scanned Python resource passes shell=True to a subprocess call.',
    ],
    failWhen: [
      'A Python resource calls a shell API directly.',
      'A Python resource passes shell=True, which hands a command string to the shell to parse.',
    ],
    notApplicableWhen: ['The skill contains no Python resource for the scanner to read.'],
  },
  evidence: { fieldPaths: ['resources.textContent'] },
}, SCR_CMD_01_OPTIONS);

/**
 * Every scanner rule declared here, in published order.
 *
 * `skillRuleRegistry.ts` spreads {@link skillScannerDefinitions} over the rows
 * still written out by hand, so a rule that moves here stops being authored
 * twice without any consumer of `RULE_REGISTRY` changing.
 */
export const skillScannerRuleEntries: readonly SkillScannerRuleEntry[] = Object.freeze([
  SCR_CMD_01,
]);

export const skillScannerCoreRules: readonly Rule<SkillResourceContext>[] = Object.freeze(
  skillScannerRuleEntries.map(entry => entry.rule),
);

export const skillScannerDefinitions: Readonly<Record<string, SkillRuleDefinition>> = Object.freeze(
  Object.fromEntries(skillScannerRuleEntries.map(entry => [entry.rule.id, entry.definition])),
);
