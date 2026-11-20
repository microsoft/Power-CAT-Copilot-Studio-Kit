import {
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  CheckmarkCircle20Filled,
  Circle20Regular,
  DismissCircle20Filled,
} from '@fluentui/react-icons';
import type { ProgressStage } from '../../hooks/useReviewMutation';
import { ReviewStageAttribution } from './ReviewStageAttribution';
import { REVIEW_PROGRESS_TOUCH_MEDIA, reviewProgressLayout } from './reviewProgressLayout';

const STATUS_LABEL: Record<ProgressStage['status'], string> = {
  completed: 'completed',
  active: 'in progress',
  error: 'failed',
  pending: 'not started',
};

const useStyles = makeStyles({
  list: {
    display: 'grid',
    gridAutoRows: 'auto',
    rowGap: tokens.spacingVerticalNone,
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  row: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    columnGap: tokens.spacingHorizontalS,
    minHeight: reviewProgressLayout.rowHeight,
    [REVIEW_PROGRESS_TOUCH_MEDIA]: {
      minHeight: reviewProgressLayout.touchRowHeight,
    },
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: tokens.fontSizeBase500,
    minHeight: reviewProgressLayout.rowHeight,
    [REVIEW_PROGRESS_TOUCH_MEDIA]: {
      minHeight: reviewProgressLayout.touchRowHeight,
    },
  },
  content: {
    flex: '1 1 0',
    minWidth: 0,
    // Align every label with the icon; details use the space below that label.
    paddingTop: reviewProgressLayout.labelPadding,
    [REVIEW_PROGRESS_TOUCH_MEDIA]: {
      paddingTop: reviewProgressLayout.touchLabelPadding,
    },
  },
  name: {
    display: 'block',
    overflowWrap: 'anywhere',
  },
  detail: {
    display: 'block',
    overflowWrap: 'anywhere',
    color: tokens.colorNeutralForeground3,
  },
  pending: {
    color: tokens.colorNeutralForeground3,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
});

export interface ReviewProgressStagesProps {
  stages: readonly ProgressStage[];
}

/** Displays review steps sized to their content without changing state or details. */
export function ReviewProgressStages({ stages }: ReviewProgressStagesProps) {
  const styles = useStyles();
  if (stages.length === 0) return null;

  return (
    <ol className={styles.list} role="list" aria-label="Review steps">
      {stages.map((stage, index) => (
        <li key={index} className={styles.row}>
          <span className={styles.status}>
            {stage.status === 'completed' && (
              <CheckmarkCircle20Filled style={{ color: tokens.colorPaletteGreenForeground1 }} />
            )}
            {stage.status === 'active' && (
              <Spinner size="tiny" aria-label={`${stage.stageName} in progress`} />
            )}
            {stage.status === 'error' && (
              <DismissCircle20Filled style={{ color: tokens.colorPaletteRedForeground1 }} />
            )}
            {stage.status === 'pending' && (
              <Circle20Regular style={{ color: tokens.colorNeutralForegroundDisabled }} />
            )}
          </span>
          <div className={styles.content}>
            <Text
              size={200}
              className={mergeClasses(
                styles.name,
                stage.status === 'pending' && styles.pending,
              )}
            >
              {stage.stageName}
            </Text>
            {stage.detail && (
              <Text size={100} className={styles.detail}>
                {stage.detail}
              </Text>
            )}
          </div>
          <span className={styles.visuallyHidden}>{STATUS_LABEL[stage.status]}</span>
          <ReviewStageAttribution stage={stage} />
        </li>
      ))}
    </ol>
  );
}
