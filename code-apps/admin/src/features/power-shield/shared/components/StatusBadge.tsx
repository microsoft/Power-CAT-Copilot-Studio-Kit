import React from 'react';
import { Badge, makeStyles, mergeClasses } from '@fluentui/react-components';
import type { RequestStatus } from '../../models/status';
import type { StatusDisplayKey } from '../../models/status';
import { getStatusDisplayLabel } from '../../models/status';
import { statusColors } from '../../theme/powerShieldTheme.tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Styles — keyed by display label, not internal status
// ─────────────────────────────────────────────────────────────────────────────

const pulseKeyframes = {
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.3 },
};

const useStyles = makeStyles({
  base: {
    '::before': {
      content: '""',
      display: 'inline-block',
      width: '5px',
      height: '5px',
      borderRadius: '50%',
      flexShrink: 0,
      marginRight: '5px',
    },
  },
  Draft: {
    backgroundColor: statusColors.draft.bg,
    color: statusColors.draft.fg,
    '::before': { backgroundColor: statusColors.draft.fg },
  },
  Submitted: {
    backgroundColor: statusColors.submitted.bg,
    color: statusColors.submitted.fg,
    '::before': { backgroundColor: statusColors.submitted.fg },
  },
  'In Review': {
    backgroundColor: statusColors.inReview.bg,
    color: statusColors.inReview.fg,
    '::before': {
      backgroundColor: statusColors.inReview.fg,
      animationName: pulseKeyframes,
      animationDuration: '1.6s',
      animationIterationCount: 'infinite',
    },
  },
  Approved: {
    backgroundColor: statusColors.approved.bg,
    color: statusColors.approved.fg,
    '::before': { backgroundColor: statusColors.approved.fg },
  },
  'In Progress': {
    backgroundColor: statusColors.inProgress.bg,
    color: statusColors.inProgress.fg,
    '::before': {
      backgroundColor: statusColors.inProgress.fg,
      animationName: pulseKeyframes,
      animationDuration: '1.6s',
      animationIterationCount: 'infinite',
    },
  },
  Completed: {
    backgroundColor: statusColors.completed.bg,
    color: statusColors.completed.fg,
    '::before': { backgroundColor: statusColors.completed.fg },
  },
  'Policy Failed': {
    backgroundColor: statusColors.policyFailed.bg,
    color: statusColors.policyFailed.fg,
    '::before': { backgroundColor: statusColors.policyFailed.fg },
  },
  Rejected: {
    backgroundColor: statusColors.rejected.bg,
    color: statusColors.rejected.fg,
    '::before': { backgroundColor: statusColors.rejected.fg },
  },
  Withdrawn: {
    backgroundColor: statusColors.withdrawn.bg,
    color: statusColors.withdrawn.fg,
    '::before': { backgroundColor: statusColors.withdrawn.fg },
  },
  'Auto Rejected': {
    backgroundColor: statusColors.autoRejected.bg,
    color: statusColors.autoRejected.fg,
    '::before': { backgroundColor: statusColors.autoRejected.fg },
  },
});

// Style keys matching StatusDisplayKey values
type StyleKeys = keyof ReturnType<typeof useStyles>;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  /** Connector request status — resolved to a display label + colour key. */
  status?: RequestStatus;
  /**
   * Explicit label + colour key override. Used by the Copilot Credits surface,
   * whose labels live outside the connector `RequestStatus` domain but reuse the
   * same shared colour palette (`StatusDisplayKey`). When provided, these take
   * precedence over `status`.
   */
  label?: string;
  colorKey?: StatusDisplayKey;
}

function StatusBadgeInner({ status, label, colorKey }: StatusBadgeProps) {
  const styles = useStyles();
  const displayLabel = label ?? (status ? getStatusDisplayLabel(status) : '');
  const resolvedKey = colorKey ?? (status ? getStatusDisplayLabel(status) : 'Draft');
  const styleKey = resolvedKey as StatusDisplayKey as StyleKeys;
  const statusClass = styles[styleKey];

  return (
    <Badge
      appearance="filled"
      shape="circular"
      role="status"
      aria-label={displayLabel}
      className={mergeClasses(styles.base, statusClass)}
    >
      {displayLabel}
    </Badge>
  );
}

export const StatusBadge = React.memo(StatusBadgeInner);

export default StatusBadge;
