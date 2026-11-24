// Full-page Forecast Workspace. Users pick a metric, choose horizon + model,
// adjust scenario sliders, and see the forecast with MAPE + projected change.

import { useEffect, useMemo, useState } from 'react';
import {
  makeStyles, tokens, Label, Slider, Text, Caption1, Spinner, Dropdown, Option,
  Card, CardHeader, Divider, Button, Tooltip, MessageBar, MessageBarBody, MessageBarTitle, Badge,
  Accordion, AccordionHeader, AccordionItem, AccordionPanel,
  Link, Popover, PopoverTrigger, PopoverSurface,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, AppsListDetail24Regular, Info16Regular, PanelLeftContract24Regular, PanelLeftExpand24Regular, DataTrending24Regular } from '@fluentui/react-icons';
import { ForecastMetricBrowser } from './ForecastMetricBrowser';
import { useAppStore } from '../../store/appStore';
import { trendForecaster, etsForecaster } from '../../services/forecastService';
import type { ForecastResult } from '../../types';
import { FluentLineChart } from '../charts/fluent/FluentLineChart';
import { getPrimaryColor, getAccentColor, hexToRgba } from '../../utils/chartColors';

import { LEVER_TOOLTIPS, DISCLAIMER_TEXT, STAT_TOOLTIPS, MAPE_TOOLTIP, getMapeConfidence } from './forecastUiHelpers';

const MODEL_DESCRIPTIONS: Record<string, { label: string; desc: string }> = {
  Trend: {
    label: 'Trend + Band',
    desc: 'Fits a linear regression to historical data and projects the trend forward. Best for metrics with a steady directional pattern.',
  },
  ETS: {
    label: 'ETS / Holt',
    desc: 'Exponential smoothing that gives more weight to recent data. Better at adapting to recent shifts or level changes in a metric.',
  },
};

const useStyles = makeStyles({
  root: {
    flex: 1, overflowX: 'hidden', overflowY: 'auto',
    padding: tokens.spacingHorizontalXL,
    background: tokens.colorNeutralBackground2,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 320px) 1fr',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
  gridCollapsed: {
    display: 'grid',
    gridTemplateColumns: '48px 1fr',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
  controls: {
    display: 'flex', flexDirection: 'column',
    background: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    height: 'fit-content',
    maxHeight: 'calc(100vh - 120px)',
    position: 'sticky', top: 0,
    overflow: 'hidden',
    minHeight: 0,
    transitionProperty: 'width, min-width',
    transitionDuration: '0.2s',
    transitionTimingFunction: 'ease',
  },
  controlsCollapsed: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center',
    background: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    height: 'fit-content',
    position: 'sticky', top: 0,
    padding: tokens.spacingVerticalS,
    gap: tokens.spacingVerticalM,
  },
  controlsHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    gap: tokens.spacingHorizontalS,
  },
  controlsHeaderContent: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  metricBrowserSection: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL} ${tokens.spacingVerticalM}`,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  configSection: {
    flexShrink: 0,
    padding: `0 ${tokens.spacingHorizontalL} ${tokens.spacingHorizontalL}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalM,
  },
  main: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0, overflow: 'hidden' },
  card: { padding: tokens.spacingHorizontalL },
  chartBox: { height: '420px', marginTop: tokens.spacingVerticalM },
  statsCard: {
    padding: tokens.spacingHorizontalL,
    background: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalS,
  },
  statsHeading: {
    margin: '0',
  },
  stat: {
    padding: 0,
  },
  statLabel: { fontSize: '11px', color: tokens.colorNeutralForeground3 },
  statValue: { fontSize: '22px', fontWeight: 600 },
  sliderRow: { display: 'grid', gridTemplateColumns: '120px 1fr 48px', alignItems: 'center', gap: tokens.spacingHorizontalS },
  labelWithInfo: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  infoButton: { minWidth: 'auto', padding: '2px' },
  optionContent: { display: 'flex', flexDirection: 'column' as const },
  optionDesc: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  modelRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: tokens.spacingHorizontalM, marginTop: tokens.spacingVerticalS },
  disclaimer: { marginBottom: tokens.spacingVerticalXS },
  disclaimerPopover: { maxWidth: '480px', padding: tokens.spacingHorizontalM },
  empty: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    justifyContent: 'center', gap: tokens.spacingVerticalM,
    flex: 1, textAlign: 'center' as const, padding: tokens.spacingHorizontalXXXL,
  },
  emptyIcon: { fontSize: '48px', color: tokens.colorNeutralForeground4 },
  emptyHint: { maxWidth: '420px' },
});

export function ForecastWorkspace() {
  const s = useStyles();
  const metrics = useAppStore(st => st.metrics);
  const datasets = useAppStore(st => st.datasets);
  const loadingDatasets = useAppStore(st => st.loadingDatasets);
  const loadDataset = useAppStore(st => st.loadDataset);
  const scenario = useAppStore(st => st.scenarioInputs);
  const setScenario = useAppStore(st => st.setScenario);
  const filters = useAppStore(st => st.filters);
  const collapsed = useAppStore(st => st.forecastSidebarCollapsed);
  const toggleCollapse = useAppStore(st => st.toggleForecastSidebar);
  const primary = getPrimaryColor();
  const accent = getAccentColor();

  const [selectedId, setSelectedId] = useState<string | undefined>(metrics[0]?.id);
  const [horizon, setHorizon] = useState(30);
  const [modelOverride, setModelOverride] = useState<'Trend' | 'ETS'>('Trend');
  const [result, setResult] = useState<ForecastResult | null>(null);

  const metric = metrics.find(m => m.id === selectedId);
  const dataset = selectedId ? datasets[selectedId] : undefined;
  const loading = selectedId ? loadingDatasets[selectedId] : false;

  useEffect(() => {
    if (!selectedId && metrics.length) setSelectedId(metrics[0].id);
  }, [metrics, selectedId]);

  useEffect(() => {
    if (selectedId && !dataset && !loading) loadDataset(selectedId);
  }, [selectedId, dataset, loading, loadDataset]);

  // Reload forecast dataset when global filters change
  useEffect(() => {
    if (selectedId) loadDataset(selectedId, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    if (!dataset) { setResult(null); return; }
    const forecaster =
      modelOverride === 'ETS' ? etsForecaster : trendForecaster;
    setResult(forecaster.forecast(dataset.points, horizon, scenario));
  }, [dataset, horizon, scenario, modelOverride]);

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
  const endP10 = result?.forecast.at(-1)?.p10 ?? 0;
  const endP90 = result?.forecast.at(-1)?.p90 ?? 0;
  const changePct = lastHistory ? ((endForecast - lastHistory) / lastHistory) * 100 : 0;

  const hasData = dataset && dataset.points.length > 0 && result && result.history.length > 0;

  return (
    <div className={s.root}>
      {metrics.length === 0 ? (
        <div className={s.empty}>
          <AppsListDetail24Regular className={s.emptyIcon} />
          <Text size={500} weight="semibold">No metrics available</Text>
          <Caption1 className={s.emptyHint}>
            Forecasting requires published metrics. Open the Metrics tab to create and publish metric definitions first.
          </Caption1>
          <Button
            appearance="primary"
            icon={<AppsListDetail24Regular />}
            onClick={() => useAppStore.getState().setView('metric-registry')}
          >
            Open Metrics
          </Button>
        </div>
      ) : (
      <>
      <div className={collapsed ? s.gridCollapsed : s.grid}>
        {collapsed ? (
          <div className={s.controlsCollapsed}>
            <Tooltip content="Expand forecast panel" relationship="label">
              <Button
                appearance="subtle"
                size="small"
                icon={<PanelLeftExpand24Regular />}
                onClick={toggleCollapse}
                aria-label="Expand forecast panel"
              />
            </Tooltip>
          </div>
        ) : (
        <div className={s.controls}>
          <div className={s.controlsHeader}>
            <div className={s.controlsHeaderContent}>
              <div className={s.labelWithInfo}>
                <Label weight="semibold">Metric</Label>
                <Tooltip content="Choose which metric to forecast. Metrics are grouped by category — each one represents a measurable KPI from your agent telemetry." relationship="description" positioning="above">
                  <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Metric info" />
                </Tooltip>
              </div>
            </div>
            <Tooltip content="Collapse forecast panel" relationship="label">
              <Button
                appearance="subtle"
                size="small"
                icon={<PanelLeftContract24Regular />}
                onClick={toggleCollapse}
                aria-label="Collapse forecast panel"
              />
            </Tooltip>
          </div>
          <Caption1 style={{ display: 'block', padding: `0 ${tokens.spacingHorizontalM}`, marginTop: tokens.spacingVerticalXS, marginBottom: tokens.spacingVerticalS, color: tokens.colorNeutralForeground3 }}>
            Double-click a metric to forecast it. To create new metrics, go to{' '}
            <Link inline style={{ fontSize: 'inherit' }} onClick={() => useAppStore.getState().setView('metric-registry')}>Metrics</Link>.
          </Caption1>
          <div className={s.metricBrowserSection} data-tour-id="forecast-metric-browser">
            <ForecastMetricBrowser
              metrics={metrics}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          <div className={s.configSection} data-tour-id="forecast-model">
            <div className={s.labelWithInfo}>
              <Label weight="semibold">Model</Label>
              <Tooltip content="Choose a forecasting algorithm. Each model handles trends differently — pick based on whether your metric has steady growth or recent shifts." relationship="description" positioning="above">
                <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Model info" />
              </Tooltip>
            </div>
            <Dropdown
              value={MODEL_DESCRIPTIONS[modelOverride].label}
              selectedOptions={[modelOverride]}
              onOptionSelect={(_, d) => setModelOverride(d.optionValue as typeof modelOverride)}
              size="small"
            >
              {Object.entries(MODEL_DESCRIPTIONS).map(([key, { label, desc }]) => (
                <Option key={key} value={key} text={label}>
                  <span className={s.optionContent}>
                    <span>{label}</span>
                    <span className={s.optionDesc}>{desc}</span>
                  </span>
                </Option>
              ))}
            </Dropdown>

            <div className={s.labelWithInfo} data-tour-id="forecast-horizon">
              <Label>Horizon: <b>{horizon} days</b></Label>
              <Tooltip content="How many days into the future the forecast projects. Longer horizons increase uncertainty — the confidence bands widen over time." relationship="description" positioning="above">
                <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Horizon info" />
              </Tooltip>
            </div>
            <Slider min={7} max={180} step={1} value={horizon} onChange={(_, d) => setHorizon(d.value)} />

            <div data-tour-id="forecast-levers" style={{ width: '100%' }}>
              <Accordion collapsible defaultOpenItems={['levers']}>
              <AccordionItem value="levers">
                <AccordionHeader size="small">
                  <Text weight="semibold" size={200}>Scenario levers</Text>
                </AccordionHeader>
                <AccordionPanel>
                  <div className={s.sliderRow}>
                    <div className={s.labelWithInfo}>
                      <Label>Adoption</Label>
                      <Tooltip content={LEVER_TOOLTIPS.adoption} relationship="description" positioning="above">
                        <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Adoption lever info" />
                      </Tooltip>
                    </div>
                    <Slider min={-50} max={100} value={scenario.adoptionLiftPct} onChange={(_, d) => setScenario({ adoptionLiftPct: d.value })} />
                    <Text>{scenario.adoptionLiftPct}%</Text>
                  </div>
                  <div className={s.sliderRow}>
                    <div className={s.labelWithInfo}>
                      <Label>Containment</Label>
                      <Tooltip content={LEVER_TOOLTIPS.containment} relationship="description" positioning="above">
                        <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Containment lever info" />
                      </Tooltip>
                    </div>
                    <Slider min={-50} max={100} value={scenario.containmentLiftPct} onChange={(_, d) => setScenario({ containmentLiftPct: d.value })} />
                    <Text>{scenario.containmentLiftPct}%</Text>
                  </div>
                  <div className={s.sliderRow}>
                    <div className={s.labelWithInfo}>
                      <Label>Volume</Label>
                      <Tooltip content={LEVER_TOOLTIPS.volume} relationship="description" positioning="above">
                        <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Volume lever info" />
                      </Tooltip>
                    </div>
                    <Slider min={-50} max={100} value={scenario.volumeDeltaPct} onChange={(_, d) => setScenario({ volumeDeltaPct: d.value })} />
                    <Text>{scenario.volumeDeltaPct}%</Text>
                  </div>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
            </div>

            <Divider />
            <Button
              appearance="secondary"
              icon={<ArrowDownload24Regular />}
              disabled={!result}
              size="small"
              onClick={() => {
                if (!result) return;
                const rows = [
                  ['date', 'p10', 'p50', 'p90'],
                  ...result.forecast.map(f => [f.date, f.p10.toFixed(2), f.p50.toFixed(2), f.p90.toFixed(2)]),
                ];
                const csv = rows.map(r => r.join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `forecast-${metric?.name ?? 'metric'}.csv`;
                a.click();
              }}
            >
              Download forecast (CSV)
            </Button>
          </div>
        </div>
        )}

        <div className={s.main}>
          <MessageBar intent="info" className={s.disclaimer}>
            <MessageBarBody>
              <MessageBarTitle>Forecasts are statistical projections, not commitments.</MessageBarTitle>
              Do not use them as the sole basis for capacity, staffing, or financial decisions.{' '}
              <Popover withArrow>
                <PopoverTrigger disableButtonEnhancement>
                  <Link as="button">Learn more</Link>
                </PopoverTrigger>
                <PopoverSurface className={s.disclaimerPopover}>
                  <Text size={200}>{DISCLAIMER_TEXT}</Text>
                </PopoverSurface>
              </Popover>
            </MessageBarBody>
          </MessageBar>

          {loading && <Spinner label="Loading data…" />}

          {!loading && !hasData && dataset && (
            <div className={s.empty}>
              <DataTrending24Regular className={s.emptyIcon} />
              <Text size={500} weight="semibold">No data available for the selected filters</Text>
              <Caption1 className={s.emptyHint}>
                Try selecting a different agent, channel, or data mode. The selected metric may not have data matching the current filter combination.
              </Caption1>
            </div>
          )}

          {hasData && (
            <section className={s.statsCard}>
              <Text as="h3" size={400} weight="semibold" className={s.statsHeading}>Key metrics</Text>
              <div className={s.statsGrid}>
                <div className={s.stat}>
                  <div className={s.statLabel}>Today (last actual)</div>
                  <div className={s.statValue}>{lastHistory.toFixed(1)}</div>
                </div>
                <div className={s.stat}>
                  <div className={s.labelWithInfo}>
                    <div className={s.statLabel}>Projected P50 (day {horizon})</div>
                    <Tooltip content={STAT_TOOLTIPS.projected} relationship="description" positioning="above">
                      <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Projected P50 info" />
                    </Tooltip>
                  </div>
                  <div className={s.statValue}>{endForecast.toFixed(1)}</div>
                </div>
                <div className={s.stat}>
                  <div className={s.statLabel}>Change vs today</div>
                  <div className={s.statValue} style={{ color: changePct >= 0 ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>
                    {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
                  </div>
                </div>
                <div className={s.stat}>
                  <div className={s.labelWithInfo}>
                    <div className={s.statLabel}>80% range (P10 – P90)</div>
                    <Tooltip content={STAT_TOOLTIPS.range} relationship="description" positioning="above">
                      <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="Range stat info" />
                    </Tooltip>
                  </div>
                  <div className={s.statValue}>{endP10.toFixed(0)} – {endP90.toFixed(0)}</div>
                </div>
              </div>
            </section>
          )}

          {hasData && (
            <Card className={s.card} data-tour-id="forecast-chart">
              <CardHeader
                header={<Text size={500} weight="semibold">{metric?.name ?? 'Select a metric'}</Text>}
                description={<Caption1>{metric?.description}</Caption1>}
              />
              <>
                <div className={s.chartBox}>
                  <FluentLineChart
                    series={chartSeries}
                    chartTitle={metric?.name ?? 'Forecast workspace'}
                    ariaLabel={`${metric?.name ?? 'Selected metric'} forecast workspace line chart`}
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
                    <Button appearance="subtle" size="small" icon={<Info16Regular />} className={s.infoButton} aria-label="About forecast chart series" />
                  </Tooltip>
                </div>
              </>
            </Card>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
