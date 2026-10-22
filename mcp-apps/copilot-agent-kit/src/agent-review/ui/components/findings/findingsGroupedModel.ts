/**
 * Builds the grouped-by-family view of the review findings for the Findings tab.
 * Pure and synchronous.
 *
 * Review findings span every rule family (Instructions, Tools, Models, Knowledge,
 * Skills, Lifecycle, Connected agents, Evaluation, Parsing), so they are grouped by
 * their family rather than the four skill-rubric dimensions. Each finding keeps a
 * stable index-based key so findings that share a rule id (same rule firing on
 * multiple targets) remain individually addressable in the in-pane drill-down.
 */
import type {
  FindingGroupView,
  FindingRowView,
  FindingsGroupedView,
  FindingView,
  Severity,
} from '../viewTypes.js';

const SEV_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
const FINDING_ROW_FOCUS_PREFIX = 'row-key:';

/** Create a cross-tab locator for one stable finding row key. */
export function createFindingRowFocus(rowKey: FindingRowView['key']): string {
  return `${FINDING_ROW_FOCUS_PREFIX}${rowKey}`;
}

/** Resolve either a stable row locator or a legacy rule-id focus request. */
export function resolveFindingRowFocus(
  rows: readonly FindingRowView[],
  focus: string | null | undefined,
): string | undefined {
  if (!focus) return undefined;

  if (focus.startsWith(FINDING_ROW_FOCUS_PREFIX)) {
    const rowKey = focus.slice(FINDING_ROW_FOCUS_PREFIX.length);
    return rows.some(row => row.key === rowKey) ? rowKey : undefined;
  }

  return rows.find(row => row.finding.id === focus)?.key;
}

/** Worst-first inside a family: by severity, then by rule id for stable order. */
function sortRows(rows: FindingRowView[]): FindingRowView[] {
  return [...rows].sort(
    (a, b) =>
      SEV_RANK[a.finding.sev] - SEV_RANK[b.finding.sev] ||
      a.finding.id.localeCompare(b.finding.id),
  );
}

/** Lowest (worst) severity rank present in a group; 3 when the group is empty. */
function groupWorstRank(group: FindingGroupView): number {
  return group.rows.reduce((min, r) => Math.min(min, SEV_RANK[r.finding.sev]), 3);
}

/**
 * Build the grouped Findings view from the flat finding list.
 *
 * @param findings - All mapped review findings (order preserved for stable keys).
 * @param sourceFindings - Unfiltered review findings that own the stable row keys.
 * @returns Findings grouped by family, worst family first.
 */
export function buildFindingsGroupedView(
  findings: readonly FindingView[],
  sourceFindings: readonly FindingView[] = findings,
): FindingsGroupedView {
  const byFamily = new Map<string, FindingRowView[]>();
  const sourceKeys = new Map<FindingView, string[]>();

  sourceFindings.forEach((finding, index) => {
    const keys = sourceKeys.get(finding) ?? [];
    keys.push(String(index));
    sourceKeys.set(finding, keys);
  });

  findings.forEach((finding) => {
    const key = sourceKeys.get(finding)?.shift();
    if (key === undefined) {
      throw new Error('A visible finding is missing from the source review.');
    }
    const rows = byFamily.get(finding.family) ?? [];
    rows.push({ key, finding });
    byFamily.set(finding.family, rows);
  });

  const groups: FindingGroupView[] = [...byFamily.entries()].map(([family, rows]) => {
    const counts = { error: 0, warning: 0, info: 0 };
    for (const r of rows) counts[r.finding.sev] += 1;
    return { family, rows: sortRows(rows), counts };
  });

  // Worst first: families with the most severe findings float up, ties break by
  // breadth (more findings first), then by family name for deterministic order.
  groups.sort(
    (a, b) =>
      groupWorstRank(a) - groupWorstRank(b) ||
      b.rows.length - a.rows.length ||
      a.family.localeCompare(b.family),
  );

  return { groups };
}
