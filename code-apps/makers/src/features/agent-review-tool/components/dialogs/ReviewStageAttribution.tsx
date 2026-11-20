import {
  Tooltip,
  createFocusOutlineStyle,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { ProgressStage } from '../../hooks/useReviewMutation';
import { WorkflowMark, WorkflowMarkColor } from '../../../../shared/icons/WorkflowMark';
import { REVIEW_PROGRESS_TOUCH_MEDIA, reviewProgressLayout } from './reviewProgressLayout';

const useStyles = makeStyles({
  mark: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: `calc(${tokens.spacingHorizontalXXXL} + ${tokens.spacingHorizontalM})`,
    minHeight: reviewProgressLayout.rowHeight,
    flexShrink: 0,
    borderRadius: tokens.borderRadiusSmall,
    [REVIEW_PROGRESS_TOUCH_MEDIA]: {
      minHeight: reviewProgressLayout.touchRowHeight,
    },
    ...createFocusOutlineStyle(),
  },
  live: {
    color: tokens.colorBrandForeground1,
    animationName: {
      '0%, 100%': { opacity: 0.45 },
      '50%': { opacity: 1 },
    },
    animationDuration: '1.6s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      opacity: 1,
    },
  },
  idle: { color: tokens.colorNeutralForeground3 },
});

/** Identifies an AI review without replacing the separate stage status. */
export function ReviewStageAttribution({ stage }: { stage: ProgressStage }) {
  const styles = useStyles();
  if (stage.attribution !== 'workflow-agent') return null;

  return (
    <Tooltip content="AI review" relationship="label">
      <span className={styles.mark} role="img" aria-label="AI review" tabIndex={0}>
        {stage.status === 'completed' ? (
          <WorkflowMarkColor size={16} />
        ) : (
          <WorkflowMark
            size={16}
            className={stage.status === 'active' ? styles.live : styles.idle}
          />
        )}
      </span>
    </Tooltip>
  );
}
