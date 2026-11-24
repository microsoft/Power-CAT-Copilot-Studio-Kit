import type { ReactNode } from 'react';

export interface BasicDataGridColumn<TRecord extends object> {
  key: string;
  label: string;
  width: string;
  sortable?: boolean;
  alignment?: 'start' | 'end';
  render?: (record: TRecord) => ReactNode;
  searchValue?: (record: TRecord) => string;
  sortValue?: (record: TRecord) => unknown;
  truncate?: boolean;
}

export interface BasicDataGridProps<TRecord extends object> {
  title: string;
  subtitle?: string;
  columns: BasicDataGridColumn<TRecord>[];
  records: TRecord[];
  getRecordId: (record: TRecord) => string;
  pageSize?: number;
  searchPlaceholder?: string;
  emptyMessage?: string;
  searchEmptyMessage?: string;
  actions?: ReactNode;
  showSearch?: boolean;
  showPagination?: boolean;
  cardClassName?: string;
  headerClassName?: string;
  gridWrapperClassName?: string;
  searchBoxClassName?: string;
  headerLayout?: 'default' | 'search-actions';
  minimumGridWidth?: string;
}
