import type { ReactNode } from 'react';
import {
  Body1Strong,
  Card,
  CardHeader,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  SearchBox,
  createTableColumn,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type {
  TableColumnDefinition,
  TableColumnId,
  TableColumnSizingOptions,
  TableRowData,
} from '@fluentui/react-components';

export interface FluentDataGridColumn<T extends object> {
  columnId: string;
  label: string;
  width: string;
  renderCell: (item: T) => ReactNode;
  alignment?: 'start' | 'end';
  sortable?: boolean;
}

export interface FluentDataGridSortState {
  sortColumn: TableColumnId;
  sortDirection: 'ascending' | 'descending';
}

export interface FluentDataGridProps<T extends object> {
  title?: string;
  items: T[];
  columns: FluentDataGridColumn<T>[];
  getRowId: (item: T) => string;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  sortState: FluentDataGridSortState;
  onSortChange: (state: FluentDataGridSortState) => void;
  actions?: ReactNode;
  footer?: ReactNode;
}

const useStyles = makeStyles({
  card: {
    width: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    width: '100%',
  },
  title: {
    flex: '1 1 auto',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  search: {
    minWidth: '220px',
  },
  scroller: {
    overflowX: 'auto',
    padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
  },
  grid: {
    minWidth: '860px',
  },
});

/**
 * Controlled Makers DataGrid wrapper with the project-required Card shell.
 */
export function FluentDataGrid<T extends object>({
  title,
  items,
  columns,
  getRowId,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  sortState,
  onSortChange,
  actions,
  footer,
}: FluentDataGridProps<T>) {
  const styles = useStyles();
  const gridColumns: TableColumnDefinition<T>[] = columns.map((column) =>
    createTableColumn<T>({
      columnId: column.columnId,
      // Sorting is controlled by the caller over the full data set. A two-argument
      // no-op keeps the header sortable without reordering this paged slice.
      ...(column.sortable !== false && {
        compare: (left: T, right: T) => {
          void left;
          void right;
          return 0;
        },
      }),
      renderHeaderCell: () => column.label,
      renderCell: column.renderCell,
    }),
  );

  const columnSizingOptions: TableColumnSizingOptions = {};
  for (const column of columns) {
    const defaultWidth = Number.parseInt(column.width, 10);
    columnSizingOptions[column.columnId] = {
      defaultWidth,
      minWidth: Math.min(defaultWidth, 64),
    };
  }
  const alignments = new Map(
    columns.map((column) => [column.columnId, column.alignment ?? 'start']),
  );

  return (
    <Card appearance="filled" className={styles.card}>
      {(title || onSearchChange) && (
        <CardHeader
          header={(
            <div className={styles.header}>
              {title && <Body1Strong className={styles.title}>{title}</Body1Strong>}
              <div className={styles.controls}>
                {actions}
                {onSearchChange && (
                  <SearchBox
                    className={styles.search}
                    value={searchValue ?? ''}
                    placeholder={searchPlaceholder ?? 'Search'}
                    aria-label={searchPlaceholder ?? 'Search'}
                    onChange={(_, data) => onSearchChange(data.value)}
                  />
                )}
              </div>
            </div>
          )}
        />
      )}
      <div className={styles.scroller}>
        <DataGrid
          className={styles.grid}
          items={items}
          columns={gridColumns}
          getRowId={getRowId}
          sortable
          sortState={sortState}
          onSortChange={(_, data) => onSortChange({
            sortColumn: data.sortColumn ?? sortState.sortColumn,
            sortDirection: data.sortDirection,
          })}
          focusMode="cell"
          resizableColumns
          columnSizingOptions={columnSizingOptions}
        >
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell, columnId }) => (
                <DataGridHeaderCell
                  key={String(columnId)}
                  style={{
                    textAlign: alignments.get(String(columnId)),
                  }}
                >
                  {renderHeaderCell()}
                </DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<T>>
            {({ item, rowId }: TableRowData<T>) => (
              <DataGridRow<T> key={rowId}>
                {({ renderCell, columnId }) => (
                  <DataGridCell
                    key={String(columnId)}
                    style={{
                      textAlign: alignments.get(String(columnId)),
                    }}
                  >
                    {renderCell(item)}
                  </DataGridCell>
                )}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      </div>
      {footer}
    </Card>
  );
}
