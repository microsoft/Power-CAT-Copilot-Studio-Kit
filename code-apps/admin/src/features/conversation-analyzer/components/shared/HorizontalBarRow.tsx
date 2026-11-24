import { makeStyles, tokens, Body1 } from '@fluentui/react-components';

interface HorizontalBarRowProps {
  label: string;
  value: number;
  /** The denominator for the bar (max value across siblings). */
  total: number;
  /** Color token name for the filled portion. */
  color: string;
}

const useStyles = makeStyles({
  row: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr 56px',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
  },
  label: {
    color: tokens.colorNeutralForeground1,
  },
  track: {
    height: '10px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: tokens.borderRadiusCircular,
  },
  value: {
    color: tokens.colorNeutralForeground1,
    textAlign: 'right',
  },
});

export function HorizontalBarRow({ label, value, total, color }: HorizontalBarRowProps) {
  const styles = useStyles();
  const pct = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  return (
    <div className={styles.row} role="img" aria-label={`${label}: ${value} of ${total}`}>
      <Body1 className={styles.label}>{label}</Body1>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <Body1 className={styles.value}>{value.toLocaleString()}</Body1>
    </div>
  );
}
