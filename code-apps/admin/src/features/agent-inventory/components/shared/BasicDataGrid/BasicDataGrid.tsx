import { useCallback, useId, useMemo, useState } from 'react';
import {
  Body1,
  Body1Strong,
  Button,
  Card,
  CardHeader,
  DataGrid as FluentDataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  SearchBox,
  createTableColumn,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import type {
  TableColumnDefinition,
  TableColumnId,
  TableRowData,
} from '@fluentui/react-components';
import { ChevronLeft16Regular, ChevronRight16Regular } from '@fluentui/react-icons';
import type { BasicDataGridProps } from './BasicDataGrid.types';

const MAX_VISIBLE_COLUMNS = 10;

const useStyles = makeStyles({
  card: {
    width: '100%',
    minWidth: 0,
  },
  header: {
    paddingBottom: tokens.spacingVerticalS,
  },
  headerRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
  },
  titleCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  headerSpacer: {
    flex: '1 1 auto',
  },
  search: {
    width: '280px',
    maxWidth: '100%',
  },
  gridWrapper: {
    padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
  },
  containedGrid: {
    overflowX: 'auto',
  },
  cellContent: {
    display: 'block',
    height: tokens.lineHeightBase400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
  },
  untruncatedCellContent: {
    display: 'flex',
    alignItems: 'center',
    minHeight: tokens.spacingVerticalXXXL,
    overflow: 'visible',
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
  empty: {
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
  },
  pageInfo: {
    color: tokens.colorNeutralForeground3,
  },
});

interface GridSortState {
  sortColumn: TableColumnId | undefined;
  sortDirection: 'ascending' | 'descending';
}

function rawValue<TRecord extends object>(record: TRecord, key: string): unknown {
  return (record as Record<string, unknown>)[key];
}

function compareValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

/** Lightweight Agent Inventory grid with client-side search, sorting, and pagination. */
export function BasicDataGrid<TRecord extends object>({
  title,
  subtitle,
  columns,
  records,
  getRecordId,
  pageSize = 10,
  searchPlaceholder = 'Search records',
  emptyMessage = 'No records found.',
  searchEmptyMessage,
  actions,
  showSearch = true,
  showPagination = true,
  cardClassName,
  headerClassName,
  gridWrapperClassName,
  searchBoxClassName,
  headerLayout = 'default',
  minimumGridWidth,
}: BasicDataGridProps<TRecord>) {
  const styles = useStyles();
  const titleId = useId();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortState, setSortState] = useState<GridSortState>({
    sortColumn: undefined,
    sortDirection: 'ascending',
  });

  const visibleColumns = useMemo(() => columns.slice(0, MAX_VISIBLE_COLUMNS), [columns]);
  const widthByColumn = useMemo(() => {
    const numericWidths = visibleColumns.map((column) => Number.parseFloat(column.width));
    const totalWidth = numericWidths.reduce((total, width) => total + width, 0);
    return new Map(visibleColumns.map((column, index) => [
      column.key,
      totalWidth > 0 ? `${numericWidths[index] / totalWidth * 100}%` : column.width,
    ]));
  }, [visibleColumns]);
  const alignmentByColumn = useMemo(
    () => new Map(visibleColumns.map((column) => [column.key, column.alignment ?? 'start'])),
    [visibleColumns],
  );

  const gridColumns = useMemo<TableColumnDefinition<TRecord>[]>(
    () => visibleColumns.map((column) => createTableColumn<TRecord>({
      columnId: column.key,
      compare: column.sortable
        ? (left, right) => compareValues(
          column.sortValue?.(left) ?? rawValue(left, column.key),
          column.sortValue?.(right) ?? rawValue(right, column.key),
        )
        : () => 0,
      renderHeaderCell: () => column.label,
      renderCell: (record) => {
        const value = rawValue(record, column.key);
        const displayText = column.searchValue?.(record) ?? (value == null ? '' : String(value));
        if (column.truncate === false) {
          return (
            <div className={styles.untruncatedCellContent}>
              {column.render ? column.render(record) : displayText}
            </div>
          );
        }
        return (
          <span className={styles.cellContent} title={displayText || undefined}>
            {column.render ? column.render(record) : displayText}
          </span>
        );
      },
    })),
    [styles.cellContent, styles.untruncatedCellContent, visibleColumns],
  );

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) => visibleColumns.some((column) => {
      const value = column.searchValue?.(record) ?? rawValue(record, column.key);
      return value != null && String(value).toLowerCase().includes(term);
    }));
  }, [records, search, visibleColumns]);

  const sortedRecords = useMemo(() => {
    if (!sortState.sortColumn) return filteredRecords;
    const column = visibleColumns.find((item) => item.key === sortState.sortColumn);
    if (!column?.sortable) return filteredRecords;
    const direction = sortState.sortDirection === 'ascending' ? 1 : -1;
    return [...filteredRecords].sort(
      (left, right) => compareValues(
        column.sortValue?.(left) ?? rawValue(left, column.key),
        column.sortValue?.(right) ?? rawValue(right, column.key),
      ) * direction,
    );
  }, [filteredRecords, sortState, visibleColumns]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRecords = sortedRecords.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const handleSortChange = useCallback((_event: React.SyntheticEvent, next: GridSortState) => {
    setSortState(next);
    setPage(0);
  }, []);

  return (
    <Card appearance="filled" className={mergeClasses(styles.card, cardClassName)}>
      <CardHeader
        className={mergeClasses(styles.header, headerClassName)}
        header={(
          <div className={styles.headerRow}>
            {headerLayout === 'search-actions' ? (
              <>
                <Body1Strong as="h3" id={titleId} className={styles.visuallyHidden}>{title}</Body1Strong>
                {showSearch && (
                  <SearchBox
                    className={mergeClasses(styles.search, searchBoxClassName)}
                    size="medium"
                    value={search}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    onChange={(_, data) => {
                      setSearch(data.value);
                      setPage(0);
                    }}
                  />
                )}
                <div className={styles.headerSpacer} />
                <div className={styles.actions}>{actions}</div>
              </>
            ) : (
              <>
                <div className={styles.titleCopy}>
                  <Body1Strong as="h3" id={titleId} className={styles.title}>{title}</Body1Strong>
                  {subtitle && <Body1>{subtitle}</Body1>}
                </div>
                <div className={styles.actions}>
                  {actions}
                  {showSearch && (
                    <SearchBox
                      className={mergeClasses(styles.search, searchBoxClassName)}
                      size="medium"
                      value={search}
                      placeholder={searchPlaceholder}
                      aria-label={searchPlaceholder}
                      onChange={(_, data) => {
                        setSearch(data.value);
                        setPage(0);
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      />
      <div className={mergeClasses(styles.gridWrapper, minimumGridWidth && styles.containedGrid, gridWrapperClassName)}>
        <FluentDataGrid
          aria-labelledby={titleId}
          items={pageRecords}
          columns={gridColumns}
          sortable
          sortState={sortState}
          onSortChange={handleSortChange}
          getRowId={getRecordId}
          focusMode="cell"
          style={{ width: '100%', minWidth: minimumGridWidth }}
        >
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell, columnId }) => (
                <DataGridHeaderCell
                  key={String(columnId)}
                  style={{
                    width: widthByColumn.get(String(columnId)),
                    minWidth: widthByColumn.get(String(columnId)),
                    maxWidth: widthByColumn.get(String(columnId)),
                    boxSizing: 'border-box',
                    textAlign: alignmentByColumn.get(String(columnId)),
                  }}
                >
                  <Body1Strong>{renderHeaderCell()}</Body1Strong>
                </DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<TRecord>>
            {({ item, rowId }: TableRowData<TRecord>) => (
              <DataGridRow<TRecord> key={rowId}>
                {({ renderCell, columnId }) => (
                  <DataGridCell
                    key={String(columnId)}
                    style={{
                      width: widthByColumn.get(String(columnId)),
                      minWidth: widthByColumn.get(String(columnId)),
                      maxWidth: widthByColumn.get(String(columnId)),
                      boxSizing: 'border-box',
                      textAlign: alignmentByColumn.get(String(columnId)),
                    }}
                  >
                    {renderCell(item)}
                  </DataGridCell>
                )}
              </DataGridRow>
            )}
          </DataGridBody>
        </FluentDataGrid>
        {sortedRecords.length === 0 && (
          <Body1 className={styles.empty} role="status">
            {search.trim() && searchEmptyMessage ? searchEmptyMessage : emptyMessage}
          </Body1>
        )}
      </div>
      {showPagination && (
        <div className={styles.pagination}>
          <Body1 className={styles.pageInfo} role="status" aria-live="polite">
            {sortedRecords.length === 0
              ? 'No results'
              : `${safePage * pageSize + 1}-${Math.min((safePage + 1) * pageSize, sortedRecords.length)} of ${sortedRecords.length}`}
          </Body1>
          <Button
            appearance="subtle"
            size="small"
            icon={<ChevronLeft16Regular />}
            aria-label="Previous page"
            disabled={safePage === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          />
          <Button
            appearance="subtle"
            size="small"
            icon={<ChevronRight16Regular />}
            aria-label="Next page"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
          />
        </div>
      )}
    </Card>
  );
}
