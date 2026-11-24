import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Dropdown,
  Option,
  Spinner,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  DataGridSelectionCell,
  createTableColumn,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
} from '@fluentui/react-components';
import { CheckmarkCircle16Regular } from '@fluentui/react-icons';
import type { OnSelectionChangeData, TableColumnDefinition } from '@fluentui/react-components';
import type { PpEnvironment } from '../../models/environment';
import { semanticColors } from '../../theme/powerShieldTheme.tokens';
import { filterEnvironments, mergePageSelection } from '../utils/environmentSelection';

const PAGE_SIZE = 15;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
  },
  filterRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    marginBottom: tokens.spacingVerticalM,
  },
  gridWrapper: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopWidth: tokens.strokeWidthThin,
    borderRightWidth: tokens.strokeWidthThin,
    borderBottomWidth: tokens.strokeWidthThin,
    borderLeftWidth: tokens.strokeWidthThin,
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftColor: tokens.colorNeutralStroke2,
    borderRadius: tokens.borderRadiusMedium,
  },
  dataGrid: {
    '& [role="row"]': {
      boxShadow: `inset 0 -1px 0 0 ${tokens.colorNeutralStroke2}`,
    },
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
  nameCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  rowWarning: {
    fontSize: tokens.fontSizeBase200,
    color: semanticColors.warning,
  },
  emptyState: {
    padding: tokens.spacingVerticalL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  selectionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderTopStyle: 'solid',
    borderTopWidth: '0.5px',
    borderTopColor: tokens.colorBrandStroke2,
  },
  paginationRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalXS,
  },
});

const TYPE_BADGE_STYLES: Record<string, { background: string; color: string }> = {
  Default: { background: semanticColors.infoBackground, color: semanticColors.info },
  Sandbox: { background: semanticColors.successBackground, color: semanticColors.success },
  Production: { background: semanticColors.warningBackground, color: semanticColors.warning },
};

/** Coloured pill for an environment type (Default, Sandbox, Production). */
export function TypeBadge({ type }: { type: string }) {
  const style = TYPE_BADGE_STYLES[type];
  if (!style) return <Text>{type}</Text>;
  return (
    <span
      style={{
        backgroundColor: style.background,
        color: style.color,
        borderRadius: tokens.borderRadiusSmall,
        paddingTop: '2px',
        paddingBottom: '2px',
        paddingLeft: tokens.spacingHorizontalXS,
        paddingRight: tokens.spacingHorizontalXS,
        fontSize: tokens.fontSizeBase100,
        fontWeight: tokens.fontWeightSemibold,
        whiteSpace: 'nowrap',
      }}
    >
      {type}
    </span>
  );
}

export interface EnvironmentPickerTableProps {
  items: PpEnvironment[];
  /** Selected environment GUIDs (`PpEnvironment.name`). The parent owns the selection. */
  selectedIds: ReadonlySet<string>;
  /** Called with the full selection, including IDs on other pages or hidden by filters. */
  onSelectionChange: (next: Set<string>) => void;
  /** Optional warning shown under the environment name. */
  rowWarning?: (env: PpEnvironment) => ReactNode | undefined;
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
  /** Shown when there are no environments and no search is active. */
  emptyMessage?: string;
  ariaLabel: string;
}

/**
 * Multi-select environment table with search, Type and Location filters, and
 * paging. Selection is controlled by the parent and survives paging, search and
 * filter changes. Search, filter and page state live here.
 */
export function EnvironmentPickerTable({
  items,
  selectedIds,
  onSelectionChange,
  rowWarning,
  isLoading,
  error,
  onRetry,
  emptyMessage = 'No eligible environments found.',
  ariaLabel,
}: EnvironmentPickerTableProps) {
  const styles = useStyles();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const typeOptions = useMemo(() => [...new Set(items.map((e) => e.environmentSku))].sort(), [items]);
  const locationOptions = useMemo(() => [...new Set(items.map((e) => e.location))].sort(), [items]);

  const filtered = useMemo(
    () => filterEnvironments(items, searchTerm, typeFilter, locationFilter),
    [items, searchTerm, typeFilter, locationFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Pull the page back into range when the list shrinks.
  const page = Math.min(currentPage, totalPages);
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const pageIds = useMemo(() => new Set(paged.map((e) => e.name)), [paged]);
  const pageSelection = useMemo(
    () => new Set([...selectedIds].filter((id) => pageIds.has(id))),
    [selectedIds, pageIds],
  );

  const columns: TableColumnDefinition<PpEnvironment>[] = useMemo(
    () => [
      createTableColumn<PpEnvironment>({
        columnId: 'displayName',
        renderHeaderCell: () => 'Display Name',
        renderCell: (item) => {
          const warning = rowWarning?.(item);
          if (!warning) return item.displayName;
          return (
            <div className={styles.nameCell}>
              <Text>{item.displayName}</Text>
              <span className={styles.rowWarning}>{warning}</span>
            </div>
          );
        },
      }),
      createTableColumn<PpEnvironment>({
        columnId: 'type',
        renderHeaderCell: () => 'Type',
        renderCell: (item) => <TypeBadge type={item.environmentSku} />,
      }),
      createTableColumn<PpEnvironment>({
        columnId: 'location',
        renderHeaderCell: () => 'Location',
        renderCell: (item) => item.location,
      }),
    ],
    [rowWarning, styles.nameCell, styles.rowWarning],
  );

  function handleSelectionChange(_: unknown, data: OnSelectionChangeData) {
    const pageSelected = new Set([...data.selectedItems].map(String));
    onSelectionChange(mergePageSelection(selectedIds, pageIds, pageSelected));
  }

  if (isLoading) {
    return <Spinner size="small" label="Loading environments…" />;
  }

  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{error}</MessageBarBody>
        {onRetry && (
          <MessageBarActions>
            <Button size="small" onClick={onRetry}>
              Retry
            </Button>
          </MessageBarActions>
        )}
      </MessageBar>
    );
  }

  const count = selectedIds.size;

  return (
    <div className={styles.root}>
      <div className={styles.filterRow}>
        <Input
          placeholder="Search by display name..."
          value={searchTerm}
          onChange={(_, d) => { setSearchTerm(d.value); setCurrentPage(1); }}
          style={{ maxWidth: '280px' }}
          aria-label="Search environments"
        />
        <Dropdown
          placeholder="All Types"
          multiselect
          selectedOptions={typeFilter}
          onOptionSelect={(_, d) => { setTypeFilter(d.selectedOptions); setCurrentPage(1); }}
          value={typeFilter.length > 0 ? `${typeFilter.length} type${typeFilter.length !== 1 ? 's' : ''} selected` : ''}
          style={{ minWidth: '160px' }}
          aria-label="Filter by type"
        >
          {typeOptions.map((t) => <Option key={t} value={t}>{t}</Option>)}
        </Dropdown>
        <Dropdown
          placeholder="All Locations"
          multiselect
          selectedOptions={locationFilter}
          onOptionSelect={(_, d) => { setLocationFilter(d.selectedOptions); setCurrentPage(1); }}
          value={locationFilter.length > 0 ? `${locationFilter.length} location${locationFilter.length !== 1 ? 's' : ''} selected` : ''}
          style={{ minWidth: '180px' }}
          aria-label="Filter by location"
        >
          {locationOptions.map((l) => <Option key={l} value={l}>{l}</Option>)}
        </Dropdown>
      </div>

      {count > 0 && (
        <MessageBar intent="info" style={{ marginBottom: tokens.spacingVerticalS }}>
          <MessageBarBody>
            {count} environment{count !== 1 ? 's' : ''} selected
            {totalPages > 1 ? '. Selections are preserved across pages.' : '.'}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.gridWrapper}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <Text>{searchTerm ? `No environments match "${searchTerm}".` : emptyMessage}</Text>
          </div>
        ) : (
          <DataGrid
            items={paged}
            columns={columns}
            selectionMode="multiselect"
            selectedItems={pageSelection}
            onSelectionChange={handleSelectionChange}
            getRowId={(item) => item.name}
            className={styles.dataGrid}
            aria-label={ariaLabel}
            focusMode="composite"
          >
            <DataGridHeader>
              <DataGridRow
                selectionCell={
                  <DataGridSelectionCell
                    checkboxIndicator={{ 'aria-label': 'Select all environments on this page' }}
                  />
                }
              >
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell className={styles.headerCell}>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<PpEnvironment>>
              {({ item, rowId }) => (
                <DataGridRow<PpEnvironment>
                  key={rowId}
                  selectionCell={
                    <DataGridSelectionCell
                      checkboxIndicator={{ 'aria-label': `Select ${item.displayName}` }}
                    />
                  }
                >
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}

        {count > 0 && (
          <div className={styles.selectionBar}>
            <CheckmarkCircle16Regular style={{ color: tokens.colorBrandForeground1 }} />
            <Text size={200} style={{ color: tokens.colorBrandForeground1 }}>
              {count} environment{count !== 1 ? 's' : ''} selected
              {totalPages > 1 ? ' (across all pages)' : ''}
            </Text>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className={styles.paginationRow}>
          <Button appearance="subtle" size="small" onClick={() => setCurrentPage(page - 1)} disabled={page === 1}>
            ← Prev
          </Button>
          <Text size={200}>Page {page} of {totalPages}</Text>
          <Button appearance="subtle" size="small" onClick={() => setCurrentPage(page + 1)} disabled={page === totalPages}>
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
