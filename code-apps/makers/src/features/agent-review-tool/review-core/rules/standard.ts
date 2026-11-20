/**
 * How a Standard rule is declared.
 *
 * A copilot rule's `check` *is* its algorithm, so it is written inline in the
 * rule. A Standard rule's algorithm is not: it is a `LocalPattern` builder plus
 * roughly a hundred lines of shared outcome arbitration — the ZIP limitation on
 * `local-pattern-8`, the second topic-scope pass on `local-pattern-11`, the
 * pass-to-could-not-run flip, the configuration-fact downgrade — which lives in
 * `assessStandard` and is the only authority on a Standard verdict.
 *
 * `standardRule` therefore does not ask an author to write a verdict. It takes
 * the declaration plus the builder and wires `check` to project that one
 * authority into a `RuleOutcome`, which is what the registry's
 * `execution !== 'ai' requires check` invariant asks for. The adapter publishes
 * the same assessment unprojected. One authority, two shapes.
 *
 * The closure refers to the rule it is being attached to, which is safe because
 * `check` is only ever called after construction returns.
 */

import type { ParsedBotData } from '../../contracts/ServiceContracts';
import {
  standardCheck, type CoreStandardOptions,
} from '../../agents-experience/services/rules/standardRuleDefinition';
import { rule, type Rule } from '../rule';

export type { CoreStandardOptions };

export function standardRule(
  declaration: Omit<Rule<ParsedBotData>, 'check'>, options: CoreStandardOptions,
): Rule<ParsedBotData> {
  const declared: Rule<ParsedBotData> = {
    ...declaration,
    check: model => standardCheck(declared, options, model),
  };
  return rule(declared);
}
