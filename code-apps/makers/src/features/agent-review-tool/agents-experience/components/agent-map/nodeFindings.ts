/**
 * Select the review findings that belong to one Agent map node. The root agent
 * receives the full review because it represents the complete reviewed agent.
 *
 * Attribution is by `componentIdUnique` only. Each rule stamps that id onto the
 * findings it raises, because the rule already holds the component it is
 * inspecting -- so the link is recorded at the point where it is known for
 * certain, not reconstructed afterwards.
 *
 * Deliberately no name matching. A component name parsed back out of a finding
 * title is a guess: names are not unique, they are user-supplied, and this
 * codebase has already shipped wrong Agent map edges built that way. A finding
 * that cannot be attributed with certainty is left off every node, because an
 * unattributed finding is recoverable from the Findings tab whereas a
 * misattributed one quietly sends a maker to fix the wrong component.
 */
import type { FindingView } from '../viewTypes';

/**
 * Exactly the finding fields the map reads.
 *
 * Narrower than `FindingView` on purpose: the map is shared with hosts that model findings their
 * own way, and asking them for fields it never touches would force them to invent values. A
 * `FindingView` satisfies this, so the Agent Review Tool passes its findings through unchanged.
 */
export type AgentMapFinding = Pick<FindingView, 'sev' | 'title' | 'componentIdUnique'>;
import type { AgentMapNode } from '../../contracts/AgentMap';

/** Severity order for display: worst first. */
const SEVERITY_RANK: Record<FindingView['sev'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export interface NodeFindingsResult {
  findings: AgentMapFinding[];
  errors: number;
  warnings: number;
  infos: number;
  /**
   * True when this node can never be attributed, because the review predates
   * finding-to-component stamping. Lets the panel say "not recorded" instead of
   * the misleading "no findings".
   */
  attributionUnavailable: boolean;
}

function summarizeFindings(findings: readonly AgentMapFinding[]): NodeFindingsResult {
  const sorted = findings
    .slice()
    .sort((left, right) => SEVERITY_RANK[left.sev] - SEVERITY_RANK[right.sev]);
  return {
    findings: sorted,
    errors: sorted.filter(finding => finding.sev === 'error').length,
    warnings: sorted.filter(finding => finding.sev === 'warning').length,
    infos: sorted.filter(finding => finding.sev === 'info').length,
    attributionUnavailable: false,
  };
}

/**
 * @param node - The selected map node.
 * @param findings - Every finding in the review.
 * @param anyFindingAttributed - Whether *any* finding in this review carries a
 *   component id. When none do, the review is a legacy one and silence means
 *   "not recorded" rather than "clean".
 */
export function selectNodeFindings(
  node: AgentMapNode | undefined,
  findings: readonly AgentMapFinding[],
  anyFindingAttributed: boolean,
): NodeFindingsResult {
  const empty: NodeFindingsResult = {
    findings: [],
    errors: 0,
    warnings: 0,
    infos: 0,
    attributionUnavailable: false,
  };

  if (!node) return empty;
  if (node.category === 'agent') return summarizeFindings(findings);
  if (!node.componentIdUnique) {
    return { ...empty, attributionUnavailable: findings.length > 0 };
  }
  if (findings.length > 0 && !anyFindingAttributed) {
    return { ...empty, attributionUnavailable: true };
  }

  return summarizeFindings(
    findings.filter(finding => finding.componentIdUnique === node.componentIdUnique),
  );
}

/** True when at least one finding carries a component id. */
export function hasAttributedFindings(findings: readonly AgentMapFinding[]): boolean {
  return findings.some(f => !!f.componentIdUnique);
}

/** "1 error · 2 warnings" — omits zero counts so the line stays short. */
export function formatFindingTally(result: NodeFindingsResult): string {
  const parts: string[] = [];
  if (result.errors > 0) parts.push(`${result.errors} ${result.errors === 1 ? 'error' : 'errors'}`);
  if (result.warnings > 0) parts.push(`${result.warnings} ${result.warnings === 1 ? 'warning' : 'warnings'}`);
  if (result.infos > 0) parts.push(`${result.infos} info`);
  return parts.join(' · ');
}

/** Summarize the selected node's exact relationship to the saved review findings. */
export function formatNodeReviewSummary(
  node: AgentMapNode,
  result: NodeFindingsResult,
): string {
  if (node.category === 'agent') {
    return result.findings.length > 0
      ? `This review recorded ${formatFindingTally(result)} across the agent.`
      : 'This review recorded no findings for the agent.';
  }
  if (result.attributionUnavailable) {
    return node.componentIdUnique
      ? 'This saved review predates component-level finding links.'
      : 'Component-level review findings are unavailable because this item has no unique component ID.';
  }
  return result.findings.length > 0
    ? `This review linked ${formatFindingTally(result)} to this component.`
    : 'No review findings were linked to this component.';
}
