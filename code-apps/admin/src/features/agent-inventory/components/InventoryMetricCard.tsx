import {
  Body1Strong,
  Caption1,
  Caption1Strong,
  Card,
  Subtitle1,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { useCallback, useRef, useState } from 'react';
import { Info20Regular } from '@fluentui/react-icons';
import type { DistributionItem } from '../contracts/types';
import { useAgentInventorySurfaceStyles } from '../styles/surfaceStyles';

const AGENT_TYPE_COLORS = ['#637CEF', '#E3008C', '#2AA0A4'];
const AGENT_TYPE_ORDER = ['Standard', 'GitHub Copilot', 'Copilot Chat'];
const AGENT_TYPE_DONUT_SIZE = 56;
const AGENT_TYPE_DONUT_STROKE = 7;

function AgentTypeDonut({
  items,
  percentage,
  label,
}: {
  items: DistributionItem[];
  percentage: number;
  label: string;
}) {
  const radius = (AGENT_TYPE_DONUT_SIZE - AGENT_TYPE_DONUT_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const segmentLengths = items.map((item) => total ? item.value / total * circumference : 0);

  return (
    <svg
      role="img"
      aria-label={label}
      width={AGENT_TYPE_DONUT_SIZE}
      height={AGENT_TYPE_DONUT_SIZE}
      viewBox={`0 0 ${AGENT_TYPE_DONUT_SIZE} ${AGENT_TYPE_DONUT_SIZE}`}
    >
      <circle
        cx={AGENT_TYPE_DONUT_SIZE / 2}
        cy={AGENT_TYPE_DONUT_SIZE / 2}
        r={radius}
        fill="none"
        stroke={tokens.colorNeutralBackground4}
        strokeWidth={AGENT_TYPE_DONUT_STROKE}
      />
      {items.map((item, index) => (
        <circle
          key={item.label}
          cx={AGENT_TYPE_DONUT_SIZE / 2}
          cy={AGENT_TYPE_DONUT_SIZE / 2}
          r={radius}
          fill="none"
          stroke={AGENT_TYPE_COLORS[index]}
          strokeWidth={AGENT_TYPE_DONUT_STROKE}
          strokeDasharray={`${segmentLengths[index]} ${circumference - segmentLengths[index]}`}
          strokeDashoffset={-segmentLengths.slice(0, index).reduce((sum, length) => sum + length, 0)}
          transform={`rotate(-90 ${AGENT_TYPE_DONUT_SIZE / 2} ${AGENT_TYPE_DONUT_SIZE / 2})`}
        />
      ))}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={tokens.fontSizeBase200}
        fontWeight={tokens.fontWeightSemibold}
        fill={tokens.colorNeutralForeground1}
      >
        {percentage}%
      </text>
    </svg>
  );
}

const useStyles = makeStyles({
  card: {
    minHeight: '92px',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  stackedCard: {
    minHeight: '84px',
  },
  clickable: {
    cursor: 'pointer',
    transitionProperty: 'box-shadow, transform',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      boxShadow: tokens.shadow8,
    },
    ':active': {
      transform: 'scale(0.995)',
    },
  },
  content: {
    height: '100%',
    minHeight: '92px',
    boxSizing: 'border-box',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  stackedContent: {
    minHeight: '84px',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  valueRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalXXS,
  },
  stackedValueRow: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'baseline',
  },
  supportRow: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalS,
  },
  value: {
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: tokens.fontFamilyNumeric,
    fontSize: tokens.fontSizeHero800,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightBold,
  },
  stackedValue: {
    fontWeight: tokens.fontWeightRegular,
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightBase600,
  },
  supporting: {
    color: tokens.colorNeutralForeground3,
  },
  stackedSupporting: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  detailPositive: {
    color: tokens.colorPaletteGreenForeground1,
  },
  detailNegative: {
    color: tokens.colorPaletteRedForeground1,
  },
  infoIcon: {
    width: '20px',
    height: '20px',
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground3,
    cursor: 'help',
  },
  distributionContent: {
    display: 'grid',
    gridTemplateColumns: `${AGENT_TYPE_DONUT_SIZE}px minmax(0, 1fr)`,
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  distributionDetails: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  distributionMetrics: {
    display: 'flex',
    flexDirection: 'column',
  },
  distributionItem: {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: '6px minmax(0, 1fr) auto',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXXS,
  },
  distributionDot: {
    width: '6px',
    height: '6px',
    borderRadius: tokens.borderRadiusCircular,
  },
  distributionCount: {
    gridColumn: 3,
  },
});

interface InventoryMetricCardBaseProps {
  label: string;
  accentColor: string;
  tooltip?: string;
  onActivate?: () => void;
  actionLabel?: string;
}

interface InventoryValueMetricCardProps extends InventoryMetricCardBaseProps {
  kind: 'metric';
  value: string;
  supporting?: string;
  detail?: string;
  detailIntent?: 'positive' | 'negative';
  layout?: 'inline' | 'stacked';
  /** When true, surface a tooltip with the full value only if it is truncated (ellipsized). */
  valueTooltipOnOverflow?: boolean;
}

interface InventoryDistributionMetricCardProps extends InventoryMetricCardBaseProps {
  kind: 'distribution';
  distribution: {
    items: DistributionItem[];
    unclassifiedCount: number;
  };
}

type InventoryMetricCardProps = InventoryValueMetricCardProps | InventoryDistributionMetricCardProps;

/**
 * Renders a metric value that ellipsizes on overflow. When `enabled`, a tooltip with the
 * full value is surfaced only while the text is actually truncated (e.g. a long feature name);
 * otherwise it renders a plain Subtitle1 identical to the default metric value.
 *
 * The measurement uses a callback ref (rather than useRef + useEffect) so the ResizeObserver
 * always follows the currently-mounted node. This matters because wrapping the value in a
 * Tooltip only when truncated remounts the span; a stale observer left on the detached node
 * would fire with a 0x0 size and incorrectly reset the truncated state.
 */
function MetricValue({ value, className, enabled }: { value: string; className: string; enabled?: boolean }) {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [truncated, setTruncated] = useState(false);

  const measuredRef = useCallback((node: HTMLSpanElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || !enabled) return;
    const measure = () => {
      if (node.scrollWidth === 0 && node.clientWidth === 0) return;
      const parentWidth = node.parentElement?.clientWidth ?? node.clientWidth;
      setTruncated(node.scrollWidth > node.clientWidth || node.scrollWidth > parentWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.parentElement) observer.observe(node.parentElement);
    observerRef.current = observer;
    window.requestAnimationFrame(measure);
  }, [enabled]);

  if (!enabled) {
    return <Subtitle1 className={className}>{value}</Subtitle1>;
  }
  const valueNode = <span ref={measuredRef} className={className}>{value}</span>;
  return truncated
    ? <Tooltip content={value} relationship="description">{valueNode}</Tooltip>
    : valueNode;
}

export function InventoryMetricCard(props: InventoryMetricCardProps) {
  const styles = useStyles();
  const surfaceStyles = useAgentInventorySurfaceStyles();
  const { label, accentColor, tooltip, onActivate, actionLabel } = props;
  const isInteractive = typeof onActivate === 'function';
  const isDistribution = props.kind === 'distribution';
  const isStacked = props.kind === 'metric' && props.layout === 'stacked';
  const distributionItems = isDistribution
    ? [...props.distribution.items].sort((left, right) =>
      AGENT_TYPE_ORDER.indexOf(left.label) - AGENT_TYPE_ORDER.indexOf(right.label))
    : [];
  const classifiedTotal = isDistribution
    ? distributionItems.reduce((total, item) => total + item.value, 0)
    : 0;
  const largestAgentTypeCount = isDistribution
    ? Math.max(0, ...distributionItems.map((item) => item.value))
    : 0;
  const largestAgentTypePercentage = classifiedTotal
    ? Math.round(largestAgentTypeCount / classifiedTotal * 100)
    : 0;
  const distributionLabel = isDistribution
    ? `${label}: ${distributionItems.map((item) => `${item.label} ${item.value.toLocaleString()}`).join(', ')}.${props.distribution.unclassifiedCount ? ` ${props.distribution.unclassifiedCount.toLocaleString()} unclassified.` : ''}`
    : '';

  return (
    <Card
      appearance="filled"
      className={mergeClasses(
        surfaceStyles.card,
        styles.card,
        isStacked && styles.stackedCard,
        isInteractive ? styles.clickable : undefined,
      )}
      style={{ borderInlineStart: `${tokens.strokeWidthThicker} solid ${accentColor}` }}
      onClick={onActivate}
      onKeyDown={isInteractive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate?.();
        }
      } : undefined}
      role={isInteractive ? 'button' : undefined}
      aria-label={isInteractive ? (actionLabel ?? `View ${label}`) : undefined}
    >
      <div className={mergeClasses(
        styles.content,
        isDistribution && styles.distributionContent,
        isStacked && styles.stackedContent,
      )}>
        {isDistribution ? (
          <>
            <AgentTypeDonut
              items={distributionItems}
              percentage={largestAgentTypePercentage}
              label={distributionLabel}
            />
            <div className={styles.distributionDetails}>
              <Body1Strong>{label}</Body1Strong>
              <div className={styles.distributionMetrics}>
                {distributionItems.map((item, index) => (
                  <span className={styles.distributionItem} key={item.label}>
                    <span
                      className={styles.distributionDot}
                      style={{ backgroundColor: AGENT_TYPE_COLORS[index] }}
                      aria-hidden="true"
                    />
                    <Caption1>{item.label}</Caption1>
                    <Caption1Strong className={styles.distributionCount}>
                      {item.value.toLocaleString()}
                    </Caption1Strong>
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={styles.header}>
              <Body1Strong>{label}</Body1Strong>
              {tooltip && (
                <Tooltip content={tooltip} relationship="description">
                  <span
                    className={styles.infoIcon}
                    tabIndex={0}
                    aria-label={`${label}: ${tooltip}`}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Info20Regular aria-hidden="true" />
                  </span>
                </Tooltip>
              )}
            </div>
            {isStacked ? (
              <>
                <div className={styles.stackedValueRow}>
                  <MetricValue
                    value={props.value}
                    className={mergeClasses(styles.value, styles.stackedValue)}
                    enabled={props.valueTooltipOnOverflow}
                  />
                </div>
                <div className={styles.supportRow}>
                  {props.supporting && (
                    <Caption1 className={mergeClasses(styles.supporting, styles.stackedSupporting)}>
                      {props.supporting}
                    </Caption1>
                  )}
                  {props.detail && (
                    <Caption1
                      className={props.detailIntent === 'negative'
                        ? styles.detailNegative
                        : styles.detailPositive}
                    >
                      {props.detail}
                    </Caption1>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.valueRow}>
                <MetricValue value={props.value} className={styles.value} enabled={props.valueTooltipOnOverflow} />
                {props.supporting && <Caption1 className={styles.supporting}>{props.supporting}</Caption1>}
                {props.detail && (
                  <Caption1
                    className={props.detailIntent === 'negative'
                      ? styles.detailNegative
                      : styles.detailPositive}
                  >
                    {props.detail}
                  </Caption1>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
