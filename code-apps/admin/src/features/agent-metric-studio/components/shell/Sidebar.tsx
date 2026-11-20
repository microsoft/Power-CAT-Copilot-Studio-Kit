import { useMemo, useState, useCallback } from 'react';
import {
  makeStyles, tokens, Text, Caption1, SearchBox,
  Accordion, AccordionHeader, AccordionItem, AccordionPanel,
  Button, Tooltip, mergeClasses,
  ToggleButton, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
  useToastController, Toast, ToastTitle, Toaster, useId, Link,
} from '@fluentui/react-components';
import {
  DataPie24Regular, ChartMultiple24Regular, People20Regular, ErrorCircle24Regular, Money24Regular, Glance20Regular,
  PanelLeftContract24Regular, PanelLeftExpand24Regular, Info16Regular,
  Checkmark12Regular, MoreHorizontal20Regular, Add16Regular, Edit16Regular,
} from '@fluentui/react-icons';
import { useAppStore } from '../../store/appStore';
import type { MetricCategory, MetricDefinition } from '../../types';

type CanvasFilter = 'all' | 'available' | 'on-canvas';

const useStyles = makeStyles({
  root: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorNeutralBackground1,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    height: '100%',
    boxSizing: 'border-box' as const,
    transitionProperty: 'width, min-width',
    transitionDuration: '0.2s',
    transitionTimingFunction: 'ease',
  },
  expanded: { width: '280px', minWidth: '280px' },
  collapsed: { width: '48px', minWidth: '48px' },
  header: { padding: tokens.spacingVerticalM, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  headerContent: { flex: 1, minWidth: 0, overflow: 'hidden' },
  search: {
    padding: `0 ${tokens.spacingHorizontalS}`,
    marginTop: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalS,
  },
  searchBox: { width: '100%' },
  controls: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingBottom: tokens.spacingVerticalS,
  },
  list: { flex: 1, overflowY: 'auto', padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS} 0` },
  item: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'grab',
    transition: 'background 0.15s',
    ':hover': { background: tokens.colorNeutralBackground3 },
    userSelect: 'none',
  },
  itemBody: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  itemName: { fontSize: '13px', fontWeight: 500, color: tokens.colorNeutralForeground1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  vizType: { color: tokens.colorNeutralForeground3, fontWeight: 400, whiteSpace: 'nowrap', flexShrink: 0 },
  itemActions: { display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 },
  footer: {
    padding: tokens.spacingVerticalS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: '11px', color: tokens.colorNeutralForeground3,
  },
  hintBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    margin: `0 ${tokens.spacingHorizontalS} ${tokens.spacingVerticalS}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground4,
  },
  hintIcon: { color: tokens.colorNeutralForeground3, fontSize: '14px', flexShrink: 0 },
  hintText: { fontSize: '11px', color: tokens.colorNeutralForeground3, lineHeight: '16px' },
  subtitle: { display: 'block', padding: `0 ${tokens.spacingHorizontalM}`, marginTop: tokens.spacingVerticalXS, marginBottom: tokens.spacingVerticalS, color: tokens.colorNeutralForeground3 },
  categoryLabel: { fontWeight: 600 },
  collapsedList: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: tokens.spacingVerticalM, paddingTop: tokens.spacingVerticalM },
  collapsedIconBtn: { minWidth: 'auto', color: tokens.colorNeutralForeground2, ':hover': { color: tokens.colorBrandForeground1 } },
  filterRow: {
    display: 'flex',
    gap: '2px',
    padding: `0 ${tokens.spacingHorizontalS}`,
  },
  filterBtn: {
    minWidth: 'auto',
    fontSize: '11px',
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
  },
  itemOnCanvas: {
    backgroundColor: tokens.colorNeutralBackground4,
  },
  onCanvasIcon: {
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
  },
  emptyFilter: {
    display: 'block',
    textAlign: 'center',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalM}`,
    color: tokens.colorNeutralForeground3,
  },
});

const categoryIcons: Record<MetricCategory, React.ReactElement> = {
  Conversations: <ChartMultiple24Regular />,
  Quality:       <Glance20Regular />,
  Adoption:      <People20Regular />,
  Performance:   <DataPie24Regular />,
  Cost:          <Money24Regular />,
  Errors:        <ErrorCircle24Regular />,
};

export function Sidebar() {
  const s = useStyles();
  const metrics = useAppStore(st => st.metrics);
  const cards = useAppStore(st => st.currentLayout.cards);
  const addCard = useAppStore(st => st.addCard);
  const collapsed = useAppStore(st => st.sidebarCollapsed);
  const toggleSidebar = useAppStore(st => st.toggleSidebar);
  const [query, setQuery] = useState('');
  const [canvasFilter, setCanvasFilter] = useState<CanvasFilter>('all');

  const toasterId = useId('sidebar-toaster');
  const { dispatchToast } = useToastController(toasterId);

  const handleAddCard = useCallback((metric: MetricDefinition) => {
    addCard(metric.id);
    dispatchToast(
      <Toast>
        <ToastTitle>Added "{metric.name}" to dashboard</ToastTitle>
      </Toast>,
      { intent: 'success', timeout: 3000 },
    );
  }, [addCard, dispatchToast]);

  // Derive a map of metricId → count of times on canvas
  const canvasCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of cards) {
      counts.set(card.metricId, (counts.get(card.metricId) ?? 0) + 1);
    }
    return counts;
  }, [cards]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = metrics.filter(m => {
      // Text search filter
      if (q && !m.name.toLowerCase().includes(q) && !m.description?.toLowerCase().includes(q)) {
        return false;
      }
      // Canvas status filter
      const isOnCanvas = canvasCounts.has(m.id);
      if (canvasFilter === 'available' && isOnCanvas) return false;
      if (canvasFilter === 'on-canvas' && !isOnCanvas) return false;
      return true;
    });
    const g: Record<string, MetricDefinition[]> = {};
    for (const m of filtered) {
      (g[m.category] ||= []).push(m);
    }
    return g;
  }, [metrics, query, canvasFilter, canvasCounts]);

  const cats = Object.keys(grouped) as MetricCategory[];

  if (collapsed) {
    return (
      <div className={`${s.root} ${s.collapsed}`}>
        <div className={s.header}>
          <Tooltip content="Expand metrics panel" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<PanelLeftExpand24Regular />}
              onClick={toggleSidebar}
            />
          </Tooltip>
        </div>
        <div className={s.collapsedList}>
          {cats.map(cat => (
            <Tooltip content={`${cat} (${grouped[cat].length})`} relationship="label" positioning="after" key={cat}>
              <Button
                appearance="subtle"
                size="small"
                className={s.collapsedIconBtn}
                icon={categoryIcons[cat]}
                aria-label={`Expand and show ${cat} metrics (${grouped[cat].length})`}
                onClick={() => {
                  if (collapsed) toggleSidebar();
                }}
              />
            </Tooltip>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
    <Toaster toasterId={toasterId} position="bottom-end" />
    <div className={`${s.root} ${s.expanded}`} data-tour-id="metrics-sidebar">
      <div className={s.header}>
        <div className={s.headerContent}>
          <Text size={500} weight="semibold">Metric</Text>
        </div>
        <Tooltip content="Collapse metrics panel" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<PanelLeftContract24Regular />}
            onClick={toggleSidebar}
          />
        </Tooltip>
      </div>
      <Caption1 className={s.subtitle}>
        Double-click a metric to add it to your dashboard. To add more metrics, go to{' '}
        <Link inline style={{ fontSize: 'inherit' }} onClick={() => useAppStore.getState().setView('metric-registry')}>Metrics</Link>
      </Caption1>
      <div className={s.controls}>
        <div className={s.search}>
          <SearchBox
            className={s.searchBox}
            value={query}
            onChange={(_, d) => setQuery(d.value)}
            placeholder="Search metrics…"
          />
        </div>
        <div className={s.filterRow} role="group" aria-label="Filter metrics by canvas status">
          <Tooltip content="Show all metrics regardless of canvas status." relationship="description">
            <ToggleButton
              className={s.filterBtn}
              size="small"
              appearance={canvasFilter === 'all' ? 'primary' : 'subtle'}
              checked={canvasFilter === 'all'}
              onClick={() => setCanvasFilter('all')}
            >
              All
            </ToggleButton>
          </Tooltip>
          <Tooltip content="Show metrics not currently on the canvas." relationship="description">
            <ToggleButton
              className={s.filterBtn}
              size="small"
              appearance={canvasFilter === 'available' ? 'primary' : 'subtle'}
              checked={canvasFilter === 'available'}
              onClick={() => setCanvasFilter('available')}
            >
              Available
            </ToggleButton>
          </Tooltip>
          <Tooltip content="Show only metrics already placed on the canvas." relationship="description">
            <ToggleButton
              className={s.filterBtn}
              size="small"
              appearance={canvasFilter === 'on-canvas' ? 'primary' : 'subtle'}
              checked={canvasFilter === 'on-canvas'}
              onClick={() => setCanvasFilter('on-canvas')}
            >
              On canvas
            </ToggleButton>
          </Tooltip>
        </div>
      </div>
      <div className={s.list}>
        <Accordion multiple collapsible defaultOpenItems={cats as string[]}>
          {cats.map(cat => (
              <AccordionItem value={cat} key={cat}>
                  <AccordionHeader expandIconPosition="end">
                    <span className={s.categoryLabel}>{cat}</span>
                  </AccordionHeader>
                <AccordionPanel>
                  {grouped[cat].map(m => {
                    const onCanvasCount = canvasCounts.get(m.id) ?? 0;
                    const isOnCanvas = onCanvasCount > 0;
                    return (
                      <div
                        key={m.id}
                        className={mergeClasses(s.item, isOnCanvas && s.itemOnCanvas)}
                        draggable
                        role="button"
                        tabIndex={0}
                        aria-label={`${m.name} (${m.visualizationType})${isOnCanvas ? `. On canvas${onCanvasCount > 1 ? ` ${onCanvasCount} times` : ''}` : ''}. Press Enter to add to canvas.`}
                        onDragStart={e => {
                          e.dataTransfer.setData('text/metric-id', m.id);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onDoubleClick={() => handleAddCard(m)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleAddCard(m);
                          }
                        }}
                        title={isOnCanvas ? `On canvas${onCanvasCount > 1 ? ` (${onCanvasCount}×)` : ''} — double-click to add again` : 'Double-click to add to canvas'}
                      >
                        {isOnCanvas && (
                          <Tooltip content={`On canvas${onCanvasCount > 1 ? ` (${onCanvasCount}×)` : ''}`} relationship="description">
                            <Checkmark12Regular className={s.onCanvasIcon} aria-hidden="true" />
                          </Tooltip>
                        )}
                        <div className={s.itemBody}>
                          <span className={s.itemName}>{m.name}</span>
                          <Caption1 className={s.vizType}>{m.visualizationType}</Caption1>
                        </div>
                        <div className={s.itemActions} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                          <Tooltip content={m.description ?? `${m.aggregation} of ${m.sourceField}`} relationship="description">
                            <Button
                              appearance="subtle"
                              size="small"
                              icon={<Info16Regular />}
                              aria-label={`Info for ${m.name}`}
                              className="ams-card-no-drag"
                            />
                          </Tooltip>
                          <Menu>
                            <MenuTrigger disableButtonEnhancement>
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<MoreHorizontal20Regular />}
                                aria-label={`More actions for ${m.name}`}
                                className="ams-card-no-drag"
                              />
                            </MenuTrigger>
                            <MenuPopover>
                              <MenuList>
                                <MenuItem icon={<Add16Regular />} onClick={() => handleAddCard(m)}>Add to canvas</MenuItem>
                                <MenuItem icon={<Edit16Regular />} onClick={() => useAppStore.getState().setView('metric-registry')}>Edit</MenuItem>
                              </MenuList>
                            </MenuPopover>
                          </Menu>
                        </div>
                      </div>
                    );
                  })}
                </AccordionPanel>
              </AccordionItem>
          ))}
        </Accordion>
        {cats.length === 0 && (
          <Caption1 className={s.emptyFilter}>
            {canvasFilter === 'on-canvas'
              ? 'No metrics on the canvas yet. Drag metrics from "All" to get started.'
              : canvasFilter === 'available'
                ? 'All metrics are already on the canvas.'
                : 'No metrics match your search.'}
          </Caption1>
        )}
      </div>
      <div className={s.footer}>{metrics.length} metrics available</div>
    </div>
    </>
  );
}
