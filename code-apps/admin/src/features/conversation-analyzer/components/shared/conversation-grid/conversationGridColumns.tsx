import type { ReactNode } from 'react';
import { createTableColumn, type TableColumnDefinition } from '@fluentui/react-components';
import { formatCompactDuration, formatShortDateTime } from '../../../utils/format';
import { AnalysisChips, ConversationCell, NumberCell, SummaryCell, TruncatedCell } from './ConversationGridCells';
import type { ConversationGridColumnId, ConversationGridRow } from './types';

export interface ConversationGridColumnOptions<T extends ConversationGridRow> {
  showAgent?: boolean;
  showAnalysis?: boolean;
  showSummary?: boolean;
  renderActions?: (row: T) => ReactNode;
  /** Columns without a server or client sort. */
  unsortable?: readonly ConversationGridColumnId[];
  /** Makes sortable column headers clickable. */
  clickableSort?: boolean;
  /** Right-aligns action cell content. */
  actionClassName: string;
}

// Order is controlled by the parent (server or client sort); a comparator is still required for sortable headers.
const keepOrder = () => 0;
// Fluent makes a header clickable only when compare declares parameters (compare.length > 0).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const keepOrderClickable = (_a: unknown, _b: unknown) => 0;

/** Builds the shared column set in GR-1 order: Conversation · (Agent) · Start time · Duration · Messages · Analysis · actions. */
export function createConversationGridColumns<T extends ConversationGridRow>(
  options: ConversationGridColumnOptions<T>,
): TableColumnDefinition<T>[] {
  const unsortable = new Set(options.unsortable ?? []);
  const sortCompare = options.clickableSort ? keepOrderClickable : keepOrder;
  const compare = (id: ConversationGridColumnId) => (unsortable.has(id) ? undefined : sortCompare);
  const columns: TableColumnDefinition<T>[] = [
    createTableColumn<T>({
      columnId: 'conversation',
      compare: compare('conversation'),
      renderHeaderCell: () => 'Conversation',
      renderCell: (row) => <ConversationCell row={row} />,
    }),
  ];
  if (options.showAgent) {
    columns.push(createTableColumn<T>({
      columnId: 'agent',
      compare: compare('agent'),
      renderHeaderCell: () => 'Agent',
      renderCell: (row) => <TruncatedCell value={row.agentName} />,
    }));
  }
  columns.push(
    createTableColumn<T>({
      columnId: 'startTime',
      compare: compare('startTime'),
      renderHeaderCell: () => 'Start time',
      renderCell: (row) => formatShortDateTime(row.startTime),
    }),
    createTableColumn<T>({
      columnId: 'duration',
      compare: compare('duration'),
      renderHeaderCell: () => 'Duration',
      renderCell: (row) => <NumberCell value={formatCompactDuration(row.durationSeconds) || undefined} />,
    }),
    createTableColumn<T>({
      columnId: 'messages',
      compare: compare('messages'),
      renderHeaderCell: () => 'Messages',
      renderCell: (row) => <NumberCell value={row.messageCount} />,
    }),
  );
  if (options.showAnalysis) {
    columns.push(createTableColumn<T>({
      columnId: 'analysis',
      compare: compare('analysis'),
      renderHeaderCell: () => 'Analysis',
      renderCell: (row) => <AnalysisChips row={row} />,
    }));
  }
  if (options.showSummary) {
    columns.push(createTableColumn<T>({
      columnId: 'summary',
      compare: compare('summary'),
      renderHeaderCell: () => 'Summary',
      renderCell: (row) => <SummaryCell text={row.summary} />,
    }));
  }
  if (options.renderActions) {
    const renderActions = options.renderActions;
    columns.push(createTableColumn<T>({
      columnId: 'actions',
      renderHeaderCell: () => null,
      renderCell: (row) => <span className={options.actionClassName}>{renderActions(row)}</span>,
    }));
  }
  return columns;
}
