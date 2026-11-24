/**
 * MDL-01 now lives in `review-core/rules/model.rules.ts`.
 *
 * This file is the ART publication point: it takes the rule as declared once and
 * hands it to the Copilot machinery that owns availability, evidence synthesis
 * and finding verification. Nothing about what the rule decides is restated here.
 */
import { modelRules as coreModelRules } from '../../../review-core/rules/model.rules';
import { defineCoreCopilotRule } from './copilotRuleDefinition';

const registered = coreModelRules.map(rule =>
  defineCoreCopilotRule(rule, { family: 'Model', kind: 'record' }));

export const modelRules = registered.map(rule => rule.legacy);
export const unifiedModelRules = registered.map(rule => rule.unified);
