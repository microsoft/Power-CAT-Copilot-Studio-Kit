import { SKL_08, SKL_15 } from '../../../review-core/rules/skills.rules';
import { standardSkillRuleEntries } from '../../../review-core/rules/standard-skills.rules';
import { defineCoreCopilotRule } from './copilotRuleDefinition';
import { defineCoreStandardRule } from './standardRuleDefinition';

const FAMILY = 'Skills';

export const standardSkillRules = standardSkillRuleEntries.map(
  ({ rule, options }) => defineCoreStandardRule(rule, options),
);

// SKL-09 is deliberately absent: it declares `execution: 'ai'`, so it has no
// deterministic check to publish and the two skill nodes decide it instead.
// SKL-15 carries the mechanical half of the same question and is deterministic,
// so it publishes here and keeps answering when the workflow is unreachable.
const copilotOptions = { family: FAMILY, optionalPopulation: 'skills' as const, inlineSkillsOnly: true };
const registered = [
  defineCoreCopilotRule(SKL_08, copilotOptions),
  defineCoreCopilotRule(SKL_15, copilotOptions),
];
export const skillRules = registered.map(rule => rule.legacy);
export const unifiedSkillRules = registered.map(rule => rule.unified);
