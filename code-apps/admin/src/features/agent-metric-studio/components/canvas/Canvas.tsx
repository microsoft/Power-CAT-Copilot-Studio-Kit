import { makeStyles, tokens, Text, Caption1, Button } from '@fluentui/react-components';
import { ChartMultiple24Regular, AppsListDetail24Regular } from '@fluentui/react-icons';
import { useAppStore } from '../../store/appStore';
import { MetricCardTile } from './MetricCardTile';
import { forwardRef, useRef, useMemo, useEffect } from 'react';
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout/legacy';

const ReactGridLayout = WidthProvider(GridLayout);

const GRID_COLS = 12;
const GRID_ROW_HEIGHT = 80;

const useStyles = makeStyles({
  wrapper: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  grid: {
    flex: 1, overflow: 'auto', padding: tokens.spacingHorizontalL,
    position: 'relative',
  },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '80px 20px', textAlign: 'center',
    border: `2px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    color: tokens.colorNeutralForeground3,
    minHeight: '400px',
    gap: tokens.spacingVerticalM,
  },
  emptyIcon: { fontSize: '48px', color: tokens.colorNeutralForeground4 },
  emptyHint: { maxWidth: '420px' },
  tileWrap: {
    height: '100%', width: '100%',
  },
});

export const Canvas = forwardRef<HTMLDivElement, { onOpenMetricRegistry: () => void }>(({ onOpenMetricRegistry }, ref) => {
  const s = useStyles();
  const cards = useAppStore(st => st.currentLayout.cards);
  const metrics = useAppStore(st => st.metrics);
  const bootstrapping = useAppStore(st => st.bootstrapping);
  const addCard = useAppStore(st => st.addCard);
  const applyLayoutDelta = useAppStore(st => st.applyLayoutDelta);
  const lastAddedCardId = useAppStore(st => st.lastAddedCardId);
  const clearLastAddedCard = useAppStore(st => st.clearLastAddedCard);
  const gridRef = useRef<HTMLDivElement>(null);

  // Scroll newly-added card into view with smooth animation
  useEffect(() => {
    if (lastAddedCardId && gridRef.current) {
      requestAnimationFrame(() => {
        const cardEl = gridRef.current?.querySelector(`[data-card-id="${lastAddedCardId}"]`);
        if (cardEl) {
          cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
      const timer = setTimeout(() => clearLastAddedCard(), 1500);
      return () => clearTimeout(timer);
    }
  }, [lastAddedCardId, clearLastAddedCard]);

  // Expose the grid element (not the toolbar) for PDF export
  const setRef = (el: HTMLDivElement | null) => {
    (gridRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  const layout: Layout = useMemo(
    () => cards.map(c => ({
      i: c.instanceId,
      x: c.x, y: c.y, w: c.w, h: c.h,
      minW: 4, minH: 5,
    })),
    [cards]
  );

  const onDragOver: React.DragEventHandler = (e) => {
    if (e.dataTransfer.types.includes('text/metric-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop: React.DragEventHandler = (e) => {
    const id = e.dataTransfer.getData('text/metric-id');
    if (id) { e.preventDefault(); addCard(id); }
  };

  return (
    <div className={s.wrapper}>
      {/* Scrollable grid area (ref for PDF export) */}
      <div className={s.grid} ref={setRef} onDragOver={onDragOver} onDrop={onDrop} role="region" aria-label="Dashboard canvas" data-tour-id="dashboard-canvas">
        {cards.length === 0 && !bootstrapping ? (
          <div className={s.empty}>
            {metrics.length === 0 ? (
              <>
                <AppsListDetail24Regular className={s.emptyIcon} />
                <Text as="h2" size={500} weight="semibold">No metrics available</Text>
                <Caption1 className={s.emptyHint}>
                  Dashboards require published metrics. Open the Metrics tab to create and publish metric definitions first.
                </Caption1>
                <Button
                  appearance="primary"
                  icon={<AppsListDetail24Regular />}
                  onClick={onOpenMetricRegistry}
                >
                  Open Metrics
                </Button>
              </>
            ) : (
              <>
                <ChartMultiple24Regular className={s.emptyIcon} />
                <Text as="h2" size={500} weight="semibold">Your canvas is empty</Text>
                <Caption1 className={s.emptyHint}>
                  Drag metrics from the panel on the left, or double-click a metric to add it.
                  Drag the card header to move; drag the bottom-right corner to resize.
                </Caption1>
              </>
            )}
          </div>
        ) : (
          <ReactGridLayout
            className="layout"
            layout={layout}
            cols={GRID_COLS}
            rowHeight={GRID_ROW_HEIGHT}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            compactType="vertical"
            preventCollision={false}
            isDraggable={true}
            isResizable={true}
            draggableHandle=".ams-card-drag-handle"
            draggableCancel=".ams-card-no-drag"
            resizeHandles={['se']}
            onLayoutChange={(next) => applyLayoutDelta(next.map(l => ({ instanceId: l.i, x: l.x, y: l.y, w: l.w, h: l.h })))}
          >
            {cards.map(c => (
              <div key={c.instanceId} className={s.tileWrap} data-card-id={c.instanceId}>
                <MetricCardTile card={c} isNew={c.instanceId === lastAddedCardId} />
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>
    </div>
  );
});
Canvas.displayName = 'Canvas';
