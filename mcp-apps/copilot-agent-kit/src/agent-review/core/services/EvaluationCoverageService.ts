/**
 * Evaluation coverage matrix (spec 013 §4.4). Maps each capability (tools,
 * skills, connected agents) to the test cases that exercise it, and emits the
 * EVL-02 uncovered-capability finding.
 *
 * Two mapping strategies, in priority order:
 *
 * 1. **Declared** — a conversation case names the capability under
 *    `expectedExecutionSteps[].schemaName`. That value is the capability's
 *    `schemaname` verbatim, so the match is exact and reflects the maker's own
 *    statement of intent. Always preferred when any case declares steps.
 * 2. **Inferred** — no case declares anything, so fall back to looking for the
 *    capability's display name inside the case input. A weak heuristic kept
 *    only so agents authored without declared steps still show something.
 *
 * Single-response cases (`EvaluationData`) have no `expectedExecutionSteps`
 * field at all, so a set built only from those can never declare coverage —
 * reported as `canDeclare: false` rather than as an uncovered capability.
 *
 * Coverage describes *asserted intent*, never observed execution: run results
 * are not available to a static review.
 */
import type { AgentsExperienceModel, AeTestCase } from '../contracts/AgentsExperienceModel.js';
import type { GroundedFinding } from '../contracts/Findings.js';
import { norm } from './rules/ruleTypes.js';

/** How a capability's asserting cases were identified. */
export type CoverageBasis = 'declared' | 'inferred';

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
  /** False when the set holds no conversation cases, so it cannot declare steps. */
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
}

interface Capability { name: string; kind: string; schemaname: string }

const declares = (c: AeTestCase, schemaname: string): boolean =>
  schemaname.length > 0 && (c.expectedTools ?? []).some(s => s.schemaName === schemaname);

const matchByName = (cases: AeTestCase[], capName: string): AeTestCase[] => {
  const needle = norm(capName);
  if (needle.length === 0) return [];
  return cases.filter(c => norm(c.input ?? c.name).includes(needle));
};

export function computeCoverage(model: AgentsExperienceModel): CoverageResult {
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
  const basis: CoverageBasis = declaringCases.length > 0 ? 'declared' : 'inferred';

  const rows: CoverageRow[] = capabilities.map(cap => {
    const matches = basis === 'declared'
      ? declaringCases.filter(c => declares(c, cap.schemaname))
      : matchByName(model.testCases, cap.name);
    return { name: cap.name, kind: cap.kind, cases: matches.length, caseNames: matches.map(c => c.name) };
  });

  const uncovered = rows.filter(r => r.cases === 0);
  const covered = rows.length - uncovered.length;

  return {
    rows,
    covered,
    total: rows.length,
    uncoveredNames: uncovered.map(r => r.name),
    basis,
    declaringCases: declaringCases.length,
    sets: computeSetCoverage(model, capabilities),
    finding: buildFinding(uncovered, model.testCases.length, basis),
  };
}

/**
 * Rolls coverage up per evaluation set. Requires the case→set link, so it
 * yields an empty list for reviews persisted before that link was captured.
 */
function computeSetCoverage(model: AgentsExperienceModel, capabilities: Capability[]): SetCoverage[] {
  return model.evaluationSets.flatMap(set => {
    if (!set.id) return [];
    const cases = model.testCases.filter(c => c.setId === set.id);
    if (cases.length === 0) return [];
    const canDeclare = cases.some(c => c.multiTurn);
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
  basis: CoverageBasis,
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
