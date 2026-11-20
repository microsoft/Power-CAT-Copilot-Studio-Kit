import {
  TOL_01, TOL_02, TOL_03, TOL_04, TOL_05, TOL_06, toolOperationScopeIncomplete,
} from '../../../review-core/rules/tools.rules';
import { LOCAL_PATTERN_7, LOCAL_PATTERN_7_OPTIONS, LOCAL_PATTERN_12, LOCAL_PATTERN_12_OPTIONS, LOCAL_PATTERN_13, LOCAL_PATTERN_13_OPTIONS } from '../../../review-core/rules/standard-tools.rules';
import type { UnifiedCopilotRule } from '../../contracts/UnifiedReview';
import { defineCoreCopilotRule } from './copilotRuleDefinition';
import { defineCoreStandardRule } from './standardRuleDefinition';

const FAMILY = 'Tools';

export const standardToolRules = [
  defineCoreStandardRule(LOCAL_PATTERN_7, LOCAL_PATTERN_7_OPTIONS),
  defineCoreStandardRule(LOCAL_PATTERN_12, LOCAL_PATTERN_12_OPTIONS),
  defineCoreStandardRule(LOCAL_PATTERN_13, LOCAL_PATTERN_13_OPTIONS),
];

const tol01 = defineCoreCopilotRule(TOL_01, { family: FAMILY, optionalPopulation: 'tools', kind: 'record' });
const tol02 = defineCoreCopilotRule(TOL_02, { family: FAMILY, optionalPopulation: 'tools' });
const tol03 = defineCoreCopilotRule(TOL_03, { family: FAMILY, optionalPopulation: 'tools' });
const tol04 = defineCoreCopilotRule(TOL_04, { family: FAMILY, optionalPopulation: 'tools' });
const tol05 = defineCoreCopilotRule(TOL_05, { family: FAMILY, optionalPopulation: 'tools' });
// No optionalPopulation: an agent with no connector tool can still have an agent flow that needs user sign-in.
const tol06 = defineCoreCopilotRule(TOL_06, { family: FAMILY });

/**
 * TOL-05 is the one rule in this family that reports on the completeness of its own scope.
 *
 * A tool captured without a connector/operation pair cannot be compared against the
 * others, so the duplicate search covers less than the inventory and the assessment has
 * always said so through `incomplete`. A `RuleOutcome` has no way to express "answered,
 * but over part of the population" — `could-not-run` is the whole-rule version of that
 * and would change the outcome — so the flag is re-published here instead, from the same
 * predicate the rule itself skips on. Only ever raised, never cleared: everything ART
 * already folds into `incomplete` (partial populations, unverified evidence) stays.
 *
 * This deliberately stays a wrapper rather than becoming a `CoreCopilotOptions` hook
 * alongside `evidence`. A hook would raise the flag *inside* `defineCopilotRule`, where
 * `outcome === 'pass' && inspection.incomplete` is rewritten to `could-not-run` — and an
 * agent with three tools, one missing an `operationId` and no duplicates among the rest,
 * passes TOL-05 with an incomplete scope. That is an ordinary configuration, and turning
 * it into `could-not-run` would drop the rule out of the scoring denominator entirely.
 * Applying the flag after `evaluate` keeps `pass` + `incomplete: true`, which is what ART
 * has always published. Revisit in Phase 3, where the scorer, not the adapter, decides
 * what a partially-scoped pass is worth.
 */
const tol05Unified: UnifiedCopilotRule = {
  ...tol05.unified,
  evaluate(context) {
    const assessment = tol05.unified.evaluate(context);
    if (assessment.incomplete || !toolOperationScopeIncomplete(context.model)) return assessment;
    return { ...assessment, incomplete: true };
  },
};

export const toolRules = [tol01.legacy, tol02.legacy, tol03.legacy, tol04.legacy, tol05.legacy, tol06.legacy];
export const unifiedToolRules = [
  tol01.unified, tol02.unified, tol03.unified, tol04.unified, tol05Unified, tol06.unified,
];

