import { Fragment } from 'react';
import { Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
  },
  dot: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground3,
  },
  dotOn: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  line: {
    width: '40px',
    height: '2px',
    backgroundColor: tokens.colorNeutralStroke2,
  },
  lineOn: { backgroundColor: tokens.colorBrandBackground },
  hidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  },
});

export interface StepIndicatorProps {
  steps: string[];
  /** Zero-based index of the step the user is on. */
  current: number;
}

/** Numbered step dots (done steps show ✓). Screen readers hear one "Step X of Y: Name" line. */
export function StepIndicator({ steps, current }: StepIndicatorProps) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <span className={styles.hidden}>
        Step {current + 1} of {steps.length}: {steps[current]}
      </span>
      {steps.map((name, i) => (
        <Fragment key={name}>
          {i > 0 && <div aria-hidden="true" className={mergeClasses(styles.line, i <= current && styles.lineOn)} />}
          <div aria-hidden="true" className={mergeClasses(styles.dot, i <= current && styles.dotOn)}>
            {i < current ? '✓' : i + 1}
          </div>
          <Text aria-hidden="true" size={200} weight={i === current ? 'semibold' : 'regular'}>
            {name}
          </Text>
        </Fragment>
      ))}
    </div>
  );
}
