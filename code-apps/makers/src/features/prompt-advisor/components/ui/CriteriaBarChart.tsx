import { makeStyles, Caption1, Caption1Strong, tokens } from '@fluentui/react-components';
import type { CriteriaItem } from '../../contracts/types';

export interface CriteriaBarChartProps {
  items: CriteriaItem[];
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  label: {
    width: '80px',
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
  },
  barTrack: {
    flex: 1,
    height: tokens.spacingVerticalXS,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralStroke2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: tokens.borderRadiusSmall,
    transition: 'width 0.4s ease-in-out',
    backgroundColor: tokens.colorPaletteTealForeground2,
  },
  value: {
    width: '36px',
    textAlign: 'right' as const,
    flexShrink: 0,
  },
});

/**
 * Horizontal bar chart showing 5 criteria (0-10 scale).
 * Each bar: label left, colored bar (width proportional to value/max), value right.
 */
export function CriteriaBarChart({ items }: CriteriaBarChartProps) {
  const styles = useStyles();

  if (items.length === 0) return null;

  return (
    <div className={styles.root}>
      {items.map((item) => (
        <div key={item.name} className={styles.row}>
          <Caption1 className={styles.label}>{item.name}</Caption1>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${(item.value / item.maxValue) * 100}%` } as React.CSSProperties}
            />
          </div>
          <Caption1Strong className={styles.value}>{item.value}/{item.maxValue}</Caption1Strong>
        </div>
      ))}
    </div>
  );
}
