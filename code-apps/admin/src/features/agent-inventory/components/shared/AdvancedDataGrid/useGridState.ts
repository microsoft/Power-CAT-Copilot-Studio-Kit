import { useEffect, useMemo, useState } from 'react';
import type {
  GridColumnDefinition,
  GridFilter,
  GridFilterOperator,
  GridGroup,
  GridSort,
} from './AdvancedDataGrid.types';

const COLUMN_STORAGE_PREFIX = 'agent-inventory:grid:';

function readStoredColumns<TRecord>(
  gridId: string,
  columns: GridColumnDefinition<TRecord>[],
): string[] | undefined {
  try {
    const value = window.localStorage.getItem(`${COLUMN_STORAGE_PREFIX}${gridId}:columns`);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const validIds = new Set(columns.map((column) => column.columnId));
    return parsed.filter((columnId): columnId is string => (
      typeof columnId === 'string' && validIds.has(columnId)
    ));
  } catch {
    return undefined;
  }
}

function defaultColumnIds<TRecord>(columns: GridColumnDefinition<TRecord>[]): string[] {
  return columns
    .filter((column) => column.required || column.defaultVisible)
    .map((column) => column.columnId);
}

function ensureRequiredColumns<TRecord>(
  columnIds: string[],
  columns: GridColumnDefinition<TRecord>[],
): string[] {
  const validIds = new Set(columns.map((column) => column.columnId));
  const requiredIds = columns.filter((column) => column.required).map((column) => column.columnId);
  const ordered = columnIds.filter((columnId) => validIds.has(columnId));
  requiredIds.forEach((columnId) => {
    if (!ordered.includes(columnId)) ordered.unshift(columnId);
  });
  return ordered.length > 0 ? ordered : defaultColumnIds(columns);
}

function toSearchText(value: unknown): string {
  if (Array.isArray(value)) return value.join(' ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
  const leftDate = left instanceof Date ? left.getTime() : Date.parse(String(left));
  const rightDate = right instanceof Date ? right.getTime() : Date.parse(String(right));
  if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate) && String(left).includes('-')) {
    return leftDate - rightDate;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

function equalsValue(raw: unknown, expected: string): boolean {
  if (typeof raw === 'boolean') return String(raw) === expected;
  if (typeof raw === 'number') return raw === Number(expected);
  return toSearchText(raw).toLocaleLowerCase() === expected.toLocaleLowerCase();
}

function hasDataValue(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'number') return !Number.isNaN(raw);
  if (typeof raw === 'string') return raw.trim().length > 0;
  if (Array.isArray(raw)) return raw.length > 0;
  return true;
}

function matchesFilter<TRecord>(
  record: TRecord,
  filter: GridFilter,
  columnsById: Map<string, GridColumnDefinition<TRecord>>,
): boolean {
  const column = columnsById.get(filter.columnId);
  if (!column) return true;
  const raw = column.getValue(record);
  const text = toSearchText(raw).toLocaleLowerCase();
  const scalar = (Array.isArray(filter.value) ? filter.value[0] ?? '' : filter.value).trim();
  const expected = scalar.toLocaleLowerCase();
  const selectedValues = (Array.isArray(filter.value) ? filter.value : [filter.value]).map((value) => value.trim());
  const numericValue = Number(raw);
  const numericExpected = Number(scalar);
  const dateValue = new Date(String(raw));
  const dateExpected = new Date(scalar);
  const sameDay = (
    dateValue.getFullYear() === dateExpected.getFullYear()
    && dateValue.getMonth() === dateExpected.getMonth()
    && dateValue.getDate() === dateExpected.getDate()
  );

  switch (filter.operator) {
    case 'contains': return text.includes(expected);
    case 'notContains': return !text.includes(expected);
    case 'startsWith': return text.startsWith(expected);
    case 'endsWith': return text.endsWith(expected);
    case 'equals': return equalsValue(raw, scalar);
    case 'notEquals': return !equalsValue(raw, scalar);
    case 'isAnyOf': return selectedValues.some((value) => (
      Array.isArray(raw)
        ? raw.some((item) => equalsValue(item, value))
        : equalsValue(raw, value)
    ));
    case 'isNotAnyOf': return selectedValues.every((value) => (
      Array.isArray(raw)
        ? raw.every((item) => !equalsValue(item, value))
        : !equalsValue(raw, value)
    ));
    case 'greaterThan': return numericValue > numericExpected;
    case 'greaterThanOrEqual': return numericValue >= numericExpected;
    case 'lessThan': return numericValue < numericExpected;
    case 'lessThanOrEqual': return numericValue <= numericExpected;
    case 'on': return sameDay;
    case 'before': return dateValue.getTime() < dateExpected.getTime();
    case 'after': return dateValue.getTime() > dateExpected.getTime();
    case 'onOrBefore': return sameDay || dateValue.getTime() < dateExpected.getTime();
    case 'onOrAfter': return sameDay || dateValue.getTime() > dateExpected.getTime();
    case 'hasData': return hasDataValue(raw);
    case 'noData': return !hasDataValue(raw);
    default: return true;
  }
}

export function getDefaultFilterOperator(dataType: GridColumnDefinition<unknown>['dataType']): GridFilterOperator {
  if (dataType === 'choice' || dataType === 'boolean') return 'equals';
  if (dataType === 'number') return 'equals';
  if (dataType === 'date' || dataType === 'datetime') return 'on';
  return 'contains';
}

function toGroupValue(value: unknown): { key: string; label: string } {
  if (value === null || value === undefined || value === '') {
    return { key: '\u0000__blank__', label: '(Blank)' };
  }
  const text = Array.isArray(value) ? value.join(', ') : String(value);
  return { key: text.toLocaleLowerCase(), label: text };
}

function buildGroups<TRecord>(
  records: TRecord[],
  column: GridColumnDefinition<TRecord>,
): GridGroup<TRecord>[] {
  const groupsByKey = new Map<string, GridGroup<TRecord>>();
  records.forEach((record) => {
    const { key, label } = toGroupValue(column.getValue(record));
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.records.push(record);
    } else {
      groupsByKey.set(key, { key, label, records: [record] });
    }
  });
  return [...groupsByKey.values()].sort((left, right) => {
    if (left.key === '\u0000__blank__') return 1;
    if (right.key === '\u0000__blank__') return -1;
    if (right.records.length !== left.records.length) {
      return right.records.length - left.records.length;
    }
    return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function useGridState<TRecord>(
  gridId: string,
  columns: GridColumnDefinition<TRecord>[],
  records: TRecord[],
  initialSort?: GridSort,
  initialGroupColumnId?: string,
) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<GridSort | undefined>(initialSort);
  const [filters, setFilters] = useState<GridFilter[]>([]);
  const [groupColumnId, setGroupColumnIdState] = useState<string | undefined>(() => {
    if (!initialGroupColumnId) return undefined;
    const column = columns.find((item) => item.columnId === initialGroupColumnId);
    return column ? initialGroupColumnId : undefined;
  });
  const [storedVisibleColumnIds, setVisibleColumnIdsState] = useState<string[]>(() => (
    ensureRequiredColumns(readStoredColumns(gridId, columns) ?? defaultColumnIds(columns), columns)
  ));

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const columnsById = useMemo(
    () => new Map(columns.map((column) => [column.columnId, column])),
    [columns],
  );

  const visibleColumnIds = useMemo(
    () => ensureRequiredColumns(storedVisibleColumnIds, columns),
    [columns, storedVisibleColumnIds],
  );

  const visibleColumns = useMemo(
    () => visibleColumnIds
      .map((columnId) => columnsById.get(columnId))
      .filter((column): column is GridColumnDefinition<TRecord> => Boolean(column)),
    [columnsById, visibleColumnIds],
  );

  const processedRecords = useMemo(() => {
    const term = search.toLocaleLowerCase();
    const filtered = records.filter((record) => {
      const matchesSearch = !term || columns.some((column) => (
        (column.getSearchText?.(record) ?? toSearchText(column.getValue(record)))
          .toLocaleLowerCase()
          .includes(term)
      ));
      return matchesSearch && filters.every((filter) => matchesFilter(record, filter, columnsById));
    });
    if (!sort) return filtered;
    const column = columnsById.get(sort.columnId);
    if (!column) return filtered;
    const direction = sort.direction === 'ascending' ? 1 : -1;
    return [...filtered].sort((left, right) => (
      compareValues(column.getValue(left), column.getValue(right)) * direction
    ));
  }, [columns, columnsById, filters, records, search, sort]);

  const setVisibleColumnIds = (columnIds: string[]) => {
    const next = ensureRequiredColumns(columnIds, columns);
    setVisibleColumnIdsState(next);
    try {
      window.localStorage.setItem(`${COLUMN_STORAGE_PREFIX}${gridId}:columns`, JSON.stringify(next));
    } catch {
      // Browser storage can be unavailable in restricted host contexts.
    }
  };

  const resetVisibleColumns = () => setVisibleColumnIds(defaultColumnIds(columns));

  /**
   * Reorders a visible column relative to a target column, persisting the new order.
   * @param sourceColumnId - the column being moved.
   * @param targetColumnId - the column to drop next to.
   * @param position - whether to place the source before or after the target.
   */
  const moveColumn = (
    sourceColumnId: string,
    targetColumnId: string,
    position: 'before' | 'after',
  ) => {
    if (sourceColumnId === targetColumnId) return;
    if (!visibleColumnIds.includes(sourceColumnId) || !visibleColumnIds.includes(targetColumnId)) {
      return;
    }
    const without = visibleColumnIds.filter((columnId) => columnId !== sourceColumnId);
    const targetIndex = without.indexOf(targetColumnId);
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
    setVisibleColumnIds([
      ...without.slice(0, insertIndex),
      sourceColumnId,
      ...without.slice(insertIndex),
    ]);
  };
  const applyColumnState = (
    columnId: string,
    direction: GridSort['direction'] | undefined,
    filter: GridFilter | undefined,
  ) => {
    setSort(direction ? { columnId, direction } : (current) => (
      current?.columnId === columnId ? undefined : current
    ));
    setFilters((current) => [
      ...current.filter((item) => item.columnId !== columnId),
      ...(filter ? [filter] : []),
    ]);
  };

  const activeGroupColumn = groupColumnId
    ? columnsById.get(groupColumnId)
    : undefined;
  const groups = useMemo(
    () => (activeGroupColumn ? buildGroups(processedRecords, activeGroupColumn) : undefined),
    [activeGroupColumn, processedRecords],
  );
  const setGroupColumnId = (columnId: string | undefined) => {
    setGroupColumnIdState(columnId && columnsById.has(columnId) ? columnId : undefined);
  };

  return {
    searchInput,
    setSearchInput,
    search,
    sort,
    filters,
    visibleColumnIds,
    visibleColumns,
    processedRecords,
    setVisibleColumnIds,
    resetVisibleColumns,
    moveColumn,
    applyColumnState,
    groupColumnId,
    groupColumn: activeGroupColumn,
    setGroupColumnId,
    groups,
  };
}
