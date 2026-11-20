/**
 * Which rule outcomes report configuration rather than judging it.
 *
 * A record rule states a fact — the model in use, the harness, how many skills and tools the agent
 * has, that memory is on, how long results are kept. Nothing about a fact can be right or wrong, so
 * these are excluded from both the checks-passed ratio and the score, and they render in the Agent
 * info category rather than beside real results.
 *
 * The rule declares `kind` itself, but reviews saved before it did carry none. Rule ids are stable
 * and this list is fixed, so resolving by id repairs saved reviews without a re-run — the same
 * approach the checks view already uses for rule subjects.
 */

import type { RuleEvaluationResult } from '../../contracts/Findings';

export const RECORD_RULE_IDS: ReadonlySet<string> = new Set([
  'LCY-01', 'LCY-02', 'CON-04', 'KNW-01', 'MDL-01', 'EVL-03', 'TOL-01',
  // Reclassified from scored `info`: these state configuration, they do not judge it.
  'EVL-06', 'KNW-04', 'INS-02',
]);

/** True when this outcome records configuration instead of judging it. */
export function isRecordResult(result: RuleEvaluationResult): boolean {
  return result.kind === 'record' || (result.kind === undefined && RECORD_RULE_IDS.has(result.ruleId));
}
