import { distinctGraders, formatGrader, evaluationGraderRequiresExpectedResponse } from '../graders';
import { copilotResult, defineCopilotRule, type CopilotRuleSpec, type CopilotInspection } from './copilotRuleDefinition';
import { defineCoreStandardRule } from './standardRuleDefinition';
import { defineStandardEvaluationRule } from './standardEvaluationAdapter';
import type { EvaluationConfiguration } from '../../contracts/EvaluationEvidence';
import {
  LOCAL_PATTERN_8, LOCAL_PATTERN_8_OPTIONS,
} from '../../../review-core/rules/standard-evaluation.rules';

const FAMILY = 'Evaluation';

export const standardEvaluationRules = [defineCoreStandardRule(LOCAL_PATTERN_8, LOCAL_PATTERN_8_OPTIONS)];

interface EvaluationRuleSpec extends Omit<CopilotRuleSpec, 'inspect'> {
  inspect(model: EvaluationConfiguration): CopilotInspection;
}

const definitions: EvaluationRuleSpec[] = [
  {
    id: 'EVL-01', family: FAMILY, severity: 'warning', referenceId: 'ms-eval-intro',
    title: 'An evaluation test set is configured', fact: 'Check for at least one captured evaluation-set component.',
    why: 'A configured test set is a prerequisite for evaluation; its presence does not prove executed test success.',
    fix: 'Create a representative test set and evaluate the agent before publication.',
    populations: ['evaluation'], completeForFailure: ['evaluation'], fieldPath: 'evaluationSets',
    inspect(model) {
      if (model.evaluationSets.length > 0) return copilotResult('pass', null);
      return copilotResult('fail', {
        id: 'EVL-01', family: FAMILY, severity: 'warning', referenceId: 'ms-eval-intro', ai: false,
        title: 'No evaluation test set exists',
        fact: 'EvaluationSet components: 0',
        why: 'Evaluations validate agent behavior before publishing.',
        fix: 'Create a test set in the Evaluate tab and run it before publishing.',
      });
    },
  },
  {
    id: 'EVL-03', family: FAMILY, severity: 'info', referenceId: 'ms-eval-create', kind: 'record',
    title: 'Evaluation grader inventory', fact: 'Record the captured grader configuration and case count.',
    why: 'Grader choices explain evaluation configuration, not evaluation results.',
    fix: 'No action required — inspect graders when maintaining test sets.',
    populations: ['evaluation'], fieldPath: 'evaluationSets.graders',
    inspect(model) {
      const graders = distinctGraders(model.evaluationSets).map(formatGrader);
      if (graders.length === 0) return copilotResult('not-applicable', null, 'No configured graders are present in the captured sets.');
      return copilotResult('pass', {
        id: 'EVL-03', family: FAMILY, severity: 'info', referenceId: 'ms-eval-create', ai: false,
        title: `Graders configured: ${graders.join(', ')}`,
        fact: `graders: ${graders.join(', ')} · test cases: ${model.testCases.length}`,
        why: 'General quality scores relevance, groundedness, completeness, and abstention; similarity/text-match graders require expected responses.',
        fix: 'No action required — surfaced for the review record.',
      });
    },
  },
  {
    id: 'EVL-04', family: FAMILY, severity: 'warning', referenceId: 'ms-eval-create',
    title: 'Expected responses accompany similarity-based evaluation',
    fact: 'Inspect captured case expectations when any captured set uses a similarity/text-match grader.',
    why: 'Similarity-based graders require reference responses; the CP1 base check is agent-wide, not a shared set/case parser.',
    fix: 'Provide expected responses or choose a grader that does not require them.',
    populations: ['evaluation'], fieldPath: 'testCases.expected',
    inspect(model) {
      const graders = model.evaluationSets.flatMap(s => s.graders);
      const needsExpected = graders.some(evaluationGraderRequiresExpectedResponse);
      if (!needsExpected) return copilotResult('not-applicable', null, 'No captured grader requires an expected response.');
      const missing = model.testCases.filter(c => !c.expected || c.expected.trim().length === 0);
      if (model.testCases.length === 0) return copilotResult('not-applicable', null, 'No captured test cases can be inspected for expected responses.');
      if (missing.length === 0) return copilotResult('pass', null);
      return copilotResult('fail', {
        id: 'EVL-04', family: FAMILY, severity: 'warning', referenceId: 'ms-eval-create', ai: false,
        title: `${missing.length} test cases lack an expected response`,
        fact: `similarity/text-match grader present; test cases without expected: ${missing.length}`,
        why: 'Similarity and text-match graders score against a reference answer; cases without one cannot be graded.',
        fix: 'Add an expected response to each test case, or use the General quality grader.',
      }, undefined, missing.map(c => ({
        componentId: c.componentIdUnique ?? c.componentId, schemaName: c.schemaname,
        fieldPath: 'testCases.expected', quote: c.expected ?? '',
        status: 'verified', reason: 'Expected response is absent on this captured case; CP1 uses the existing agent-wide grader heuristic.',
      })));
    },
  },
  {
    id: 'EVL-05', family: FAMILY, severity: 'warning', referenceId: 'ms-eval-create',
    title: 'Configured evaluation includes multi-turn cases',
    fact: 'Compare captured test cases and multi-turn case components.',
    why: 'Multi-turn cases provide configuration coverage for clarification flows, not proof those flows work.',
    fix: 'Add multi-turn evaluation cases for supported clarification flows.',
    populations: ['evaluation'], completeForFailure: ['evaluation'], fieldPath: 'testCases/multiTurnCases',
    inspect(model) {
      if (model.testCases.length === 0) return copilotResult('not-applicable', null, 'No test cases are configured.');
      if (model.multiTurnCases.length > 0) return copilotResult('pass', null);
      return copilotResult('fail', {
        id: 'EVL-05', family: FAMILY, severity: 'warning', referenceId: 'ms-eval-create', ai: false,
        title: 'Test set is single-turn only',
        fact: `single-turn cases: ${model.testCases.length} · MultiTurnEvaluationCase: ${model.multiTurnCases.length}`,
        why: 'Single-turn cases cannot measure multi-turn behavior such as clarify-then-act flows.',
        fix: 'Generate multi-turn conversations to cover clarification flows the instructions define.',
      });
    },
  },
  {
    id: 'EVL-06', family: FAMILY, severity: 'info', referenceId: 'ms-eval-results', kind: 'record',
    title: 'Evaluation history retention guidance', fact: 'Record retention guidance when evaluation sets are configured.',
    why: 'Product retention limits may require exporting evaluation history.',
    fix: 'Review the cited current retention guidance and export results when longer retention is needed.',
    populations: ['evaluation'], fieldPath: 'evaluationSets',
    inspect(model) {
      if (model.evaluationSets.length === 0) return copilotResult('not-applicable', null, 'No evaluation sets are configured.');
      return copilotResult('pass', {
        id: 'EVL-06', family: FAMILY, severity: 'info', referenceId: 'ms-eval-results', ai: false,
        title: 'Evaluation results are retained for 89 days',
        fact: `evaluation sets: ${model.evaluationSets.length}`,
        why: 'Product retention is limited; run history older than 89 days is not kept in Copilot Studio.',
        fix: 'Export run results to CSV if you need history beyond the retention window.',
      });
    },
  },
];

const registered = definitions.map(defineCopilotRule);
export const evaluationRules = registered.map(rule => rule.legacy);
export const unifiedEvaluationRules = registered.map(rule => rule.unified);

/** New Standard comparison rules reuse evaluation predicates on an evaluation-only evidence model. */
export const standardNativeEvaluationRules = definitions.map((definition, index) =>
  defineStandardEvaluationRule(registered[index].unified, definition.inspect));
