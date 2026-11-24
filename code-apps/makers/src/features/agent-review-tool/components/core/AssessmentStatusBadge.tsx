import {
  Badge,
  Tooltip,
  makeStyles,
  tokens,
  type BadgeProps,
} from '@fluentui/react-components';
import { getAssessmentStatusDescription } from './assessmentStatus';

const useStyles = makeStyles({
  explainedStatus: {
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
});

export interface AssessmentStatusBadgeProps {
  status: boolean | null;
  statusColor: BadgeProps['color'];
  statusLabel: string;
  size?: BadgeProps['size'];
}

/** Render an assessment status and explain excluded outcomes on hover or keyboard focus. */
export function AssessmentStatusBadge({
  status,
  statusColor,
  statusLabel,
  size = 'small',
}: AssessmentStatusBadgeProps) {
  const styles = useStyles();
  const description = getAssessmentStatusDescription(statusLabel);
  const badge = (
    <Badge
      shape="rounded"
      appearance={status === null ? 'outline' : 'filled'}
      color={statusColor}
      size={size}
      className={description ? styles.explainedStatus : undefined}
      tabIndex={description ? 0 : undefined}
    >
      {statusLabel}
    </Badge>
  );

  return description ? (
    <Tooltip content={description} relationship="description" withArrow>
      {badge}
    </Tooltip>
  ) : badge;
}
