/**
 * The pillar vocabulary, and the only place a pillar weight is written down.
 *
 * Two apps and three scorers each used to declare their own table, in two
 * different casings, bridged by an unchecked cast at the UI boundary. A weight
 * that appears in more than one file is not a constant: it is two constants that
 * happen to agree today. So the literals below are the single source, and every
 * other module re-exports or derives from them rather than restating a number.
 *
 * Ids are lower-case because that is already what the AI node contract emits and
 * what a persisted row should carry. The Title-case spellings ART has shown since
 * spec 013 are display text, not identity — they live in {@link PILLAR_LABELS},
 * and {@link LEGACY_PILLAR_NAME} keeps ART's public surface unchanged.
 *
 * Nothing here imports anything. This module is the base of the dependency graph
 * so that both apps can reach it without either depending on the other.
 */

/** The six scored capability pillars of an agent, in reporting order. */
export type AgentPillar =
  | 'instructions'
  | 'skills'
  | 'tools'
  | 'knowledge'
  | 'orchestration'
  | 'evaluation';

export const AGENT_PILLARS: readonly AgentPillar[] = Object.freeze([
  'instructions', 'skills', 'tools', 'knowledge', 'orchestration', 'evaluation',
] as const);

/**
 * Agent pillar weights, totalling 100.
 *
 * Standard and Copilot deliberately share this one table (DEC-1): the question a
 * pillar answers is the same under either harness, so neither is advantaged by
 * its profile and both are reported on one denominator. A harness that fills a
 * pillar differently renames it — see `HARNESS_PILLAR_LABELS` in the harness
 * policy — rather than reweighting it.
 */
export const AGENT_PILLAR_WEIGHTS: Readonly<Record<AgentPillar, number>> = Object.freeze({
  instructions: 25,
  skills: 15,
  tools: 12,
  knowledge: 8,
  orchestration: 10,
  evaluation: 30,
});

/**
 * Pillars that keep their declared weight even when nothing was measured.
 *
 * Every other pillar is conditional: an agent with no tools has no Tools pillar,
 * and its 12 points are shared out among the pillars that do apply, because
 * "has no tools" is not a failing. Evaluation is the exception — an agent that
 * was never evaluated has not avoided the question, it has answered it badly, so
 * it forfeits the 30 points rather than having them redistributed. EVL-01 is a
 * `gate` with an empty `notApplicableWhen`, so that forfeit is a *measured* zero
 * from a failing rule, not a manufactured one.
 *
 * Redistributing Evaluation instead would let its influence grow as capabilities
 * go missing — a bare agent would see it swell from 30/100 to 30/55, capping an
 * otherwise flawless untested agent at 45 instead of the documented 70. That
 * punishes the simplest agents hardest, which inverts the intent.
 *
 * Declared here so the two scorers that renormalize — ART's `compositeFromBreakdown`
 * and the AI review's composite — read one list instead of each naming the pillar
 * in their own arithmetic. The skill rubric has no such dimension, so its
 * renormalization sees an empty set and spreads across everything.
 */
export const UNCONDITIONAL_AGENT_PILLARS: readonly AgentPillar[] = Object.freeze([
  'evaluation',
] as const);

/** The six dimensions of Microsoft's published skill-authoring rubric, in reporting order. */
export type SkillDimension =
  | 'trigger-clarity'
  | 'task-focus'
  | 'instruction-quality'
  | 'portability'
  | 'safety-evidence'
  | 'packaging-quality';

export const SKILL_DIMENSIONS: readonly SkillDimension[] = Object.freeze([
  'trigger-clarity', 'task-focus', 'instruction-quality',
  'portability', 'safety-evidence', 'packaging-quality',
] as const);

/**
 * Skill-rubric weights, totalling 100.
 *
 * A standalone skill upload is scored on these rather than on agent pillars: it
 * has no evaluation set, no knowledge sources and no connected agents, so the
 * agent table would leave most of its weight permanently unmeasured. Both tables
 * live here because "one spot" means one file, not one table.
 */
export const SKILL_DIMENSION_WEIGHTS: Readonly<Record<SkillDimension, number>> = Object.freeze({
  'trigger-clarity': 20,
  'task-focus': 15,
  'instruction-quality': 20,
  portability: 10,
  'safety-evidence': 25,
  'packaging-quality': 10,
});

/**
 * The four score buckets ART has grouped skill findings into since Task-4.
 *
 * Not a second rubric: it is the published six collapsed onto the four columns
 * the other two tabs already show, so a reader comparing tabs sees one set of
 * headings. Declared here, beside the six it collapses, because the mapping was
 * previously written out in `skills-automations/contracts/ArtifactReview.ts`
 * while the rule registry re-derived the same answer from an id prefix — two
 * tables that agreed only by habit.
 *
 * The union is restated rather than imported: `pillars.ts` is the base of the
 * dependency graph and imports nothing. `SkillRubricDimension` in
 * `agents-experience/contracts/Findings.ts` is the same four strings, so the
 * annotation on `DIMENSION_TO_BUCKET` is what fails the build if they drift.
 */
export type SkillScoreBucket = 'quality' | 'integrity' | 'safety' | 'readiness';

export const SKILL_DIMENSION_BUCKET: Readonly<Record<SkillDimension, SkillScoreBucket>> =
  Object.freeze({
    'trigger-clarity': 'quality',
    'task-focus': 'quality',
    'instruction-quality': 'quality',
    portability: 'readiness',
    'safety-evidence': 'safety',
    'packaging-quality': 'integrity',
  });

/** Any scored group, under either profile. */
export type Pillar = AgentPillar | SkillDimension;

/** Display text. Changing a label is a copy change; changing an id is a data migration. */
export const PILLAR_LABELS: Readonly<Record<Pillar, string>> = Object.freeze({
  instructions: 'Instructions',
  skills: 'Skills',
  tools: 'Tools',
  knowledge: 'Knowledge',
  orchestration: 'Orchestration',
  evaluation: 'Evaluation',
  'trigger-clarity': 'Trigger clarity',
  'task-focus': 'Task focus',
  'instruction-quality': 'Instruction quality',
  portability: 'Portability',
  'safety-evidence': 'Safety evidence',
  'packaging-quality': 'Packaging quality',
});

/**
 * The Title-case spellings ART has persisted since spec 013.
 *
 * Kept as a translation, not a second vocabulary: historic rows carry these
 * strings and D-1 leaves them alone, so reading one back has to map rather than
 * guess. New writes should use the lower-case id.
 */
export type LegacyPillarName =
  | 'Instructions' | 'Evaluation' | 'Skills' | 'Tools' | 'Knowledge' | 'Orchestration';

export const LEGACY_PILLAR_NAME: Readonly<Record<AgentPillar, LegacyPillarName>> = Object.freeze({
  instructions: 'Instructions',
  skills: 'Skills',
  tools: 'Tools',
  knowledge: 'Knowledge',
  orchestration: 'Orchestration',
  evaluation: 'Evaluation',
});

export const PILLAR_FROM_LEGACY: Readonly<Record<LegacyPillarName, AgentPillar>> = Object.freeze({
  Instructions: 'instructions',
  Skills: 'skills',
  Tools: 'tools',
  Knowledge: 'knowledge',
  Orchestration: 'orchestration',
  Evaluation: 'evaluation',
});

/** Narrows a persisted pillar name of either casing, or returns undefined rather than inventing one. */
export function toAgentPillar(value: string): AgentPillar | undefined {
  if ((AGENT_PILLARS as readonly string[]).includes(value)) return value as AgentPillar;
  return PILLAR_FROM_LEGACY[value as LegacyPillarName];
}
