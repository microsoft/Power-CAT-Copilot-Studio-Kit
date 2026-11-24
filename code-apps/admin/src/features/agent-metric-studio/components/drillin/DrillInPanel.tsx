// Drill-in side panel — shows the raw Dataverse rows that make up a given
// metric point the user clicked on (day bucket or categorical bucket).
// Uses Fluent UI DataGrid with hardcoded column configs and client-side pagination.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Drawer, DrawerHeader, DrawerHeaderTitle, DrawerBody, Button, Spinner,
  makeStyles, tokens, Text, SearchBox, Badge, Tooltip,
  DataGrid, DataGridHeader, DataGridRow, DataGridHeaderCell, DataGridBody, DataGridCell,
  createTableColumn, type TableColumnDefinition, type TableColumnSizingOptions,
} from '@fluentui/react-components';
import { Dismiss24Regular, ChevronLeft24Regular, ChevronRight24Regular, Table24Regular, Calendar24Regular } from '@fluentui/react-icons';
import { useAppStore } from '../../store/appStore';
import { dv } from '../../services/dataverseClient';
import { getColumnsForTable, type DrillInColumn } from '../../config/drillInColumns';
import { tableLabel } from '../../services/schemaCatalog';
import { resolveTimeRange } from '../../utils/dateHelpers';
import {
  buildChannelFilterClause,
  pickAgentColumn,
  pickChannelColumn,
  pickDataSourceColumn,
} from '../../services/metricService';

const PAGE_SIZE = 10;
const MAX_ROWS = 100;

const useStyles = makeStyles({
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
    flexWrap: 'wrap',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalS,
  },
  searchBox: { maxWidth: '280px' },
  content: { padding: tokens.spacingHorizontalM },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center' as const,
    color: tokens.colorNeutralForeground3,
  },
  gridContainer: {
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 280px)',
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
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  paginationText: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
  },
});

function pluralize(entity: string): string {
  const fixed: Record<string, string> = {
    'cat_agenttranscripts': 'cat_agenttranscriptses',
    'cat_dailymetrics': 'cat_dailymetricses',
    'cat_transcriptmetrics': 'cat_transcriptmetricses',
  };
  if (fixed[entity]) return fixed[entity];
  if (entity.endsWith('s')) return entity;
  if (entity.endsWith('y')) return entity.slice(0, -1) + 'ies';
  return entity + 's';
}

type RowItem = Record<string, unknown>;

export function DrillInPanel() {
  const s = useStyles();
  const drillIn = useAppStore(st => st.drillIn);
  const closeDrillInStore = useAppStore(st => st.closeDrillIn);
  const triggerRef = useRef<Element | null>(null);

  // Capture the element that had focus when the panel opened
  useEffect(() => {
    if (drillIn) {
      triggerRef.current = document.activeElement;
    }
  }, [drillIn]);

  const closeDrillIn = useCallback(() => {
    closeDrillInStore();
    requestAnimationFrame(() => {
      if (triggerRef.current && 'focus' in triggerRef.current) {
        (triggerRef.current as HTMLElement).focus();
      }
    });
  }, [closeDrillInStore]);

  const metrics = useAppStore(st => st.metrics);
  const filters = useAppStore(st => st.filters);
  const [rows, setRows] = useState<RowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [page, setPage] = useState(0);
  const [searchText, setSearchText] = useState('');

  const metric = drillIn ? metrics.find(m => m.id === drillIn.metricId) : undefined;

  useEffect(() => {
    if (!drillIn || !metric) return;
    setLoading(true);
    setError(undefined);
    setRows([]);
    setPage(0);
    setSearchText('');
    const bucket = drillIn.bucket;
    const dateField = metric.sourceTable.includes('dailymetrics')
      ? 'cat_metricdate'
      : metric.sourceTable.includes('transcriptmetrics')
        ? 'cat_conversationdate'
        : 'createdon';
    const filterParts: string[] = [];

    if (bucket && /^\d{4}-\d{2}-\d{2}$/.test(bucket)) {
      // Drill into a specific day bucket
      const start = new Date(bucket + 'T00:00:00Z');
      const end = new Date(bucket + 'T23:59:59Z');
      filterParts.push(`${dateField} ge ${start.toISOString()}`);
      filterParts.push(`${dateField} le ${end.toISOString()}`);
    } else {
      // No bucket — apply the global time range filter
      const range = resolveTimeRange(filters.timeRange);
      filterParts.push(`${dateField} ge ${range.from.toISOString()}`);
      filterParts.push(`${dateField} le ${range.to.toISOString()}`);
    }

    // Apply agent filter from global filters
    if (filters.agentIds?.length) {
      const col = pickAgentColumn(metric.sourceTable);
      if (col) {
        filterParts.push(`${col} eq ${filters.agentIds[0]}`);
      }
    }

    // Apply channel filter
    if (filters.channels?.length) {
      const col = pickChannelColumn(metric.sourceTable);
      if (col) {
        filterParts.push(buildChannelFilterClause(filters.channels[0], col));
      }
    }

    // Apply data mode filter
    if (filters.dataMode && filters.dataMode !== 'both') {
      const col = pickDataSourceColumn(metric.sourceTable);
      if (col) {
        const code = filters.dataMode === 'production' ? 1 : 2;
        filterParts.push(`${col} eq ${code}`);
      }
    }

    dv.list<RowItem>(pluralize(metric.sourceTable), {
      filter: filterParts.join(' and ') || undefined,
      top: MAX_ROWS,
      orderBy: `${dateField} desc`,
    })
      .then(setRows)
      .catch(e => setError((e as Error).message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, [drillIn, metric, filters]);

  // Determine columns — use hardcoded config or fallback to auto-detect
  const columnConfig = useMemo(() => {
    if (!metric) return [];
    const config = getColumnsForTable(metric.sourceTable);
    if (config) return config;
    // Fallback: auto-detect from first row
    if (rows.length === 0) return [];
    return pickVisibleColumns(rows[0]).map<DrillInColumn>(k => {
      const label = prettyHeader(k);
      return {
        key: k,
        label,
        minWidth: Math.max(120, Math.min(220, label.length * 8)),
      };
    });
  }, [metric, rows]);

  // Build DataGrid column definitions
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
          const raw = displayValue(item, col.key);
          const text = formatCell(raw);
          const fullText = String(raw ?? '');
          // Only wrap in Tooltip if text is long enough to potentially truncate
          if (fullText.length > 25) {
            return (
              <Tooltip content={fullText} relationship="description">
                <span className={s.cellContent}>{text}</span>
              </Tooltip>
            );
          }
          return <span className={s.cellContent}>{text}</span>;
        },
      })
    ),
    [columnConfig, s.cellContent]
  );

  // Column sizing options
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

  // Pagination (over filtered rows)
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filteredRows, page]
  );

  if (!drillIn || !metric) return null;

  return (
    <Drawer open={!!drillIn} onOpenChange={(_, { open }) => { if (!open) closeDrillIn(); }} position="end" size="large">
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" icon={<Dismiss24Regular />} onClick={closeDrillIn} aria-label="Close" />}>
          Drill-in: {metric.name}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <div className={s.content}>
          <div className={s.metaRow}>
            <Badge appearance="outline" icon={<Table24Regular />} color="informative">
              {tableLabel(metric.sourceTable)}
            </Badge>
            {drillIn.bucket && (
              <Badge appearance="outline" icon={<Calendar24Regular />} color="subtle">
                {drillIn.bucket}
              </Badge>
            )}
          </div>

          {loading && <Spinner label="Loading rows…" />}
          {error && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>}
          {!loading && !error && rows.length === 0 && (
            <div className={s.empty}>No rows match this date range.</div>
          )}
          {!loading && rows.length > 0 && gridColumns.length > 0 && (
            <>
              <div className={s.toolbar}>
                <SearchBox
                  className={s.searchBox}
                  placeholder="Search rows…"
                  value={searchText}
                  onChange={(_, d) => { setSearchText(d.value); setPage(0); }}
                  aria-label="Search drill-in rows"
                />
                {searchText.trim() && filteredRows.length !== rows.length && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {filteredRows.length} of {rows.length} rows
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
                  getRowId={(item) => String(item['cat_dailymetricsid'] ?? item['cat_copilotkpiid'] ?? JSON.stringify(item).slice(0, 50))}
                  size="small"
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
            </>
          )}
        </div>
      </DrawerBody>
    </Drawer>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string' && v.length > 60) return v.slice(0, 57) + '…';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  return String(v);
}

// Dataverse system / audit / lifecycle columns we never want to show in the drill-in.
const SYSTEM_FIELDS = new Set<string>([
  'versionnumber', 'importsequencenumber', 'overriddencreatedon',
  'utcconversiontimezonecode', 'timezoneruleversionnumber',
  'modifiedon', 'modifiedby', 'modifiedonbehalfby',
  'createdby', 'createdonbehalfby',
  'statecode', 'statuscode',
  'ownerid', 'owningbusinessunit', 'owninguser', 'owningteam',
  'processid', 'stageid', 'traversedpath',
  'emailaddress', 'entityimage', 'entityimage_timestamp', 'entityimage_url', 'entityimageid',
]);

/** Fallback column detection for tables without hardcoded config. */
function pickVisibleColumns(row: Record<string, unknown>): string[] {
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
  return keys.slice(0, 12);
}

function displayValue(row: Record<string, unknown>, key: string): unknown {
  const formatted = row[`${key}@OData.Community.Display.V1.FormattedValue`];
  if (formatted != null && formatted !== '') return formatted;
  return row[key];
}

function prettyHeader(k: string): string {
  const stripped = k.replace(/^cat_/, '');
  return stripped
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

