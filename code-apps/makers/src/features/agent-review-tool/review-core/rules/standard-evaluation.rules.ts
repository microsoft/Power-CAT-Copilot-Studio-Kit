/**
 * The one Standard rule over configured evaluation coverage.
 *
 * Two things here look wrong and are not:
 *
 * - **It counts, it does not evaluate.** The number it reads is how many test
 *   components were captured, never whether any of them ran or passed. That is
 *   the CP1 compatibility shape the hand-written rule had, and widening it to
 *   linked sets/cases or executed results would change the verdict of every
 *   Standard agent that has tests configured but not run.
 * - **It can never fail on a ZIP.** The builder below already answers
 *   `not-applicable` for a solution ZIP, and `assessStandard` then forces the
 *   whole rule to `could-not-run` with its own reason string, keyed on this
 *   exact id. Both are deliberate; the arbitration in `assessStandard` is the
 *   only authority on a Standard verdict, so the builder states the fact and the
 *   arbitration states the limitation.
 *
 * The builder lives in this file rather than in the adapter because it is the
 * rule's algorithm, and because it keeps the import direction one-way: the
 * adapter imports this file, and this file imports nothing from the adapter.
 *
 * `gate` and `weight` are deliberately absent. Those belong to the EVL-* rules in
 * `evaluation.rules.ts`, which own the Evaluation pillar's shares and its one
 * precondition; a second gate on the same harness/pillar pair would be rejected
 * by the registry and would move scores.
 */

import type { LocalPattern, ParsedBotData } from '../../contracts/ServiceContracts';
import { getPatternSeverity, isPopulationIncomplete } from '../../utils/patternUtils';
import type { Rule } from '../rule';
import { standardRule, type CoreStandardOptions } from './standard';

/** CP1 compatibility check: configured-component count, not linked evaluation coverage. */
export function buildStandardEvaluationPattern(data: ParsedBotData): LocalPattern {
  const incompletePopulation = isPopulationIncomplete(data);
  const zip = data.source === 'zip';
  const inadequateTests = data.testCaseCount < 10;
  return {
    patternId: 'local-pattern-8', patternName: 'Inadequate Test Cases',
    description: zip ? 'A solution ZIP does not establish the complete agent evaluation coverage.'
      : `${data.testCaseCount} test case(s) are present in the reviewed configuration.`,
    recommendation: 'Review evaluation coverage for representative supported and unsupported requests. The authoring target is at least 10 test cases.',
    status: !zip && data.configurationAvailable !== false && !inadequateTests,
    assessmentStatus: zip ? 'not-applicable' : data.configurationAvailable === false || (inadequateTests && incompletePopulation)
      ? 'not-assessed' : inadequateTests ? 'fail' : 'pass',
    assessmentReason: zip ? 'Evaluation coverage cannot be assessed from this review source.'
      : data.configurationAvailable === false ? 'No readable component configuration was supplied.'
        : inadequateTests && incompletePopulation ? 'Unresolved components prevent a complete evaluation count. The confirmed count is only a lower bound.'
        : 'This check counts configured tests; it does not execute them.',
    topics: [], category: 'Evaluation', severity: getPatternSeverity('Inadequate Test Cases'),
    evidenceKind: 'authoring-guidance',
  };
}

export const LOCAL_PATTERN_8_OPTIONS: CoreStandardOptions = {
  family: 'Evaluation', fieldPath: 'testCaseCount', build: buildStandardEvaluationPattern,
};

export const LOCAL_PATTERN_8: Rule<ParsedBotData> = standardRule({
  id: 'local-pattern-8',
  title: 'Inadequate Test Cases',
  harnesses: ['standard'],
  pillar: 'evaluation',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-eval-intro', 'ms-eval-create'],
  prose: {
    question: 'Does the captured configuration carry enough test cases to be a representative evaluation?',
    summary: 'CP1 compatibility check counts configured test components, not fully linked sets/cases or executed results.',
    why: 'Representative evaluations help validate supported and unsupported requests before publication.',
    fix: 'Review representative evaluation cases; the compatibility authoring target is at least ten.',
    passWhen: ['The readable configuration carries at least 10 test cases.'],
    failWhen: ['Fewer than 10 test cases are present in a complete, readable configuration.'],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['testCaseCount'] },
}, LOCAL_PATTERN_8_OPTIONS);

export const standardEvaluationCoreRules: readonly Rule<ParsedBotData>[] = [LOCAL_PATTERN_8];
