import type { Rule } from './ruleTypes.js';
import { distinctGraders, formatGrader } from '../graders.js';

const FAMILY = 'Evaluation';
const SIMILARITY_GRADERS = /similarity|textmatch|text match|exactmatch|exact match|comparemeaning|compare meaning/i;

export const evaluationRules: Rule[] = [
  {
    id: 'EVL-01', family: FAMILY, severity: 'warning', referenceId: 'ms-eval-intro',
    check(model) {
      if (model.evaluationSets.length > 0) return null;
      return {
        id: 'EVL-01', family: FAMILY, severity: 'warning', referenceId: 'ms-eval-intro', ai: false,
        title: 'No evaluation test set exists',
        fact: 'EvaluationSet components: 0',
        why: 'Evaluations validate agent behavior before publishing.',
        fix: 'Create a test set in the Evaluate tab and run it before publishing.',
      };
    },
  },
  {
    id: 'EVL-03', family: FAMILY, severity: 'info', referenceId: 'ms-eval-create', kind: 'record',
    check(model) {
      const graders = distinctGraders(model.evaluationSets).map(formatGrader);
      if (graders.length === 0) return null;
      return {
        id: 'EVL-03', family: FAMILY, severity: 'info', referenceId: 'ms-eval-create', ai: false,
        title: `Graders configured: ${graders.join(', ')}`,
        fact: `graders: ${graders.join(', ')} · test cases: ${model.testCases.length}`,
        why: 'General quality scores relevance, groundedness, completeness, and abstention; similarity/text-match graders require expected responses.',
        fix: 'No action required — surfaced for the review record.',
      };
    },
  },
  {
    id: 'EVL-04', family: FAMILY, severity: 'warning', referenceId: 'ms-eval-create',
    check(model) {
      const graders = model.evaluationSets.flatMap(s => s.graders);
      const needsExpected = graders.some(g => SIMILARITY_GRADERS.test(g));
      if (!needsExpected) return null;
      const missing = model.testCases.filter(c => !c.expected || c.expected.trim().length === 0);
      if (missing.length === 0) return null;
      return {
        id: 'EVL-04', family: FAMILY, severity: 'warning', referenceId: 'ms-eval-create', ai: false,
        title: `${missing.length} test cases lack an expected response`,
        fact: `similarity/text-match grader present; test cases without expected: ${missing.length}`,
        why: 'Similarity and text-match graders score against a reference answer; cases without one cannot be graded.',
        fix: 'Add an expected response to each test case, or use the General quality grader.',
      };
    },
  },
  {
    id: 'EVL-05', family: FAMILY, severity: 'info', referenceId: 'ms-eval-create',
    check(model) {
      if (model.testCases.length === 0 || model.multiTurnCases.length > 0) return null;
      return {
        id: 'EVL-05', family: FAMILY, severity: 'info', referenceId: 'ms-eval-create', ai: false,
        title: 'Test set is single-turn only',
        fact: `single-turn cases: ${model.testCases.length} · MultiTurnEvaluationCase: ${model.multiTurnCases.length}`,
        why: 'Single-turn cases cannot measure multi-turn behavior such as clarify-then-act flows.',
        fix: 'Generate multi-turn conversations to cover clarification flows the instructions define.',
      };
    },
  },
  {
    id: 'EVL-06', family: FAMILY, severity: 'info', referenceId: 'ms-eval-results',
    check(model) {
      if (model.evaluationSets.length === 0) return null;
      return {
        id: 'EVL-06', family: FAMILY, severity: 'info', referenceId: 'ms-eval-results', ai: false,
        title: 'Evaluation results are retained for 89 days',
        fact: `evaluation sets: ${model.evaluationSets.length}`,
        why: 'Product retention is limited; run history older than 89 days is not kept in Copilot Studio.',
        fix: 'Export run results to CSV if you need history beyond the retention window.',
      };
    },
  },
];
