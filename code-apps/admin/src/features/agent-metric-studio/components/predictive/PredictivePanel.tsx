import { useEffect, useMemo, useState } from 'react';
import {
  makeStyles, tokens, Drawer, DrawerHeader, DrawerHeaderTitle, DrawerBody,
  Button, Dropdown, Option, Label, Slider, Text, Caption1, Spinner, Tooltip, Badge,
  MessageBar, MessageBarBody,
} from '@fluentui/react-components';
import { Dismiss24Regular, Info16Regular } from '@fluentui/react-icons';
import { useAppStore } from '../../store/appStore';
import { resolveForecaster } from '../../services/forecastService';
import type { ForecastResult } from '../../types';
import { FluentLineChart } from '../charts/fluent/FluentLineChart';
import { getPrimaryColor, getAccentColor, hexToRgba } from '../../utils/chartColors';
import { LEVER_TOOLTIPS, DISCLAIMER_TEXT, MAPE_TOOLTIP, getMapeConfidence } from './forecastUiHelpers';

const useStyles = makeStyles({
  section: { marginBottom: tokens.spacingVerticalL },
  metricRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM, marginBottom: tokens.spacingVerticalS },
  sliderRow: { display: 'grid', gridTemplateColumns: '140px 1fr 60px', alignItems: 'center', gap: tokens.spacingHorizontalM },
  chartBox: { height: '280px', marginTop: tokens.spacingVerticalM },
  summary: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingHorizontalM, marginTop: tokens.spacingVerticalM },
  stat: { padding: tokens.spacingHorizontalM, background: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusMedium },
  statLabel: { fontSize: '11px', color: tokens.colorNeutralForeground3 },
  statValue: { fontSize: '22px', fontWeight: 600 },
  caption: { display: 'block', marginBottom: tokens.spacingVerticalM },
  modelRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalM },
  labelWithInfo: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  infoButton: { minWidth: 'auto', padding: '2px' },
  disclaimer: { marginTop: tokens.spacingVerticalL },
});

export function PredictivePanel() {
  const s = useStyles();
  const open = useAppStore(st => st.predictivePanelOpen);
  const closePanel = useAppStore(st => st.closePredictive);
  const metrics = useAppStore(st => st.metrics);
  const selectedId = useAppStore(st => st.predictiveMetricId);
  const metricLocked = useAppStore(st => st.predictiveMetricLocked);
  const dataset = useAppStore(st => selectedId ? st.datasets[selectedId] : undefined);
  const scenario = useAppStore(st => st.scenarioInputs);
  const setScenario = useAppStore(st => st.setScenario);
  const openPredictive = useAppStore(st => st.openPredictive);
  const primary = getPrimaryColor();
  const accent = getAccentColor();

  const [horizon, setHorizon] = useState(14);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ForecastResult | null>(null);

  const metric = metrics.find(m => m.id === selectedId);

  useEffect(() => {
    if (!open || !dataset) return;
    setLoading(true);
    const forecaster = resolveForecaster();
    Promise.resolve(forecaster.forecast(dataset.points, horizon, scenario))
      .then(setResult)
      .finally(() => setLoading(false));
  }, [open, dataset, horizon, scenario]);

  const chartSeries = useMemo(() => {
    if (!result) return [];
    return [
      {
        legend: 'History',
        data: result.history.map(point => ({ x: new Date(point.date), y: point.value })),
        color: primary,
      },
      {
        legend: 'Forecast (P50)',
        data: result.forecast.map(point => ({ x: new Date(point.date), y: point.p50 })),
        color: accent,
      },
      {
        legend: 'P90',
        data: result.forecast.map(point => ({ x: new Date(point.date), y: point.p90 })),
        color: hexToRgba(accent, 0.45),
      },
      {
        legend: 'P10',
        data: result.forecast.map(point => ({ x: new Date(point.date), y: point.p10 })),
        color: hexToRgba(accent, 0.3),
      },
    ];
  }, [result, primary, accent]);

  const lastHistory = result?.history.at(-1)?.value ?? 0;
  const endForecast = result?.forecast.at(-1)?.p50 ?? 0;
  const changePct = lastHistory ? ((endForecast - lastHistory) / lastHistory) * 100 : 0;

  return (
    <Drawer open={open} onOpenChange={(_, { open }) => { if (!open) closePanel(); }} position="end" size="large">
      <DrawerHeader>
        <DrawerHeaderTitle
          action={<Button appearance="subtle" icon={<Dismiss24Regular />} onClick={closePanel} />}
        >
          Predictive scenarios
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <div className={`${s.section} ${s.metricRow}`}>
          {metricLocked ? (
            <>
              <Label>Metric</Label>
              <Text weight="semibold">{metric?.name ?? 'Unknown metric'}</Text>
            </>
          ) : (
            <>
              <Label>Metric</Label>
              <Dropdown
                value={metric?.name ?? 'Pick a metric'}
                selectedOptions={selectedId ? [selectedId] : []}
                onOptionSelect={(_, d) => openPredictive(d.optionValue)}
              >
                {metrics.map(m => <Option key={m.id} value={m.id}>{m.name}</Option>)}
              </Dropdown>
            </>
          )}
        </div>

        <div className={s.section}>
          <div className={s.sliderRow}>
            <div className={s.labelWithInfo}>
              <Label>Horizon</Label>
              <Tooltip content="How many days into the future the forecast projects. Longer horizons increase uncertainty — the confidence bands widen over time." relationship="description" positioning="above">
                <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Horizon info" />
              </Tooltip>
            </div>
            <Slider min={7} max={90} step={1} value={horizon} onChange={(_, d) => setHorizon(d.value)} />
            <Text><b>{horizon} days</b></Text>
          </div>
        </div>

        <div className={s.section}>
          <Text weight="semibold" size={300}>Scenario levers</Text>
          <Caption1 className={s.caption}>Tune adoption, containment, and volume and watch the forecast react.</Caption1>

          <div className={s.sliderRow}>
            <div className={s.labelWithInfo}>
              <Label>Adoption lift</Label>
              <Tooltip content={LEVER_TOOLTIPS.adoption} relationship="description" positioning="above">
                <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Adoption lever info" />
              </Tooltip>
            </div>
            <Slider min={-50} max={100} value={scenario.adoptionLiftPct} onChange={(_, d) => setScenario({ adoptionLiftPct: d.value })} />
            <Text>{scenario.adoptionLiftPct}%</Text>
          </div>
          <div className={s.sliderRow}>
            <div className={s.labelWithInfo}>
              <Label>Containment lift</Label>
              <Tooltip content={LEVER_TOOLTIPS.containment} relationship="description" positioning="above">
                <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Containment lever info" />
              </Tooltip>
            </div>
            <Slider min={-50} max={100} value={scenario.containmentLiftPct} onChange={(_, d) => setScenario({ containmentLiftPct: d.value })} />
            <Text>{scenario.containmentLiftPct}%</Text>
          </div>
          <div className={s.sliderRow}>
            <div className={s.labelWithInfo}>
              <Label>Volume delta</Label>
              <Tooltip content={LEVER_TOOLTIPS.volume} relationship="description" positioning="above">
                <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Volume lever info" />
              </Tooltip>
            </div>
            <Slider min={-50} max={100} value={scenario.volumeDeltaPct} onChange={(_, d) => setScenario({ volumeDeltaPct: d.value })} />
            <Text>{scenario.volumeDeltaPct}%</Text>
          </div>
        </div>

        {loading && <Spinner label="Computing forecast…" />}

        {!loading && result && (
          <>
            <div className={s.chartBox}>
              <FluentLineChart
                series={chartSeries}
                chartTitle={metric?.name ?? 'Predictive forecast'}
                ariaLabel={`${metric?.name ?? 'Selected metric'} predictive forecast line chart`}
              />
            </div>
            <div className={s.modelRow}>
              <Caption1>
                Model: <b>{result?.modelName}</b>
                {result?.mape != null && Number.isFinite(result.mape) ? <> · MAPE: <b>{result.mape.toFixed(1)}%</b></> : null}
              </Caption1>
              {result?.mape != null && Number.isFinite(result.mape) && (
                <Badge color={getMapeConfidence(result.mape).color} appearance="filled" size="small">
                  {getMapeConfidence(result.mape).label}
                </Badge>
              )}
              <Tooltip content={MAPE_TOOLTIP} relationship="description" positioning="below">
                <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="About model accuracy" />
              </Tooltip>
            </div>
            <div className={s.summary}>
              <div className={s.stat}>
                <div className={s.statLabel}>Projected end-of-horizon (P50)</div>
                <div className={s.statValue}>{endForecast.toFixed(1)}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Change vs today</div>
                <div className={s.statValue} style={{ color: changePct >= 0 ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
                </div>
              </div>
            </div>
            <MessageBar intent="info" className={s.disclaimer}>
              <MessageBarBody>
                {DISCLAIMER_TEXT}
              </MessageBarBody>
            </MessageBar>
          </>
        )}
      </DrawerBody>
    </Drawer>
  );
}
