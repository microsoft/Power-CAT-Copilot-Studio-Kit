/**
 * FluentDataGrid - Shared wrapper around Fluent UI v9 DataGrid.
 *
 * Provides: Card shell, search, client-side sort + pagination, export button,
 * column resize, and cell truncation with interactive scrollable Popover.
 * Tabs pass the same GridColumn<T> definitions — no column refactoring needed.
 */

import React, { useMemo, useState, useCallback } from "react";
import {
  makeStyles, tokens, Card, CardHeader,
  Body1Strong, Body1, Button, SearchBox, Tooltip,
  Popover, PopoverTrigger, PopoverSurface,
  DataGrid, DataGridHeader, DataGridHeaderCell, DataGridRow,
  DataGridBody, DataGridCell,
  createTableColumn,
} from "@fluentui/react-components";
import type {
  TableColumnDefinition,
  TableRowData, TableColumnId,
} from "@fluentui/react-components";
import { ChevronLeft16Regular, ChevronRight16Regular, Info16Regular } from "@fluentui/react-icons";
import type { GridColumn } from "../contracts/types";
import { DEFAULT_PAGE_SIZE } from "../contracts/types";
import type { ExportColumn } from "../utils/exportColumns";
import ExportButton from "./ExportButton";

const MAX_VISIBLE_COLUMNS = 10;

export interface FluentDataGridProps<T extends object> {
  title: string;
  titleTooltip?: string;
  columns: GridColumn<T>[];
  data: T[];
  rowKey?: (row: T, index: number) => string;
  pageSize?: number;
  searchPlaceholder?: string;
  exportColumns?: ExportColumn[];
  exportFilename?: string;
  exportData?: Record<string, unknown>[];
  actions?: React.ReactNode;
  /** Content rendered to the left of the search box (e.g. filter dropdowns). */
  beforeSearch?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  card: { width: "100%" },
  headerRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM, flexWrap: "wrap", width: "100%" },
  titleArea: { flex: "1 1 auto", display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  infoIcon: { color: tokens.colorNeutralForeground3, cursor: "help", display: "flex", alignItems: "center" },
  actionsArea: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexShrink: 0 },
  searchBox: { minWidth: "200px", maxWidth: "300px" },
  gridWrapper: { overflowX: "hidden", paddingLeft: tokens.spacingHorizontalM, paddingRight: tokens.spacingHorizontalM, paddingBottom: tokens.spacingVerticalM },
  cellContent: {
    display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase400,
    height: tokens.lineHeightBase400,
  },
  popoverSurface: {
    maxHeight: "200px",
    maxWidth: "400px",
    overflowY: "auto",
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    wordBreak: "break-word",
    whiteSpace: "normal",
    cursor: "text",
  },
  pagination: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: tokens.spacingHorizontalS, paddingTop: tokens.spacingVerticalS, paddingRight: tokens.spacingHorizontalM, paddingBottom: tokens.spacingVerticalS },
  pageInfo: { color: tokens.colorNeutralForeground3 },
});

// ---------------------------------------------------------------------------
// CellWithPopover — truncated cell + interactive popover on hover
// ---------------------------------------------------------------------------

interface CellPopoverProps { tooltipText: string; cellContentClass: string; popoverClass: string; children: React.ReactNode }

const CellWithPopover: React.FC<CellPopoverProps> = React.memo(({ tooltipText, cellContentClass, popoverClass, children }) => {
  if (!tooltipText) {
    return <span className={cellContentClass}>{children}</span>;
  }
  return (
    <Popover openOnHover mouseLeaveDelay={300} positioning="below-start" withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <span className={cellContentClass}>{children}</span>
      </PopoverTrigger>
      <PopoverSurface className={popoverClass}>
        {tooltipText}
      </PopoverSurface>
    </Popover>
  );
});
CellWithPopover.displayName = "CellWithPopover";

// ---------------------------------------------------------------------------
// Sort state type
// ---------------------------------------------------------------------------

interface GridSortState {
  sortColumn: TableColumnId | undefined;
  sortDirection: "ascending" | "descending";
}

// ---------------------------------------------------------------------------
// FluentDataGrid component
// ---------------------------------------------------------------------------

function FluentDataGridInner<T extends object>({
  title, titleTooltip, columns, data, rowKey, pageSize = DEFAULT_PAGE_SIZE,
  searchPlaceholder = "Search...", exportColumns, exportFilename, exportData, actions, beforeSearch,
}: FluentDataGridProps<T>) {
  const styles = useStyles();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortState, setSortState] = useState<GridSortState>({ sortColumn: undefined, sortDirection: "ascending" });

  const visibleColumns = useMemo(() => columns.slice(0, MAX_VISIBLE_COLUMNS), [columns]);

  // --- Column definitions for DataGrid ---
  const gridColumns: TableColumnDefinition<T>[] = useMemo(
    () => visibleColumns.map((col) =>
      createTableColumn<T>({
        columnId: col.key,
        compare: col.sortable
          ? (a, b) => {
              const aVal = (a as Record<string, unknown>)[col.key];
              const bVal = (b as Record<string, unknown>)[col.key];
              if (aVal == null && bVal == null) return 0;
              if (aVal == null) return 1;
              if (bVal == null) return -1;
              return typeof aVal === "number" && typeof bVal === "number"
                ? aVal - bVal
                : String(aVal).localeCompare(String(bVal));
            }
          : () => 0,
        renderHeaderCell: () => col.label,
        renderCell: (item: T) => {
          const rawValue = (item as Record<string, unknown>)[col.key];
          const displayText = rawValue != null ? String(rawValue) : "";
          const tooltipText = col.searchValue ? col.searchValue(item) : displayText;
          const cellContent = col.render ? col.render(item) : displayText;
          return (
            <CellWithPopover tooltipText={tooltipText} cellContentClass={styles.cellContent} popoverClass={styles.popoverSurface}>
              {cellContent}
            </CellWithPopover>
          );
        },
      }),
    ),
    [visibleColumns, styles.cellContent, styles.popoverSurface],
  );

  // --- Column width map (used for inline styles on cells) ---
  const widthMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const col of visibleColumns) map.set(col.key, col.width);
    return map;
  }, [visibleColumns]);

  // --- Search / filter ---
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter((row) =>
      visibleColumns.some((col) => {
        const val = col.searchValue
          ? col.searchValue(row)
          : (row as Record<string, unknown>)[col.key];
        return val != null && String(val).toLowerCase().includes(term);
      }),
    );
  }, [data, search, visibleColumns]);

  // --- Sort (external, so we can paginate the sorted result) ---
  const sorted = useMemo(() => {
    if (!sortState.sortColumn) return filtered;
    const col = visibleColumns.find((c) => c.key === sortState.sortColumn);
    if (!col?.sortable) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[col.key];
      const bVal = (b as Record<string, unknown>)[col.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortState.sortDirection === "ascending" ? cmp : -cmp;
    });
  }, [filtered, sortState, visibleColumns]);

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // --- Handlers ---
  const handleSortChange = useCallback(
    (_e: React.SyntheticEvent, next: GridSortState) => {
      setSortState({ sortColumn: next.sortColumn, sortDirection: next.sortDirection });
      setPage(0);
    },
    [],
  );

  // --- Column alignment lookup ---
  const alignmentMap = useMemo(() => {
    const map = new Map<string, "start" | "end">();
    for (const col of visibleColumns) if (col.alignment) map.set(col.key, col.alignment);
    return map;
  }, [visibleColumns]);

  return (
    <Card appearance="filled" className={styles.card}>
      <CardHeader header={
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <Body1Strong>{title}</Body1Strong>
            {titleTooltip && (
              <Tooltip content={titleTooltip} relationship="description">
                <span className={styles.infoIcon}><Info16Regular /></span>
              </Tooltip>
            )}
          </div>
          <div className={styles.actionsArea}>
            {exportColumns && exportFilename && (
              <ExportButton data={exportData ?? data as Record<string, unknown>[]} columns={exportColumns} filename={exportFilename} iconOnly />
            )}
            {actions}
            {beforeSearch}
            <SearchBox className={styles.searchBox} placeholder={searchPlaceholder} value={search}
              onChange={(_, d) => { setSearch(d.value); setPage(0); }} size="small" aria-label={searchPlaceholder} />
          </div>
        </div>
      } />

      <div className={styles.gridWrapper}>
        <DataGrid
          items={pageData}
          columns={gridColumns}
          sortable
          sortState={sortState}
          onSortChange={handleSortChange}
          getRowId={rowKey
            ? (item: T) => rowKey(item, 0)
            : (item: T) => String(pageData.indexOf(item))}
          focusMode="cell"
          style={{ width: "100%" }}
        >
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell, columnId }) => (
                <DataGridHeaderCell
                  key={String(columnId)}
                  style={{
                    width: widthMap.get(String(columnId)),
                    minWidth: widthMap.get(String(columnId)),
                    maxWidth: widthMap.get(String(columnId)),
                    textAlign: alignmentMap.get(String(columnId)) ?? "start",
                  }}
                >
                  <Body1Strong>{renderHeaderCell()}</Body1Strong>
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
                      width: widthMap.get(String(columnId)),
                      minWidth: widthMap.get(String(columnId)),
                      maxWidth: widthMap.get(String(columnId)),
                      textAlign: alignmentMap.get(String(columnId)) ?? "start",
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

      <div className={styles.pagination}>
        <Body1 className={styles.pageInfo}>
          {sorted.length === 0 ? "No results" : `${safePage * pageSize + 1}-${Math.min((safePage + 1) * pageSize, sorted.length)} of ${sorted.length}`}
        </Body1>
        <Button appearance="subtle" icon={<ChevronLeft16Regular />} aria-label="Previous page"
          disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} size="small" />
        <Button appearance="subtle" icon={<ChevronRight16Regular />} aria-label="Next page"
          disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} size="small" />
      </div>
    </Card>
  );
}

const FluentDataGrid = React.memo(FluentDataGridInner) as typeof FluentDataGridInner;
export default FluentDataGrid;
