import type { ReactNode } from 'react';
import {
  Body1,
  Card,
  Caption1,
  Subtitle2,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import type { DistributionItem } from '../contracts/types';
import { useAgentInventorySurfaceStyles } from '../styles/surfaceStyles';

function DistributionDonut({
  items,
  colors,
  size,
  title,
}: {
  items: DistributionItem[];
  colors: string[];
  size: number;
  title: string;
}) {
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const segments = items.map((item, index) => {
    const priorValue = items
      .slice(0, index)
      .reduce((sum, priorItem) => sum + priorItem.value, 0);

    return {
      item,
      color: colors[index % colors.length],
      length: total ? item.value / total * circumference : 0,
      offset: total ? -(priorValue / total * circumference) : 0,
    };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${title}: ${items.map((item) => `${item.label} ${item.value}`).join(', ')}`}
    >
      {segments.map(({ item, color, length, offset }) => (
          <circle
            key={item.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
      ))}
    </svg>
  );
}

const useStyles = makeStyles({
  card: {
    height: '100%',
    padding: 0,
    overflow: 'hidden',
  },
  content: {
    height: '100%',
    boxSizing: 'border-box',
    padding: tokens.spacingVerticalL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  heading: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
  },
  headingCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  title: {
    margin: 0,
    fontWeight: tokens.fontWeightBold,
  },
  verticalBody: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    flex: '1 1 0',
  },
  horizontalBody: {
    display: 'grid',
    gridTemplateColumns: '108px minmax(0, 1fr)',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXL,
    flex: '1 1 0',
  },
  chart: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  chartCenter: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  centerValue: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
  },
  legend: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  legendRow: {
    display: 'grid',
    gridTemplateColumns: '8px minmax(0, 1fr) auto',
    alignItems: 'start',
    gap: tokens.spacingHorizontalS,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  legendText: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  legendSub: {
    color: tokens.colorNeutralForeground3,
  },
  dot: {
    width: '8px',
    height: '8px',
    marginTop: '6px',
    borderRadius: tokens.borderRadiusCircular,
  },
  empty: {
    color: tokens.colorNeutralForeground3,
  },
  action: {
    marginTop: 'auto',
    alignSelf: 'flex-start',
  },
  clickable: {
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '-2px',
    },
  },
});

interface DistributionCardProps {
  title: string;
  subtitle: string;
  items: DistributionItem[];
  variant?: 'vertical' | 'horizontal';
  centerLabel?: string;
  centerSublabel?: string;
  colors: string[];
  action?: ReactNode;
  legendMode?: 'percentage' | 'value';
  onActivate?: () => void;
  actionLabel?: string;
}

export function DistributionCard({
  title,
  subtitle,
  items,
  variant = 'horizontal',
  centerLabel,
  centerSublabel,
  colors,
  action,
  legendMode = 'value',
  onActivate,
  actionLabel,
}: DistributionCardProps) {
  const styles = useStyles();
  const surfaceStyles = useAgentInventorySurfaceStyles();
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const visibleChartSize = variant === 'vertical' ? 104 : 96;
  const donutSize = visibleChartSize;
  const bodyClass = variant === 'vertical' ? styles.verticalBody : styles.horizontalBody;
  const interactive = Boolean(onActivate);

  return (
    <Card
      appearance="filled"
      className={mergeClasses(surfaceStyles.card, styles.card, interactive && styles.clickable)}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? (actionLabel ?? title) : undefined}
      onClick={interactive ? onActivate : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate?.();
        }
      } : undefined}
    >
      <div className={styles.content}>
        <div className={styles.heading}>
          <div className={styles.headingCopy}>
            <Subtitle2 as="h2" className={styles.title}>{title}</Subtitle2>
            <Caption1>{subtitle}</Caption1>
          </div>
        </div>
        {total > 0 ? (
          <div className={bodyClass}>
            <div
              className={styles.chart}
              style={{ width: visibleChartSize, height: visibleChartSize }}
            >
              <DistributionDonut
                items={items}
                colors={colors}
                size={donutSize}
                title={title}
              />
              {centerLabel && (
                <div className={styles.chartCenter}>
                  <span className={styles.centerValue}>{centerLabel}</span>
                  {centerSublabel && <Caption1>{centerSublabel}</Caption1>}
                </div>
              )}
            </div>
            <div
              className={styles.legend}
              style={variant === 'vertical' ? {
                borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
                paddingTop: tokens.spacingVerticalM,
              } : undefined}
            >
              {items.map((item, index) => (
                <div key={item.label} className={styles.legendRow}>
                  <span className={styles.dot} style={{ backgroundColor: colors[index % colors.length] }} />
                  <div className={styles.legendText}>
                    <Body1>{item.label}</Body1>
                    {item.description && <Caption1 className={styles.legendSub}>{item.description}</Caption1>}
                  </div>
                  <Body1>
                    <strong>{legendMode === 'percentage' ? `${Math.round(item.value / total * 100)}%` : item.value.toLocaleString()}</strong>
                  </Body1>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Body1 className={styles.empty}>No data available.</Body1>
        )}
        {action && <div className={styles.action}>{action}</div>}
      </div>
    </Card>
  );
}
