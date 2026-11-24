/**
 * ValueByEnvironmentGrid — Card with a Fluent UI DataGrid showing value benefit
 * aggregations grouped by environment.
 *
 * Columns: Count (sortable) | Environment name | Most popular value benefit (brand colored)
 */
import { useCallback, memo } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Subtitle2,
  Caption1Strong,
  Link,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  type TableColumnDefinition,
} from '@fluentui/react-components';
import type { DrillthroughFilter, ValueByEnvironmentRow } from '../../contracts/types';

interface ValueByEnvironmentGridProps {
  data: ValueByEnvironmentRow[];
  onDrillthrough: (filter: DrillthroughFilter) => void;
}

const useStyles = makeStyles({
  card: {
    borderRadius: tokens.borderRadiusLarge,
    display: 'flex',
    flexDirection: 'column',
    flex: '1',
  },
  gridWrapper: {
    padding: `0 0 ${tokens.spacingVerticalM}`,
    overflow: 'auto',
    flex: '1',
    maxHeight: '340px',
    fontSize: tokens.fontSizeBase200,
  },
  benefitCell: {
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  cell: {
    fontSize: tokens.fontSizeBase200,
  },
});

type SortDirection = 'ascending' | 'descending';

/** Card with environment-level value benefit data grid. Count column is sortable and drills through. */
export const ValueByEnvironmentGrid = memo(function ValueByEnvironmentGrid({ data, onDrillthrough }: ValueByEnvironmentGridProps) {
  const styles = useStyles();

  const columns: TableColumnDefinition<ValueByEnvironmentRow>[] = [
    createTableColumn<ValueByEnvironmentRow>({
      columnId: 'count',
      compare: (a, b) => a.count - b.count,
      renderHeaderCell: () => <Caption1Strong>Count</Caption1Strong>,
      renderCell: (item) => (
        <Link
          as="button"
          className={styles.cell}
          onClick={() =>
            onDrillthrough({
              kind: 'environment-benefit',
              environmentKey: item.environmentKey,
              environmentDisplayName: item.environmentDisplayName,
              valueBenefit: item.agentValueBenefit,
            })
          }
          aria-label={`${item.count} ${item.count === 1 ? 'agent' : 'agents'} in ${item.environmentDisplayName} delivering ${item.agentValueBenefit}. View agents`}
        >
          {item.count}
        </Link>
      ),
    }),
    createTableColumn<ValueByEnvironmentRow>({
      columnId: 'environmentDisplayName',
      renderHeaderCell: () => <Caption1Strong>Environment name</Caption1Strong>,
      renderCell: (item) => <span className={styles.cell}>{item.environmentDisplayName}</span>,
    }),
    createTableColumn<ValueByEnvironmentRow>({
      columnId: 'agentValueBenefit',
      renderHeaderCell: () => <Caption1Strong>Most popular value benefit</Caption1Strong>,
      renderCell: (item) => (
        <span className={styles.benefitCell}>{item.agentValueBenefit}</span>
      ),
    }),
  ];

  const getRowId = useCallback(
    (item: ValueByEnvironmentRow) =>
      `${item.environmentKey}-${item.agentValueBenefit}`,
    [],
  );

  return (
    <Card className={styles.card} appearance="filled">
      <CardHeader header={<Subtitle2>Value benefit by environment</Subtitle2>} />
      <div className={styles.gridWrapper}>
        <DataGrid
          items={data}
          columns={columns}
          getRowId={getRowId}
          sortable
          resizableColumns
          focusMode="composite"
          columnSizingOptions={{
            count: { minWidth: 50, defaultWidth: 60 },
            environmentDisplayName: { minWidth: 120, defaultWidth: 200 },
            agentValueBenefit: { minWidth: 120, defaultWidth: 200 },
          }}
          defaultSortState={{ sortColumn: 'count', sortDirection: 'descending' as SortDirection }}
          aria-label="Value benefit by environment"
        >
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell }) => (
                <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<ValueByEnvironmentRow>>
            {({ item, rowId }) => (
              <DataGridRow<ValueByEnvironmentRow> key={rowId}>
                {({ renderCell }) => (
                  <DataGridCell>{renderCell(item)}</DataGridCell>
                )}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      </div>
    </Card>
  );
});

export default ValueByEnvironmentGrid;
