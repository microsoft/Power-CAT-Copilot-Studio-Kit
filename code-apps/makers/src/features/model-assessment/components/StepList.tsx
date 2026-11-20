import { Spinner, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import {
  CheckmarkCircle20Filled,
  Circle20Regular,
  DismissCircle20Filled,
  SubtractCircle20Regular,
} from '@fluentui/react-icons';
import type { StepState } from '../contracts/step-progress';

export type StepItemState = StepState | 'error';

export interface StepItem {
  title: string;
  /** What the step does; shown under it while it is active. */
  desc?: string;
  state: StepItemState;
  /** Live status shown under the step while it is active, in place of the description. */
  statusText?: string;
}

/** Spoken equivalent of the status icon, which is hidden from screen readers. */
const STATUS_LABEL: Record<StepItemState, string> = {
  done: 'completed',
  active: 'in progress',
  pending: 'not started',
  skipped: 'skipped',
  error: 'failed',
};

const useStyles = makeStyles({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  icon: { flexShrink: 0 },
  done: { color: tokens.colorPaletteGreenForeground1 },
  error: { color: tokens.colorPaletteRedForeground1 },
  idle: { color: tokens.colorNeutralForegroundDisabled },
  // The lowest token that is still readable text: pending steps are information, not disabled controls.
  muted: { color: tokens.colorNeutralForeground3 },
  detail: { display: 'block', marginLeft: '28px', color: tokens.colorNeutralForeground3 },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
});

/** Vertical list of progress steps, matching the Agent Review Tool progress dialog. */
export function StepList({ steps }: { steps: StepItem[] }) {
  const styles = useStyles();
  return (
    <ol className={styles.list}>
      {steps.map((step) => {
        const detail = step.state === 'active' ? step.statusText ?? step.desc : undefined;
        return (
          <li key={step.title}>
            <div className={styles.row}>
              {step.state === 'done' && <CheckmarkCircle20Filled className={mergeClasses(styles.icon, styles.done)} />}
              {step.state === 'active' && <Spinner size="tiny" className={styles.icon} />}
              {step.state === 'error' && <DismissCircle20Filled className={mergeClasses(styles.icon, styles.error)} />}
              {step.state === 'skipped' && <SubtractCircle20Regular className={mergeClasses(styles.icon, styles.idle)} />}
              {step.state === 'pending' && <Circle20Regular className={mergeClasses(styles.icon, styles.idle)} />}
              <Text size={200} className={step.state === 'pending' || step.state === 'skipped' ? styles.muted : undefined}>
                {step.title}
              </Text>
              <span className={styles.visuallyHidden}>{STATUS_LABEL[step.state]}</span>
            </div>
            {detail && <Text size={100} className={styles.detail}>{detail}</Text>}
          </li>
        );
      })}
    </ol>
  );
}
