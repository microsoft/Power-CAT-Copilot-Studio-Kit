/**
 * Evaluation coverage matrix (spec 013 §4.4). Maps each capability (tools,
 * skills, connected agents) to the test cases that exercise it, and emits the
 * EVL-02 uncovered-capability finding.
 *
 * Three evidence states, in priority order:
 *
 * 1. **Declared** — a conversation case names the capability under
 *    `expectedExecutionSteps[].schemaName`. That value is the capability's
 *    `schemaname` verbatim, so the match is exact and reflects the maker's own
 *    statement of intent. Always preferred when any case declares steps.
 * 2. **Inferred** — no case declares anything, so fall back to looking for the
 *    capability's display name inside the case input. A weak heuristic kept
 *    only for compatible and historical evaluation shapes.
 * 3. **Unverified** — General Quality conversation cases carry no expected or
 *    observed capability calls. Prompt wording is not execution evidence, so
 *    this shape receives no coverage or uncovered-capability claims.
 *
 * Single-response cases (`EvaluationData`) have no `expectedExecutionSteps`
 * field at all, so a set built only from those can never declare coverage —
 * reported as `canDeclare: false` rather than as an uncovered capability.
 *
 * Coverage claims describe *asserted intent*, never observed execution: run
 * results are not available to a static review.
 */
import type { AgentsExperienceModel, AeTestCase } from '../contracts/AgentsExperienceModel';
import type { GroundedFinding, RuleEvaluationResult } from '../contracts/Findings';
import { norm } from './rules/ruleTypes';
import type { CopilotRuleContext, UnifiedPopulation } from '../contracts/UnifiedReview';
import { copilotPopulationAvailability } from './rules/copilotRuleDefinition';

/** How a capability's asserting cases were identified. */
export type CoverageBasis = 'declared' | 'inferred' | 'unverified';

export interface CoverageRow {
  name: string;
  kind: string;
  cases: number;
  /** Names of the asserting cases, for drill-down. */
  caseNames: string[];
}

/** Per-set rollup: coverage is a property of the set you run, not of the agent. */
export interface SetCoverage {
  name: string;
  caseCount: number;
  /** Cases in this set that declare at least one expected capability. */
  declaringCases: number;
  /** False when the available set shape cannot declare expected capability steps. */
  canDeclare: boolean;
  covered: number;
  total: number;
}

export interface CoverageResult {
  rows: CoverageRow[];
  covered: number;
  total: number;
  uncoveredNames: string[];
  basis: CoverageBasis;
  /** Cases across the agent that declare at least one expected capability. */
  declaringCases: number;
  sets: SetCoverage[];
  finding: GroundedFinding | null;
  /**
   * One EVL-02 outcome per capability, so coverage is a list of checks rather than a single verdict.
   *
   * Coverage used to reach the score without ever reaching `ruleResults`, which left it the one
   * judgement in the review with no row behind it: a reviewer could read "4 capabilities have no
   * test coverage" and had no way to say that three of them are deliberately untested. An instance
   * per capability gives the consolidated view a row to group and the override a key to name.
   *
   * Keyed `EVL-02:<name>` to match the per-capability dismissal `deriveEvaluationSignals` already
   * reads, so setting one aside from the list and crediting it in the score are the same fact.
   *
   * Empty when there is nothing to judge by — no test cases at all, or a shape that cannot express
   * coverage. `EVL-01` already reports that absence, and rows here would restate it once per
   * capability while implying coverage had been measured and found missing.
   *
   * These rows are the consolidated view's grouping and the dismissal override's key; they are not
   * a second scoring input. Since D-15 the Evaluation pillar is scored by the `review-core` rules
   * (the `EVL-01` gate, then `EVL-02`/`EVL-05`/`EVL-04` by weight), and `EVL-02` takes its partial
   * credit from the same coverage ratio these rows describe — so the two cannot disagree.
   */
  ruleResults: RuleEvaluationResult[];
}

interface Capability { name: string; kind: string; schemaname: string }

const declares = (c: AeTestCase, schemaname: string): boolean =>
  schemaname.length > 0 && (c.expectedTools ?? []).some(s => s.schemaName === schemaname);

const matchByName = (cases: AeTestCase[], capName: string): AeTestCase[] => {
  const needle = norm(capName);
  if (needle.length === 0) return [];
  return cases.filter(c => norm(c.input ?? c.name).includes(needle));
};

/**
 * Detects the evaluation shape currently emitted by the Microsoft Copilot
 * experience. The rule depends only on normalized evaluation evidence, not on
 * a particular agent, capability name, or test prompt.
 */
function hasUnverifiableConversationCoverage(model: AgentsExperienceModel): boolean {
  return model.evaluationSets.length > 0
    && model.testCases.length > 0
    && model.testCases.every(testCase => testCase.multiTurn === true)
    && model.evaluationSets.every(set =>
      set.graders.length > 0
      && set.graders.every(grader => grader === 'GeneralQualityGrader'))
    && !model.testCases.some(testCase => (testCase.expectedTools?.length ?? 0) > 0);
}

/** Measure captured evaluation coverage only when its required populations are complete. */
export function computeCoverage(
  model: AgentsExperienceModel,
  availability?: CopilotRuleContext['availability'],
): CoverageResult {
  const populations: UnifiedPopulation[] = ['evaluation', 'tools', 'skills', 'connectedAgents'];
  const incomplete = populations.filter(population =>
    copilotPopulationAvailability({ harness: 'copilot', model, availability }, population) !== 'complete');
  const capabilities: Capability[] = [
    ...model.tools.map(t => ({
      name: t.name,
      kind: t.kind === 'McpTool' ? 'MCP tool' : 'Connector tool',
      schemaname: t.schemaname,
    })),
    ...model.skills.map(s => ({
      name: s.frontmatterName ?? s.name,
      kind: 'Skill',
      schemaname: s.schemaname,
    })),
    ...model.connectedAgents.map(a => ({
      name: a.name,
      kind: 'Connected agent',
      schemaname: a.schemaname,
    })),
  ];

  const declaringCases = model.testCases.filter(c => (c.expectedTools ?? []).length > 0);
  const basis: CoverageBasis = incomplete.length > 0 ? 'unverified' : declaringCases.length > 0
    ? 'declared'
    : hasUnverifiableConversationCoverage(model)
      ? 'unverified'
      : 'inferred';

  const rows: CoverageRow[] = capabilities.map(cap => {
    const matches = basis === 'declared'
      ? declaringCases.filter(c => declares(c, cap.schemaname))
      : basis === 'inferred'
        ? matchByName(model.testCases, cap.name)
        : [];
    return { name: cap.name, kind: cap.kind, cases: matches.length, caseNames: matches.map(c => c.name) };
  });

  const uncovered = rows.filter(r => r.cases === 0);
  const covered = basis === 'unverified' ? 0 : rows.length - uncovered.length;

  return {
    rows,
    covered,
    total: rows.length,
    uncoveredNames: basis === 'unverified' ? [] : uncovered.map(r => r.name),
    basis,
    declaringCases: declaringCases.length,
    sets: computeSetCoverage(model, capabilities, basis),
    finding: basis === 'unverified'
      ? null
      : buildFinding(uncovered, model.testCases.length, basis),
    ruleResults: incomplete.length > 0 ? [{
      key: 'EVL-02', ruleId: 'EVL-02', family: 'Evaluation', status: 'failed', incomplete: true,
      reason: `Complete coverage inputs were not captured: ${incomplete.join(', ')}.`,
    }] : basis === 'unverified' || model.testCases.length === 0
      ? []
      : rows.map(row => ({
          key: `EVL-02:${row.name}`,
          ruleId: 'EVL-02',
          family: 'Evaluation',
          status: row.cases > 0 ? 'passed' : 'warning',
          subject: row.name,
          subjectId: row.name,
        })),
  };
}

/**
 * Rolls coverage up per evaluation set. Requires the case→set link, so it
 * yields an empty list for reviews persisted before that link was captured.
 */
function computeSetCoverage(
  model: AgentsExperienceModel,
  capabilities: Capability[],
  basis: CoverageBasis,
): SetCoverage[] {
  return model.evaluationSets.flatMap(set => {
    if (!set.id) return [];
    const cases = model.testCases.filter(c => c.setId === set.id);
    if (cases.length === 0) return [];
    const canDeclare = basis !== 'unverified' && cases.some(c => c.multiTurn);
    const declaring = cases.filter(c => (c.expectedTools ?? []).length > 0);
    const covered = capabilities.filter(cap => declaring.some(c => declares(c, cap.schemaname))).length;
    return [{
      name: set.displayName ?? set.name,
      caseCount: cases.length,
      declaringCases: declaring.length,
      canDeclare,
      covered,
      total: capabilities.length,
    }];
  });
}

function buildFinding(
  uncovered: CoverageRow[],
  testCaseCount: number,
  basis: Exclude<CoverageBasis, 'unverified'>,
): GroundedFinding | null {
  if (uncovered.length === 0 || testCaseCount === 0) return null;
  const fact = uncovered.map(r => `${r.name} (${r.kind})`).join('\n');
  return basis === 'declared'
    ? {
        id: 'EVL-02', family: 'Evaluation', severity: 'warning', referenceId: 'ms-eval-intro', ai: false,
        title: `${uncovered.length} capabilities have no test coverage`,
        fact,
        why: 'No test case expects a call to these capabilities, so a regression in them is invisible to an evaluation re-run.',
        fix: 'Add a multi-turn test case for each and set its expected tool call to that capability.',
      }
    : {
        id: 'EVL-02', family: 'Evaluation', severity: 'warning', referenceId: 'ms-eval-intro', ai: false,
        title: `${uncovered.length} capabilities have no declared test coverage`,
        fact,
        why: 'No test case names the capability it exercises, so coverage cannot be verified — the match shown is guessed from case wording alone.',
        fix: 'Use multi-turn test cases and set an expected tool call on each, so coverage is measured rather than guessed.',
      };
}
