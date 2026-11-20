// TableGridView — renders a Fluent UI DataGrid for metrics with visualizationType 'Table'.
// Fetches raw rows from the metric's source table with date filters applied,
// uses hardcoded column config from drillInColumns.ts, with pagination and sorting.

import { useEffect, useMemo, useState } from 'react';
import {
  makeStyles, tokens, Spinner, Text, SearchBox,
  DataGrid, DataGridHeader, DataGridRow, DataGridHeaderCell, DataGridBody, DataGridCell,
  createTableColumn, type TableColumnDefinition, type TableColumnSizingOptions,
  Button,
} from '@fluentui/react-components';
import { ChevronLeft24Regular, ChevronRight24Regular } from '@fluentui/react-icons';
import type { MetricDefinition, FilterState } from '../../types';
import { dv } from '../../services/dataverseClient';
import { getColumnsForTable, type DrillInColumn } from '../../config/drillInColumns';
import { resolveTimeRange } from '../../utils/dateHelpers';

const PAGE_SIZE = 10;
const MAX_ROWS = 100;

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: tokens.spacingHorizontalS },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalS,
  },
  searchBox: { maxWidth: '220px' },
  gridContainer: {
    flex: 1,
    overflowX: 'auto',
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cellContent: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    maxWidth: '100%',
  },
  stickyHeader: { position: 'sticky' as const, top: 0, zIndex: 1, backgroundColor: tokens.colorNeutralBackground1 },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalXS,
  },
  paginationText: {
    fontSize: '11px',
    color: tokens.colorNeutralForeground3,
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
    fontSize: '13px',
  },
});

function pluralize(entity: string): string {
  const fixed: Record<string, string> = {
    'cat_agenttranscripts': 'cat_agenttranscriptses',
    'cat_dailymetrics': 'cat_dailymetricses',
  };
  if (fixed[entity]) return fixed[entity];
  if (entity.endsWith('s')) return entity;
  if (entity.endsWith('y')) return entity.slice(0, -1) + 'ies';
  return entity + 's';
}

function pickDateField(table: string): string {
  if (table.includes('dailymetrics')) return 'cat_metricdate';
  return 'createdon';
}

type RowItem = Record<string, unknown>;

interface Props {
  metric: MetricDefinition;
  filters: FilterState;
}

export function TableGridView({ metric, filters }: Props) {
  const s = useStyles();
  const [rows, setRows] = useState<RowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [page, setPage] = useState(0);
  const [searchText, setSearchText] = useState('');

  // Fetch data when metric or filters change
  useEffect(() => {
    setLoading(true);
    setError(undefined);
    setRows([]);
    setPage(0);
    setSearchText('');

    const dateField = pickDateField(metric.sourceTable);
    const range = resolveTimeRange(filters.timeRange);
    const filterParts: string[] = [];
    filterParts.push(`${dateField} ge ${range.from.toISOString()}`);
    filterParts.push(`${dateField} le ${range.to.toISOString()}`);

    dv.list<RowItem>(pluralize(metric.sourceTable), {
      filter: filterParts.join(' and '),
      top: MAX_ROWS,
      orderBy: `${dateField} desc`,
    })
      .then(setRows)
      .catch(e => setError((e as Error).message ?? 'Failed to load data'))
      .finally(() => setLoading(false));
  }, [metric.sourceTable, filters.timeRange]);

  // Column config
  const columnConfig = useMemo(() => {
    const config = getColumnsForTable(metric.sourceTable);
    if (config) return config;
    if (rows.length === 0) return [];
    return autoDetectColumns(rows[0]);
  }, [metric.sourceTable, rows]);

  // DataGrid columns
  const gridColumns: TableColumnDefinition<RowItem>[] = useMemo(
    () => columnConfig.map(col =>
      createTableColumn<RowItem>({
        columnId: col.key,
        compare: (a, b) => {
          const aVal = a[col.key];
          const bVal = b[col.key];
          if (aVal == null && bVal == null) return 0;
          if (aVal == null) return -1;
          if (bVal == null) return 1;
          const aNum = Number(aVal);
          const bNum = Number(bVal);
          if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
          return String(aVal).localeCompare(String(bVal));
        },
        renderHeaderCell: () => col.label,
        renderCell: (item) => {
          const text = formatCell(displayValue(item, col.key));
          return <span className={s.cellContent} title={text !== '—' ? text : undefined}>{text}</span>;
        },
      })
    ),
    [columnConfig]
  );

  // Column sizing
  const columnSizingOptions: TableColumnSizingOptions = useMemo(
    () => Object.fromEntries(columnConfig.map(col => [col.key, { minWidth: col.minWidth }])),
    [columnConfig]
  );

  // Search filtering
  const filteredRows = useMemo(() => {
    if (!searchText.trim()) return rows;
    const term = searchText.trim().toLowerCase();
    return rows.filter(row =>
      columnConfig.some(col => {
        const val = displayValue(row, col.key);
        return val != null && String(val).toLowerCase().includes(term);
      })
    );
  }, [rows, searchText, columnConfig]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredRows, page]
  );

  if (loading) {
    return <div className={s.empty}><Spinner size="tiny" label="Loading…" /></div>;
  }

  if (error) {
    return <div className={s.empty}><Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text></div>;
  }

  if (rows.length === 0) {
    return <div className={s.empty}>No data available for the selected filters.</div>;
  }

  if (gridColumns.length === 0) {
    return <div className={s.empty}>No columns configured for this table.</div>;
  }

  return (
    <div className={s.root}>
      <div className={s.toolbar}>
        <SearchBox
          className={s.searchBox}
          size="small"
          placeholder="Search…"
          value={searchText}
          onChange={(_, d) => { setSearchText(d.value); setPage(0); }}
          aria-label="Search table rows"
        />
        {searchText.trim() && filteredRows.length !== rows.length && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {filteredRows.length} of {rows.length}
          </Text>
        )}
      </div>

      <div className={s.gridContainer}>
        <DataGrid
          items={pagedRows}
          columns={gridColumns}
          sortable
          resizableColumns
          columnSizingOptions={columnSizingOptions}
          getRowId={(item) => String(item[Object.keys(item).find(k => k.endsWith('id')) ?? ''] ?? Math.random())}
          size="extra-small"
          style={{ minWidth: '100%', tableLayout: 'fixed' }}
        >
          <DataGridHeader className={s.stickyHeader}>
            <DataGridRow>
              {({ renderHeaderCell, columnId }) => (
                <DataGridHeaderCell className={s.headerCell} title={columnConfig.find(c => c.key === columnId)?.label}>
                  {renderHeaderCell()}
                </DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<RowItem>>
            {({ item, rowId }) => (
              <DataGridRow<RowItem> key={rowId}>
                {({ renderCell }) => (
                  <DataGridCell>
                    {renderCell(item)}
                  </DataGridCell>
                )}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      </div>

      <div className={s.pagination}>
        <span className={s.paginationText}>
          {filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'}
        </span>
        <div>
          <Button
            size="small"
            appearance="subtle"
            icon={<ChevronLeft24Regular />}
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            aria-label="Previous page"
          />
          {totalPages > 1 && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {page + 1} / {totalPages}
            </Text>
          )}
          <Button
            size="small"
            appearance="subtle"
            icon={<ChevronRight24Regular />}
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            aria-label="Next page"
          />
        </div>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string' && v.length > 50) return v.slice(0, 47) + '…';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 50);
  return String(v);
}

function displayValue(row: Record<string, unknown>, key: string): unknown {
  const formatted = row[`${key}@OData.Community.Display.V1.FormattedValue`];
  if (formatted != null && formatted !== '') return formatted;
  return row[key];
}

const SYSTEM_FIELDS = new Set<string>([
  'versionnumber', 'importsequencenumber', 'overriddencreatedon',
  'utcconversiontimezonecode', 'timezoneruleversionnumber',
  'modifiedon', 'modifiedby', 'modifiedonbehalfby',
  'createdby', 'createdonbehalfby',
  'statecode', 'statuscode',
  'ownerid', 'owningbusinessunit', 'owninguser', 'owningteam',
]);

function autoDetectColumns(row: Record<string, unknown>): DrillInColumn[] {
  const keys = Object.keys(row).filter(k => {
    if (k.includes('@')) return false;
    if (k.startsWith('_')) return false;
    if (k.endsWith('id') && k !== 'cat_id') return false;
    if (SYSTEM_FIELDS.has(k)) return false;
    return true;
  });
  keys.sort((a, b) => {
    const aName = a === 'cat_name' || a.endsWith('name');
    const bName = b === 'cat_name' || b.endsWith('name');
    if (aName !== bName) return aName ? -1 : 1;
    return 0;
  });
  return keys.slice(0, 10).map(k => {
    const label = prettyHeader(k);
    return {
      key: k,
      label,
      minWidth: Math.max(120, Math.min(220, label.length * 8)),
    };
  });
}

function prettyHeader(k: string): string {
  const stripped = k.replace(/^cat_/, '');
  return stripped
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}
