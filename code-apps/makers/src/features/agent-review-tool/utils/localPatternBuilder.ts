import type { LocalPattern, ParsedBotData } from '../contracts/ServiceContracts';
import { standardSkillRules } from '../agents-experience/services/rules/skillRules';
import { standardToolRules } from '../agents-experience/services/rules/toolRules';
import { standardEvaluationRules } from '../agents-experience/services/rules/evaluationRules';
import { standardConnectedAgentRules } from '../agents-experience/services/rules/connectedAgentRules';

/** Legacy AI assembler projection: keep historical order and omitted empty-child rows. */
export function buildLocalPatterns(data: ParsedBotData): LocalPattern[] {
  const rules = [
    ...standardSkillRules.slice(0, 6), ...standardToolRules, ...standardEvaluationRules,
    ...standardSkillRules.slice(6), ...standardConnectedAgentRules,
  ];
  return rules.flatMap(rule => {
    const pattern = rule.legacyPattern(data);
    return pattern ? [pattern] : [];
  });
}
