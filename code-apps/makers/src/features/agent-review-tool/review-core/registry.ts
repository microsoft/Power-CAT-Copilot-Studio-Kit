/**
 * The rule registry, and the guards that keep it honest.
 *
 * There is one array of rules. Everything that used to be a separate registry —
 * "the standard rules", "the copilot skill rules", "the AI catalog for node X" —
 * is a filter over that array, so a rule cannot be in one list and missing from
 * another. Twenty-eight registries became one plus a handful of one-line views.
 *
 * {@link validateRules} runs at module load and throws. The checks it performs
 * were previously scattered across `UnifiedRuleEngine.ts` and
 * `ai-review-catalog.ts` as ad-hoc assertions in the few places someone
 * remembered to write one; consolidating them means a malformed rule fails when
 * the module is imported, not when a review happens to hit it.
 */

import { EXTERNAL_HARNESSES, HARNESSES, pillarVocabularyFor, type Harness } from './harness';
import { AGENT_PILLAR_WEIGHTS, SKILL_DIMENSION_WEIGHTS, type Pillar } from './pillars';
import { SEVERITIES } from './severity';
import {
  NODE_KINDS,
  SUBJECT_SCOPES,
  nodesFor,
  pillarFor,
  type NodeKind,
  type Rule,
  type RuleId,
} from './rule';
import { connectedAgentRules } from './rules/connected-agents.rules';
import { crossSkillRules } from './rules/cross-skill.rules';
import { evaluationRules } from './rules/evaluation.rules';
import { instructionRules } from './rules/instructions.rules';
import { knowledgeRules } from './rules/knowledge.rules';
import { lifecycleRules } from './rules/lifecycle.rules';
import { modelRules } from './rules/model.rules';
import { skillAiRules } from './rules/skill-ai.rules';
import { skillAuthoringRules } from './rules/skill-authoring.rules';
import { skillBundleIntegrityRules } from './rules/skill-bundle-integrity.rules';
import { skillCoverageRules } from './rules/skill-coverage.rules';
import { allSkillScannerRules } from './rules/skill-scanner.all';
import { skillRules } from './rules/skills.rules';
import { standardConnectedAgentCoreRules } from './rules/standard-connected.rules';
import { standardEvaluationCoreRules } from './rules/standard-evaluation.rules';
import { standardInstructionRules } from './rules/standard-instructions.rules';
import { standardPatternRules } from './rules/standard-patterns.rules';
import { standardSkillCoreRules } from './rules/standard-skills.rules';
import { standardToolCoreRules } from './rules/standard-tools.rules';
import { toolRules } from './rules/tools.rules';

/**
 * The tags a rule may carry.
 *
 * Validated rather than free so a typo cannot quietly create a second tag that
 * filters to nothing. Adding a tag means adding one string to this array, in
 * this file — which is the same cost as adding it to the rule.
 *
 * The first row is the cross-cutting concerns. The second is the subject axis
 * the AI catalog has always carried; it was absent here, so rules migrated out
 * of the catalog had to drop those words and thirty-two ended up disagreeing
 * with the catalog about their own tags. Admitting them lets a rule state its
 * subject once, in the rule.
 */
export const KNOWN_TAGS: readonly string[] = Object.freeze([
  'security', 'quality', 'safety', 'privacy',
  'cost', 'performance', 'accessibility', 'token-optimizer',
  'routing', 'scope', 'ux', 'grounding', 'capability-alignment', 'dependencies',
] as const);

const TAG_FORMAT = /^[a-z][a-z0-9-]*$/;

function blank(value: string | undefined): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Checks every rule and returns the frozen registry, or throws listing every
 * problem at once.
 *
 * Reporting all failures rather than the first is deliberate: these are authoring
 * mistakes found while writing rules, and fixing them one error per run is the
 * reason people stop running the check.
 */
export function validateRules(rules: readonly Rule<never>[]): readonly Rule<never>[] {
  const problems: string[] = [];
  const seen = new Map<RuleId, number>();
  const gates = new Map<string, RuleId>();

  const agentTotal = Object.values(AGENT_PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
  if (agentTotal !== 100) problems.push(`Agent pillar weights total ${agentTotal}, not 100.`);
  const skillTotal = Object.values(SKILL_DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
  if (skillTotal !== 100) problems.push(`Skill dimension weights total ${skillTotal}, not 100.`);

  for (const rule of rules) {
    const at = `Rule ${rule.id || '(no id)'}`;

    if (blank(rule.id)) problems.push(`${at}: id is blank.`);
    else {
      const count = (seen.get(rule.id) ?? 0) + 1;
      seen.set(rule.id, count);
      if (count === 2) problems.push(`${at}: declared more than once.`);
    }
    if (blank(rule.title)) problems.push(`${at}: title is blank.`);

    // ─── harnesses ───
    if (rule.harnesses.length === 0) {
      problems.push(`${at}: declares no harness, so nothing would ever run it.`);
    }
    for (const harness of rule.harnesses) {
      if ((EXTERNAL_HARNESSES as readonly string[]).includes(harness)) {
        problems.push(
          `${at}: declares harness "${harness}", which is reviewed outside this scorer (D-12). `
          + 'Remove the harness or move the rule to the flow that owns it.',
        );
      } else if (!(HARNESSES as readonly string[]).includes(harness)) {
        problems.push(`${at}: unknown harness "${harness}".`);
      }
    }

    // ─── subject scope ───
    if (!(SUBJECT_SCOPES as readonly string[]).includes(rule.subjectScope)) {
      problems.push(`${at}: unknown subjectScope "${rule.subjectScope}".`);
    }
    if (rule.subjectScope === 'skill-set' && rule.harnesses.includes('standalone-skill')) {
      problems.push(
        `${at}: subjectScope "skill-set" cannot apply to "standalone-skill". `
        + 'An upload is a single skill and has no set to compare against.',
      );
    }
    if (rule.subjectScope === 'agent' && rule.harnesses.some((h) => h.endsWith('-skill'))) {
      problems.push(`${at}: subjectScope "agent" cannot apply to a skill harness.`);
    }

    // ─── pillar ───
    for (const harness of rule.harnesses) {
      if (!(HARNESSES as readonly string[]).includes(harness)) continue;
      let pillar: Pillar;
      try {
        pillar = pillarFor(rule, harness as Harness);
      } catch (error) {
        problems.push(`${at}: ${(error as Error).message}`);
        continue;
      }
      const vocabulary = pillarVocabularyFor(harness as Harness);
      if (!vocabulary.includes(pillar)) {
        problems.push(
          `${at}: pillar "${pillar}" is not in the table harness "${harness}" scores on `
          + `(${vocabulary.join(', ')}).`,
        );
      }
    }

    // ─── severity ───
    if (!(SEVERITIES as readonly string[]).includes(rule.severity)) {
      problems.push(`${at}: unknown severity "${rule.severity}".`);
    }

    // ─── weight and gate ───
    if (rule.weight !== undefined) {
      if (!Number.isFinite(rule.weight) || rule.weight <= 0) {
        problems.push(`${at}: weight must be a positive number; received ${rule.weight}.`);
      }
      if (rule.severity === 'info') {
        problems.push(
          `${at}: declares a weight but is "info", which is excluded from scoring. `
          + 'Either drop the weight or give the rule a severity that can fail.',
        );
      }
    }
    if (rule.gate && rule.severity !== 'high') {
      problems.push(
        `${at}: is a gate but severity is "${rule.severity}". A gate zeroes its whole pillar, `
        + 'so it cannot also be a half-credit failure.',
      );
    }
    if (rule.gate) {
      for (const harness of rule.harnesses) {
        if (!(HARNESSES as readonly string[]).includes(harness)) continue;
        let pillar: Pillar;
        try {
          pillar = pillarFor(rule, harness as Harness);
        } catch {
          continue;
        }
        const key = `${harness}/${pillar}`;
        const existing = gates.get(key);
        if (existing && existing !== rule.id) {
          problems.push(
            `${at}: ${existing} already gates pillar "${pillar}" for harness "${harness}". `
            + 'Two gates on one pillar means the second can never be reached.',
          );
        } else {
          gates.set(key, rule.id);
        }
      }
    }

    // ─── execution and its implementation ───
    if (rule.execution === 'ai' && rule.check) {
      problems.push(`${at}: execution is "ai" but a deterministic check is declared.`);
    }
    if (rule.execution !== 'ai' && !rule.check) {
      problems.push(`${at}: execution is "${rule.execution}" but no check is declared.`);
    }
    if (rule.execution !== 'deterministic' && nodesFor(rule).length === 0) {
      problems.push(
        `${at}: execution is "${rule.execution}" but its harnesses resolve to no AI node.`,
      );
    }

    // ─── prose ───
    if (blank(rule.prose?.question)) problems.push(`${at}: prose.question is blank.`);
    if (blank(rule.prose?.why)) problems.push(`${at}: prose.why is blank.`);
    if (blank(rule.prose?.fix)) problems.push(`${at}: prose.fix is blank.`);
    if (!rule.prose?.passWhen?.length) problems.push(`${at}: prose.passWhen is empty.`);
    // A record — `severity: 'info'` — observes something and never fails, so it
    // has no failure condition to describe. Everything that can cost a maker
    // points must say, in words, what loses them.
    if (rule.severity !== 'info' && !rule.prose?.failWhen?.length) {
      problems.push(`${at}: prose.failWhen is empty.`);
    }

    // ─── tags and references ───
    for (const tag of rule.tags) {
      if (!TAG_FORMAT.test(tag)) {
        problems.push(`${at}: tag "${tag}" is not lower-kebab.`);
      } else if (!KNOWN_TAGS.includes(tag)) {
        problems.push(`${at}: unknown tag "${tag}". Add it to KNOWN_TAGS in registry.ts first.`);
      }
    }
    for (const reference of rule.references) {
      if (blank(reference)) problems.push(`${at}: a reference id is blank.`);
    }

    // ─── evidence ───
    if (!rule.evidence?.fieldPaths?.length) {
      problems.push(`${at}: evidence.fieldPaths is empty, so nothing records what the rule reads.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid rule registry:\n  - ${problems.join('\n  - ')}`);
  }
  return Object.freeze([...rules]);
}

/**
 * Every rule in the product.
 *
 * Family files land one at a time through Phase 2 — evaluation first, because it
 * is the family that exercised the worst of the duplication: a hard-coded
 * scoring formula written twice, one rule that no registry listed at all
 * (EVL-02, which moved the score), and five rules that applied to Copilot agents
 * only because nobody had declared them for Standard.
 *
 * The order below is the published order, and `review-core.test.ts` asserts it
 * exactly. It is grouped by file, not by id, which is why the Standard block
 * reads 1-6, 11, 7, 8, 9, 10: `local-pattern-7` is declared in the tools file
 * and `-8` in the evaluation file, so no spread order can make the ids
 * consecutive. Grouping by file is the property worth keeping.
 */
export const RULES: readonly Rule<never>[] = validateRules([
  ...(evaluationRules as readonly Rule<never>[]),
  ...(modelRules as readonly Rule<never>[]),
  ...(connectedAgentRules as readonly Rule<never>[]),
  ...(lifecycleRules as readonly Rule<never>[]),
  ...(instructionRules as readonly Rule<never>[]),
  ...(knowledgeRules as readonly Rule<never>[]),
  ...(skillRules as readonly Rule<never>[]),
  ...(toolRules as readonly Rule<never>[]),
  // Standard harness (Step 2.2b). These reach a verdict through `assessStandard`
  // rather than an inline `check` — see §7.1 IMPL-12.
  ...(standardSkillCoreRules as readonly Rule<never>[]),
  ...(standardToolCoreRules as readonly Rule<never>[]),
  ...(standardEvaluationCoreRules as readonly Rule<never>[]),
  ...(standardConnectedAgentCoreRules as readonly Rule<never>[]),
  // The 15 instruction-compliance criteria (Phase 3). Declared in four files and
  // registered in none, they reached the scorer only through the legacy
  // `family: 'Instructions'` lookup that Phase 3 replaces — see §7.1 IMPL-33.
  ...(standardInstructionRules as readonly Rule<never>[]),
  // The 10 Standard AI pattern rules (Phase 3 / A3). They were declared only in
  // `AI_RULE_CATALOG`, which carries scoring metadata but no rule text, so the
  // registry had no title, question or fix for any of them. Seven score in the
  // Skills pillar, which is the Topics slot for the Standard harness.
  ...(standardPatternRules as readonly Rule<never>[]),
  // Skill scanners (Step 2.3). Declared across the `skill-scanner-*.rules.ts`
  // family files and composed in published order by `skill-scanner.all.ts`,
  // which is also what `RULE_REGISTRY` spreads — so a scanner rule is authored
  // exactly once and both consumers see the same declaration.
  ...(allSkillScannerRules as readonly Rule<never>[]),
  // The inline-legacy skill families (Step 2.3). These were never in any
  // registry: their logic and their prose both lived inside service files, so
  // each one's legacy source becomes a thin adapter over the declaration here.
  // `skillAuthoringRules` is an *agent* family that happens to read a skill —
  // `analyzeSkillL0` folds into the agent review and scores through the agent's
  // Skills pillar — which is why it declares `copilot`, not `copilot-skill`.
  ...(skillAuthoringRules as readonly Rule<never>[]),
  // The 8 skill AI rules (Phase 3 / A3), likewise catalog-only until now. They
  // declare both skill harnesses and carry a pillar per harness (D-14): the
  // agent's Skills pillar from a Copilot agent, an upload dimension otherwise.
  ...(skillAiRules as readonly Rule<never>[]),
  // Bundle integrity. The only dual-pillar family (D-14): the same claim rolls
  // into the agent's Skills pillar from a Copilot agent, and into the upload
  // rubric's `packaging-quality` from a standalone upload.
  ...(skillBundleIntegrityRules as readonly Rule<never>[]),
  ...(skillCoverageRules as readonly Rule<never>[]),
  // Cross-skill orchestration. The only `subjectScope: 'skill-set'` family, and
  // the first legitimate claimant of the `copilot-skill` harness — see IMPL-28.
  ...(crossSkillRules as readonly Rule<never>[]),
]);

const BY_ID: ReadonlyMap<RuleId, Rule<never>> = new Map(
  RULES.flatMap((rule) => [
    [rule.id, rule] as const,
    ...(rule.legacyIds ?? []).map((legacy) => [legacy, rule] as const),
  ]),
);

/** Resolves a current or historical id. Returns undefined rather than guessing. */
export function ruleById(id: RuleId): Rule<never> | undefined {
  return BY_ID.get(id);
}

/** Every id the registry answers to, including the historical ones. */
export function knownRuleIds(): readonly RuleId[] {
  return Object.freeze([...BY_ID.keys()]);
}

export function rulesFor(harness: Harness): readonly Rule<never>[] {
  return RULES.filter((rule) => rule.harnesses.includes(harness));
}

export function deterministicRulesFor(harness: Harness): readonly Rule<never>[] {
  return rulesFor(harness).filter((rule) => rule.execution !== 'ai');
}

export function aiRulesForNode(node: NodeKind): readonly Rule<never>[] {
  return RULES.filter((rule) => nodesFor(rule).includes(node));
}

export function rulesByTag(tag: string): readonly Rule<never>[] {
  return RULES.filter((rule) => rule.tags.includes(tag));
}

export function rulesByPillar(pillar: Pillar, harness: Harness): readonly Rule<never>[] {
  return rulesFor(harness).filter((rule) => pillarFor(rule, harness) === pillar);
}

/** Per-node rule counts. Deliberately not disjoint — a shared skill rule is on two nodes. */
export function ruleCountByNode(): Readonly<Record<NodeKind, number>> {
  const counts = Object.fromEntries(NODE_KINDS.map((n) => [n, 0])) as Record<NodeKind, number>;
  for (const rule of RULES) for (const node of nodesFor(rule)) counts[node] += 1;
  return Object.freeze(counts);
}

/**
 * Pillars a harness scores on that no rule writes into.
 *
 * A migration-progress report while Phase 2 is in flight: families land one file
 * at a time, so most pillars are legitimately empty until their file arrives.
 * Once the last family is migrated this becomes a thrown error in
 * {@link validateRules} — a pillar carrying weight with no rule behind it is a
 * share of the score nothing can earn or lose.
 *
 * Evaluation is no longer an exception. It used to be scored by a formula rather
 * than by rules, which would have made it permanently empty here; it is now four
 * ordinary weighted rules in `rules/evaluation.rules.ts`.
 */
export function pillarsWithoutRules(harness: Harness): readonly Pillar[] {
  const owned = new Set(rulesFor(harness).map((rule) => pillarFor(rule, harness)));
  return Object.freeze(pillarVocabularyFor(harness).filter((p) => !owned.has(p)));
}
