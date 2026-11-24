/**
 * The Evaluation pillar — six rules, four of which carry weight.
 *
 * This file replaces `evaluationCoverageScore`, a hard-coded expression that
 * lived in `agents-experience/services/scoring.ts` and was copy-pasted a second
 * time into `rescorePillars`:
 *
 *     0.35 + 0.4 * coverageRatio + 0.15 * multiTurn + 0.1 * expectedOk
 *
 * Those four coefficients are now the `weight` on four rules, and the leading
 * `if (!hasSet) return 0` is `gate: true` on EVL-01. The arithmetic is unchanged
 * — 35 + 40 + 15 + 10 = 100 — but Evaluation is no longer a special case the
 * scorer has to know about, and adding a fifth evaluation rule is now the same
 * one-file edit as adding a rule to any other pillar.
 *
 * Two details are preserved deliberately, because getting either wrong moves
 * real scores:
 *
 * - **EVL-04 passes when no grader needs an expected response.** It is tempting
 *   to call that not-applicable, but not-applicable removes the rule from the
 *   denominator, which *raises* every other agent's evaluation score by
 *   redistributing its 10 points. Today's formula credits the full 10 in that
 *   case, so the rule passes: the requirement is satisfied, vacuously.
 * - **EVL-02 fails rather than opting out when coverage cannot be verified.**
 *   Opting out would hand back its 40 points to an agent whose coverage nobody
 *   could confirm, which is the "unmeasured scores well" failure this refactor
 *   exists to remove.
 */

import { rule, pass, fail, failPartial, notApplicable, type Rule } from '../rule';

/** How the coverage matrix matched capabilities to cases. */
export type CoverageBasis = 'declared' | 'inferred' | 'unverified';

/**
 * Everything the evaluation rules read, and nothing else.
 *
 * Deliberately structural rather than ART's `EvaluationConfiguration`. Both apps
 * capture agents differently, and `review-core` sits underneath both — importing
 * one app's contract here would point the dependency the wrong way. Each host
 * builds this from its own capture, which is also where per-capability dismissal
 * is folded into `covered`.
 */
export interface EvaluationContext {
  readonly evaluationSetCount: number;
  readonly testCaseCount: number;
  readonly multiTurnCaseCount: number;
  /** Distinct grader names, already formatted for display. */
  readonly graders: readonly string[];
  /** True when any configured grader scores against a reference answer. */
  readonly requiresExpectedResponse: boolean;
  /** Identifiers of cases with no expected response. Only meaningful when the above is true. */
  readonly casesMissingExpected: readonly string[];
  readonly coverage: {
    readonly total: number;
    readonly covered: number;
    readonly uncovered: readonly string[];
    readonly basis: CoverageBasis;
  };
}

const AGENTS = ['standard', 'copilot'] as const;

export const EVL_01: Rule<EvaluationContext> = rule<EvaluationContext>({
  id: 'EVL-01',
  title: 'An evaluation test set is configured',
  harnesses: AGENTS,
  pillar: 'evaluation',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'high',
  weight: 35,
  gate: true,
  prose: {
    question: 'Does the agent have an evaluation set with at least one test case?',
    why: 'Every other evaluation question assumes there is something to evaluate. Without a test set, a regression in any instruction, tool or knowledge source is invisible until a user finds it.',
    fix: 'Create a representative test set in the Evaluate tab and run it before publishing.',
    passWhen: ['At least one evaluation set exists and it holds at least one test case.'],
    failWhen: [
      'No evaluation set is configured.',
      'An evaluation set exists but contains no test cases.',
    ],
    notApplicableWhen: [],
    failTitle: 'No evaluation test set exists',
  },
  tags: ['quality'],
  references: ['ms-eval-intro'],
  evidence: {
    fieldPaths: ['evaluationSets', 'testCases'],
    populations: ['evaluation'],
    completeForFailure: ['evaluation'],
  },
  check(ctx) {
    if (ctx.evaluationSetCount > 0 && ctx.testCaseCount > 0) {
      return pass(`evaluation sets: ${ctx.evaluationSetCount} · test cases: ${ctx.testCaseCount}`);
    }
    return fail(
      `evaluation sets: ${ctx.evaluationSetCount} · test cases: ${ctx.testCaseCount}`,
      'Create a test set in the Evaluate tab, add representative supported and unsupported requests, and run it before publishing.',
    );
  },
});

export const EVL_02: Rule<EvaluationContext> = rule<EvaluationContext>({
  id: 'EVL-02',
  title: 'Every capability is exercised by a test case',
  harnesses: AGENTS,
  pillar: 'evaluation',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'high',
  weight: 40,
  prose: {
    question: 'Does each tool, skill and connected agent appear in at least one test case?',
    why: 'A capability no test case exercises is a capability no evaluation re-run can protect. It will keep passing the suite after it breaks.',
    fix: 'Add a test case for each uncovered capability and set its expected tool call to that capability.',
    passWhen: [
      'Every captured capability is named by at least one test case.',
      'The agent has no tools, skills or connected agents to cover.',
    ],
    failWhen: [
      'One or more capabilities are named by no test case.',
      'Coverage cannot be verified from what was captured.',
    ],
    notApplicableWhen: [],
    failTitle: 'Capabilities have no test coverage',
  },
  tags: ['quality'],
  references: ['ms-eval-intro'],
  evidence: {
    fieldPaths: ['testCases.expectedExecutionSteps', 'tools', 'skills', 'connectedAgents'],
    populations: ['evaluation'],
  },
  check(ctx) {
    const { total, covered, uncovered, basis } = ctx.coverage;
    if (basis === 'unverified') {
      return fail(
        'Coverage could not be established from the captured test cases.',
        'Use multi-turn test cases and set an expected tool call on each, so coverage is measured rather than guessed.',
      );
    }
    if (total === 0) return pass('The agent has no capabilities requiring coverage.');
    if (covered >= total) return pass(`${covered} of ${total} capabilities are covered.`);

    const detail = `${uncovered.length} of ${total} capabilities have no test coverage:\n${uncovered.join('\n')}`;
    const action = basis === 'declared'
      ? 'Add a test case for each listed capability and set its expected tool call to that capability.'
      : 'No test case names the capability it exercises, so the match shown is guessed. Set an expected tool call on each case so coverage is measured.';
    return failPartial(detail, action, covered / total, uncovered);
  },
});

export const EVL_03: Rule<EvaluationContext> = rule<EvaluationContext>({
  id: 'EVL-03',
  title: 'Evaluation grader inventory',
  harnesses: AGENTS,
  pillar: 'evaluation',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  prose: {
    question: 'Which graders is this agent evaluated with?',
    why: 'Grader choice explains what the evaluation measures. General quality scores relevance, groundedness, completeness and abstention; similarity and text-match graders score against a reference answer.',
    fix: 'No action required — inspect graders when maintaining test sets.',
    passWhen: ['At least one grader is configured.'],
    failWhen: [],
    notApplicableWhen: ['No configured graders are present in the captured sets.'],
  },
  tags: ['quality'],
  references: ['ms-eval-create'],
  evidence: { fieldPaths: ['evaluationSets.graders'], populations: ['evaluation'] },
  check(ctx) {
    if (ctx.graders.length === 0) {
      return notApplicable('No configured graders are present in the captured sets.');
    }
    return pass(`graders: ${ctx.graders.join(', ')} · test cases: ${ctx.testCaseCount}`);
  },
});

export const EVL_04: Rule<EvaluationContext> = rule<EvaluationContext>({
  id: 'EVL-04',
  title: 'Expected responses accompany similarity-based evaluation',
  harnesses: AGENTS,
  pillar: 'evaluation',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'high',
  weight: 10,
  prose: {
    question: 'Does every test case carry an expected response, where the grader needs one?',
    why: 'Similarity and text-match graders score against a reference answer. A case without one cannot be graded, so it silently contributes nothing to the result it appears in.',
    fix: 'Add an expected response to each test case, or use the General quality grader.',
    passWhen: [
      'Every case has an expected response.',
      'No configured grader requires one, so the requirement is satisfied.',
    ],
    failWhen: ['A grader requires an expected response and at least one case lacks it.'],
    notApplicableWhen: [],
    failTitle: 'Test cases lack an expected response',
  },
  tags: ['quality'],
  references: ['ms-eval-create'],
  evidence: { fieldPaths: ['testCases.expected', 'evaluationSets.graders'], populations: ['evaluation'] },
  check(ctx) {
    if (!ctx.requiresExpectedResponse) {
      return pass('No captured grader requires an expected response.');
    }
    if (ctx.casesMissingExpected.length === 0) {
      return pass(`All ${ctx.testCaseCount} test cases carry an expected response.`);
    }
    return fail(
      `similarity/text-match grader present; test cases without expected: ${ctx.casesMissingExpected.length}`,
      'Add an expected response to each listed test case, or switch the set to the General quality grader.',
      ctx.casesMissingExpected,
    );
  },
});

export const EVL_05: Rule<EvaluationContext> = rule<EvaluationContext>({
  id: 'EVL-05',
  title: 'Configured evaluation includes multi-turn cases',
  harnesses: AGENTS,
  pillar: 'evaluation',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'high',
  weight: 15,
  prose: {
    question: 'Does the test set include at least one multi-turn case?',
    why: 'Single-turn cases cannot measure behaviour that spans turns — clarifying questions, follow-ups, or any flow the instructions define as clarify-then-act.',
    fix: 'Add multi-turn evaluation cases for the clarification flows the instructions describe.',
    passWhen: ['At least one multi-turn evaluation case exists.'],
    failWhen: ['The test set contains only single-turn cases.'],
    notApplicableWhen: [],
    failTitle: 'Test set is single-turn only',
  },
  tags: ['quality'],
  references: ['ms-eval-create'],
  evidence: {
    fieldPaths: ['testCases', 'multiTurnCases'],
    populations: ['evaluation'],
    completeForFailure: ['evaluation'],
  },
  check(ctx) {
    if (ctx.multiTurnCaseCount > 0) return pass(`multi-turn cases: ${ctx.multiTurnCaseCount}`);
    return fail(
      `single-turn cases: ${ctx.testCaseCount} · multi-turn cases: 0`,
      'Generate multi-turn conversations covering the clarification flows the instructions define.',
    );
  },
});

export const EVL_06: Rule<EvaluationContext> = rule<EvaluationContext>({
  id: 'EVL-06',
  title: 'Evaluation history retention guidance',
  harnesses: AGENTS,
  pillar: 'evaluation',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  prose: {
    question: 'Is the maker aware that evaluation history is retained for a limited window?',
    why: 'Copilot Studio does not keep evaluation run history indefinitely, so trend analysis beyond the retention window needs an export.',
    fix: 'Export run results to CSV when you need history beyond the retention window.',
    passWhen: ['At least one evaluation set is configured, so retention applies.'],
    failWhen: [],
    notApplicableWhen: ['No evaluation sets are configured.'],
  },
  tags: ['quality'],
  references: ['ms-eval-results'],
  evidence: { fieldPaths: ['evaluationSets'], populations: ['evaluation'] },
  check(ctx) {
    if (ctx.evaluationSetCount === 0) return notApplicable('No evaluation sets are configured.');
    return pass(`evaluation sets: ${ctx.evaluationSetCount}`);
  },
});

export const evaluationRules: readonly Rule<EvaluationContext>[] = Object.freeze([
  EVL_01, EVL_02, EVL_03, EVL_04, EVL_05, EVL_06,
]);
