/**
 * The deterministic rules over a Scout automation definition shipped in a skill
 * bundle (Group E of the legacy `RULE_REGISTRY`).
 *
 * A sibling of `skill-packaging.rules.ts`, not a second seam. It imports that
 * file's generator, its population vocabulary and its entry shape, and adds
 * exactly two things of its own: the population these four rules share, and a
 * way to keep a legacy `dimension` that its `pillar` does not derive.
 *
 * ── Why the dimension override exists ──────────────────────────────────────
 *
 * `skillPackagingRule` derives the published `dimension` from the declared
 * `pillar` via `SKILL_DIMENSION_BUCKET`, which is right for the packaging rules
 * because for all of them the two agree. For three of the four rules here they
 * do not, and both sides are load-bearing:
 *
 * - The **pillar** is what the rubric scorer reads, and for `AUTO-UNATTENDED`
 *   and `AUTO-DESTRUCTIVE` it is pinned by `RULE_TO_DIMENSION` in
 *   `skills-automations/services/artifactReviewService.ts` and asserted by
 *   `skills-automations/__tests__/reviewPipeline.test.ts`
 *   (`dimensionForFinding('AUTO-UNATTENDED') === 'safety-evidence'`).
 * - The **dimension** is the legacy four-bucket grouping key that
 *   `createRegisteredFinding` copies onto every finding, and it branches on
 *   `dimension === 'safety'`. Deriving `AUTO-UNATTENDED`'s dimension from its
 *   pinned pillar would turn `'readiness'` into `'safety'` and start emitting a
 *   blocking safety disposition this rule has never emitted.
 *
 * So they cannot derive from one another, and D-13 fidelity says a relocation
 * does not change published data. `SkillPackagingOptions.legacyDimension` declares
 * the pillar truthfully and overlays the legacy dimension on the projected row
 * only, leaving `rule.pillar` untouched. Every overlay is marked `// DIVERGENCE:` at
 * its declaration with both values, so the list of rows whose two axes disagree
 * is readable rather than inferred. None of them is "fixed" here; closing them
 * is a scoring change and belongs to a phase that is allowed to move scores.
 *
 * ── Why the population is "is there an automation at all" ───────────────────
 *
 * All four rules make a claim *about an automation definition*. A skill bundle
 * that ships none has no claim to answer, so these rules are not-applicable
 * rather than passing: a pass would credit the bundle for four questions it was
 * never asked and dilute every real result beside it. The partner hazard is the
 * opposite one — a bundle whose only candidate JSON could not be parsed has not
 * been shown to contain no automation, it has not been read — and that is
 * `could-not-run`, never not-applicable.
 */

import {
  extensionOf, filesWhere, stripRoot,
} from '../../skills-automations/services/artifactUtils';
import type { Rule } from '../rule';
import {
  noPopulation, populated, skillPackagingRule, unreadablePopulation,
  type SkillPackagingContext, type SkillPackagingOptions, type SkillPackagingPopulation,
  type SkillPackagingRuleEntry, type SkillRuleDefinition,
} from './skill-packaging.rules';

/** The legacy row shape, re-exported so this file's consumers need only one import. */
export type { SkillRuleDefinition };

/** The family all four automation rules publish under. */
const AUTOMATION_RULE_FAMILY = 'Automation';

// ── Population ─────────────────────────────────────────────────────────────

/**
 * JSON that describes the package rather than being part of it.
 *
 * Restated from `skills-automations/services/automationValidator.ts`, where it
 * is module-private. Exporting it from there would be the better fix and is the
 * one to make when that file is next opened; reaching into it from here, or
 * widening its surface during a phase in which four agents share the tree, is
 * not. The two sets must stay identical — a name that is metadata to the
 * detector and a definition to this population would make a rule report
 * `could-not-run` over a file the detector deliberately skipped.
 */
const AUTOMATION_METADATA_JSON = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json', 'manifest.json',
]);

/** The two keys that, to the detector, make a JSON object an automation definition. */
function isAutomationDefinition(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Array.isArray((value as Record<string, unknown>).steps) || 'schedule' in value;
}

/** How far the bundle's candidate JSON files could be read. */
interface AutomationCandidates {
  /** Paths that parsed to an automation definition. */
  readonly definitions: readonly string[];
  /** Paths that are candidate JSON but could not be decoded or parsed. */
  readonly unreadable: readonly string[];
}

/**
 * The same candidate selection `evaluateAutomation` makes, kept separate from
 * what it concludes.
 *
 * The detector folds "could not parse" into "not a candidate" — its filter
 * returns `false` from the `catch`, so its own AUTO-SCHEMA "is not valid JSON"
 * branch below is unreachable. That fold is invisible in the findings list: a
 * bundle whose only automation is a broken JSON file produces no finding and,
 * read naively, looks clean. Splitting the two apart here is what lets these
 * rules say `could-not-run` instead of silently passing.
 */
function readAutomationCandidates(ctx: SkillPackagingContext): AutomationCandidates {
  const jsonFiles = filesWhere(ctx.artifact, (relative) => {
    if (extensionOf(relative) !== 'json') return false;
    const base = relative.split('/').pop()?.toLowerCase() ?? '';
    return !AUTOMATION_METADATA_JSON.has(base);
  });

  const definitions: string[] = [];
  const unreadable: string[] = [];

  for (const file of jsonFiles) {
    const path = stripRoot(file.path, ctx.artifact.rootFolderName);
    if (typeof file.text !== 'string') {
      unreadable.push(path);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.text);
    } catch {
      unreadable.push(path);
      continue;
    }
    // Parsed, but carries neither `steps` nor `schedule`: demonstrably not an
    // automation, which is an answer rather than a failure to read.
    if (isAutomationDefinition(parsed)) definitions.push(path);
  }

  return { definitions, unreadable };
}

/**
 * The Scout automation definitions in the bundle, if there are any.
 *
 * A readable definition outranks an unreadable sibling: once one automation has
 * been read, each rule's claim has a subject and the detector's verdict over it
 * stands. The unreadable list only decides between the two *empty* answers —
 * "this bundle ships no automation" and "this bundle was not read well enough to
 * say" — which is the distinction the ladder exists for.
 */
export const AUTOMATION_DEFINITIONS: SkillPackagingPopulation = Object.freeze({
  label: 'Scout automation definitions',
  resolve: (ctx: SkillPackagingContext) => {
    const { definitions, unreadable } = readAutomationCandidates(ctx);

    if (definitions.length > 0) {
      return populated(
        `${definitions.length} automation definition(s) were parsed and checked: `
        + `${definitions.join(', ')}.`,
      );
    }

    if (unreadable.length > 0) {
      return unreadablePopulation(
        `No automation definition could be read from this bundle, and ${unreadable.length} `
        + `candidate JSON file(s) could not be decoded or parsed, so they could not be ruled `
        + `out as automations: ${unreadable.join(', ')}.`,
      );
    }

    return noPopulation(
      'This bundle ships no Scout automation definition — no JSON file outside the package '
      + 'metadata parses to an object carrying a steps array or a schedule — so there is no '
      + 'automation for this rule to make a claim about.',
    );
  },
});

// ── Automation rules ───────────────────────────────────────────────────────

export const AUTO_SCHEMA_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'critical', confidence: 'high', family: AUTOMATION_RULE_FAMILY,
  population: AUTOMATION_DEFINITIONS,
  legacyDimension: 'integrity',
});

// DIVERGENCE: pillar 'instruction-quality' buckets to dimension 'quality', but the
// legacy row publishes dimension 'integrity'. The pillar is the AUTO prefix default
// in `artifactReviewService.ts`; the dimension is what the grouped skill view has
// always shown. Both are preserved; neither is corrected here.
export const AUTO_SCHEMA: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'AUTO-SCHEMA',
  title: 'Automation Does Not Match the Import Contract',
  pillar: 'instruction-quality',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-scout-automation-schema'],
  prose: {
    question: "Does every bundled automation definition satisfy Scout's import contract?",
    summary: 'Check each automation definition for a non-empty name, an object-shaped schedule, and a label and prompt on every step.',
    why: 'The importer validates the definition before accepting it. A definition that fails validation is rejected outright, so the automation never runs.',
    fix: 'Correct the definition so it satisfies the import contract.',
    fixSteps: [
      'Read the reported field and the value the contract expects.',
      'Correct the field, then re-import to confirm the definition is accepted.',
    ],
    passWhen: [
      'Every bundled automation declares a non-empty name, and every step is an object with a non-empty label and prompt.',
      'A schedule, where present, is an object.',
    ],
    failWhen: [
      'A required field is missing or empty, a step is not an object, or the schedule is not an object — any of which the importer rejects.',
    ],
    notApplicableWhen: [
      'The bundle ships no automation definition, so there is no definition for the import contract to be checked against.',
    ],
  },
  evidence: {
    fieldPaths: ['automation.name', 'automation.steps[].label', 'automation.steps[].prompt', 'automation.schedule'],
  },
}, AUTO_SCHEMA_OPTIONS);

export const AUTO_STEPS_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'critical', confidence: 'high', family: AUTOMATION_RULE_FAMILY,
  population: AUTOMATION_DEFINITIONS,
  legacyDimension: 'integrity',
});

// DIVERGENCE: pillar 'instruction-quality' buckets to dimension 'quality', but the
// legacy row publishes dimension 'integrity'. Same pair as AUTO-SCHEMA above, and
// preserved for the same reason.
export const AUTO_STEPS: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'AUTO-STEPS',
  title: 'Automation Has No Steps',
  pillar: 'instruction-quality',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-scout-automation-schema'],
  prose: {
    question: 'Does every bundled automation declare at least one step to perform?',
    summary: 'Check that each automation definition carries a non-empty steps array.',
    why: 'An automation with no steps imports successfully and then does nothing on every scheduled run, which is harder to notice than an outright failure.',
    fix: 'Add at least one step with a label and a prompt.',
    fixSteps: [
      'Add a step describing the first action the automation must take.',
      'Give it a short label and a prompt that states the action and its expected output.',
    ],
    passWhen: [
      'Every bundled automation declares a steps array holding at least one step.',
    ],
    failWhen: [
      'An automation declares no steps field, or declares one that is not an array, or declares an empty array — so each scheduled run completes having done nothing.',
    ],
    notApplicableWhen: [
      'The bundle ships no automation definition, so there is no steps array to look for.',
    ],
  },
  evidence: { fieldPaths: ['automation.steps'] },
}, AUTO_STEPS_OPTIONS);

export const AUTO_UNATTENDED_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'high', confidence: 'medium', family: AUTOMATION_RULE_FAMILY,
  population: AUTOMATION_DEFINITIONS,
  legacyDimension: 'readiness',
});

// DIVERGENCE: pillar 'safety-evidence' buckets to dimension 'safety', but the legacy
// row publishes dimension 'readiness'. This is the one place the two axes cannot be
// reconciled by choosing either:
//   - The pillar is pinned. `RULE_TO_DIMENSION` in `artifactReviewService.ts` maps
//     AUTO-UNATTENDED to 'safety-evidence' and `reviewPipeline.test.ts` asserts it.
//   - The dimension is load-bearing. `createRegisteredFinding` branches on
//     `dimension === 'safety'`, so deriving it from the pinned pillar would start
//     marking a stalled unattended run as a blocking safety defect. It is not one:
//     the step waits, it does not act.
// `legacyDimension` therefore keeps the declared pillar on the rule and overlays
// the legacy dimension on the projected row alone.
export const AUTO_UNATTENDED: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'AUTO-UNATTENDED',
  title: 'Step Asks the User a Question',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['quality'],
  // Scout's automation guidance only. OWASP LLM06 Excessive Agency describes an
  // agent that acts too freely on its own; a step that stalls waiting for a
  // human is the opposite failure, so citing it here would mislead the reader.
  // AUTO-DESTRUCTIVE below is the rule that genuinely earns that citation.
  references: ['ms-scout-automation-schema'],
  prose: {
    question: 'Can every automation step complete without waiting for a human answer?',
    summary: 'Read each step prompt for phrasing that asks the user to answer, confirm or approve mid-run.',
    why: 'An unattended automation cannot stop to ask a human. A step that waits for an answer stalls the run, and the schedule continues without the work ever completing.',
    fix: 'Replace the question with a decision the automation can make on its own.',
    fixSteps: [
      'State the rule the automation should apply instead of asking.',
      'Where a human really must decide, have the automation report and stop rather than wait.',
    ],
    passWhen: [
      'No step prompt asks the user for input, confirmation or approval part-way through the run.',
    ],
    failWhen: [
      'A step prompt asks the user a question, or waits for confirmation or approval, which an unattended scheduled run can never supply.',
    ],
    notApplicableWhen: [
      'The bundle ships no automation definition, so no step runs unattended and the question does not arise.',
    ],
  },
  evidence: { fieldPaths: ['automation.steps[].prompt', 'automation.steps[].label'] },
}, AUTO_UNATTENDED_OPTIONS);

export const AUTO_DESTRUCTIVE_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'high', confidence: 'medium', family: AUTOMATION_RULE_FAMILY,
  population: AUTOMATION_DEFINITIONS,
});

// No divergence: pillar 'safety-evidence' buckets to dimension 'safety', which is
// what the legacy row publishes. The only one of the four whose two axes agree.
export const AUTO_DESTRUCTIVE: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'AUTO-DESTRUCTIVE',
  title: 'Step Performs an Irreversible Action Without Stating Its Scope',
  pillar: 'safety-evidence',
  severity: 'high',
  tags: ['quality', 'security'],
  references: ['owasp-llm06', 'ms-scout-automation-schema'],
  prose: {
    question: 'Does every irreversible automation step state exactly what it may affect?',
    summary: 'Read each step prompt for a destructive verb, and check the same prompt states the scope the action is bounded by.',
    why: 'An unattended step that deletes or sends has no human check between the instruction and the effect. Without an explicit scope the model decides how far the action reaches, on every scheduled run.',
    fix: 'State exactly what the action may affect.',
    fixSteps: [
      'Name the exact scope: which items, which folder, which recipients.',
      'Add an explicit upper bound, so an unexpected result cannot become an unbounded action.',
      'Prefer a reversible action, such as moving to an archive rather than deleting.',
    ],
    passWhen: [
      'No step prompt performs an irreversible action.',
      'Every step prompt that does also states the scope that action is bounded by.',
    ],
    failWhen: [
      'A step prompt deletes, sends or otherwise acts irreversibly without naming the items, folder or recipients it may reach.',
    ],
    notApplicableWhen: [
      'The bundle ships no automation definition, so no step acts unattended and there is no scope to state.',
    ],
  },
  evidence: { fieldPaths: ['automation.steps[].prompt', 'automation.steps[].label'] },
}, AUTO_DESTRUCTIVE_OPTIONS);

/**
 * Every automation rule declared here, in published order.
 *
 * The order is the order of Group E in `RULE_REGISTRY`, so the spread that
 * replaces those literals leaves the registry's key order unchanged. That spread
 * is the orchestrator's edit, not this file's.
 */
export const skillAutomationRuleEntries: readonly SkillPackagingRuleEntry[] = Object.freeze([
  AUTO_SCHEMA,
  AUTO_STEPS,
  AUTO_UNATTENDED,
  AUTO_DESTRUCTIVE,
]);

export const skillAutomationCoreRules: readonly Rule<SkillPackagingContext>[] = Object.freeze(
  skillAutomationRuleEntries.map(entry => entry.rule),
);

export const skillAutomationDefinitions: Readonly<Record<string, SkillRuleDefinition>> =
  Object.freeze(
    Object.fromEntries(skillAutomationRuleEntries.map(entry => [entry.rule.id, entry.definition])),
  );
