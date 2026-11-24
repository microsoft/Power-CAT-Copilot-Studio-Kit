import { Caption1, ProgressBar, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { Warning16Filled } from '@fluentui/react-icons';

const LOW_COVERAGE = 0.5;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  bar: {
    flex: 1,
    minWidth: '48px',
    maxWidth: '96px',
  },
  value: {
    minWidth: '32px',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  warning: {
    color: tokens.colorPaletteMarigoldForeground1,
    flexShrink: 0,
  },
});

/** Brand coverage meter; shows an empty bar at 0% and warns between 0% and 50% (AG-4). */
export function CoverageMeter({ ratio }: { ratio: number }) {
  const styles = useStyles();
  const value = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const percent = Math.round(value * 100);
  return (
    <div className={styles.root}>
      <ProgressBar
        className={styles.bar}
        value={value}
        thickness="large"
        color="brand"
        aria-label={`Coverage ${percent}%`}
      />
      <Caption1 className={styles.value}>{percent}%</Caption1>
      {value > 0 && value < LOW_COVERAGE && (
        <Tooltip content="This agent accounts for less than half of all analyzer records in the selected period" relationship="description">
          <Warning16Filled className={styles.warning} aria-label="Low analysis share" />
        </Tooltip>
      )}
    </div>
  );
}
