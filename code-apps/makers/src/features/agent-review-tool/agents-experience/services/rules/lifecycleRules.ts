/**
 * LCY-01 and LCY-02 now live in `review-core/rules/lifecycle.rules.ts`.
 *
 * This file is the ART publication point: it takes the rules as declared once
 * and hands them to the Copilot machinery that owns availability, evidence
 * synthesis and finding verification. `family: 'Lifecycle'` is ART's display
 * grouping, not a second classification axis, so it stays here. Nothing about
 * what either rule decides is restated.
 */
import { lifecycleRules as coreLifecycleRules } from '../../../review-core/rules/lifecycle.rules';
import { defineCoreCopilotRule } from './copilotRuleDefinition';

const registered = coreLifecycleRules.map(rule =>
  defineCoreCopilotRule(rule, { family: 'Lifecycle', kind: 'record' }));

export const lifecycleRules = registered.map(rule => rule.legacy);
export const unifiedLifecycleRules = registered.map(rule => rule.unified);
