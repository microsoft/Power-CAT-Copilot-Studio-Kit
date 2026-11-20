import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  makeStyles,
  mergeClasses,
  tokens,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Caption1Strong,
  Card,
  Subtitle2,
  Tooltip,
} from '@fluentui/react-components';
import {
  ArrowTrending20Regular,
  ArrowTrendingDown20Regular,
  DismissRegular,
  HistoryRegular,
  Info16Regular,
} from '@fluentui/react-icons';
import { AreaChart, DonutChart, HorizontalBarChart, type ILineChartPoints } from '@fluentui/react-charting';
import {
  buildAuditSummary,
  type ChangeKind,
  type RankedItem,
} from '../utils/audit-summary';
import { type ChangeLogEntry } from '../contracts/change-tracker';


/**
 * Contributors shown in "Who made the change". Capping the list keeps the card
 * a fixed height on agents with many editors, so it never grows its own
 * scrollbar or stretches the row of cards beside it.
 */
const TOP_CONTRIBUTORS = 7;

/** Agents shown in "Top agents". */
const TOP_AGENTS = 5;

/** Fixed donut size; the card reserves this much room regardless of data. */
const DONUT_SIZE = 160;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    // Matches the grid's row gap, so every vertical gap between cards is equal
    // — the Overview/Top makers and Activity/Top agents seams previously used
    // XXL while the grid rows used M, which read as inconsistent.
    gap: tokens.spacingVerticalM,
  },
  grid: {
    // Intrinsic two-up layout: each card carries its own basis, so the row
    // reflows from the width it actually has. A viewport media query would be
    // measuring the wrong box — these cards sit beside a 280-380px rail inside
    // a page capped at 1280px. Responsive.md § "Responsive Flex Row (Cards)".
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: tokens.spacingHorizontalM,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: tokens.spacingVerticalM,
    minWidth: 0,
  },
  gridCard: {
    // Basis is the narrowest a card stays readable (160px donut + legend), so
    // two sit side by side when there is room and stack when there is not.
    // Only cards inside the wrapping row get this: `root` is a column flex, and
    // there a basis would size the card's height instead of its width.
    flex: '1 1 320px',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  cardHeadText: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    // Replaces the descriptive caption that used to sit under each heading.
    marginBottom: tokens.spacingVerticalM,
  },
  // Card titles are real <h3> elements so the pane has a document outline.
  // Fluent's Text does not reset the UA heading margin, and these sit in flex
  // containers where that margin would apply.
  heading: {
    margin: 0,
  },
  metrics: {
    // Agent Insights Hub's OverviewMetrics pattern: tiles flex to share the row
    // and wrap when they run out of space. Container-driven, so it needs no
    // breakpoints — the previous grid keyed off viewport width, which is wrong
    // here because this card sits beside the ~380px agent rail and is therefore
    // far narrower than the viewport.
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalL,
    // Tight, so the metrics sit close under the "Overview" heading.
    paddingTop: tokens.spacingVerticalXS,
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    // Grow to fill the row so no dead space is left at the right, matching the
    // Hub's tile sizing exactly.
    flex: '1 1 0',
    minWidth: '150px',
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
  },
  // Matches Agent Insights Hub MetricCard: label + info tooltip on one row.
  metricLabelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  metricLabel: {
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
  },
  infoIcon: {
    color: tokens.colorNeutralForeground3,
    cursor: 'help',
    display: 'flex',
    alignItems: 'center',
  },
  metricValueRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: tokens.spacingHorizontalXS,
    whiteSpace: 'nowrap',
  },
  // Belt and braces: the row already sets nowrap, but the value is the one
  // string long enough to wrap ("3 (5% of all changes)") and must never break.
  metricValue: {
    whiteSpace: 'nowrap',
  },
  // Trend badge, matching Insights Hub TrendIndicator.
  trendBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
    borderRadius: tokens.borderRadiusSmall,
  },
  trendPositive: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  trendNegative: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
  },
  trendNote: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  barMeasure: {
    width: '100%',
    minWidth: 0,
    overflow: 'hidden',
  },
  barRows: {
    display: 'flex',
    flexDirection: 'column',
    // The chart supplies its own row spacing; adding more would separate the
    // rows further than the Hub does.
    gap: 0,
  },
  barRow: {
    // Deliberately inert: no padding, border or background, so the chart inside
    // renders exactly as it does in Agent Insights Hub. Only hover and selected
    // tints are added, and neither changes layout.
    display: 'block',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'none',
    padding: 0,
    margin: 0,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    minWidth: 0,
    overflow: 'hidden',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  barRowSelected: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  barValue: {
    // Matches the chart's own data-text size so the appended share does not
    // look bolted on.
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
  },
  iconTile: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase400,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '28px minmax(0, 1fr)',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'none',
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXXS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  rowSelected: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  rowStatic: {
    // Published is reported but not filterable, so it must not look clickable.
    cursor: 'default',
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
  rowBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  rowTop: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  rowName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  rowCount: {
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground3,
  },
  chartWrap: {
    minHeight: '220px',
    width: '100%',
    minWidth: 0,
    // The chart is sized to this box; hiding overflow stops a stray pixel from
    // widening the card and re-triggering a measure.
    overflow: 'hidden',
  },
  donutLayout: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  donutWrap: {
    width: `${DONUT_SIZE}px`,
    height: `${DONUT_SIZE}px`,
    flexShrink: 0,
    overflow: 'hidden',
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: '1 1 180px',
    minWidth: 0,
  },
  legendItem: {
    display: 'grid',
    gridTemplateColumns: '10px auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    width: '100%',
    textAlign: 'left',
    border: 'none',
    background: 'none',
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXXS}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  legendItemSelected: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  legendItemNoIcon: {
    // Change types has no per-item glyph, so drop the icon column; otherwise
    // the label and value land one column adrift.
    gridTemplateColumns: '10px minmax(0, 1fr) auto',
  },
  legendItemStatic: {
    // Published is reported but not filterable, so it must not look clickable.
    cursor: 'default',
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
  legendSwatch: {
    width: '10px',
    height: '10px',
    borderRadius: tokens.borderRadiusSmall,
    flexShrink: 0,
  },
  legendIcon: {
    display: 'inline-flex',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase300,
  },
  legendLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  legendValue: {
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground3,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  emptyIcon: {
    fontSize: tokens.fontSizeHero900,
    color: tokens.colorNeutralForeground4,
  },
});

/** Change-kind accent colours, matching the change-type language used elsewhere. */
/**
 * Colour per change type. Added/Updated/Removed deliberately reuse the exact
 * tokens the `+ ~ −` chips use in the Change history header, so the same change
 * reads as the same colour everywhere.
 */
function kindColor(kind: ChangeKind): string {
  if (kind === 'Added') return tokens.colorPaletteGreenForeground1;
  if (kind === 'Removed') return tokens.colorPaletteRedForeground1;
  if (kind === 'Published') return tokens.colorBrandForeground1;
  return tokens.colorPaletteMarigoldForeground1;
}

/**
 * Slice palette, matching the Agent Insights Hub chart colours so the two apps
 * read as one product.
 */
const SLICE_COLORS = [
  '#637CEF', '#2AA0A4', '#9373C0', '#13A10E', '#CA5010',
  '#3A96DD', '#E3008C', '#57811B', '#B146C2', '#AE8C00',
] as const;

function sliceColor(index: number): string {
  return SLICE_COLORS[index % SLICE_COLORS.length];
}

/**
 * Width of an element, measured once per meaningful resize.
 *
 * `VerticalBarChart`'s own `enableReflow` measures its container and then
 * resizes itself inside it, which can feed back into the container's size and
 * spin the ResizeObserver — the page stops responding to clicks while that
 * loop runs. Measuring here instead, and ignoring sub-threshold changes, breaks
 * the feedback cycle.
 *
 * Uses a callback ref rather than `useEffect(…, [])` deliberately: this
 * component early-returns an empty state when the filters match nothing, so a
 * one-shot effect would run while the measured node does not exist and would
 * never re-run when the node reappeared — leaving the width at 0 and the
 * width-dependent cards blank after the filters were cleared.
 */
function useMeasuredWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const frameRef = useRef(0);

  const ref = useCallback((element: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    cancelAnimationFrame(frameRef.current);
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0].contentRect.width);
      cancelAnimationFrame(frameRef.current);
      // Defer to the next frame and ignore small deltas, so a resize we cause
      // cannot immediately trigger another round.
      frameRef.current = requestAnimationFrame(() => {
        setWidth((previous) => (Math.abs(previous - next) > 8 ? next : previous));
      });
    });

    observer.observe(element);
    observerRef.current = observer;
  }, []);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return [ref, width] as const;
}

interface MetricProps {
  label: string;
  value: string;
  tooltip: string;
  /** Percent change vs the earlier half of the range; omitted when no activity. */
  trend?: number | null;
}

/**
 * KPI tile matching Agent Insights Hub's `MetricCard`: label with an info
 * tooltip, then the value and an inline trend badge on a single line.
 */
function Metric({ label, value, tooltip, trend }: MetricProps) {
  const styles = useStyles();
  // A flat 0% carries no signal, so it is not worth a badge.
  const showTrend = trend !== null && trend !== undefined && trend !== 0;
  const isUp = (trend ?? 0) > 0;

  return (
    <div className={styles.metric}>
      <div className={styles.metricLabelRow}>
        <Body1 className={styles.metricLabel}>{label}</Body1>
        <Tooltip content={tooltip} relationship="description">
          <span className={styles.infoIcon}>
            <Info16Regular />
          </span>
        </Tooltip>
      </div>
      <div className={styles.metricValueRow}>
        <Subtitle2 className={styles.metricValue}>{value}</Subtitle2>
        {showTrend && (
          <span
            className={mergeClasses(
              styles.trendBadge,
              isUp ? styles.trendPositive : styles.trendNegative,
            )}
          >
            {isUp ? (
              <ArrowTrending20Regular style={{ fontSize: tokens.fontSizeBase400 }} />
            ) : (
              <ArrowTrendingDown20Regular style={{ fontSize: tokens.fontSizeBase400 }} />
            )}
            <Caption1Strong>
              {Math.abs(trend as number) > 999 ? '>999%' : `${Math.abs(trend as number)}%`}
            </Caption1Strong>
          </span>
        )}
      </div>
    </div>
  );
}

interface SectionHeadingProps {
  title: string;
  tooltip: string;
}

/**
 * Section title with an info tooltip. Replaces the descriptive caption that
 * used to sit under each heading, so the cards stay compact.
 */
function SectionHeading({ title, tooltip }: SectionHeadingProps) {
  const styles = useStyles();
  return (
    <div className={styles.sectionHead}>
      <Subtitle2 as="h3" className={styles.heading}>{title}</Subtitle2>
      <Tooltip content={tooltip} relationship="description">
        <span className={styles.infoIcon}>
          <Info16Regular />
        </span>
      </Tooltip>
    </div>
  );
}

/**
 * Ranked rows rendered as Agent Insights Hub's "Slowest topics": label left,
 * value right, full-width bar with a grey remainder track and the standard
 * hover callout.
 *
 * Each row is its own single-entry `HorizontalBarChart` so it can sit inside a
 * button and stay clickable. The button carries no padding, border or
 * background of its own, so the rows render exactly as they do in the Hub —
 * only a subtle hover tint is added as a click affordance.
 */
function BarList({
  items,
  selected,
  onToggle,
  emptyLabel,
  width,
  total,
  actionTooltip,
}: BarListProps) {
  const styles = useStyles();
  if (items.length === 0) return <Caption1 className={styles.muted}>{emptyLabel}</Caption1>;
  if (width <= 0) return null;

  // Bars are scaled against the total, so a bar's filled width is exactly the
  // percentage shown beside it. Scaling against the largest item instead made
  // the top row full width regardless of its share (48 · 70% filled the track).
  const denominator = Math.max(total, 1);
  // Matches the Hub wrapper's inset, which keeps the bar clear of the card edge.
  const chartWidth = Math.max(width - 16, 200);

  return (
    <div className={styles.barRows}>
      {items.map((item, index) => {
        const isSelected = selected.has(item.key);
        const chart = (
          <HorizontalBarChart
            data={[
              {
                chartTitle: item.label,
                chartData: [
                  {
                    legend: item.label,
                    horizontalBarChartdata: { x: item.count, y: denominator },
                    color: sliceColor(index),
                  },
                ],
              },
            ]}
            width={chartWidth}
            // Supported hook for the text at the top right of a bar. Used to
            // append the share, which the default renderer omits.
            barChartCustomData={() => (
              <span className={styles.barValue}>
                <b>{item.count}</b> · {item.share}%
              </span>
            )}
            styles={{ root: { width: '100%', overflow: 'hidden' } }}
          />
        );

        return (
          <Tooltip
            key={item.key}
            content={actionTooltip(item, isSelected)}
            relationship="description"
          >
            <button
              type="button"
              className={mergeClasses(styles.barRow, isSelected && styles.barRowSelected)}
              aria-pressed={isSelected}
              aria-label={`${item.label}: ${item.count} changes, ${item.share} percent`}
              onClick={() => onToggle(item)}
            >
              {chart}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

interface BarListProps {
  items: RankedItem[];
  selected: ReadonlySet<string>;
  onToggle: (item: RankedItem) => void;
  emptyLabel: string;
  /** Measured width of the card, since the chart cannot size itself. */
  width: number;
  /**
   * Denominator the item shares were computed against, so each bar's width
   * matches the percentage displayed beside it.
   */
  total: number;
  /**
   * Hover text for a row. Required because the two lists do different things on
   * click — Top makers toggles a filter, Top agents opens the agent — so a
   * single generic wording would be wrong for one of them.
   */
  actionTooltip: (item: RankedItem, isSelected: boolean) => string;
}

export interface AuditSummaryProps {
  /** Already-filtered entries — the same set the Change history tab renders. */
  entries: ChangeLogEntry[];
  /** Days covered by the active date filter, or null for "All time". */
  dateFilterDays: number | null;
  /** Explicit window for a custom range, so the chart plots the real dates. */
  dateWindow?: { start: number; end: number } | null;
  /** Human label for the active range, e.g. "all time" or "last 30 days". */
  rangeLabel: string;
  agentNames?: ReadonlyMap<string, string>;
  componentTypeOf: (entry: ChangeLogEntry) => number;
  componentLabelOf: (type: number) => string;
  /** Optional glyph per component type, shown instead of the initials tile. */
  componentIconOf?: (type: number) => ReactNode;
  selectedUsers: string[];
  selectedComponents: number[];
  selectedKinds: ChangeKind[];
  onToggleUser: (name: string) => void;
  onToggleComponent: (type: number) => void;
  onToggleKind: (kind: ChangeKind) => void;
  onSelectAgent?: (configId: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

/**
 * Audit Summary tab: aggregate view of the same entries the Change history tab
 * lists, so both tabs always report identical totals.
 */
export function AuditSummary({
  entries,
  dateFilterDays,
  dateWindow,
  rangeLabel,
  agentNames,
  componentTypeOf,
  componentLabelOf,
  componentIconOf,
  selectedUsers,
  selectedComponents,
  selectedKinds,
  onToggleUser,
  onToggleComponent,
  onToggleKind,
  onSelectAgent,
  onClearFilters,
  hasActiveFilters,
}: AuditSummaryProps) {
  const styles = useStyles();
  const [chartRef, chartWidth] = useMeasuredWidth<HTMLDivElement>();
  const [makersRef, makersWidth] = useMeasuredWidth<HTMLDivElement>();
  const [agentsRef, agentsWidth] = useMeasuredWidth<HTMLDivElement>();

  // Only the all-agents view can open another agent, so this doubles as the
  // scope flag for wording that differs between the two hosts.
  const isAllAgentsScope = onSelectAgent !== undefined;

  // Reference time is captured once per mount: calling Date.now() during render
  // is impure and would make the trend and buckets shift on unrelated renders.
  const [now] = useState(() => Date.now());

  const summary = useMemo(
    () =>
      buildAuditSummary(entries, {
        now,
        dateFilterDays,
        dateWindow,
        agentNames,
        componentTypeOf,
        componentLabelOf,
      }),
    [entries, now, dateFilterDays, dateWindow, agentNames, componentTypeOf, componentLabelOf],
  );

  const selectedUserKeys = useMemo(() => new Set(selectedUsers), [selectedUsers]);
  const selectedComponentKeys = useMemo(
    () => new Set(selectedComponents.map(String)),
    [selectedComponents],
  );

  const chartSeries = useMemo<ILineChartPoints[]>(() => {
    if (summary.activity.length === 0) return [];
    return [
      {
        legend: 'Changes',
        // LineChart requires Date objects on the x axis; bucket starts are
        // already calendar-aligned so each point lands on a distinct day.
        data: summary.activity.map((bucket) => ({
          x: new Date(bucket.start),
          y: bucket.count,
          xAxisCalloutData: bucket.label,
          yAxisCalloutData: `${bucket.count} ${bucket.count === 1 ? 'change' : 'changes'}`,
        })),
        color: sliceColor(0),
      },
    ];
  }, [summary.activity]);

  // One tick per bucket. Bucket starts are calendar-aligned, so every tick is a
  // distinct day and the axis never falls back to sub-day ("12 am") labels.
  const chartTicks = useMemo(
    () => summary.activity.map((bucket) => new Date(bucket.start)),
    [summary.activity],
  );

  const componentSlices = useMemo(
    () =>
      summary.components.map((item, index) => ({
        legend: item.label,
        data: item.count,
        color: sliceColor(index),
        xAxisCalloutData: item.label,
        yAxisCalloutData: `${item.count} (${item.share}%)`,
      })),
    [summary.components],
  );

  const topAgents = useMemo(
    () => summary.byAgent.slice(0, TOP_AGENTS),
    [summary.byAgent],
  );

  /** Change kinds as ranked items, so they render through the shared BarList. */
  const kindItems = useMemo<RankedItem[]>(() => {
    const max = Math.max(...summary.kinds.map((entry) => entry.count), 1);
    return summary.kinds.map(({ kind, count }) => ({
      key: kind,
      label: kind,
      count,
      share: summary.totalChanges > 0 ? Math.round((count / summary.totalChanges) * 100) : 0,
      fill: Math.round((count / max) * 100),
    }));
  }, [summary.kinds, summary.totalChanges]);

  const selectedKindKeys = useMemo(() => new Set<string>(selectedKinds), [selectedKinds]);

  /** Donut slices for the change kinds, in each kind's own colour. */
  const kindSlices = useMemo(
    () =>
      kindItems
        // A zero-count kind would contribute no arc but would still occupy a
        // colour and a callout, so it is charted only when it has data.
        .filter((item) => item.count > 0)
        .map((item) => ({
          legend: item.label,
          data: item.count,
          color: kindColor(item.key as ChangeKind),
          xAxisCalloutData: item.label,
          yAxisCalloutData: `${item.count} (${item.share}%)`,
        })),
    [kindItems],
  );

  // Cap the contributor list so a busy agent cannot grow the card or introduce
  // its own scrollbar. Any person currently used as a filter is kept visible
  // even when they fall outside the top slice.
  const topContributors = useMemo(() => {
    const top = summary.contributors.slice(0, TOP_CONTRIBUTORS);
    const shown = new Set(top.map((item) => item.key));
    const pinned = summary.contributors.filter(
      (item) => selectedUserKeys.has(item.key) && !shown.has(item.key),
    );
    return [...top, ...pinned];
  }, [summary.contributors, selectedUserKeys]);

  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <HistoryRegular className={styles.emptyIcon} />
        <Body1Strong>No changes match the current filters</Body1Strong>
        {hasActiveFilters && (
          <Button appearance="secondary" icon={<DismissRegular />} onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Card className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardHeadText}>
            <div className={styles.metricLabelRow}>
              <Subtitle2 as="h3" className={styles.heading}>Overview</Subtitle2>
              <Tooltip
                content="Change activity for the current agent selection and filters. Percentages compare the most recent half of the range with the earlier half, so they show whether activity is rising or slowing."
                relationship="description"
              >
                <span className={styles.infoIcon}>
                  <Info16Regular />
                </span>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className={styles.metrics}>
          <Metric
            label="# Changes"
            tooltip="Every individual edit captured across all saves in this range — a single save that touches five things counts as five changes. The percentage compares the most recent half of the range with the earlier half."
            value={String(summary.totalChanges)}
            trend={summary.totalTrend}
          />
          <Metric
            label="# Makers"
            tooltip="How many different makers saved at least one change in this range. The percentage compares the most recent half of the range with the earlier half."
            value={String(summary.peopleCount)}
            trend={summary.peopleTrend}
          />
          <Metric
            label="# Publishes"
            tooltip={`How many times ${
              isAllAgentsScope ? 'tracked agents were' : 'the agent was'
            } published in this range. Publishes are detected from the agent's publish date moving forward. The percentage compares the most recent half of the range with the earlier half.`}
            value={String(summary.publishCount)}
            trend={summary.publishTrend}
          />
          <Metric
            label="Active day"
            tooltip="The day with the most changes in this range, and how many landed on it — useful for spotting a large edit or migration."
            value={
              summary.busiestDay
                ? `${new Date(summary.busiestDay.date).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })} (${summary.busiestDay.count})`
                : '0'
            }
          />
        </div>
      </Card>

      <div className={styles.grid}>
        <Card className={mergeClasses(styles.card, styles.gridCard)}>
          <SectionHeading
            title="Top makers"
            tooltip={`People ranked by how many changes they made in this range, up to ${TOP_CONTRIBUTORS}. Select a person to filter every view${
              isAllAgentsScope ? ' on this page.' : ' on this tab and the Change history.'
            }`}
          />
          <div ref={makersRef} className={styles.barMeasure}>
            <BarList
              items={topContributors}
              selected={selectedUserKeys}
              onToggle={(item) => onToggleUser(item.key)}
              actionTooltip={(item, isSelected) =>
                isSelected ? `Clear filter for ${item.label}` : `Filter by ${item.label}`
              }
              emptyLabel="No contributors in this selection."
              width={makersWidth}
              total={summary.totalChanges}
            />
          </div>
        </Card>

        <Card className={mergeClasses(styles.card, styles.gridCard)}>
          <SectionHeading
            title="Components changed"
            tooltip={`Which parts of ${
              isAllAgentsScope ? 'your agents' : 'the agent'
            } were edited — topics, tools, knowledge, settings and so on. The ring shows each area's share of all changes in this range. Select an area to filter every view.`}
          />
          <div className={styles.donutLayout}>
            <div className={styles.donutWrap}>
              {componentSlices.length > 0 && (
                <DonutChart
                  // Remount when the slice set changes; the chart caches its
                  // arc geometry and otherwise keeps stale segments on screen.
                  key={componentSlices.map((slice) => slice.legend).join('|')}
                  data={{ chartTitle: 'Components changed', chartData: componentSlices }}
                  innerRadius={Math.round((DONUT_SIZE / 2) * 0.45)}
                  width={DONUT_SIZE}
                  height={DONUT_SIZE}
                  hideLegend
                  hideLabels
                  valueInsideDonut={String(summary.totalChanges)}
                />
              )}
            </div>
            <div className={styles.legend}>
              {summary.components.map((item, index) => {
                const isSelected = selectedComponentKeys.has(item.key);
                return (
                  <Tooltip
                    key={item.key}
                    content={
                      isSelected ? `Clear filter for ${item.label}` : `Filter by ${item.label}`
                    }
                    relationship="description"
                  >
                    <button
                      type="button"
                      className={mergeClasses(
                        styles.legendItem,
                        isSelected && styles.legendItemSelected,
                      )}
                      aria-pressed={isSelected}
                      onClick={() => onToggleComponent(Number(item.key))}
                    >
                      <span
                        className={styles.legendSwatch}
                        style={{ backgroundColor: sliceColor(index) }}
                        aria-hidden
                      />
                      {componentIconOf && (
                        <span className={styles.legendIcon} aria-hidden>
                          {componentIconOf(Number(item.key))}
                        </span>
                      )}
                      <Caption1 className={styles.legendLabel}>{item.label}</Caption1>
                      <Caption1 className={styles.legendValue}>
                        <b>{item.count}</b> · {item.share}%
                      </Caption1>
                    </button>
                  </Tooltip>
                );
              })}
              {summary.components.length === 0 && (
                <Caption1 className={styles.muted}>No components in this selection.</Caption1>
              )}
            </div>
          </div>
        </Card>

        <Card className={mergeClasses(styles.card, styles.gridCard)}>
          <SectionHeading
            title="Change types"
            tooltip="Each change counted once by what happened to it: Added, Updated, Removed or Published. The four are mutually exclusive, so they add up to the total. Select Added, Updated or Removed to filter every view — Published isn't recorded as an edit, so it can't be filtered."
          />
          <div className={styles.donutLayout}>
            <div className={styles.donutWrap}>
              {kindSlices.length > 0 && (
                <DonutChart
                  // Remount when the slice set changes; the chart caches its
                  // arc geometry and otherwise keeps stale segments on screen.
                  key={kindSlices.map((slice) => slice.legend).join('|')}
                  data={{ chartTitle: 'Change types', chartData: kindSlices }}
                  innerRadius={Math.round((DONUT_SIZE / 2) * 0.45)}
                  width={DONUT_SIZE}
                  height={DONUT_SIZE}
                  hideLegend
                  hideLabels
                  valueInsideDonut={String(summary.totalChanges)}
                />
              )}
            </div>
            <div className={styles.legend}>
              {kindItems.map((item) => {
                const kind = item.key as ChangeKind;
                const isSelected = selectedKindKeys.has(item.key);
                const swatch = (
                  <span
                    className={styles.legendSwatch}
                    style={{ backgroundColor: kindColor(kind) }}
                    aria-hidden
                  />
                );
                const body = (
                  <>
                    {swatch}
                    <Caption1 className={styles.legendLabel}>{item.label}</Caption1>
                    <Caption1 className={styles.legendValue}>
                      <b>{item.count}</b> · {item.share}%
                    </Caption1>
                  </>
                );

                // "Published" is derived from an agent field edit and has no
                // ChangeType of its own, so the shared history filter cannot
                // express it. It is reported, but not selectable.
                if (kind === 'Published') {
                  return (
                    <Tooltip
                      key={item.key}
                      content="Publishes are detected from the agent's publish date rather than recorded as an edit, so they can't be used as a filter."
                      relationship="description"
                    >
                      <div
                        className={mergeClasses(
                          styles.legendItem,
                          styles.legendItemNoIcon,
                          styles.legendItemStatic,
                        )}
                      >
                        {body}
                      </div>
                    </Tooltip>
                  );
                }

                return (
                  <Tooltip
                    key={item.key}
                    content={
                      isSelected
                        ? `Clear filter for ${item.label} changes`
                        : `Filter by ${item.label} changes`
                    }
                    relationship="description"
                  >
                    <button
                      type="button"
                      className={mergeClasses(
                        styles.legendItem,
                        styles.legendItemNoIcon,
                        isSelected && styles.legendItemSelected,
                      )}
                      aria-pressed={isSelected}
                      onClick={() => onToggleKind(kind)}
                    >
                      {body}
                    </button>
                  </Tooltip>
                );
              })}
              {kindItems.length === 0 && (
                <Caption1 className={styles.muted}>No changes in this selection.</Caption1>
              )}
            </div>
          </div>
        </Card>

        <Card className={mergeClasses(styles.card, styles.gridCard)}>
          <SectionHeading
            title="Activity over time"
            tooltip={`Number of changes in each period across ${rangeLabel}, so you can see bursts of editing and quiet stretches. Hover a point for its exact count.`}
          />
          <div className={styles.chartWrap} ref={chartRef}>
            {chartWidth > 0 && chartSeries.length > 0 && (
              <AreaChart
                data={{ chartTitle: 'Changes per period', lineChartData: chartSeries }}
                width={chartWidth}
                height={200}
                enablePerfOptimization
                yAxisTickCount={4}
                tickValues={chartTicks}
                // Dates only: with a short range the default formatter adds
                // "12 am"/"12 pm", which crowds the axis and reads as noise.
                customDateTimeFormatter={(date: Date) =>
                  date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                }
              />
            )}
          </div>
        </Card>
      </div>

      {summary.byAgent.length > 0 && (
        <Card className={styles.card}>
          <SectionHeading
            title="Top agents"
            tooltip={`The agents with the most changes in this range, up to ${TOP_AGENTS}. Select an agent to open its own audit summary and change history.`}
          />
          <div ref={agentsRef} className={styles.barMeasure}>
            <BarList
              items={topAgents}
              selected={new Set<string>()}
              onToggle={(item) => onSelectAgent?.(item.key)}
              actionTooltip={(item) => `Open ${item.label}`}
              emptyLabel="No agent activity in this selection."
              width={agentsWidth}
              total={summary.totalChanges}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
