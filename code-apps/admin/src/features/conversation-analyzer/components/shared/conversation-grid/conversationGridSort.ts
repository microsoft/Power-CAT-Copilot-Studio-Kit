import type { ConversationGridRow, ConversationGridSortState } from './types';

function compareValues(a: string | number | undefined, b: string | number | undefined): number {
  // Missing values sort last in ascending order.
  if (a === undefined || a === '') return b === undefined || b === '' ? 0 : 1;
  if (b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

function sortValue(row: ConversationGridRow, column: ConversationGridSortState['sortColumn']): string | number | undefined {
  switch (column) {
    case 'conversation': return row.topic ?? row.conversationId;
    case 'agent': return row.agentName;
    case 'startTime': return row.startTime ? new Date(row.startTime).getTime() : undefined;
    case 'duration': return row.durationSeconds;
    case 'messages': return row.messageCount;
    case 'analysis': return row.analyses?.[0] ? `${row.analyses[0].promptLabel} ${row.analyses[0].outcomeLabel}` : undefined;
    case 'summary': return row.summary;
    default: return undefined;
  }
}

/** Client-side sort used for columns the server cannot sort and for fully loaded grids (AR-3). */
export function sortConversationRows<T extends ConversationGridRow>(rows: readonly T[], sort: ConversationGridSortState): T[] {
  const direction = sort.sortDirection === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sort.sortColumn);
    const bv = sortValue(b, sort.sortColumn);
    if (av === undefined || av === '' || bv === undefined || bv === '') return compareValues(av, bv);
    return compareValues(av, bv) * direction;
  });
}
