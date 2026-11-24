import { useMemo } from 'react';
import {
  makeStyles, tokens, typographyStyles, Card, Subtitle2, Body1, Caption1,
  DataGrid, DataGridHeader, DataGridRow, DataGridHeaderCell, DataGridBody, DataGridCell,
  createTableColumn, type TableColumnDefinition,
} from '@fluentui/react-components';
import { formatDuration } from '../../utils/format';

export interface SentimentData {
  summary: {
    overallSentiment: string;
    dominantEmotion: string;
    averageSentimentScore: string;
    convSummary: string;
  };
  sentiments: {
    sentiment: string;
    sentimentScore: string;
    emotion: string;
    emotionIntensity: string;
    sentimentVariability: string;
    summary: string;
    confidenceScore: string;
    message: string;
  }[];
}

interface SentimentResultCardProps {
  data: SentimentData;
  duration?: number;
  messages?: number;
  onSelectMessage?: (message: string) => void;
}

const SENTIMENT_COLORS: Record<string, string> = {
  dissatisfied: tokens.colorPaletteRedForeground1,
  poor: tokens.colorPaletteDarkOrangeForeground1,
  neutral: tokens.colorBrandForeground1,
  satisfied: tokens.colorPaletteGreenForeground1,
  happy: tokens.colorPaletteGreenForeground1,
};

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
  barContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  bar: {
    display: 'flex',
    height: '12px',
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    width: '100%',
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  legendDot: {
    width: '10px',
    height: '10px',
    borderRadius: '2px',
    flexShrink: 0,
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
  negativeScore: {
    color: tokens.colorPaletteRedForeground1,
  },
  positiveScore: {
    color: tokens.colorPaletteGreenForeground1,
  },
  clickableRow: {
    cursor: 'pointer',
    minHeight: '44px',
  },
});

export function SentimentResultCard({ data, duration, messages, onSelectMessage }: SentimentResultCardProps) {
  const styles = useStyles();

  // Build sentiment distribution from sentiments array
  const distribution = buildDistribution(data.sentiments);

  const columns: TableColumnDefinition<SentimentData['sentiments'][0]>[] = useMemo(() => [
    createTableColumn({
      columnId: 'message',
      renderHeaderCell: () => 'MESSAGE',
      renderCell: (row) => <Body1>{row.message}</Body1>,
      compare: (a, b) => a.message.localeCompare(b.message),
    }),
    createTableColumn({
      columnId: 'confidence',
      renderHeaderCell: () => 'CONFIDENCE SCORE',
      renderCell: (row) => <Body1>{row.confidenceScore}</Body1>,
      compare: (a, b) => parseFloat(a.confidenceScore) - parseFloat(b.confidenceScore),
    }),
    createTableColumn({
      columnId: 'sentimentScore',
      renderHeaderCell: () => 'SENTIMENT SCORE',
      renderCell: (row) => {
        const score = parseFloat(row.sentimentScore);
        const cls = score < 0 ? styles.negativeScore : styles.positiveScore;
        return <Body1 className={cls}>{row.sentimentScore}</Body1>;
      },
      compare: (a, b) => parseFloat(a.sentimentScore) - parseFloat(b.sentimentScore),
    }),
  ], [styles.negativeScore, styles.positiveScore]);

  return (
    <Card className={styles.card} appearance="filled">
      <div className={styles.body}>
        <Subtitle2>Summary</Subtitle2>
        <Body1 className={styles.summaryText}>{data.summary.convSummary}</Body1>

        {/* Sentiment distribution bar */}
        <div className={styles.barContainer}>
          <div className={styles.bar}>
            {distribution.map((d) => (
              <div
                key={d.label}
                style={{ width: `${d.pct}%`, backgroundColor: d.color }}
              />
            ))}
          </div>
          <div className={styles.legend}>
            {distribution.map((d) => (
              <div key={d.label} className={styles.legendItem}>
                <div className={styles.legendDot} style={{ backgroundColor: d.color }} />
                <Caption1>{`${d.label} ${d.pct}%`}</Caption1>
              </div>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className={styles.kpiRow}>
          <div className={styles.kpiBox}>
            <span className={styles.kpiValue}>{data.summary.overallSentiment}</span>
            <Caption1 className={styles.kpiLabel}>Overall Sentiment</Caption1>
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

        {/* Sentiments table */}
        {data.sentiments.length > 0 && (
          <DataGrid
            items={data.sentiments}
            columns={columns}
            size="small"
            style={{ width: '100%' }}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<SentimentData['sentiments'][0]>>
              {({ item, rowId }) => (
                <DataGridRow
                  key={rowId}
                  onClick={() => onSelectMessage?.(item.message)}
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

interface DistEntry {
  label: string;
  pct: number;
  color: string;
}

function buildDistribution(sentiments: SentimentData['sentiments']): DistEntry[] {
  if (sentiments.length === 0) return [];
  const counts: Record<string, number> = {};
  for (const s of sentiments) {
    const key = s.sentiment.toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const total = sentiments.length;
  return Object.entries(counts).map(([key, count]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    pct: Math.round((count / total) * 100),
    color: SENTIMENT_COLORS[key] ?? tokens.colorNeutralForeground4,
  }));
}
