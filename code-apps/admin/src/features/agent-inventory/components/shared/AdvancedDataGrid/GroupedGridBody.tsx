import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SelectionItemId } from '@fluentui/react-components';
import {
  Badge,
  Button,
  Checkbox,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDown20Regular,
  ArrowUp20Regular,
  ChevronDown20Regular,
  ChevronRight20Regular,
  Dismiss20Regular,
} from '@fluentui/react-icons';
import { ColumnMenu } from './ColumnMenu';
import { useColumnDragReorder } from './useColumnDragReorder';
import type {
  GridColumnDefinition,
  GridFilter,
  GridGroup,
  GridSort,
  GridSortDirection,
} from './AdvancedDataGrid.types';

const SELECTION_COLUMN_WIDTH = 44;

const useStyles = makeStyles({
  groupBar: {
    position: 'sticky',
    top: 0,
    left: 0,
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minHeight: '34px',
    padding: `0 ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    boxSizing: 'border-box',
  },
  groupBarLabel: {
    color: tokens.colorNeutralForeground2,
  },
  groupBarValue: {
    fontWeight: tokens.fontWeightSemibold,
  },
  header: {
    position: 'sticky',
    top: '34px',
    zIndex: 2,
    display: 'flex',
    alignItems: 'stretch',
    minHeight: '38px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    fontWeight: tokens.fontWeightSemibold,
  },
  selectionCell: {
    width: `${SELECTION_COLUMN_WIDTH}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCell: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    padding: '0 10px',
    overflow: 'hidden',
    cursor: 'grab',
  },
  headerCellDropBefore: {
    boxShadow: `inset 3px 0 0 0 ${tokens.colorBrandBackground}`,
  },
  headerCellDropAfter: {
    boxShadow: `inset -3px 0 0 0 ${tokens.colorBrandBackground}`,
  },
  headerDragging: {
    opacity: 0.4,
  },
  headerLabel: {
    minWidth: 0,
    flexGrow: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  sortIcon: {
    fontSize: '16px',
    color: tokens.colorNeutralForeground3,
  },
  groupHeader: {
    position: 'sticky',
    top: '72px',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minHeight: '38px',
    padding: `0 ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    boxSizing: 'border-box',
  },
  groupChevron: {
    display: 'flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    color: tokens.colorNeutralForeground2,
  },
  groupTitle: {
    fontWeight: tokens.fontWeightSemibold,
  },
  groupCount: {
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightRegular,
  },
  row: {
    display: 'flex',
    alignItems: 'stretch',
    minHeight: '44px',
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  rowSelected: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  indentCell: {
    position: 'relative',
    paddingLeft: '30px',
    '::before': {
      content: '""',
      position: 'absolute',
      left: '14px',
      top: 0,
      bottom: 0,
      width: '2px',
      backgroundColor: tokens.colorNeutralStroke2,
    },
  },
  cell: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    padding: '7px 10px',
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cellContent: {
    minWidth: 0,
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  alignedEnd: {
    justifyContent: 'flex-end',
    textAlign: 'right',
  },
  alignedCenter: {
    justifyContent: 'center',
    textAlign: 'center',
  },
  loadMore: {
    minHeight: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

interface GroupedGridBodyProps<TRecord> {
  groups: GridGroup<TRecord>[];
  columns: GridColumnDefinition<TRecord>[];
  columnWidths: Map<string, number>;
  gridContentWidth: number;
  getRecordKey: (record: TRecord) => string;
  collapsedGroups: Set<string>;
  onToggleCollapse: (groupKey: string) => void;
  visibleCount: number;
  selectedItems: Set<SelectionItemId>;
  setSelectedItems: Dispatch<SetStateAction<Set<SelectionItemId>>>;
  sort?: GridSort;
  filters: GridFilter[];
  mountNode?: HTMLElement | null;
  groupColumnId: string;
  groupColumnLabel: string;
  onUngroup: () => void;
  onToggleGroupColumn: (columnId: string) => void;
  onApplyColumnState: (
    columnId: string,
    direction: GridSortDirection | undefined,
    filter: GridFilter | undefined,
  ) => void;
  onMoveColumn: (
    sourceColumnId: string,
    targetColumnId: string,
    position: 'before' | 'after',
  ) => void;
}

export function GroupedGridBody<TRecord>({
  groups,
  columns,
  columnWidths,
  gridContentWidth,
  getRecordKey,
  collapsedGroups,
  onToggleCollapse,
  visibleCount,
  selectedItems,
  setSelectedItems,
  sort,
  filters,
  mountNode,
  groupColumnId,
  groupColumnLabel,
  onUngroup,
  onToggleGroupColumn,
  onApplyColumnState,
  onMoveColumn,
}: GroupedGridBodyProps<TRecord>) {
  const styles = useStyles();
  const columnDnd = useColumnDragReorder(onMoveColumn);

  const allKeys = useMemo(
    () => groups.flatMap((group) => group.records.map(getRecordKey)),
    [getRecordKey, groups],
  );
  const selectedCount = allKeys.filter((key) => selectedItems.has(key)).length;
  const allSelected = allKeys.length > 0 && selectedCount === allKeys.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleKeys = (keys: string[], checked: boolean) => {
    setSelectedItems((current) => {
      const next = new Set(current);
      keys.forEach((key) => (checked ? next.add(key) : next.delete(key)));
      return next;
    });
  };

  const rowWidth = `${gridContentWidth}px`;
  let remaining = visibleCount;
  let truncated = false;

  return (
    <div style={{ minWidth: rowWidth }}>
      <div className={styles.groupBar} style={{ width: rowWidth }}>
        <Text size={200} className={styles.groupBarLabel}>Group by:</Text>
        <Text size={200} className={styles.groupBarValue}>{groupColumnLabel}</Text>
        <Tooltip content="Ungroup" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<Dismiss20Regular />}
            aria-label="Ungroup"
            onClick={onUngroup}
          />
        </Tooltip>
      </div>

      <div className={styles.header} style={{ width: rowWidth }}>
        <div className={styles.selectionCell}>
          <Checkbox
            checked={allSelected ? true : someSelected ? 'mixed' : false}
            onChange={(_, data) => toggleKeys(allKeys, data.checked === true)}
            aria-label="Select all agents"
          />
        </div>
        {columns.map((column) => {
          const activeSort = sort?.columnId === column.columnId ? sort.direction : undefined;
          const activeFilter = filters.find((filter) => filter.columnId === column.columnId);
          const isGrouped = groupColumnId === column.columnId;
          return (
            <div
              key={column.columnId}
              className={mergeClasses(
                styles.headerCell,
                column.align === 'end' && styles.alignedEnd,
                column.align === 'center' && styles.alignedCenter,
                columnDnd.draggingColumnId === column.columnId && styles.headerDragging,
                columnDnd.dropTarget?.columnId === column.columnId
                  && (columnDnd.dropTarget.position === 'before'
                    ? styles.headerCellDropBefore
                    : styles.headerCellDropAfter),
              )}
              style={{ flex: `0 0 ${columnWidths.get(column.columnId) ?? 180}px` }}
              {...columnDnd.getDragSourceProps(column.columnId)}
              {...columnDnd.getDropTargetProps(column.columnId)}
            >
              <span className={styles.headerLabel} title={column.label}>{column.label}</span>
              <span className={styles.headerActions}>
                {activeSort === 'ascending' && <ArrowUp20Regular className={styles.sortIcon} aria-label="Sorted ascending" />}
                {activeSort === 'descending' && <ArrowDown20Regular className={styles.sortIcon} aria-label="Sorted descending" />}
                <ColumnMenu
                  column={column}
                  activeSort={activeSort}
                  activeFilter={activeFilter}
                  mountNode={mountNode}
                  isGrouped={isGrouped}
                  onToggleGroup={() => (isGrouped ? onUngroup() : onToggleGroupColumn(column.columnId))}
                  onApply={(direction, filter) => onApplyColumnState(column.columnId, direction, filter)}
                />
              </span>
            </div>
          );
        })}
      </div>

      {groups.map((group) => {
        const collapsed = collapsedGroups.has(group.key);
        const groupKeys = group.records.map(getRecordKey);
        const groupSelected = groupKeys.filter((key) => selectedItems.has(key)).length;
        const groupAll = groupKeys.length > 0 && groupSelected === groupKeys.length;
        const groupSome = groupSelected > 0 && !groupAll;
        let visibleRecords: TRecord[] = [];
        if (!collapsed) {
          visibleRecords = group.records.slice(0, Math.max(0, remaining));
          if (visibleRecords.length < group.records.length) truncated = true;
          remaining -= visibleRecords.length;
        }
        return (
          <div key={group.key}>
            <div className={styles.groupHeader} style={{ width: rowWidth }}>
              <div className={styles.selectionCell}>
                <Checkbox
                  checked={groupAll ? true : groupSome ? 'mixed' : false}
                  onChange={(_, data) => toggleKeys(groupKeys, data.checked === true)}
                  aria-label={`Select all agents in ${group.label}`}
                />
              </div>
              <button
                type="button"
                className={styles.groupChevron}
                onClick={() => onToggleCollapse(group.key)}
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.label}`}
              >
                {collapsed ? <ChevronRight20Regular /> : <ChevronDown20Regular />}
              </button>
              <Text className={styles.groupTitle}>{group.label}</Text>
              <Badge appearance="tint" color="subtle" shape="rounded">{group.records.length.toLocaleString()}</Badge>
            </div>
            {visibleRecords.map((record) => {
              const key = getRecordKey(record);
              const selected = selectedItems.has(key);
              return (
                <div
                  key={key}
                  className={mergeClasses(styles.row, selected && styles.rowSelected)}
                  style={{ width: rowWidth }}
                  aria-selected={selected}
                >
                  <div className={styles.selectionCell}>
                    <Checkbox
                      checked={selected}
                      onChange={() => toggleKeys([key], !selected)}
                      aria-label="Select agent"
                    />
                  </div>
                  {columns.map((column, columnIndex) => {
                    const title = column.dataType === 'text'
                      ? String(column.getValue(record) ?? '')
                      : undefined;
                    return (
                      <div
                        key={column.columnId}
                        className={mergeClasses(
                          styles.cell,
                          columnIndex === 0 && styles.indentCell,
                          column.align === 'end' && styles.alignedEnd,
                          column.align === 'center' && styles.alignedCenter,
                        )}
                        style={{ flex: `0 0 ${columnWidths.get(column.columnId) ?? 180}px` }}
                      >
                        <span className={styles.cellContent} title={title}>{column.renderCell(record)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
      {truncated && (
        <div className={styles.loadMore}>Scroll to load more</div>
      )}
    </div>
  );
}
