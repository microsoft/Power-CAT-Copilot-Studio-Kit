import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  TeachingPopover,
  TeachingPopoverBody,
  TeachingPopoverSurface,
  TeachingPopoverHeader,
  TeachingPopoverCarousel,
  TeachingPopoverCarouselCard,
  TeachingPopoverCarouselFooter,
  TeachingPopoverCarouselNav,
  TeachingPopoverCarouselNavButton,
  Checkbox,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { AppView } from '../../types';

/** Per-view localStorage key prefix. Each view tracks its own tour-seen state. */
const TOUR_STORAGE_PREFIX = 'ams_tour_completed_';
const tourKeyForView = (view: AppView): string => `${TOUR_STORAGE_PREFIX}${view}`;

interface TourStep {
  value: string;
  targetSelector: string;
  title: string;
  body: string;
  positioning?: 'below' | 'above' | 'after' | 'before';
}

const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    value: 'metrics-sidebar',
    targetSelector: '[data-tour-id="metrics-sidebar"]',
    title: 'Metrics Sidebar',
    body: 'Double-click any metric to add it to your canvas, or drag it directly onto the dashboard. Metrics are grouped by category — use the search box to find specific ones. A checkmark indicates metrics already on the canvas.',
    positioning: 'after',
  },
  {
    value: 'filter-strip',
    targetSelector: '[data-tour-id="filter-strip"]',
    title: 'Dashboard & Filters',
    body: 'Switch between saved dashboards, filter by agent, time range, channel, or data mode. Use the Export button for PDF, Excel, or PowerPoint output. Arrange auto-sizes all cards, and Save persists your layout to Dataverse.',
    positioning: 'below',
  },
  {
    value: 'dashboard-canvas',
    targetSelector: '[data-card-id]',
    title: 'Canvas',
    body: 'Your drag-and-drop dashboard canvas. Drag card headers to reposition, resize from the bottom-right corner. Each card has a refresh button and an options menu for forecasting, drill-in, or removal.',
    positioning: 'below',
  },
  {
    value: 'tab-metric-registry',
    targetSelector: '[data-tour-id="tab-metric-registry"]',
    title: 'Metrics Tab',
    body: 'Create custom metrics from any Copilot Agent Kit table or browse 100+ recommended metrics by domain. Published metrics appear in the sidebar for drag-and-drop onto dashboards.',
    positioning: 'below',
  },
];

const FORECAST_TOUR_STEPS: TourStep[] = [
  {
    value: 'forecast-metric-browser',
    targetSelector: '[data-tour-id="forecast-metric-browser"]',
    title: 'Select a Metric',
    body: 'Choose a published metric from the categorized list to forecast. Use the search box to filter by name. Double-click a metric to select it — the selected metric drives the entire projection.',
    positioning: 'after',
  },
  {
    value: 'forecast-model',
    targetSelector: '[data-tour-id="forecast-model"]',
    title: 'Choose a Model',
    body: 'Pick a forecasting algorithm. Trend + Band fits a linear trend with residual-based confidence intervals — ideal for steady metrics. ETS (Holt) uses exponential smoothing to adapt to recent shifts by weighting newer data.',
    positioning: 'after',
  },
  {
    value: 'forecast-horizon',
    targetSelector: '[data-tour-id="forecast-horizon"]',
    title: 'Set the Horizon',
    body: 'Choose how far ahead to project (7–180 days). Longer horizons widen the confidence bands as uncertainty increases. The MAPE badge shows how well the model fits your data.',
    positioning: 'after',
  },
  {
    value: 'forecast-levers',
    targetSelector: '[data-tour-id="forecast-levers"]',
    title: 'Scenario Levers',
    body: 'Model what-if scenarios by adjusting adoption lift, containment lift, or volume delta. The forecast and key metrics update in real time as you move the sliders.',
    positioning: 'after',
  },
  {
    value: 'forecast-chart',
    targetSelector: '[data-tour-id="forecast-chart"]',
    title: 'Forecast Results',
    body: 'Historical data and projected forecast with P10–P90 confidence bands. Key metrics above the chart show today\'s value, projected P50, change percentage, and the 80% confidence range. Anomaly flags mark 2-sigma outliers.',
    positioning: 'below',
  },
];

const METRICS_TOUR_STEPS: TourStep[] = [
  {
    value: 'metrics-toolbar',
    targetSelector: '[data-tour-id="metrics-toolbar"]',
    title: 'Search & Create',
    body: 'Search metrics by name, source, or category. Click "+ New Metric" to define a custom metric — pick a source table and field, choose an aggregation and visualization, then publish to make it available on dashboards.',
    positioning: 'below',
  },
  {
    value: 'metrics-recommendations',
    targetSelector: '[data-tour-id="metrics-recommendations"]',
    title: 'Recommended Metrics',
    body: 'Browse 100+ pre-configured metrics organized by domain — adoption, quality, performance, cost, and more. Click a domain card to open the picker drawer and choose exactly which metrics to add to your registry.',
    positioning: 'below',
  },
  {
    value: 'metrics-datagrid',
    targetSelector: '[data-tour-id="metrics-datagrid"]',
    title: 'Metric Registry',
    body: 'All your configured metrics — published and draft. Click any metric name to edit its definition. Use checkboxes for bulk publish, unpublish, or delete actions. Sort by any column and use the row menu for individual actions.',
    positioning: 'above',
  },
];

const TOUR_STEPS_BY_VIEW: Partial<Record<AppView, TourStep[]>> = {
  dashboard: DASHBOARD_TOUR_STEPS,
  'metric-registry': METRICS_TOUR_STEPS,
  forecast: FORECAST_TOUR_STEPS,
};

function scrollToElement(el: HTMLElement): void {
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const useStyles = makeStyles({
  surface: {
    width: '360px',
  },
  liveRegion: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    whiteSpace: 'nowrap',
  },
  checkboxRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: tokens.spacingVerticalS,
  },
});

interface GuidedTourProps {
  active: boolean;
  onComplete: () => void;
  view: AppView;
}

export function GuidedTour({ active, onComplete, view }: GuidedTourProps) {
  const s = useStyles();
  const [activeValue, setActiveValue] = useState<string>('');
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const triggerRef = useRef<Element | null>(null);
  const activeViewRef = useRef(view);

  const tourSteps = useMemo(() => TOUR_STEPS_BY_VIEW[view] ?? [], [view]);

  const stepsByValue = useMemo(() => {
    const map = new Map<string, TourStep>();
    for (const step of tourSteps) {
      map.set(step.value, step);
    }
    return map;
  }, [tourSteps]);

  // Cancel tour if view changes while active
  useEffect(() => {
    if (active && view !== activeViewRef.current) {
      setTarget(null);
      onComplete();
    }
    activeViewRef.current = view;
  }, [view, active, onComplete]);

  // Initialize tour when activated
  useEffect(() => {
    if (active && tourSteps.length > 0) {
      triggerRef.current = document.activeElement;
      const timer = setTimeout(() => {
        setDontShowAgain(false);
        // Find the first available target
        for (const step of tourSteps) {
          const el = document.querySelector(step.targetSelector) as HTMLElement | null;
          if (el) {
            scrollToElement(el);
            setTarget(el);
            setActiveValue(step.value);
            return;
          }
        }
        // No targets found
        onComplete();
      }, 200);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tourSteps]);

  // Reset state when deactivated
  useEffect(() => {
    if (!active) {
      setTarget(null); // eslint-disable-line react-hooks/set-state-in-effect
      setActiveValue('');
    }
  }, [active]);

  const restoreFocus = useCallback(() => {
    if (triggerRef.current && (triggerRef.current as HTMLElement).focus) {
      (triggerRef.current as HTMLElement).focus();
    }
  }, []);

  const finishTour = useCallback(() => {
    try { localStorage.setItem(tourKeyForView(view), 'true'); } catch { /* ignore */ }
    setTarget(null);
    restoreFocus();
    onComplete();
  }, [onComplete, restoreFocus, view]);

  const dismissTour = useCallback(() => {
    if (dontShowAgain) {
      try { localStorage.setItem(tourKeyForView(view), 'true'); } catch { /* ignore */ }
    }
    setTarget(null);
    restoreFocus();
    onComplete();
  }, [onComplete, restoreFocus, dontShowAgain, view]);

  const handleValueChange = useCallback((_: unknown, data: { value?: string }) => {
    if (!data.value) return;
    const nextStep = stepsByValue.get(data.value);
    if (!nextStep) return;

    const el = document.querySelector(nextStep.targetSelector) as HTMLElement | null;
    if (el) {
      scrollToElement(el);
      setTarget(el);
      setActiveValue(data.value);
    }
    // If target not found, stay on current step
  }, [stepsByValue]);

  const handleFinish = useCallback(() => {
    finishTour();
  }, [finishTour]);

  if (!active || !target || !tourSteps.length || !activeValue) return null;

  const currentStep = stepsByValue.get(activeValue);
  const currentIndex = tourSteps.findIndex(st => st.value === activeValue);

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className={s.liveRegion}>
        {`Step ${currentIndex + 1} of ${tourSteps.length}: ${currentStep?.title ?? ''}`}
      </div>
      <TeachingPopover
        open={true}
        positioning={{
          target,
          position: currentStep?.positioning ?? 'below',
          align: 'start',
        }}
        withArrow
        onOpenChange={(_, data) => {
          if (!data.open) {
            dismissTour();
          }
        }}
      >
        <TeachingPopoverSurface className={s.surface}>
          <TeachingPopoverCarousel
            defaultValue={tourSteps[0].value}
            value={activeValue}
            onValueChange={handleValueChange}
            onFinish={handleFinish}
          >
            {tourSteps.map((step) => (
              <TeachingPopoverCarouselCard key={step.value} value={step.value}>
                <TeachingPopoverHeader>{step.title}</TeachingPopoverHeader>
                <TeachingPopoverBody>{step.body}</TeachingPopoverBody>
              </TeachingPopoverCarouselCard>
            ))}

            <TeachingPopoverCarouselFooter
              next="Next"
              previous="Previous"
              initialStepText="Close"
              finalStepText="Got it!"
            >
              <TeachingPopoverCarouselNav>
                {() => <TeachingPopoverCarouselNavButton />}
              </TeachingPopoverCarouselNav>
            </TeachingPopoverCarouselFooter>
          </TeachingPopoverCarousel>

          <div className={s.checkboxRow}>
            <Checkbox
              label="Don't show this again"
              checked={dontShowAgain}
              onChange={(_, data) => setDontShowAgain(!!data.checked)}
            />
          </div>
        </TeachingPopoverSurface>
      </TeachingPopover>
    </>
  );
}

/** Returns true if the tour has NOT been completed yet for the given view */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldShowTour(view?: AppView): boolean {
  try {
    if (!view) return false;
    return localStorage.getItem(tourKeyForView(view)) !== 'true';
  } catch {
    return false;
  }
}

/** Resets tour state for all views (e.g., for a "Restart Tour" button) */
// eslint-disable-next-line react-refresh/only-export-components
export function resetTour(): void {
  try {
    const views: AppView[] = ['dashboard', 'metric-registry', 'forecast'];
    for (const v of views) {
      localStorage.removeItem(tourKeyForView(v));
    }
  } catch { /* ignore restricted contexts */ }
}

/** Returns true if the given view has tour steps defined */
// eslint-disable-next-line react-refresh/only-export-components
export function hasTourForView(view: AppView): boolean {
  return (TOUR_STEPS_BY_VIEW[view]?.length ?? 0) > 0;
}
