import { useMemo } from 'react';
import { makeStyles, tokens, Text, Button } from '@fluentui/react-components';
import { Warning16Filled } from '@fluentui/react-icons';
import { LineChart } from '@fluentui/react-charting';
import type { IChartProps } from '@fluentui/react-charting';
import type { MetricDataset, MetricDefinition } from '../../types';
import { formatNumber, formatDelta } from '../../utils/format';
import { useAppStore } from '../../store/appStore';
import { getCategoricalPalette } from '../../utils/chartColors';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', padding: tokens.spacingHorizontalS },
  headerRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  value: { fontSize: '42px', fontWeight: 600, lineHeight: '48px', color: tokens.colorNeutralForeground1 },
  unit:  { fontSize: '18px', color: tokens.colorNeutralForeground3, marginLeft: '4px' },
  delta: { fontSize: '13px', fontWeight: 500, marginTop: '4px' },
  pos:   { color: tokens.colorStatusSuccessForeground1 },
  neg:   { color: tokens.colorStatusDangerForeground1 },
  spark: { flex: 1, minHeight: '60px', marginTop: tokens.spacingVerticalS, cursor: 'pointer' },
  anomaly: {
    display: 'inline-flex', alignItems: 'center', gap: '3px',
    padding: '2px 6px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
    background: tokens.colorPaletteRedBackground2, color: tokens.colorPaletteRedForeground1,
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  },
  drillInBtn: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
    ':focus': {
      position: 'static',
      width: 'auto',
      height: 'auto',
      padding: undefined,
      margin: '0',
      overflow: 'visible',
      clip: 'auto',
      whiteSpace: 'normal',
    },
  },
});

/** Detect z-score anomaly on most recent value vs prior window. */
function detectAnomaly(values: number[]): { anomalous: boolean; z: number } {
  if (values.length < 8) return { anomalous: false, z: 0 };
  const last = values[values.length - 1];
  const prior = values.slice(0, -1);
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  const variance = prior.reduce((a, b) => a + (b - mean) ** 2, 0) / (prior.length - 1);
  const sd = Math.sqrt(variance);
  if (!sd) return { anomalous: false, z: 0 };
  const z = (last - mean) / sd;
  return { anomalous: Math.abs(z) >= 2, z };
}

export function KpiChart({ metric, data }: { metric: MetricDefinition; data: MetricDataset }) {
  const s = useStyles();
  const openDrillIn = useAppStore(st => st.openDrillIn);
  const palette = getCategoricalPalette();
  const d = formatDelta(data.delta);
  const labels = data.points.map(p => p.date.slice(5));
  const values = data.points.map(p => p.value);
  const anomaly = detectAnomaly(values);

  const anomalyLabel = anomaly.anomalous
    ? `Latest value is ${anomaly.z > 0 ? '+' : ''}${anomaly.z.toFixed(1)}σ from the recent average`
    : undefined;

  const dataSummary = useMemo(() => {
    const count = data.points.length;
    const totalStr = formatNumber(data.total, metric.unit);
    if (count === 0) return `KPI for ${metric.name}. Current value: ${totalStr}.`;
    const first = labels[0];
    const last = labels[count - 1];
    return `KPI for ${metric.name}. Current value: ${totalStr}. ${d.text} vs prior period. Sparkline with ${count} points from ${first} to ${last}.${anomaly.anomalous ? ` Anomaly detected: ${anomalyLabel}` : ''}`;
  }, [data.points.length, data.total, labels, metric.name, metric.unit, d.text, anomaly.anomalous, anomalyLabel]);

  return (
    <div className={s.root}>
      <div className={s.headerRow}>
        <span className={s.value}>{formatNumber(data.total, metric.unit)}</span>
        {anomaly.anomalous && (
          <span
            className={s.anomaly}
            role="status"
            aria-label={anomalyLabel}
          >
            <Warning16Filled /> {anomaly.z > 0 ? 'High' : 'Low'}
          </span>
        )}
      </div>
      <Text className={`${s.delta} ${d.positive ? s.pos : d.positive === false ? s.neg : ''}`}>
        {d.text} vs prior period
      </Text>
      <div
        className={s.spark}
        onClick={() => openDrillIn({ metricId: metric.id })}
        role="button"
        tabIndex={0}
        aria-label={`${metric.name} - KPI sparkline chart`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openDrillIn({ metricId: metric.id });
          }
        }}
      >
        <LineChart
          data={{
            chartTitle: '',
            lineChartData: [{
              legend: metric.name,
              data: data.points.map(p => ({ x: new Date(p.date), y: p.value })),
              color: palette[0],
            }],
          } as IChartProps}
          width={undefined}
          height={undefined}
          hideLegend={true}
          styles={{ root: { overflow: 'hidden', width: '100%', height: '100%' } }}
        />
      </div>
      <Button
        appearance="transparent"
        className={s.drillInBtn}
        aria-label={`View details for ${metric.name}`}
        onClick={() => openDrillIn({ metricId: metric.id })}
      >
        View details
      </Button>
      <div role="status" className={s.srOnly}>{dataSummary}</div>
    </div>
  );
}
