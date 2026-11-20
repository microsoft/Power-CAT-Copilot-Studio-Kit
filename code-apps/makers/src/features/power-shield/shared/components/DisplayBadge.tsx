import React from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { StatusDisplayKey } from '../../models/status';
import { statusColors } from '../../theme/powerShieldTheme.tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Shared pill badge — keyed by display colour, reused by connector StatusBadge
// and the Copilot Credits label badge so both slices render identically without
// duplicating the colour map.
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    borderRadius: tokens.borderRadiusCircular,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: 'nowrap',
    '::before': {
      content: '""',
      display: 'inline-block',
      width: '5px',
      height: '5px',
      borderRadius: '50%',
      flexShrink: 0,
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
      animationName: {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.3 },
      },
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
      animationName: {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.3 },
      },
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

type StyleKeys = keyof ReturnType<typeof useStyles>;

interface DisplayBadgeProps {
  /** The colour key that selects the pill palette. */
  displayKey: StatusDisplayKey;
  /** The text shown inside the pill (and used as the accessible label). */
  label: string;
}

function DisplayBadgeInner({ displayKey, label }: DisplayBadgeProps) {
  const styles = useStyles();
  const statusClass = styles[displayKey as StyleKeys];

  return (
    <span role="status" aria-label={label} className={mergeClasses(styles.base, statusClass)}>
      {label}
    </span>
  );
}

export const DisplayBadge = React.memo(DisplayBadgeInner);

export default DisplayBadge;
