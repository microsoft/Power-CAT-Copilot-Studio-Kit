import { Caption1, ProgressBar, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import {
  MAX_CONVERSATIONS_PER_ANALYSIS,
  SELECTION_WARNING_RATIO,
} from '../../contracts/constants';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  bar: {
    width: '120px',
  },
  count: {
    fontVariantNumeric: 'tabular-nums',
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

interface SelectionLimitMeterProps {
  count: number;
  max?: number;
  className?: string;
}

/** Selection limit meter with warning at 80% and error above the limit (CV-13, NA-2). */
export function SelectionLimitMeter({
  count,
  max = MAX_CONVERSATIONS_PER_ANALYSIS,
  className,
}: SelectionLimitMeterProps) {
  const styles = useStyles();
  const over = count > max;
  const color = over ? 'error' : count >= max * SELECTION_WARNING_RATIO ? 'warning' : 'brand';

  return (
    <div className={mergeClasses(styles.root, className)}>
      <Caption1 className={mergeClasses(styles.count, over && styles.error)}>
        {count.toLocaleString()} of {max.toLocaleString()}
      </Caption1>
      <ProgressBar
        className={styles.bar}
        value={Math.min(count / max, 1)}
        color={color}
        thickness="large"
        aria-label={`${count} of ${max} conversations selected`}
      />
    </div>
  );
}
