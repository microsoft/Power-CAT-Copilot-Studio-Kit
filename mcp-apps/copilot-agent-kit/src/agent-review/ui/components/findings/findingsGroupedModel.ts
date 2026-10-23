import type {
  FindingRowView,
} from '../viewTypes.js';

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
