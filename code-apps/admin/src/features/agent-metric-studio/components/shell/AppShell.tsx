import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { makeStyles, tokens, FluentProvider, Spinner, Text } from '@fluentui/react-components';
import { createAmsTheme } from '../../theme';
import { TopBar } from './TopBar';
import { DashboardCommandBar } from './DashboardCommandBar';
import { ForecastCommandBar } from './ForecastCommandBar';
import { Sidebar } from './Sidebar';
import { GuidedTour, shouldShowTour, resetTour, hasTourForView } from './GuidedTour';
import { Canvas } from '../canvas/Canvas';
import { PredictivePanel } from '../predictive/PredictivePanel';
import { ForecastWorkspace } from '../predictive/ForecastWorkspace';
import { DrillInPanel } from '../drillin/DrillInPanel';
import { MetricRegistry } from '../admin/MetricRegistry';
import { useAppStore } from '../../store/appStore';

const useStyles = makeStyles({
  // Fixed height: body is overflow:hidden (src/index.css), so inner panes must own scrolling.
  root: { display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' },
  main: { display: 'flex', flex: 1, minHeight: 0, overflow: 'auto' },
  dashboardContent: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    padding: tokens.spacingHorizontalXL,
    gap: tokens.spacingHorizontalL,
    background: tokens.colorNeutralBackground2,
    boxSizing: 'border-box' as const,
    minWidth: 0,
    overflow: 'hidden',
  },
  dashboardNav: {
    display: 'flex',
    minHeight: 0,
  },
  bootstrapOverlay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalXXL,
  },
});

export function AppShell() {
  const s = useStyles();
  const canvasRef = useRef<HTMLDivElement>(null);
  const init = useAppStore(st => st.init);
  const metrics = useAppStore(st => st.metrics);
  const datasets = useAppStore(st => st.datasets);
  const cards = useAppStore(st => st.currentLayout.cards);
  const filters = useAppStore(st => st.filters);
  const layoutName = useAppStore(st => st.currentLayout.name);
  const view = useAppStore(st => st.view);
  const bootstrapping = useAppStore(st => st.bootstrapping);
  const bootstrapMessage = useAppStore(st => st.bootstrapMessage);
  const loading = useAppStore(st => st.loading);

  const [tourActive, setTourActive] = useState(false);

  const theme = useMemo(() => createAmsTheme(), []);

  useEffect(() => { init(); }, [init]);

  // Start tour after bootstrap completes OR after normal init on first visit per view
  const initialized = useAppStore(st => st.initialized);
  const firstRunBootstrap = useAppStore(st => st.firstRunBootstrap);
  const tourTriggeredViews = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (initialized && !bootstrapping && !tourTriggeredViews.current.has(view)) {
      // Force-trigger tour after first-run bootstrap for dashboard (ignore localStorage)
      // Otherwise only show if user hasn't dismissed it for this specific view
      const forceForBootstrap = view === 'dashboard' && firstRunBootstrap;
      if (forceForBootstrap || (hasTourForView(view) && shouldShowTour(view))) {
        tourTriggeredViews.current.add(view);
        const timer = setTimeout(() => setTourActive(true), 800);
        return () => clearTimeout(timer);
      }
    }
  }, [initialized, bootstrapping, view, firstRunBootstrap]);

  const startTour = useCallback(() => {
    resetTour();
    // Start tour in the current view context — no forced navigation
    setTimeout(() => setTourActive(true), 100);
  }, []);

  const cardEntries = cards
    .map(c => ({ metric: metrics.find(m => m.id === c.metricId), data: datasets[c.metricId] }))
    .filter(e => e.metric && e.data) as { metric: NonNullable<typeof metrics[0]>; data: NonNullable<typeof datasets[string]> }[];

  const onExportExcel = async () => {
    const { exportService } = await import('../../services/exportService');
    return exportService.exportDashboardExcel(cardEntries, filters, layoutName);
  };
  const onExportPdf = async () => {
    if (!canvasRef.current) return;
    const { exportService } = await import('../../services/exportService');
    return exportService.exportDashboardPdf(canvasRef.current, filters, layoutName);
  };
  const onExportPptx = async () => {
    const { exportService } = await import('../../services/exportService');
    return exportService.exportDashboardPptx(cardEntries, filters, layoutName);
  };

  const openMetricRegistry = () => useAppStore.getState().setView('metric-registry');

  return (
    <FluentProvider theme={theme}>
      <a href="#main-content" className="ams-skip-link">Skip to main content</a>
      <div className={s.root}>
        <header>
          <TopBar onStartTour={startTour} />
        </header>
        {(bootstrapping || (loading && !initialized)) ? (
          <main id="main-content" className={s.main}>
            <div className={s.bootstrapOverlay}>
              <Spinner size="large" label={bootstrapMessage ?? 'Getting things ready…'} />
              {bootstrapping && <Text size={200} align="center">Setting up your default dashboard. To add more metrics later, go to the Metrics tab.</Text>}
            </div>
          </main>
        ) : view === 'dashboard' ? (
          <>
            {metrics.length > 0 && (
              <DashboardCommandBar
                onExportExcel={onExportExcel}
                onExportPdf={onExportPdf}
                onExportPptx={onExportPptx}
              />
            )}
            <main id="main-content" className={s.main}>
              <div className={s.dashboardContent}>
                {metrics.length > 0 && <nav aria-label="Metrics" className={s.dashboardNav}><Sidebar /></nav>}
                <Canvas ref={canvasRef} onOpenMetricRegistry={openMetricRegistry} />
              </div>
              <PredictivePanel />
            </main>
          </>
        ) : view === 'metric-registry' ? (
          <main id="main-content" className={s.main}>
            <MetricRegistry />
          </main>
        ) : (
          <>
            {metrics.length > 0 && <ForecastCommandBar />}
            <main id="main-content" className={s.main}>
              <ForecastWorkspace />
            </main>
          </>
        )}
        <DrillInPanel />
        <GuidedTour active={tourActive} onComplete={() => setTourActive(false)} view={view} />
      </div>
    </FluentProvider>
  );
}
