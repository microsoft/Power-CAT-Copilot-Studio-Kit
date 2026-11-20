import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Button,
  DataGrid as FluentDataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  DataGridSelectionCell,
  MessageBar,
  MessageBarBody,
  Spinner,
  Tooltip,
  createTableColumn,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import type {
  SelectionItemId,
  TableColumnDefinition,
  TableColumnSizingOptions,
} from '@fluentui/react-components';
import { ArrowDown20Regular, ArrowUp20Regular } from '@fluentui/react-icons';
import { ColumnEditor } from './ColumnEditor';
import { ColumnMenu } from './ColumnMenu';
import { GroupedGridBody } from './GroupedGridBody';
import type {
  AdvancedDataGridProps,
  GridColumnDefinition,
  GridFilter,
  GridQuery,
  GridSortDirection,
} from './AdvancedDataGrid.types';
import { GridToolbar } from './GridToolbar';
import { useGridState } from './useGridState';
import { useColumnDragReorder } from './useColumnDragReorder';
import { useInfiniteRecords } from './useInfiniteRecords';

/** Exact width of the built-in multiselect checkbox column (matches Fluent's TABLE_SELECTION_CELL_WIDTH / CELL_WIDTH), reserved when sizing data columns. */
const SELECTION_COLUMN_WIDTH = 44;

const useStyles = makeStyles({
  card: {
    minWidth: 0,
    height: 'calc(100vh - 114px)',
    minHeight: '560px',
    maxHeight: '760px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
    ':fullscreen': {
      width: '100vw',
      height: '100vh',
      borderRadius: 0,
      border: 'none',
    },
  },
  fillAvailableHeight: {
    maxHeight: 'none',
  },
  scroll: {
    minHeight: 0,
    flexGrow: 1,
    overflow: 'auto',
    position: 'relative',
    isolation: 'isolate',
  },
  grid: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  headerCell: {
    minHeight: '38px',
    paddingLeft: '10px',
    paddingRight: '10px',
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  headerCellDropBefore: {
    boxShadow: `inset 3px 0 0 0 ${tokens.colorBrandBackground}`,
  },
  headerCellDropAfter: {
    boxShadow: `inset -3px 0 0 0 ${tokens.colorBrandBackground}`,
  },
  headerDragHandle: {
    display: 'flex',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    width: '100%',
    cursor: 'grab',
  },
  headerDragging: {
    opacity: 0.4,
  },
  headerContent: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalXS,
  },
  headerActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0,
    flexShrink: 0,
  },
  headerLabel: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    boxSizing: 'border-box',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sortIcon: {
    width: '16px',
    height: '16px',
    flexShrink: 0,
  },
  cell: {
    minWidth: 0,
    minHeight: '48px',
    padding: `7px 10px`,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  overflowContent: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    boxSizing: 'border-box',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  row: {
    minHeight: '48px',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground3,
    },
    '&[aria-selected="true"]': {
      backgroundColor: tokens.colorBrandBackground2,
    },
  },
  alignedEnd: {
    justifyContent: 'flex-end',
    textAlign: 'right',
  },
  alignedCenter: {
    justifyContent: 'center',
    textAlign: 'center',
  },
  state: {
    minHeight: 0,
    flexGrow: 1,
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  gridEmpty: {
    position: 'sticky',
    left: 0,
    boxSizing: 'border-box',
    minHeight: '160px',
    padding: tokens.spacingHorizontalL,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    color: tokens.colorNeutralForeground2,
  },
  loadMore: {
    minHeight: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground3,
  },
  footer: {
    minHeight: '56px',
    flexShrink: 0,
    padding: `0 ${tokens.spacingHorizontalM}`,
    display: 'flex',
    alignItems: 'center',
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
});

function OverflowTooltip({
  children,
  className,
  title,
  mountNode,
}: {
  children: ReactNode;
  className: string;
  title?: string;
  mountNode?: HTMLElement | null;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [tooltipText, setTooltipText] = useState('');
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return undefined;
    const update = () => {
      const parentWidth = element.parentElement?.clientWidth ?? element.clientWidth;
      const truncated = element.scrollWidth > element.clientWidth
        || element.scrollWidth > parentWidth;
      setTooltipText(element.textContent?.trim() ?? '');
      setIsTruncated(truncated);
    };
    const resizeObserver = new ResizeObserver(update);
    const frame = window.requestAnimationFrame(update);
    resizeObserver.observe(element);
    if (element.parentElement) resizeObserver.observe(element.parentElement);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, []);

  const fullText = title ?? tooltipText;
  const nativeTitle = title !== undefined
    ? (title || undefined)
    : (isTruncated ? tooltipText : undefined);
  const content = (
    <div
      className={className}
      ref={contentRef}
      title={nativeTitle}
    >
      {children}
    </div>
  );
  return isTruncated && fullText
    ? <Tooltip content={fullText} relationship="description" mountNode={mountNode}>{content}</Tooltip>
    : content;
}

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined
    ? ''
    : Array.isArray(value) ? value.join('; ') : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv<TRecord>(
  gridId: string,
  records: TRecord[],
  columns: GridColumnDefinition<TRecord>[],
) {
  const rows = [
    columns.map((column) => escapeCsv(column.label)).join(','),
    ...records.map((record) => columns
      .map((column) => escapeCsv(column.getValue(record)))
      .join(',')),
  ];
  const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${gridId}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdvancedDataGrid<TRecord>(props: AdvancedDataGridProps<TRecord>) {
  const styles = useStyles();
  const {
    ariaLabel,
    columns,
    error: externalError,
    getRecordKey,
    gridId,
    initialGroupColumnId,
    initialSort,
    isLoading: externalLoading,
    onExport,
    onRetry,
    onSelectionChange,
    renderSelectionActions,
    exportActionRef,
    clearSelectionActionRef,
    showToolbarExport = true,
    fillAvailableHeight = false,
  } = props;
  const pageSize = props.pageSize ?? 50;
  const localRecords = props.records ?? [];
  const state = useGridState(gridId, columns, localRecords, initialSort, initialGroupColumnId);
  const columnDnd = useColumnDragReorder(state.moveColumn);
  const [selectedItems, setSelectedItems] = useState<Set<SelectionItemId>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupedVisibleCount, setGroupedVisibleCount] = useState(pageSize);
  const [columnEditorOpen, setColumnEditorOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gridViewportWidth, setGridViewportWidth] = useState(0);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === cardRef.current);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  useEffect(() => {
    if (!scrollElement) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setGridViewportWidth(entry?.contentRect.width ?? 0);
    });
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [scrollElement]);

  const fullscreenMountNode = isFullscreen ? cardRef.current : undefined;

  const queryKey = useMemo(
    () => JSON.stringify({ search: state.search, sort: state.sort, filters: state.filters }),
    [state.filters, state.search, state.sort],
  );
  const baseQuery = useMemo<Omit<GridQuery, 'skip' | 'take'>>(() => ({
    search: state.search,
    sort: state.sort,
    filters: state.filters,
  }), [state.filters, state.search, state.sort]);

  const infiniteOptions = props.loadRecords
    ? {
      mode: 'server',
      loadRecords: props.loadRecords,
      pageSize,
      query: baseQuery,
      queryKey,
    } as const
    : {
      mode: 'local',
      records: state.processedRecords,
      pageSize,
      queryKey,
    } as const;
  const infinite = useInfiniteRecords(infiniteOptions);

  const grouping = Boolean(state.groups);
  const recordPool = grouping ? state.processedRecords : infinite.records;

  const visibleKeys = useMemo(
    () => new Set(recordPool.map(getRecordKey)),
    [getRecordKey, recordPool],
  );
  const selectedKeys = useMemo(
    () => [...selectedItems].map(String).filter((key) => visibleKeys.has(key)),
    [selectedItems, visibleKeys],
  );
  const selectedRecords = useMemo(
    () => recordPool.filter((record) => selectedItems.has(getRecordKey(record))),
    [getRecordKey, recordPool, selectedItems],
  );

  useEffect(() => {
    onSelectionChange?.(selectedKeys, selectedRecords);
  }, [onSelectionChange, selectedKeys, selectedRecords]);

  useEffect(() => {
    if (!clearSelectionActionRef) return undefined;
    clearSelectionActionRef.current = () => setSelectedItems(new Set());
    return () => {
      clearSelectionActionRef.current = null;
    };
  }, [clearSelectionActionRef]);

  const toggleGroupColumn = (columnId: string | undefined) => {
    setSelectedItems(new Set());
    setCollapsedGroups(new Set());
    state.setGroupColumnId(columnId);
  };

  const tableColumns = useMemo<TableColumnDefinition<TRecord>[]>(
    () => state.visibleColumns.map((column) => createTableColumn<TRecord>({
      columnId: column.columnId,
      renderHeaderCell: () => {
        const activeSort = state.sort?.columnId === column.columnId
          ? state.sort.direction
          : undefined;
        const activeFilter = state.filters.find((filter) => filter.columnId === column.columnId);
        const isGrouped = state.groupColumnId === column.columnId;
        return (
          <div className={styles.headerContent}>
            <OverflowTooltip className={styles.headerLabel} mountNode={fullscreenMountNode}>{column.label}</OverflowTooltip>
            <span className={styles.headerActions}>
              {activeSort === 'ascending' && <ArrowUp20Regular className={styles.sortIcon} aria-label="Sorted ascending" />}
              {activeSort === 'descending' && <ArrowDown20Regular className={styles.sortIcon} aria-label="Sorted descending" />}
              <ColumnMenu
                column={column}
                activeSort={activeSort}
                activeFilter={activeFilter}
                mountNode={fullscreenMountNode}
                isGrouped={isGrouped}
                onToggleGroup={() => toggleGroupColumn(isGrouped ? undefined : column.columnId)}
                onApply={(direction: GridSortDirection | undefined, filter: GridFilter | undefined) => {
                  setSelectedItems(new Set());
                  state.applyColumnState(column.columnId, direction, filter);
                }}
              />
            </span>
          </div>
        );
      },
      renderCell: column.renderCell,
    })),
    [state, styles.headerActions, styles.headerContent, styles.headerLabel, styles.sortIcon, fullscreenMountNode],
  );

  const totalIdealWidth = useMemo(
    () => state.visibleColumns.reduce(
      (total, column) => total + (column.idealWidth ?? column.minWidth ?? 180),
      0,
    ),
    [state.visibleColumns],
  );
  const gridContentWidth = Math.max(SELECTION_COLUMN_WIDTH + totalIdealWidth, gridViewportWidth);
  const sizingOptions = useMemo<TableColumnSizingOptions>(() => {
    const available = Math.max(0, gridViewportWidth - SELECTION_COLUMN_WIDTH);
    const extra = totalIdealWidth > 0 ? Math.max(0, available - totalIdealWidth) : 0;
    const lastColumnId = state.visibleColumns.at(-1)?.columnId;
    let distributed = 0;
    return Object.fromEntries(state.visibleColumns.map((column) => {
      const ideal = column.idealWidth ?? column.minWidth ?? 180;
      let grow = Math.round((extra * ideal) / totalIdealWidth);
      if (column.columnId === lastColumnId) {
        grow = Math.max(0, Math.round(extra) - distributed);
      } else {
        distributed += grow;
      }
      const width = ideal + grow;
      return [
        column.columnId,
        {
          minWidth: column.minWidth ?? 120,
          defaultWidth: width,
          idealWidth: width,
        },
      ];
    }));
  }, [state.visibleColumns, gridViewportWidth, totalIdealWidth]);
  const gridLayoutKey = `${state.visibleColumnIds.join('-')}-${Math.floor(gridViewportWidth / 25)}`;

  const columnWidths = useMemo(
    () => new Map(state.visibleColumns.map((column) => {
      const sizing = sizingOptions[column.columnId];
      return [column.columnId, sizing?.idealWidth ?? column.idealWidth ?? column.minWidth ?? 180];
    })),
    [sizingOptions, state.visibleColumns],
  );

  useEffect(() => {
    setGroupedVisibleCount(pageSize);
  }, [pageSize, state.groupColumnId, queryKey]);

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  };

  const groupedRenderedCount = useMemo(() => {
    if (!state.groups) return 0;
    let remaining = groupedVisibleCount;
    let rendered = 0;
    for (const group of state.groups) {
      if (collapsedGroups.has(group.key)) continue;
      const take = Math.min(group.records.length, Math.max(0, remaining));
      rendered += take;
      remaining -= take;
    }
    return rendered;
  }, [collapsedGroups, groupedVisibleCount, state.groups]);
  const groupedExpandedTotal = useMemo(() => {
    if (!state.groups) return 0;
    return state.groups.reduce(
      (total, group) => total + (collapsedGroups.has(group.key) ? 0 : group.records.length),
      0,
    );
  }, [collapsedGroups, state.groups]);
  const groupedHasMore = groupedRenderedCount < groupedExpandedTotal;

  const selectionActions = renderSelectionActions?.({
    selectedKeys,
    selectedRecords,
    clearSelection: () => setSelectedItems(new Set()),
  });

  const handleExport = async () => {
    const exportRecords = props.records ? state.processedRecords : infinite.records;
    if (onExport) {
      await onExport(exportRecords, state.visibleColumns);
      return;
    }
    exportCsv(gridId, exportRecords, state.visibleColumns);
  };
  useEffect(() => {
    if (!exportActionRef) return undefined;
    exportActionRef.current = () => {
      const exportRecords = props.records ? state.processedRecords : infinite.records;
      if (onExport) {
        void onExport(exportRecords, state.visibleColumns);
      } else {
        exportCsv(gridId, exportRecords, state.visibleColumns);
      }
    };
    return () => {
      exportActionRef.current = null;
    };
  }, [
    exportActionRef,
    gridId,
    infinite.records,
    onExport,
    props.records,
    state.processedRecords,
    state.visibleColumns,
  ]);

  const error = externalError ?? infinite.error;
  const loading = externalLoading || (infinite.isLoading && infinite.records.length === 0);
  const inventoryIsEmpty = !loading && !error && localRecords.length === 0 && !props.loadRecords;
  const noResults = !loading && !error && infinite.totalCount === 0 && !inventoryIsEmpty;

  return (
    <>
      <div className={mergeClasses(styles.card, fillAvailableHeight && styles.fillAvailableHeight)} ref={cardRef}>
        <GridToolbar
          title={props.title}
          searchValue={state.searchInput}
          searchPlaceholder={props.searchPlaceholder ?? 'Search records'}
          isFullscreen={isFullscreen}
          mountNode={fullscreenMountNode}
          selectionActions={selectionActions}
          selectionNotice={props.selectionNotice}
          showExport={showToolbarExport}
          onSearchChange={(value) => {
            setSelectedItems(new Set());
            state.setSearchInput(value);
          }}
          onExport={() => { void handleExport(); }}
          onEditColumns={() => setColumnEditorOpen(true)}
          onFullscreen={() => {
            if (document.fullscreenElement === cardRef.current) {
              void document.exitFullscreen();
            } else {
              void cardRef.current?.requestFullscreen();
            }
          }}
        />
        {loading ? (
          <div className={styles.state}><Spinner label="Loading records" /></div>
        ) : error ? (
          <div className={styles.state}>
            <MessageBar intent="error">
              <MessageBarBody>
                {error.message}
                <Button
                  appearance="transparent"
                  onClick={() => {
                    onRetry?.();
                    infinite.retry();
                  }}
                >
                  Retry
                </Button>
              </MessageBarBody>
            </MessageBar>
          </div>
        ) : (
          <div
            className={styles.scroll}
            ref={setScrollElement}
            onScroll={(event) => {
              const element = event.currentTarget;
              if (element.scrollHeight - element.scrollTop - element.clientHeight < 160) {
                if (grouping) {
                  if (groupedHasMore) setGroupedVisibleCount((current) => current + pageSize);
                } else if (infinite.hasMore) {
                  infinite.loadMore();
                }
              }
            }}
          >
            {grouping && state.groups ? (
              <GroupedGridBody
                groups={state.groups}
                columns={state.visibleColumns}
                columnWidths={columnWidths}
                gridContentWidth={gridContentWidth}
                getRecordKey={getRecordKey}
                collapsedGroups={collapsedGroups}
                onToggleCollapse={toggleGroupCollapse}
                visibleCount={groupedVisibleCount}
                selectedItems={selectedItems}
                setSelectedItems={setSelectedItems}
                sort={state.sort}
                filters={state.filters}
                mountNode={fullscreenMountNode}
                groupColumnId={state.groupColumnId ?? ''}
                groupColumnLabel={state.groupColumn?.label ?? ''}
                onUngroup={() => toggleGroupColumn(undefined)}
                onToggleGroupColumn={(columnId) => toggleGroupColumn(columnId)}
                onApplyColumnState={(columnId, direction, filter) => {
                  setSelectedItems(new Set());
                  state.applyColumnState(columnId, direction, filter);
                }}
                onMoveColumn={state.moveColumn}
              />
            ) : (
            <FluentDataGrid
              key={gridLayoutKey}
              className={styles.grid}
              style={{ minWidth: `${gridContentWidth}px` }}
              items={infinite.records}
              columns={tableColumns}
              getRowId={getRecordKey}
              selectionMode="multiselect"
              selectedItems={selectedItems}
              onSelectionChange={(_, data) => setSelectedItems(data.selectedItems)}
              resizableColumns
              resizableColumnsOptions={{ autoFitColumns: false }}
              columnSizingOptions={sizingOptions}
              focusMode="composite"
              size="small"
              aria-label={ariaLabel}
            >
              <DataGridHeader className={styles.header}>
                <DataGridRow selectionCell={<DataGridSelectionCell />}>
                  {({ columnId, renderHeaderCell }) => {
                    const columnKey = String(columnId);
                    const dropClass = columnDnd.dropTarget?.columnId === columnKey
                      ? (columnDnd.dropTarget.position === 'before'
                        ? styles.headerCellDropBefore
                        : styles.headerCellDropAfter)
                      : undefined;
                    return (
                      <DataGridHeaderCell
                        className={mergeClasses(styles.headerCell, dropClass)}
                        {...columnDnd.getDropTargetProps(columnKey)}
                      >
                        <div
                          className={mergeClasses(
                            styles.headerDragHandle,
                            columnDnd.draggingColumnId === columnKey && styles.headerDragging,
                          )}
                          {...columnDnd.getDragSourceProps(columnKey)}
                        >
                          {renderHeaderCell()}
                        </div>
                      </DataGridHeaderCell>
                    );
                  }}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody<TRecord>>
                {({ item, rowId }) => (
                  <DataGridRow<TRecord> className={styles.row} key={rowId} selectionCell={<DataGridSelectionCell />}>
                    {({ columnId, renderCell }) => {
                      const column = state.visibleColumns.find((candidate) => candidate.columnId === columnId);
                      const alignment = column?.align === 'end'
                        ? styles.alignedEnd
                        : column?.align === 'center' ? styles.alignedCenter : undefined;
                      const cellTitle = column?.dataType === 'text'
                        ? String(column.getValue(item) ?? '')
                        : undefined;
                      return (
                        <DataGridCell className={`${styles.cell} ${alignment ?? ''}`}>
                          <OverflowTooltip className={styles.overflowContent} title={cellTitle} mountNode={fullscreenMountNode}>
                            {renderCell(item)}
                          </OverflowTooltip>
                        </DataGridCell>
                      );
                    }}
                  </DataGridRow>
                )}
              </DataGridBody>
            </FluentDataGrid>
            )}
            {(inventoryIsEmpty || noResults) && (
              <div className={styles.gridEmpty} style={{ width: gridViewportWidth || undefined }}>
                {inventoryIsEmpty
                  ? (props.emptyMessage ?? 'No records are available.')
                  : (props.noResultsMessage ?? 'No records match the current search and filters.')}
              </div>
            )}
            {!grouping && infinite.hasMore && (
              <div className={styles.loadMore}>
                {infinite.isLoading ? <Spinner size="tiny" label="Loading more records" /> : 'Scroll to load more'}
              </div>
            )}
          </div>
        )}
        <footer className={styles.footer}>
          Rows: {grouping
            ? `${groupedRenderedCount.toLocaleString()} of ${state.processedRecords.length.toLocaleString()} in ${state.groups?.length ?? 0} groups`
            : `${infinite.records.length.toLocaleString()} of ${infinite.totalCount.toLocaleString()}`}
        </footer>
      </div>
      {columnEditorOpen && (
        <ColumnEditor
          open
          columns={columns}
          visibleColumnIds={state.visibleColumnIds}
          onClose={() => setColumnEditorOpen(false)}
          onApply={state.setVisibleColumnIds}
          onReset={state.resetVisibleColumns}
          mountNode={fullscreenMountNode}
        />
      )}
    </>
  );
}
