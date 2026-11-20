import type { MutableRefObject, ReactNode } from 'react';

export type GridDataType = 'text' | 'choice' | 'boolean' | 'number' | 'date' | 'datetime';
export type GridSortDirection = 'ascending' | 'descending';

export type GridFilterOperator =
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'equals'
  | 'notEquals'
  | 'isAnyOf'
  | 'isNotAnyOf'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'on'
  | 'before'
  | 'after'
  | 'onOrBefore'
  | 'onOrAfter'
  | 'hasData'
  | 'noData';

export interface GridChoiceOption {
  value: string;
  label: string;
}

export interface GridFilter {
  columnId: string;
  operator: GridFilterOperator;
  value: string | string[];
}

export interface GridSort {
  columnId: string;
  direction: GridSortDirection;
}

export interface GridQuery {
  search: string;
  sort?: GridSort;
  filters: GridFilter[];
  skip: number;
  take: number;
}

export interface GridPage<TRecord> {
  records: TRecord[];
  totalCount: number;
  hasMore: boolean;
}

export interface GridColumnDefinition<TRecord> {
  columnId: string;
  label: string;
  dataType: GridDataType;
  getValue: (record: TRecord) => unknown;
  renderCell: (record: TRecord) => ReactNode;
  getSearchText?: (record: TRecord) => string;
  choiceOptions?: GridChoiceOption[];
  defaultVisible?: boolean;
  required?: boolean;
  minWidth?: number;
  idealWidth?: number;
  maxWidth?: number;
  align?: 'start' | 'center' | 'end';
}

export interface GridGroup<TRecord> {
  key: string;
  label: string;
  records: TRecord[];
}

export interface GridSelectionActionsContext<TRecord> {
  selectedKeys: string[];
  selectedRecords: TRecord[];
  clearSelection: () => void;
}

interface AdvancedDataGridBaseProps<TRecord> {
  gridId: string;
  ariaLabel: string;
  title?: string;
  columns: GridColumnDefinition<TRecord>[];
  getRecordKey: (record: TRecord) => string;
  pageSize?: number;
  searchPlaceholder?: string;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  emptyMessage?: string;
  noResultsMessage?: string;
  initialSort?: GridSort;
  initialGroupColumnId?: string;
  onSelectionChange?: (selectedKeys: string[], selectedRecords: TRecord[]) => void;
  renderSelectionActions?: (context: GridSelectionActionsContext<TRecord>) => ReactNode;
  selectionNotice?: ReactNode;
  onExport?: (records: TRecord[], visibleColumns: GridColumnDefinition<TRecord>[]) => void | Promise<void>;
  exportActionRef?: MutableRefObject<(() => void) | null>;
  clearSelectionActionRef?: MutableRefObject<(() => void) | null>;
  showToolbarExport?: boolean;
  fillAvailableHeight?: boolean;
}

export interface LocalAdvancedDataGridProps<TRecord> extends AdvancedDataGridBaseProps<TRecord> {
  records: TRecord[];
  loadRecords?: never;
}

export interface ServerAdvancedDataGridProps<TRecord> extends AdvancedDataGridBaseProps<TRecord> {
  records?: never;
  loadRecords: (query: GridQuery, signal: AbortSignal) => Promise<GridPage<TRecord>>;
}

export type AdvancedDataGridProps<TRecord> =
  | LocalAdvancedDataGridProps<TRecord>
  | ServerAdvancedDataGridProps<TRecord>;
