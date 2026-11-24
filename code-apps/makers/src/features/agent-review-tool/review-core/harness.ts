/**
 * The harness union, and the boundary that keeps unscorable subjects out.
 *
 * Harness is the only top-level classification (D-10): a rule declares the
 * harnesses it applies to, and that list *is* its tag. There is no second axis
 * above it, so there is nothing for a rule's harness and its family to disagree
 * about.
 *
 * Four values, not two. A skill reviewed inside a Copilot agent and a skill
 * uploaded on the Skills/Automations tab share neither rule set, severity
 * vocabulary, grouping axis nor scorer (D-13), so modelling them as one harness
 * with a flag would mean every consumer re-deriving the distinction from
 * something else. The AI side already names both — `catalog.ts` declares
 * `skillNodes = ['copilot-skill', 'standalone-skill']`.
 */

import {
  AGENT_PILLARS, PILLAR_LABELS, SKILL_DIMENSIONS, toAgentPillar, type Pillar,
} from './pillars';

/** A subject this codebase scores. */
export type Harness = 'standard' | 'copilot' | 'copilot-skill' | 'standalone-skill';
export const HARNESSES: readonly Harness[] = Object.freeze([
  'standard', 'copilot', 'copilot-skill', 'standalone-skill',
] as const);

/** Harnesses whose subject is a whole agent and which score on agent pillars. */
export const AGENT_HARNESSES: readonly Harness[] = Object.freeze(['standard', 'copilot'] as const);

/** Harnesses whose subject is a skill. They do not share a rule set — see D-13. */
export const SKILL_HARNESSES: readonly Harness[] = Object.freeze([
  'copilot-skill', 'standalone-skill',
] as const);

/**
 * Reviewed elsewhere and deliberately not scored here.
 *
 * Declarative agents keep the existing ART flow `71b31233` (D-12). They are named
 * rather than merely omitted so that a declarative-agent subject reaching a
 * scorer fails loudly instead of being scored against a rule set that contains
 * zero declarative-agent rules — which would silently report a perfect score.
 */
export type ExternalHarness = 'declarative-agent';

export const EXTERNAL_HARNESSES: readonly ExternalHarness[] =
  Object.freeze(['declarative-agent'] as const);

export function isHarness(value: unknown): value is Harness {
  return typeof value === 'string' && (HARNESSES as readonly string[]).includes(value);
}

export function isExternalHarness(value: unknown): value is ExternalHarness {
  return typeof value === 'string' && (EXTERNAL_HARNESSES as readonly string[]).includes(value);
}

/**
 * The scoring boundary. Throws rather than returning a result, because every
 * alternative — a null score, a zero, a skipped subject — is indistinguishable
 * downstream from a genuine measurement.
 */
export function assertScorableHarness(value: unknown): asserts value is Harness {
  if (isHarness(value)) return;
  if (isExternalHarness(value)) {
    throw new Error(
      `Harness "${value}" is reviewed outside this scorer and has no rules here. `
      + 'Scoring it would report an unearned result rather than a measurement.',
    );
  }
  throw new Error(`Unknown harness: ${JSON.stringify(value)}`);
}

/**
 * Which pillar table a harness scores on.
 *
 * Note that this is not the agent/skill split: a skill reviewed inside a Copilot
 * agent is scored on the **agent** table, because its findings roll up into that
 * agent's Skills and Orchestration pillars. Only a standalone upload — judged on
 * its own merits, with no instructions, knowledge or evaluation set of its own —
 * uses the skill rubric.
 */
export function pillarVocabularyFor(harness: Harness): readonly Pillar[] {
  return harness === 'standalone-skill' ? SKILL_DIMENSIONS : AGENT_PILLARS;
}

/**
 * Pillar display text a harness spells differently.
 *
 * The weight table is deliberately shared (DEC-1): the question a pillar asks is
 * the same under either harness, so neither is advantaged and both report on one
 * denominator. What differs is what *fills* the pillar. A Standard agent's Skills
 * pillar is scored entirely by rules over topic metadata and topic references —
 * the seven `STD-PATTERN-*` rules plus the generated `local-pattern-*` ones — so
 * "Skills" names a thing a classic agent has not got, while the Copilot harness
 * genuinely scores skills and keeps the shared label.
 *
 * An override is copy and nothing else. The id, the weight, the rule set and the
 * arithmetic are untouched, so a persisted row still reads back the same and a
 * saved score does not move. Changing an id would be a data migration; this is
 * not one.
 */
export const HARNESS_PILLAR_LABELS:
Readonly<Partial<Record<Harness, Readonly<Partial<Record<Pillar, string>>>>>> = Object.freeze({
  standard: Object.freeze({ skills: 'Topics' }),
});

/** A pillar's display text under one harness, falling back to the shared label. */
export function pillarLabelFor(harness: Harness | undefined, pillar: Pillar): string {
  const override = harness ? HARNESS_PILLAR_LABELS[harness]?.[pillar] : undefined;
  return override ?? PILLAR_LABELS[pillar];
}

/**
 * The same, for a pillar name read back from a saved review in either casing.
 *
 * A name that resolves to no pillar is returned unchanged rather than dropped:
 * rows saved before the composite carry blend labels such as "Pattern score",
 * which have no id to look up and are not pillars to relabel.
 */
export function pillarNameLabelFor(harness: Harness | undefined, name: string): string {
  const pillar = toAgentPillar(name);
  return pillar ? pillarLabelFor(harness, pillar) : name;
}
