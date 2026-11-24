/**
 * Every deterministic standalone-skill rule, composed in published order.
 *
 * Each family lives in its own `skill-*.rules.ts` file and imports its authoring
 * seam — `skill-scanner.rules.ts` for the resource scanners, `skill-packaging.rules.ts`
 * for everything that reads the bundle as a whole. This barrel is the single place
 * that knows about all of them, which keeps the import direction one-way — a seam
 * never imports its own children — and lets the two consumers,
 * `skillRuleRegistry.ts` and `review-core/registry.ts`, each take one symbol.
 *
 * **Adding a family means editing this file and nothing else.** Adding a *rule* to an
 * existing family means editing that family file alone; this barrel does not change.
 *
 * The two seams produce rules over different context types — `SkillResourceContext`
 * reads one decoded file at a time, `SkillPackagingContext` reads the whole bundle —
 * so the composed list is widened to `Rule<never>`, the same cast `registry.ts`
 * already applies to every agent family for the same reason. The context type is a
 * property of how a rule is *authored*; the registry only ever reads the declaration.
 */
import type { Rule } from '../rule';
import {
  skillScannerRuleEntries,
  type SkillRuleDefinition,
  type SkillScannerRuleEntry,
} from './skill-scanner.rules';
import { scrScannerRuleEntries } from './skill-scanner-scr.rules';
import { htmlScannerRuleEntries } from './skill-scanner-html.rules';
import { markdownScannerRuleEntries } from './skill-scanner-md.rules';
import {
  skillPackagingRuleEntries, type SkillPackagingRuleEntry,
} from './skill-packaging.rules';
import { skillSecretsRuleEntries } from './skill-secrets.rules';
import { skillShapeRuleEntries } from './skill-shape.rules';
import { skillAutomationRuleEntries } from './skill-automation.rules';
import { skillRuntimeRuleEntries } from './skill-runtime.rules';

/** What the two seams have in common: a declaration and the legacy row it projects. */
type SkillRuleEntry = SkillScannerRuleEntry | SkillPackagingRuleEntry;

/**
 * The families, in the order their rules are published.
 *
 * This is the order `RULE_REGISTRY` keys appear in and the order
 * `review-core.test.ts` asserts, so it is load-bearing. It follows the legacy
 * registry's own grouping: resource scanners first, then the bundle-level
 * families in the order they were written out by hand.
 */
const families: readonly (readonly SkillRuleEntry[])[] = [
  skillScannerRuleEntries,
  scrScannerRuleEntries,
  htmlScannerRuleEntries,
  markdownScannerRuleEntries,
  skillPackagingRuleEntries,
  skillSecretsRuleEntries,
  skillShapeRuleEntries,
  skillAutomationRuleEntries,
  skillRuntimeRuleEntries,
];

export const allSkillScannerRuleEntries: readonly SkillRuleEntry[] =
  Object.freeze(families.flat());

export const allSkillScannerRules: readonly Rule<never>[] = Object.freeze(
  allSkillScannerRuleEntries.map(entry => entry.rule as Rule<never>),
);

export const allSkillScannerDefinitions: Readonly<Record<string, SkillRuleDefinition>> = Object.freeze(
  Object.fromEntries(allSkillScannerRuleEntries.map(entry => [entry.rule.id, entry.definition])),
);
