import {
  Badge,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  TableCellLayout,
  Text,
  createTableColumn,
  makeStyles,
  tokens,
  useId,
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import type { SkillResourceRowView } from './viewTypes';

/**
 * DataGrid rendering per-resource rows from a persisted skill bundle review.
 */

const useStyles = makeStyles({
  root: {
    marginBottom: tokens.spacingVerticalM,
  },
  headerLabel: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: tokens.colorNeutralForeground3,
    paddingBottom: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalS,
  },
  noData: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
  pathCell: {
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '12px',
    wordBreak: 'break-all',
    color: tokens.colorNeutralForeground1,
  },
  mono: {
    fontFamily: 'var(--fontFamilyMonospace)',
    fontSize: '11.5px',
  },
});

const RISK_COLOR: Record<string, 'danger' | 'warning' | 'success' | 'subtle'> = {
  high: 'danger',
  medium: 'warning',
  low: 'success',
};
const READINESS_COLOR: Record<string, 'success' | 'warning' | 'subtle'> = {
  ready: 'success',
  needs_review: 'warning',
};

function riskColor(r: SkillResourceRowView['riskLevel']): 'danger' | 'warning' | 'success' | 'subtle' {
  if (!r) return 'subtle';
  return RISK_COLOR[r] ?? 'subtle';
}
function readinessColor(r: SkillResourceRowView['readiness']): 'success' | 'warning' | 'subtle' {
  if (!r) return 'subtle';
  return READINESS_COLOR[r] ?? 'subtle';
}

/**
 * Renders a DataGrid of skill bundle resource rows.
 */
export function SkillResourceTable({ rows }: { rows: SkillResourceRowView[] }) {
  const styles = useStyles();
  const labelId = useId('skill-resources-label');

  if (!rows.length) {
    return (
      <div className={styles.root}>
        <Text className={styles.noData}>No resource data available for this bundle.</Text>
      </div>
    );
  }

  const columns: TableColumnDefinition<SkillResourceRowView>[] = [
    createTableColumn<SkillResourceRowView>({
      columnId: 'path',
      renderHeaderCell: () => 'Path',
      renderCell: (row) => (
        <TableCellLayout>
          <span className={styles.pathCell}>{row.path}</span>
        </TableCellLayout>
      ),
    }),
    createTableColumn<SkillResourceRowView>({
      columnId: 'kind',
      renderHeaderCell: () => 'Kind / Language',
      renderCell: (row) => (
        <TableCellLayout>
          <span className={styles.mono}>{row.kind}{row.language ? ` / ${row.language}` : ''}</span>
        </TableCellLayout>
      ),
    }),
    createTableColumn<SkillResourceRowView>({
      columnId: 'size',
      renderHeaderCell: () => 'Size',
      renderCell: (row) => (
        <TableCellLayout>
          <span className={styles.mono}>{row.sizeBytes !== null ? `${row.sizeBytes.toLocaleString()} B` : '—'}</span>
        </TableCellLayout>
      ),
    }),
    createTableColumn<SkillResourceRowView>({
      columnId: 'status',
      renderHeaderCell: () => 'Analysis status',
      renderCell: (row) => (
        <TableCellLayout>
          <Badge appearance="tint" color="informative" size="small" shape="circular">
            {row.analysisStatus}
          </Badge>
        </TableCellLayout>
      ),
    }),
    createTableColumn<SkillResourceRowView>({
      columnId: 'risk',
      renderHeaderCell: () => 'Risk',
      renderCell: (row) => (
        <TableCellLayout>
          {row.riskLevel ? (
            <Badge appearance="tint" color={riskColor(row.riskLevel)} size="small" shape="circular">
              {row.riskLevel}
            </Badge>
          ) : (
            <span>—</span>
          )}
        </TableCellLayout>
      ),
    }),
    createTableColumn<SkillResourceRowView>({
      columnId: 'readiness',
      renderHeaderCell: () => 'Readiness',
      renderCell: (row) => (
        <TableCellLayout>
          {row.readiness ? (
            <Badge appearance="tint" color={readinessColor(row.readiness)} size="small" shape="circular">
              {row.readiness}
            </Badge>
          ) : (
            <span>—</span>
          )}
        </TableCellLayout>
      ),
    }),
    createTableColumn<SkillResourceRowView>({
      columnId: 'findings',
      renderHeaderCell: () => 'Findings',
      renderCell: (row) => (
        <TableCellLayout>
          <span className={styles.mono}>{row.findingCount}</span>
        </TableCellLayout>
      ),
    }),
    createTableColumn<SkillResourceRowView>({
      columnId: 'coverage',
      renderHeaderCell: () => 'Coverage',
      renderCell: (row) => (
        <TableCellLayout>
          <span className={styles.mono}>{row.reviewCoverage}</span>
        </TableCellLayout>
      ),
    }),
  ];

  return (
    <div className={styles.root}>
      <Text id={labelId} className={styles.headerLabel}>Resources ({rows.length})</Text>
      <DataGrid
        items={rows}
        columns={columns}
        getRowId={(row) => row.path}
        size="small"
        aria-labelledby={labelId}
      >
        <DataGridHeader>
          <DataGridRow>
            {({ renderHeaderCell }) => (
              <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
            )}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody<SkillResourceRowView>>
          {({ item, rowId }) => (
            <DataGridRow<SkillResourceRowView> key={rowId}>
              {({ renderCell }) => (
                <DataGridCell>{renderCell(item)}</DataGridCell>
              )}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
}
