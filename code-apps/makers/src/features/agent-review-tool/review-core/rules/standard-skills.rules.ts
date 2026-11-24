/**
 * The seven Standard rules over topic metadata and topic references.
 *
 * Three things here look wrong and are not:
 *
 * - **Six of the seven are generated, not written out.** The field rules differ
 *   from each other only in the four columns `standardFieldRules` already holds
 *   — key, title, singular, plural — and `buildStandardFieldPattern` indexes
 *   that same table to do its work. Hand-copying six literals would restate a
 *   table that already exists next to the algorithm reading it, and the two
 *   copies drifting apart is precisely the failure this registry removes. The
 *   `.map` keeps one table and one order.
 * - **`family: 'Skills'` is load-bearing, and it is not on the rule.** D-10 took
 *   family off `Rule` because harness and pillar are the only classification
 *   axes, so it rides on `CoreStandardOptions` instead. It is still read:
 *   `assessStandard` branches on `meta.family === 'Skills'` to turn on
 *   topic-scope handling — `aggregateTopicScope` for the field rules, the
 *   missing-topic-metadata guard for all seven, and the second reference pass
 *   that `local-pattern-11` is explicitly carved out of. Renaming it would
 *   silently change every Standard outcome in this family.
 * - **The builders are imported from the adapter tree.** `standardTopicFields`
 *   and `standardTopicReferences` are already cycle-free leaves — they import
 *   contracts and utils and nothing from here — so importing them keeps the
 *   import direction one-way without a relocation that would have to be proven
 *   byte-identical. Only the declarations moved.
 *
 * `tags: ['quality']` is declared on every rule because the helper these rules
 * came from hardcoded it. It is published metadata, so it has to be restated
 * rather than inherited.
 */

import type { ParsedBotData } from '../../contracts/ServiceContracts';
import {
  buildStandardFieldPattern, standardFieldRecommendations, standardFieldRules,
} from '../../agents-experience/services/rules/standardTopicFields';
import {
  buildStandardTopicReferencePattern,
} from '../../agents-experience/services/rules/standardTopicReferences';
import type { Rule } from '../rule';
import { standardRule, type CoreStandardOptions } from './standard';

const FAMILY = 'Skills';

/** Positionally aligned with `standardFieldRules`: the field each rule reports on. */
const STANDARD_FIELD_PATHS = [
  'ModelName', 'ModelDescription', 'InputVariables.VariableName', 'InputVariables.VariableDescription',
  'OutputVariables.VariableName', 'OutputVariables.VariableDescription',
] as const;

/**
 * A rule and the options that publish it, kept together.
 *
 * The adapter needs both halves and they must agree. Pairing them at the point
 * of construction means an adapter cannot pick up rule *n* with options *m*,
 * which two parallel arrays indexed by position would allow.
 */
export interface StandardSkillRuleEntry {
  readonly rule: Rule<ParsedBotData>;
  readonly options: CoreStandardOptions;
}

const fieldEntries: readonly StandardSkillRuleEntry[] = standardFieldRules.map(
  ([, title, singular], index): StandardSkillRuleEntry => {
    const fieldPath = STANDARD_FIELD_PATHS[index];
    const topicField = index < 2;
    const direction = index < 4 ? 'input' : 'output';
    const options: CoreStandardOptions = {
      family: FAMILY, fieldPath, build: model => buildStandardFieldPattern(model, index),
    };
    return {
      options,
      rule: standardRule({
        id: `local-pattern-${index + 1}`,
        title,
        harnesses: ['standard'],
        pillar: 'skills',
        subjectScope: 'agent',
        execution: 'deterministic',
        severity: topicField ? 'high' : 'medium',
        tags: ['quality'],
        references: ['ms-tools-skills'],
        prose: {
          question: topicField
            ? `Does every applicable topic have a ${singular}?`
            : `Does every declared ${direction} variable have a ${singular}?`,
          summary: 'Assess the effective metadata on applicable Standard topics and declared variables.',
          why: topicField ? 'Clear model-facing metadata describes a topic and its selection conditions.'
            : 'Explicit variable metadata helps makers understand the caller contract and downstream use.',
          fix: standardFieldRecommendations[index],
          passWhen: [topicField
            ? `Every applicable reviewed topic has a nonblank ${singular}.`
            : `Every declared ${direction} variable has a nonblank ${singular}.`],
          failWhen: [topicField
            ? `An applicable reviewed topic has no nonblank ${singular}.`
            : `A declared ${direction} variable has no nonblank ${singular}.`],
          notApplicableWhen: ['No reviewed topic is in scope for this field.'],
        },
        evidence: { fieldPaths: [fieldPath] },
      }, options),
    };
  },
);

export const LOCAL_PATTERN_11_OPTIONS: CoreStandardOptions = {
  family: FAMILY, fieldPath: 'ModelDescription', build: buildStandardTopicReferencePattern,
};

export const LOCAL_PATTERN_11: Rule<ParsedBotData> = standardRule({
  id: 'local-pattern-11',
  title: 'Invalid Topic Reference',
  harnesses: ['standard'],
  pillar: 'skills',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-tools-skills'],
  prose: {
    question: 'Does every topic reference in a model description name a reviewed topic?',
    summary: 'Compare explicit topic references against reviewed display names and unambiguous schema aliases.',
    why: 'A configuration reference should identify the intended topic without ambiguous placeholders.',
    fix: 'Use the Copilot Studio "/" picker to insert the exact target topic name.',
    passWhen: ['Every detected topic reference is an exact reviewed topic display name.'],
    failWhen: ['A model description names a placeholder or internal schema alias that is not a reviewed topic display name.'],
    notApplicableWhen: ['No reviewed topic is in scope for model-description review.'],
  },
  evidence: { fieldPaths: ['ModelDescription'] },
}, LOCAL_PATTERN_11_OPTIONS);

/** `local-pattern-1` … `local-pattern-6`, then `local-pattern-11`. Order is published. */
export const standardSkillRuleEntries: readonly StandardSkillRuleEntry[] = [
  ...fieldEntries,
  { rule: LOCAL_PATTERN_11, options: LOCAL_PATTERN_11_OPTIONS },
];

export const standardSkillCoreRules: readonly Rule<ParsedBotData>[] =
  standardSkillRuleEntries.map(entry => entry.rule);
