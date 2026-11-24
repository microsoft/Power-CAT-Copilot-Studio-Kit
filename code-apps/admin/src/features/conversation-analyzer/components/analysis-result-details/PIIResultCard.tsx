import { useMemo } from 'react';
import {
  makeStyles, tokens, typographyStyles, Card, Subtitle2, Body1, Caption1,
  DataGrid, DataGridHeader, DataGridRow, DataGridHeaderCell, DataGridBody, DataGridCell,
  createTableColumn, type TableColumnDefinition,
} from '@fluentui/react-components';
import { formatDuration } from '../../utils/format';

export interface PIIData {
  summary: {
    totalPIIItems: string;
    containsPII: boolean;
    highestSeverity: string;
    convSummary: string;
  };
  pii: {
    type: string;
    value: string;
    message?: string;
    confidencescore: string;
    severity: string;
  }[];
}

interface PIIResultCardProps {
  data: PIIData;
  duration?: number;
  messages?: number;
  onSelectMessage?: (message: string) => void;
}

const useStyles = makeStyles({
  card: { width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', padding: 0, border: `1px solid ${tokens.colorNeutralStroke2}` },
  body: {
    paddingTop: tokens.spacingVerticalL,
    paddingRight: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
  },
  summaryText: {
    color: tokens.colorNeutralForeground1,
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: tokens.spacingHorizontalM,
  },
  kpiBox: {
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  kpiValue: {
    ...typographyStyles.subtitle1,
  },
  kpiLabel: {
    color: tokens.colorNeutralForeground3,
  },
  clickableRow: {
    cursor: 'pointer',
    minHeight: '44px',
  },
});

export function PIIResultCard({ data, duration, messages, onSelectMessage }: PIIResultCardProps) {
  const styles = useStyles();

  const columns: TableColumnDefinition<PIIData['pii'][0]>[] = useMemo(() => [
    createTableColumn({
      columnId: 'type',
      renderHeaderCell: () => 'Type',
      renderCell: (row) => <Body1>{row.type}</Body1>,
      compare: (a, b) => a.type.localeCompare(b.type),
    }),
    createTableColumn({
      columnId: 'confidence',
      renderHeaderCell: () => 'Confidence',
      renderCell: (row) => <Body1>{row.confidencescore}</Body1>,
      compare: (a, b) => parseFloat(a.confidencescore) - parseFloat(b.confidencescore),
    }),
    createTableColumn({
      columnId: 'severity',
      renderHeaderCell: () => 'Severity',
      renderCell: (row) => <Body1>{row.severity}</Body1>,
      compare: (a, b) => parseFloat(a.severity) - parseFloat(b.severity),
    }),
  ], []);

  return (
    <Card className={styles.card} appearance="filled">
      <div className={styles.body}>
        <Subtitle2>Summary</Subtitle2>
        <Body1 className={styles.summaryText}>{data.summary.convSummary}</Body1>

        {/* KPI cards */}
        <div className={styles.kpiRow}>
          <div className={styles.kpiBox}>
            <span className={styles.kpiValue}>{data.summary.totalPIIItems}</span>
            <Caption1 className={styles.kpiLabel}>PII Detected</Caption1>
          </div>
          <div className={styles.kpiBox}>
            <span className={styles.kpiValue}>{formatDuration(duration)}</span>
            <Caption1 className={styles.kpiLabel}>Conversation Duration</Caption1>
          </div>
          <div className={styles.kpiBox}>
            <span className={styles.kpiValue}>{messages?.toLocaleString() ?? ''}</span>
            <Caption1 className={styles.kpiLabel}>Messages Analyzed</Caption1>
          </div>
        </div>

        {/* PII table */}
        {data.pii.length > 0 && (
          <DataGrid
            items={data.pii}
            columns={columns}
            size="small"
            style={{ width: '100%' }}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<PIIData['pii'][0]>>
              {({ item, rowId }) => (
                <DataGridRow
                  key={rowId}
                  onClick={() => onSelectMessage?.(item.message || item.value)}
                  className={styles.clickableRow}
                >
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}
      </div>
    </Card>
  );
}
