/**
 * Findings-list behaviour, kept free of React so it can be tested in this app's `node` test
 * environment.
 *
 * Both apps render the same findings and both need the same three decisions: what a search box
 * matches, how many findings a group shows before collapsing, and what colour a severity is.
 * Those decisions drifting apart is what makes two screens look like two products.
 */

/** Fluent `Badge` colours, named here so a caller does not have to import Fluent to decide one. */
export type SeverityAppearance = 'danger' | 'warning' | 'informative';

/** How many findings a group shows before the tail is collapsed. "Top recommendations", not an exhaustive list. */
export const TOP_FINDINGS = 3;

/**
 * Match a finding against a free-text query.
 *
 * Every field is searched, including the rule identifier, because reviewers routinely paste one in
 * from a report. Matching is case-insensitive and substring-based: findings text is prose, and a
 * whole-word match would fail on "instruction" against "instructions".
 */
export function matchesQuery(fields: readonly (string | undefined | null)[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => typeof field === 'string' && field.toLowerCase().includes(needle));
}

export interface CollapsedGroup<T> {
  visible: T[];
  /** How many are hidden. Zero when everything is shown. */
  hidden: number;
  /** Whether to offer a toggle at all — false when there was never a tail to hide. */
  collapsible: boolean;
}

/**
 * Split a group into the part shown and the part hidden.
 *
 * `collapsible` is separate from `hidden > 0` so an expanded group still renders its "show less"
 * control; deriving the control from `hidden` alone makes it vanish the moment it is used.
 */
export function collapseToTop<T>(items: readonly T[], expanded: boolean, top = TOP_FINDINGS): CollapsedGroup<T> {
  const collapsible = items.length > top;
  if (expanded || !collapsible) return { visible: [...items], hidden: 0, collapsible };
  return { visible: items.slice(0, top), hidden: items.length - top, collapsible };
}

/** Label for the expand/collapse control, phrased so it says what will happen. */
export function collapseToggleLabel(group: CollapsedGroup<unknown>, top = TOP_FINDINGS): string | undefined {
  if (!group.collapsible) return undefined;
  return group.hidden > 0 ? `Show ${group.hidden} more` : `Show top ${top} only`;
}

/** Severity to badge colour. Anything that is not an error or a warning reads as information. */
export function severityAppearance(severity: string): SeverityAppearance {
  if (severity === 'error' || severity === 'High') return 'danger';
  if (severity === 'warning' || severity === 'Medium') return 'warning';
  return 'informative';
}

/** "1 finding" / "2 findings" — the singular matters because groups of one are common. */
export function findingCountLabel(count: number): string {
  return `${count} finding${count === 1 ? '' : 's'}`;
}
